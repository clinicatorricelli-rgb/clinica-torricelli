import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {buildBookingEmail,processBookingEmails,whenText} from '../supabase/functions/_shared/booking-email.mjs';
import {createAvailabilityEmailHandler} from '../supabase/functions/_shared/availability-email.mjs';
// E-mails de agendamento: Postgres embutido com todas as migrações e envio simulado.
// Pessoas e endereços são fictícios; nada sai para a rede.
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
const questions=['pregnant_or_breastfeeding','previous_eye_procedure','cosmetic_allergy','eye_condition','cancer_treatment','wearing_mascara'];
const RULE='falta-rascunho-2026-11';

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
const providerOk=calls=>async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:crypto.randomUUID()}),{status:200});};

test('agendar, remarcar e cancelar enfileiram avisos para a cliente e para a clínica',async()=>{
 const f=await fixture();try{
  const booked=await f.book(f.at('14:00'));assert.equal(booked.ok,true,JSON.stringify(booked));
  const id=booked.appointment.id;
  let rows=await f.outbox();
  assert.deepEqual(rows.map(r=>[r.event,r.audience]),[['booked','client'],['booked','clinic']]);
  assert.equal(rows[0].facts.customer_name,'Ana Fictícia');assert.equal(rows[0].facts.customer_phone,'+5511900000001');
  const moved=await f.as(f.ana,()=>f.rpc('public.reschedule_appointment($1,$2)',[id,f.at('16:00')]));assert.equal(moved.ok,true,JSON.stringify(moved));
  rows=await f.outbox();
  const re=rows.filter(r=>r.event==='rescheduled');assert.equal(re.length,2);
  assert.equal(new Date(re[0].facts.old_starts_at).toISOString(),new Date(f.at('14:00')).toISOString());
  const cancelled=await f.as(f.ana,()=>f.rpc('public.cancel_appointment($1)',[id]));assert.equal(cancelled.ok,true);
  rows=await f.outbox();
  assert.deepEqual(rows.filter(r=>r.event==='cancelled').map(r=>r.audience).sort(),['client','clinic']);
  assert.equal(rows.find(r=>r.event==='cancelled').facts.cancel_kind,'client_early');
  // Marcar presença ou repetir o cancelamento não gera aviso novo.
  await f.as(f.ana,()=>f.rpc('public.cancel_appointment($1)',[id]));
  assert.equal((await f.outbox()).length,6);
 }finally{await f.pg.close();}
});

test('cancelamento feito pela clínica avisa só a cliente',async()=>{
 const f=await fixture();try{
  const booked=await f.book(f.at('15:00'));
  await f.pg.query('delete from private.booking_emails');
  const r=await f.as(f.admin,()=>f.rpc('public.admin_cancel_appointment($1,$2)',[booked.appointment.id,'Imprevisto fictício']),'aal2');assert.equal(r.ok,true,JSON.stringify(r));
  const rows=await f.outbox();
  assert.deepEqual(rows.map(x=>[x.event,x.audience]),[['cancelled','client']]);
 }finally{await f.pg.close();}
});

test('fila só é acessível pelo servidor: cliente e visitante não leem nem chamam as funções',async()=>{
 const f=await fixture();try{
  await f.book(f.at('17:00'));
  for(const role of ['anon','authenticated']){
   await f.pg.exec(`set role ${role}`);
   try{
    await assert.rejects(f.pg.query('select * from private.booking_emails'),/permission denied/);
    await assert.rejects(f.pg.query('select private.prepare_booking_email()'),/permission denied/);
    await assert.rejects(f.pg.query("select private.finish_booking_email(gen_random_uuid(),'accepted',null,null)"),/permission denied/);
   }finally{await f.pg.exec('reset role');}
  }
 }finally{await f.pg.close();}
});

