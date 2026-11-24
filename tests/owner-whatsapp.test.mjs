import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {buildOwnerWhatsapp,processOwnerWhatsapp,agendaLine,TEMPLATES} from '../supabase/functions/_shared/owner-whatsapp.mjs';
// Alertas da Eduarda no WhatsApp particular dela. Números e pessoas fictícios; nada sai para a rede.
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
const RULE='falta-2026-11-v1';
const OWNER='+5511988887777';

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
test('Eduarda liga os alertas no painel; número da clínica e número inválido são recusados',async()=>{
 const f=await fixture();try{
  const admin=(sql,p)=>f.as(f.admin,()=>f.rpc(sql,p),'aal2');
  await assert.rejects(f.as(f.admin,()=>f.rpc('public.admin_owner_whatsapp()'),'aal1'),/Admin MFA required/);
  await assert.rejects(f.as(f.ana,()=>f.rpc('public.admin_set_owner_whatsapp($1,$2)',[true,OWNER])),/Admin MFA required/);
  assert.deepEqual(await admin('public.admin_set_owner_whatsapp($1,$2)',[true,'+5519990347698']),{ok:false,reason:'same_as_clinic'});
  assert.deepEqual(await admin('public.admin_set_owner_whatsapp($1,$2)',[true,'19988887777']),{ok:false,reason:'invalid_phone'});
  assert.deepEqual(await admin('public.admin_set_owner_whatsapp($1,$2)',[true,null]),{ok:false,reason:'phone_required'});
  // Desligado: agendar não gera alerta.
  assert.equal((await f.book(f.at('14:00'))).ok,true);
  assert.equal((await q(f,'select count(*)::int n from private.owner_whatsapp_messages'))[0].n,0);
  assert.deepEqual(await admin('public.admin_set_owner_whatsapp($1,$2)',[true,OWNER]),{ok:true});
  const st=await admin('public.admin_owner_whatsapp()');assert.equal(st.enabled,true);assert.equal(st.phone,OWNER);
  await f.pg.exec('set role authenticated');await assert.rejects(f.pg.query('select * from private.owner_whatsapp_settings'),/permission denied/);await f.pg.exec('reset role');
 }finally{await f.pg.close();}
});

test('agendamento, remarcação e cancelamento pela cliente viram alerta; cancelamento pela clínica não',async()=>{
 const f=await fixture();try{
  await f.as(f.admin,()=>f.rpc('public.admin_set_owner_whatsapp($1,$2)',[true,OWNER]),'aal2');
  const a=(await f.book(f.at('14:00'))).appointment;
  await f.as(f.ana,()=>f.rpc('public.reschedule_appointment($1,$2)',[a.id,f.at('16:00')]));
  await f.as(f.ana,()=>f.rpc('public.cancel_appointment($1)',[a.id]));
  const b=(await f.book(f.at('18:00'))).appointment;
  await f.as(f.admin,()=>f.rpc('public.admin_cancel_appointment($1,$2)',[b.id,'Imprevisto fictício']),'aal2');
  const rows=await q(f,'select kind from private.owner_whatsapp_messages order by created_at,kind');
  assert.deepEqual(rows.map(r=>r.kind).sort(),['booked','booked','cancelled','rescheduled']);
  const job=(await q(f,'select private.prepare_owner_whatsapp() as j'))[0].j;
  assert.equal(job.to,OWNER);assert.equal(job.facts.customer_name,'Ana Fictícia');
  assert.ok(!JSON.stringify(job.facts).includes('answers'),'nenhum dado da ficha');
 }finally{await f.pg.close();}
});

test('agenda do dia no WhatsApp: uma vez por dia, seg–sáb, das 6h30 ao meio-dia; alerta velho é descartado',async()=>{
 const f=await fixture();try{
  await f.as(f.admin,()=>f.rpc('public.admin_set_owner_whatsapp($1,$2)',[true,OWNER]),'aal2');
  const day=(await f.book(f.at('14:00'))).appointment.starts_at.slice(0,10);
  await f.pg.query('delete from private.owner_whatsapp_messages');
  const enq=async hm=>(await q(f,'select private.enqueue_owner_daily_whatsapp($1) as r',[`${day}T${hm}:00-03:00`]))[0].r;
  assert.equal(await enq('06:29'),false);assert.equal(await enq('06:30'),true);assert.equal(await enq('07:00'),false,'só uma por dia');
  const sun=new Date(`${day}T12:00:00Z`);sun.setUTCDate(sun.getUTCDate()+6);
  assert.equal((await q(f,'select private.enqueue_owner_daily_whatsapp($1) as r',[`${sun.toISOString().slice(0,10)}T08:00:00-03:00`]))[0].r,false,'domingo não');
  const msg=(await q(f,"select facts from private.owner_whatsapp_messages where kind='daily_agenda'"))[0].facts;
  assert.equal(msg.items.length,1);assert.equal(msg.items[0].customer_name,'Ana Fictícia');
  await f.pg.query("update private.owner_whatsapp_messages set created_at=now()-interval '13 hours'");
  assert.equal((await q(f,'select private.prepare_owner_whatsapp() as j'))[0].j,null);
  assert.equal((await q(f,'select status from private.owner_whatsapp_messages'))[0].status,'skipped');
  // Desligar os alertas descarta o que estava na fila.
  await f.as(f.admin,()=>f.rpc('public.admin_test_owner_whatsapp()'),'aal2');
  await f.as(f.admin,()=>f.rpc('public.admin_set_owner_whatsapp($1,$2)',[false,OWNER]),'aal2');
  assert.equal((await q(f,'select private.prepare_owner_whatsapp() as j'))[0].j.skip,true);
 }finally{await f.pg.close();}
});

