import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
// Contas no painel: busca e exclusão de cadastro feito por engano. Pessoas e e-mails fictícios.
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
const RULE='falta-2026-11-v1';

async function fixture(){
 const pg=new PGlite({extensions:{btree_gist}});
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean not null default false);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const name of migrations)await pg.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
 const [ana,admin]=[crypto.randomUUID(),crypto.randomUUID()];
 await pg.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[ana,'ana-ficticia@example.test']);
 await pg.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[admin,'clinica-ficticia@example.test']);
 await pg.query('insert into private.admin_members(user_id) values($1)',[admin]);
 await pg.query("update public.profiles set display_name='Ana Fictícia',phone_e164='+5511900000001' where id=$1",[ana]);
 async function as(id,fn,aal='aal1'){
  await pg.exec('set role authenticated');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',aal})]);
  try{return await fn();}finally{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claims','',false)");}
 }
 const rpc=async(sql,params=[])=>(await pg.query(`select ${sql} as r`,params)).rows[0].r;
 await as(admin,()=>rpc('public.admin_set_booking_enabled(true)'),'aal2');
 const monday=(await pg.query("select to_char(date_trunc('week',now() at time zone 'America/Sao_Paulo')::date+14,'YYYY-MM-DD') as d")).rows[0].d;
 const at=time=>`${monday}T${time}:00-03:00`;
 const service=1; // serviço sem ficha obrigatória
 const book=start=>as(ana,()=>rpc('public.book_appointment($1,$2,$3,$4)',[service,start,RULE,crypto.randomUUID()]));
 const outbox=async()=>(await pg.query('select * from private.booking_emails order by created_at,audience')).rows;
 const db={
  prepareBookingEmail:async()=>(await pg.query('select private.prepare_booking_email() as job')).rows[0].job,
  finishBookingEmail:async(id,outcome,providerId,code)=>{await pg.query('select private.finish_booking_email($1,$2,$3,$4)',[id,outcome,providerId,code]);},
 };
 return{pg,ana,admin,as,rpc,at,book,outbox,db};
}

test('Eduarda (com segundo fator) busca contas e exclui cadastro, inclusive com histórico',async()=>{
 const f=await fixture();try{
  const bia=crypto.randomUUID();
  await f.pg.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,null)',[bia,'bia-errado@example.test']);
  await f.pg.query("update public.profiles set display_name='Bia Errado' where id=$1",[bia]);
  await f.pg.query("insert into public.notification_preferences(customer_id,email_enabled) values($1,true)",[bia]);
  const admin=(sql,params)=>f.as(f.admin,()=>f.rpc(sql,params),'aal2');
  // Sem segundo fator, ou como cliente: recusado.
  await assert.rejects(f.as(f.admin,()=>f.rpc('public.admin_list_accounts(null)'),'aal1'),/Admin MFA required/);
  await assert.rejects(f.as(f.ana,()=>f.rpc('public.admin_delete_account($1,$2)',[bia,'EXCLUIR'])),/Admin MFA required/);
  await f.pg.exec('set role anon');await assert.rejects(f.pg.query("select public.admin_list_accounts(null)"),/permission denied/);await f.pg.exec('reset role');
  const all=await admin('public.admin_list_accounts($1)',[null]);
  assert.equal(all.total,3);
  const found=await admin('public.admin_list_accounts($1)',['errado@']);
  assert.deepEqual(found.items.map(i=>[i.email,i.email_confirmed,i.has_history,i.is_admin]),[['bia-errado@example.test',false,false,false]]);
  // Ana agenda: passa a ter histórico e não pode ser excluída.
  assert.equal((await f.book(f.at('14:00'))).ok,true);
  assert.equal((await admin('public.admin_list_accounts($1)',['ana-ficticia'])).items[0].has_history,true);
  assert.deepEqual(await admin('public.admin_delete_account($1,$2)',[f.admin,'EXCLUIR']),{ok:false,reason:'not_allowed'});
  assert.deepEqual(await admin('public.admin_delete_account($1,$2)',[bia,'sim']),{ok:false,reason:'confirmation_required'});
  assert.deepEqual(await admin('public.admin_delete_account($1,$2)',[bia,'EXCLUIR']),{ok:true});
  assert.equal((await f.pg.query('select count(*)::int n from auth.users where id=$1',[bia])).rows[0].n,0);
  assert.equal((await f.pg.query('select count(*)::int n from public.profiles where id=$1',[bia])).rows[0].n,0);
  assert.equal((await f.pg.query('select count(*)::int n from public.notification_preferences where customer_id=$1',[bia])).rows[0].n,0);
  const log=(await f.pg.query("select actor_id,entity_id from public.audit_log where action='account.deleted'")).rows;
  assert.deepEqual(log,[{actor_id:f.admin,entity_id:bia}]);
  assert.deepEqual(await admin('public.admin_delete_account($1,$2)',[crypto.randomUUID(),'EXCLUIR']),{ok:false,reason:'not_found'});
  assert.deepEqual(await admin('public.admin_delete_account($1,$2)',[bia,'EXCLUIR']),{ok:false,reason:'not_found'});
  // Com histórico: agendamento cancelado tarde gera taxa; a exclusão leva tudo junto.
  const appt=(await f.pg.query('select id from public.appointments where customer_id=$1',[f.ana])).rows[0].id;
  await f.pg.query("insert into public.appointment_fees(appointment_id,customer_id,reason,amount_cents) values($1,$2,'late_cancellation',4500)",[appt,f.ana]);
  assert.deepEqual(await admin('public.admin_delete_account($1,$2)',[f.ana,'EXCLUIR']),{ok:true});
  for(const [table,col] of [['public.appointments','customer_id'],['public.appointment_fees','customer_id'],['public.profiles','id'],['auth.users','id']])
   assert.equal((await f.pg.query(`select count(*)::int n from ${table} where ${col}=$1`,[f.ana])).rows[0].n,0,table);
  assert.equal((await f.pg.query('select count(*)::int n from private.booking_emails')).rows[0].n,0);
  assert.equal((await admin('public.admin_list_accounts($1)',[null])).total,1,'sobra só a conta da clínica');
 }finally{await f.pg.close();}
});
