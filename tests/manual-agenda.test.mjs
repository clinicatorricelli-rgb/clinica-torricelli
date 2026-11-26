import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
// Agenda sem intervalo, de meia em meia hora, e agenda paralela da Eduarda. Dados fictícios.
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

const q=async(f,sql,p=[])=>(await f.pg.query(sql,p)).rows;
const hhmm=iso=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso));
const slots=async(f,svc,day)=>(await q(f,'select starts_at from public.available_slots($1,$2)',[svc,day])).map(r=>hhmm(r.starts_at));

test('sem intervalo entre atendimentos e início de meia em meia hora',async()=>{
 const f=await fixture();try{
  const day=f.at('14:00').slice(0,10);
  const dur=(await q(f,'select duration_minutes d from public.services where id=1'))[0].d;
  const free=await slots(f,1,day);
  assert.ok(free.length>0&&free.every(t=>t.endsWith(':00')||t.endsWith(':30')),'só :00 e :30');
  const a=(await f.book(f.at('14:00'))).appointment;
  const row=(await q(f,'select buffer_minutes,busy_until=ends_at as sem_folga from public.appointments where id=$1',[a.id]))[0];
  assert.deepEqual(row,{buffer_minutes:0,sem_folga:true});
  const end=new Date(Date.parse(f.at('14:00'))+dur*60000).toISOString();
  const after=await slots(f,1,day);
  assert.ok(after.includes(hhmm(end)),'o próximo horário começa exatamente quando o anterior termina');
  assert.ok(!after.includes('14:00'));
 }finally{await f.pg.close();}
});

test('agenda paralela: a Eduarda cadastra, o horário some do site e aparece no painel e na agenda do dia',async()=>{
 const f=await fixture();try{
  const admin=(sql,p)=>f.as(f.admin,()=>f.rpc(sql,p),'aal2');
  const day=f.at('15:00').slice(0,10);
  const save=(id,start,name='Dona Maria',phone=null,notes='Cliente antiga')=>admin('public.admin_save_manual_appointment($1,$2,$3,$4,$5,$6)',[id,1,start,name,phone,notes]);
  await assert.rejects(f.as(f.ana,()=>f.rpc('public.admin_save_manual_appointment($1,$2,$3,$4,$5,$6)',[null,1,f.at('15:00'),'X',null,null])),/Admin MFA required/);
  assert.deepEqual(await save(null,f.at('15:00'),''),{ok:false,reason:'name_required'});
  assert.deepEqual(await save(null,f.at('15:00'),'Dona Maria','19999'),{ok:false,reason:'invalid_phone'});
  const r=await save(null,f.at('15:00'),'Dona Maria','+5519988887777');assert.equal(r.ok,true);
  assert.ok(!(await slots(f,1,day)).includes('15:00'),'some do site');
  assert.deepEqual(await save(null,f.at('15:00'),'Outra'),{ok:false,reason:'slot_unavailable'},'não deixa marcar por cima');
  assert.equal((await f.book(f.at('15:00'))).ok,false,'cliente do site também não pega');
  // Domingo e fora do horário publicado: quem decide é a Eduarda.
  const sunday=new Date(Date.parse(f.at('15:00')));sunday.setUTCDate(sunday.getUTCDate()+6);
  assert.equal((await save(null,sunday.toISOString(),'Dona Rosa')).ok,true);
  // Sem e-mail nem WhatsApp automático para a cliente ou para a Eduarda.
  assert.equal((await q(f,'select count(*)::int n from private.booking_emails'))[0].n,0);
  assert.equal((await q(f,'select count(*)::int n from private.owner_whatsapp_messages'))[0].n,0);
  // Painel e agenda do dia.
  const ov=await admin('public.admin_booking_overview($1,$2)',[day,day]);
  const item=ov.items.find(i=>i.id===r.id);
  assert.deepEqual([item.source,item.customer.name,item.customer.phone,item.manual_notes],['manual','Dona Maria','+5519988887777','Cliente antiga']);
  const items=(await q(f,'select private.owner_day_items($1) as j',[day]))[0].j;
  assert.ok(items.some(i=>i.customer_name==='Dona Maria'));
  // Remarcar e cancelar.
  assert.equal((await save(r.id,f.at('17:00'),'Dona Maria')).ok,true);
  assert.ok((await slots(f,1,day)).includes('15:00'),'o horário antigo volta para o site');
  assert.equal((await admin('public.admin_cancel_appointment($1,$2)',[r.id,'Cliente desmarcou por telefone'])).ok,true);
  assert.ok((await slots(f,1,day)).includes('17:00'));
 }finally{await f.pg.close();}
});