test('envio: destinatários vêm do banco, texto em português e nova tentativa quando o provedor falha',async()=>{
 const f=await fixture();try{
  await f.book(f.at('18:00'));
  const calls=[];
  // Provedor fora do ar: nada é marcado como enviado e o aviso volta para a fila mais tarde.
  assert.equal(await processBookingEmails({db:f.db,resendKey:'re_fixture',fetchImpl:async()=>{throw new Error('offline');}}),'retry');
  let rows=await f.outbox();assert.equal(rows[0].status,'pending');assert.equal(rows[0].last_code,'provider_network');
  await f.pg.query("update private.booking_emails set next_attempt_at=now()");
  assert.equal(await processBookingEmails({db:f.db,resendKey:'re_fixture',fetchImpl:providerOk(calls)}),'accepted');
  rows=await f.outbox();assert.deepEqual(rows.map(r=>r.status),['sent','sent']);
  const bodies=calls.map(c=>JSON.parse(c.options.body));
  const client=bodies.find(b=>b.to[0]==='ana-ficticia@example.test'),clinic=bodies.find(b=>b.to[0]==='clinica-ficticia@example.test');
  assert.ok(client&&clinic,'um e-mail para a cliente e outro para a clínica');
  assert.match(client.subject,/confirmado/);assert.match(client.text,/Olá, Ana!/);assert.match(client.text,/24 horas/);assert.match(client.text,/\(19\) 99034-7698/);
  assert.match(clinic.subject,/^Novo agendamento: Ana Fictícia/);assert.match(clinic.text,/\(11\) 90000-0001/);
  assert.deepEqual(calls.map(c=>c.options.headers['Idempotency-Key']).sort(),rows.map(r=>`booking-email/${r.id}`).sort(),'chave estável por aviso: repetir não duplica');
  // Nada pendente: a próxima rodada fica parada.
  assert.equal(await processBookingEmails({db:f.db,resendKey:'re_fixture',fetchImpl:providerOk(calls)}),'idle');
 }finally{await f.pg.close();}
});

test('aviso antigo é descartado e conta sem e-mail confirmado não recebe',async()=>{
 const f=await fixture();try{
  await f.book(f.at('14:00'));
  await f.pg.query("update private.booking_emails set created_at=now()-interval '25 hours'");
  assert.equal(await processBookingEmails({db:f.db,resendKey:'re_fixture',fetchImpl:providerOk([])}),'idle');
  assert.deepEqual((await f.outbox()).map(r=>r.status),['skipped','skipped']);
  await f.pg.query('delete from private.booking_emails');
  await f.pg.query('update auth.users set email_confirmed_at=null where id=$1',[f.ana]);
  assert.equal((await f.book(f.at('18:00'))).ok,true);
  const calls=[];
  await processBookingEmails({db:f.db,resendKey:'re_fixture',fetchImpl:providerOk(calls)});
  const rows=await f.outbox();
  assert.equal(rows.find(r=>r.audience==='client').last_code,'no_recipient');
  assert.deepEqual(calls.map(c=>JSON.parse(c.options.body).to),[['clinica-ficticia@example.test']]);
 }finally{await f.pg.close();}
});

test('texto do e-mail: horário de São Paulo, HTML escapado, sem dados inventados',()=>{
 const job={id:'11111111-1111-4111-8111-111111111111',event:'rescheduled',audience:'clinic',to:['clinica-ficticia@example.test'],
  facts:{customer_name:'<b>Ana</b>',customer_phone:'+5511900000001',service_name:'Lash Lifting',service_variant:'Com tintura',price_cents:15000,fee_cents:4500,starts_at:'2030-01-08T01:00:00Z',old_starts_at:'2030-01-07T13:00:00Z',cancel_kind:null}};
 const e=buildBookingEmail(job);
 assert.match(whenText('2030-01-08T01:00:00Z'),/07\/01\/2030, às 22:00/,'22h em São Paulo, não 01h do dia seguinte');
 assert.match(e.text,/Antes era: .*07\/01\/2030, às 10:00/);
 assert.ok(!e.html.includes('<b>Ana</b>')&&e.html.includes('&lt;b&gt;Ana&lt;/b&gt;'));
 assert.match(e.text,/R\$ 150,00/);
 assert.doesNotMatch(e.text+e.html,/Endereço|Rua /,'endereço só entra quando a clínica informar');
 assert.throws(()=>buildBookingEmail({...job,to:['a@b.test, c@d.test']}),/invalid_private_job/);
 assert.throws(()=>buildBookingEmail({...job,event:'other'}),/invalid_private_job/);
});

test('o cron continua enviando avisos de vagas mesmo se os e-mails de agendamento falharem',async()=>{
 const secret='s'.repeat(40);
 const db={markProviderReady:async()=>{},enqueue:async()=>{},preparePayloadTransaction:async run=>run({prepare:async()=>null}),
  prepareBookingEmail:async()=>{throw new Error('db down');},finishBookingEmail:async()=>{}};
 const handler=createAvailabilityEmailHandler({db,cronSecret:secret,resendKey:'re_fixture',supabaseUrl:'https://fixture.supabase.co',fetchImpl:providerOk([])});
 const res=await handler(new Request('https://fixture.supabase.co/functions/v1/availability-email',{method:'POST',headers:{authorization:`Bearer ${secret}`},body:'{}'}));
 assert.deepEqual(await res.json(),{status:'idle',booking:'temporarily_unavailable'});
});