test('mensagens: modelo certo, variáveis sem quebra de linha e envio pela 360dialog',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const daily=buildOwnerWhatsapp({id,kind:'daily_agenda',to:OWNER,facts:{day:'2026-11-30',tomorrow_count:1,items:[{starts_at:'2026-11-30T12:00:00Z',service_name:'Lash Lifting',customer_name:'Ana Maria\nFictícia'}]}});
 assert.equal(daily.template,TEMPLATES.daily);
 assert.deepEqual(daily.params,['segunda-feira, 30/11','1 atendimento: 09:00 Ana (Lash Lifting)','1 atendimento marcado']);
 const alert=buildOwnerWhatsapp({id,kind:'rescheduled',to:OWNER,facts:{customer_name:'Bia Fictícia',service_name:'Brow Lamination',service_variant:'Sessão',starts_at:'2026-12-01T17:00:00Z',old_starts_at:'2026-11-30T13:00:00Z'}});
 assert.deepEqual(alert.params,['horário remarcado (antes: 30/11 às 10:00)','Bia Fictícia','Brow Lamination · Sessão','01/12 às 14:00']);
 assert.match(buildOwnerWhatsapp({id,kind:'cancelled',to:OWNER,facts:{customer_name:'C',service_name:'S',starts_at:'2026-12-01T17:00:00Z',cancel_kind:'client_late'}}).params[0],/menos de 24 h/);
 assert.equal(agendaLine([]),'nenhum atendimento marcado');
 const many=Array.from({length:60},(_,i)=>({starts_at:'2026-11-30T12:00:00Z',service_name:'Volume Brasileiro',customer_name:'Cliente'+i}));
 assert.ok(agendaLine(many).length<=700&&/e mais \d+$/.test(agendaLine(many)));
 for(const p of [...daily.params,...alert.params])assert.doesNotMatch(p,/[\n\t]| {4}/);
 assert.throws(()=>buildOwnerWhatsapp({id,kind:'booked',to:'+5519',facts:{}}),/invalid_private_job/);
 // Sem chave: nada sai e nada é consumido.
 const calls=[],done=[],marks=[];
 const db={markOwnerWhatsappProvider:async r=>marks.push(r),enqueueOwnerDailyWhatsapp:async()=>{},prepareOwnerWhatsapp:async()=>calls.length?null:{id,kind:'booked',to:OWNER,facts:{customer_name:'Ana',service_name:'S',starts_at:'2026-12-01T17:00:00Z'}},finishOwnerWhatsapp:async(...a)=>done.push(a)};
 assert.equal(await processOwnerWhatsapp({db,whatsappKey:null}),'provider_not_configured');assert.deepEqual(marks,[false]);
 const ok=await processOwnerWhatsapp({db,whatsappKey:'chave-ficticia',fetchImpl:async(url,o)=>{calls.push({url,o});return new Response(JSON.stringify({messages:[{id:'wamid.FICTICIO'}]}),{status:200});}});
 assert.equal(ok,'accepted');
 assert.equal(calls[0].url,'https://waba-v2.360dialog.io/messages');assert.equal(calls[0].o.headers['D360-API-KEY'],'chave-ficticia');
 const sent=JSON.parse(calls[0].o.body);assert.equal(sent.to,'5511988887777');assert.equal(sent.template.name,TEMPLATES.alert);assert.equal(sent.template.language.code,'pt_BR');
 assert.deepEqual(done,[[id,'accepted','wamid.FICTICIO',null]]);
 const done2=[];const db2={...db,prepareOwnerWhatsapp:async()=>done2.length?null:{id,kind:'booked',to:OWNER,facts:{customer_name:'Ana',service_name:'S',starts_at:'2026-12-01T17:00:00Z'}},finishOwnerWhatsapp:async(...a)=>done2.push(a)};
 assert.equal(await processOwnerWhatsapp({db:db2,whatsappKey:'k',fetchImpl:async()=>new Response('{"error":"telefone 5511..."}',{status:400})}),'failed');
 assert.deepEqual(done2[0].slice(1),['failed',null,'http_400'],'erro do provedor não é copiado');
});
