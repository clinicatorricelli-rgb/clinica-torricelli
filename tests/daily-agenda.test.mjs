import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {buildDailyAgenda,processDailyAgenda} from '../supabase/functions/_shared/daily-agenda.mjs';
// Agenda do dia (6h30, seg–sáb) para a clínica. Pessoas e e-mails fictícios; nada sai para a rede.
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

const prep=async(f,iso)=>(await f.pg.query('select private.prepare_daily_agenda($1) as j',[iso])).rows[0].j;
test('agenda do dia: só de segunda a sábado, das 6h30 ao meio-dia, uma vez por dia',async()=>{
 const f=await fixture();try{
  const booked=await f.book(f.at('14:00'));assert.equal(booked.ok,true,JSON.stringify(booked));
  const day=booked.appointment.starts_at.slice(0,10);
  const local=(hm,d=day)=>`${d}T${hm}:00-03:00`;
  assert.equal(await prep(f,local('06:29')),null,'antes das 6h30 não envia');
  const sunday=new Date(`${day}T12:00:00Z`);sunday.setUTCDate(sunday.getUTCDate()+6);
  assert.equal(await prep(f,local('07:00',sunday.toISOString().slice(0,10))),null,'domingo não envia');
  const job=await prep(f,local('06:31'));
  assert.equal(job.day,day);assert.deepEqual(job.to,['clinica-ficticia@example.test']);
  assert.equal(job.items.length,1);assert.equal(job.items[0].customer_name,'Ana Fictícia');assert.equal(job.items[0].customer_phone,'+5511900000001');
  assert.equal(await prep(f,local('06:32')),null,'enquanto envia, não duplica');
  await f.pg.query("select private.finish_daily_agenda($1,'retry',null,'provider_network')",[day]);
  assert.equal(await prep(f,local('06:33')),null,'espera 3 minutos para tentar de novo');
  assert.equal((await prep(f,local('06:35'))).attempt,2);
  await f.pg.query("select private.finish_daily_agenda($1,'accepted','11111111-1111-4111-8111-111111111111',null)",[day]);
  assert.equal(await prep(f,local('08:00')),null,'já enviado hoje');
  await f.pg.exec('set role authenticated');
  await assert.rejects(f.pg.query('select private.prepare_daily_agenda()'),/permission denied/);
  await f.pg.exec('reset role');
 }finally{await f.pg.close();}
});

test('e-mail da agenda: horário de São Paulo, WhatsApp da cliente e dia sem atendimento',async()=>{
 const job={day:'2026-11-30',to:['clinica-ficticia@example.test'],tomorrow_count:2,items:[{starts_at:'2026-11-30T17:00:00Z',ends_at:'2026-11-30T18:00:00Z',service_name:'Lash Lifting',service_variant:'Com tintura',customer_name:'<b>Ana</b>',customer_phone:'+5519900000000'}]};
 const e=buildDailyAgenda(job);
 assert.match(e.subject,/^Agenda de hoje: 1 atendimento — segunda-feira, 30\/11/);
 assert.match(e.text,/14:00–15:00 · Lash Lifting · Com tintura · <b>Ana<\/b> · WhatsApp \(19\) 90000-0000/);
 assert.match(e.text,/Amanhã: 2 atendimentos marcados/);
 assert.ok(e.html.includes('&lt;b&gt;Ana') && e.html.includes('https://wa.me/5519900000000'));
 assert.match(buildDailyAgenda({...job,items:[],tomorrow_count:0}).subject,/nenhum atendimento/);
 const calls=[],finished=[];
 const db={prepareDailyAgenda:async()=>job,finishDailyAgenda:async(...a)=>finished.push(a)};
 assert.equal(await processDailyAgenda({db,resendKey:'re_fixture',fetchImpl:async(u,o)=>{calls.push(o);return new Response(JSON.stringify({id:'22222222-2222-4222-8222-222222222222'}),{status:200});}}),'accepted');
 assert.equal(calls[0].headers['Idempotency-Key'],'booking-email/daily-2026-11-30');
 assert.deepEqual(finished,[['2026-11-30','accepted','22222222-2222-4222-8222-222222222222',null]]);
});
