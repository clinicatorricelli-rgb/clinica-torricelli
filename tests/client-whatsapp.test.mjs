import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {buildClientWhatsapp,processClientWhatsapp,CLIENT_TEMPLATES} from '../supabase/functions/_shared/client-whatsapp.mjs';
import {buildOwnerWhatsappV2,TEMPLATES_V2} from '../supabase/functions/_shared/owner-whatsapp.mjs';
// Mensagens de WhatsApp para as clientes e formato novo dos alertas da Eduarda. Dados fictícios; nada sai para a rede.
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
const sched=async(f,starts,now)=>(await q(f,"select kind,to_char(send_at at time zone 'America/Sao_Paulo','DD HH24:MI') as at from private.client_whatsapp_schedule($1,$2)",[starts,now])).map(r=>`${r.kind}@${r.at}`);

test('horários: 27 h antes entre 6h e 22h, sempre com mais de 24 h; 2 h e 20 min antes',async()=>{
 const f=await fixture();try{
  // Atendimento sexta 04/12 às 14:30, agendado dias antes.
  assert.deepEqual(await sched(f,'2026-12-04T14:30:00-03:00','2026-11-30T10:00:00-03:00'),['confirmation@30 10:00','reminder_27h@03 11:30','reminder_2h@04 12:30','reminder_20m@04 14:10']);
  // Sábado às 7h: 27 h antes cairia às 4h → vai às 6h (25 h antes); 2 h antes cairia às 5h → vai às 6h.
  assert.deepEqual(await sched(f,'2026-12-05T07:00:00-03:00','2026-11-30T10:00:00-03:00'),['confirmation@30 10:00','reminder_27h@04 06:00','reminder_2h@05 06:00','reminder_20m@05 06:40']);
  // Sábado às 8h30: 27 h antes = 5h30 → 6h ainda dá 26h30 de antecedência.
  assert.ok((await sched(f,'2026-12-05T08:30:00-03:00','2026-11-30T10:00:00-03:00')).includes('reminder_27h@04 06:00'));
  // Agendou com menos de 27 h: sem o lembrete de 27 h.
  assert.deepEqual(await sched(f,'2026-12-04T14:30:00-03:00','2026-12-03T20:00:00-03:00'),['confirmation@03 20:00','reminder_2h@04 12:30','reminder_20m@04 14:10']);
  // Agendou 2h10 antes: sem o de 2 h (sairia junto com a confirmação), mas com o de 20 min.
  assert.deepEqual(await sched(f,'2026-12-04T14:30:00-03:00','2026-12-04T12:20:00-03:00'),['confirmation@04 12:20','reminder_20m@04 14:10']);
 }finally{await f.pg.close();}
});

test('só recebe quem aceitou; remarcar refaz, cancelar descarta, desligar para tudo',async()=>{
 const f=await fixture();try{
  const a=(await f.book(f.at('14:00'))).appointment;
  assert.equal((await q(f,'select count(*)::int n from private.client_whatsapp_messages'))[0].n,0,'sem aceite, nada');
  assert.deepEqual(await f.as(f.ana,()=>f.rpc('public.set_whatsapp_consent($1)',[true])),{ok:true,enabled:true});
  assert.equal((await f.as(f.ana,()=>f.rpc('public.my_whatsapp_consent()'))).enabled,true);
  const b=(await f.book(f.at('16:00'))).appointment;
  const kinds=async id=>(await q(f,"select kind from private.client_whatsapp_messages where appointment_id=$1 and status='pending' order by send_at",[id])).map(r=>r.kind);
  assert.deepEqual(await kinds(b.id),['confirmation','reminder_27h','reminder_2h','reminder_20m']);
  await f.as(f.ana,()=>f.rpc('public.reschedule_appointment($1,$2)',[b.id,f.at('18:00')]));
  assert.equal((await q(f,"select count(*)::int n from private.client_whatsapp_messages where appointment_id=$1 and status='cancelled'",[b.id]))[0].n,4,'antigos descartados');
  assert.deepEqual(await kinds(b.id),['confirmation','reminder_27h','reminder_2h','reminder_20m'],'novos para o novo horário');
  await f.as(f.ana,()=>f.rpc('public.cancel_appointment($1)',[b.id]));
  assert.deepEqual(await kinds(b.id),[],'cancelou: nada pendente');
  // Envio desligado (padrão): nada é consumido.
  await f.pg.query("update private.client_whatsapp_messages set status='pending',next_attempt_at=now(),send_at=now() where appointment_id=$1 and kind='confirmation' and status='cancelled'",[b.id]);
  assert.equal((await q(f,'select private.prepare_client_whatsapp() as j'))[0].j,null);
  await f.pg.query('update private.client_whatsapp_settings set enabled=true');
  const j=(await q(f,'select private.prepare_client_whatsapp() as j'))[0].j;
  assert.equal(j.skip,true,'agendamento cancelado não recebe mensagem');
  // Desligar o aceite cancela o que estava programado.
  const c=(await f.book(f.at('19:00'))).appointment;
  await f.as(f.ana,()=>f.rpc('public.set_whatsapp_consent($1)',[false]));
  assert.deepEqual(await kinds(c.id),[]);
  await f.pg.exec('set role authenticated');await assert.rejects(f.pg.query('select * from private.client_whatsapp_messages'),/permission denied/);await f.pg.exec('reset role');
  await f.pg.exec('set role anon');await assert.rejects(f.pg.query('select public.set_whatsapp_consent(true)'),/permission denied/);await f.pg.exec('reset role');
 }finally{await f.pg.close();}
});

test('envio: confirmação sai na hora com os dados atuais; lembrete atrasado demais é descartado',async()=>{
 const f=await fixture();try{
  await f.pg.query('update private.client_whatsapp_settings set enabled=true');
  await f.as(f.ana,()=>f.rpc('public.set_whatsapp_consent($1)',[true]));
  const a=(await f.book(f.at('14:00'))).appointment;
  const j=(await q(f,'select private.prepare_client_whatsapp() as j'))[0].j;
  assert.equal(j.kind,'confirmation');assert.equal(j.to,'+5511900000001');assert.equal(j.facts.customer_name,'Ana Fictícia');
  await f.pg.query("select private.finish_client_whatsapp($1,'accepted','wamid.X',null)",[j.id]);
  assert.equal((await q(f,'select private.prepare_client_whatsapp() as j'))[0].j,null,'lembretes ainda não estão na hora');
  await f.pg.query("update private.client_whatsapp_messages set send_at=now()-interval '1 hour',next_attempt_at=now()-interval '1 hour' where kind='reminder_20m'");
  assert.equal((await q(f,'select private.prepare_client_whatsapp() as j'))[0].j,null);
  assert.equal((await q(f,"select status from private.client_whatsapp_messages where kind='reminder_20m'"))[0].status,'skipped');
 }finally{await f.pg.close();}
});

test('textos: variáveis certas para cada modelo e formato novo da Eduarda',async()=>{
 const id='11111111-1111-4111-8111-111111111111',to='+5511900000001';
 const facts={customer_name:'Ana Maria Fictícia',service_name:'Lash Lifting',starts_at:'2026-12-04T17:30:00Z'};
 assert.deepEqual(buildClientWhatsapp({id,to,kind:'confirmation',facts}),{template:CLIENT_TEMPLATES.confirmation,params:['Ana','Lash Lifting','sexta-feira, 04/12','14:30']});
 assert.deepEqual(buildClientWhatsapp({id,to,kind:'reminder_2h',facts}).params,['Ana','Lash Lifting','14:30']);
 assert.deepEqual(buildClientWhatsapp({id,to,kind:'reminder_20m',facts}).params,['Ana','14:30']);
 assert.throws(()=>buildClientWhatsapp({id,to:'+1555',kind:'confirmation',facts}),/invalid_private_job/);
 const calls=[],done=[];
 const db={prepareClientWhatsapp:async()=>calls.length?null:{id,to,kind:'reminder_27h',facts},finishClientWhatsapp:async(...a)=>done.push(a)};
 assert.equal(await processClientWhatsapp({db,whatsappKey:null}),'provider_not_configured');
 assert.equal(await processClientWhatsapp({db,whatsappKey:'k',fetchImpl:async(u,o)=>{calls.push(JSON.parse(o.body));return new Response(JSON.stringify({messages:[{id:'wamid.Y'}]}),{status:200});}}),'accepted');
 assert.equal(calls[0].template.name,'clinica_lembrete_27h');assert.equal(calls[0].to,'5511900000001');
 // Eduarda, formato novo.
 const items=n=>Array.from({length:n},(_,i)=>({starts_at:'2026-11-30T12:00:00Z',service_name:'Lash Lifting',customer_name:'Cliente'+i}));
 const d3=buildOwnerWhatsappV2({id,to,kind:'daily_agenda',facts:{day:'2026-11-30',tomorrow_count:2,items:items(3)}});
 assert.equal(d3.template,TEMPLATES_V2.daily(3));assert.deepEqual(d3.params,['segunda-feira, 30/11','3 atendimentos','09:00 Cliente0 (Lash Lifting)','09:00 Cliente1 (Lash Lifting)','09:00 Cliente2 (Lash Lifting)','2 atendimentos marcados']);
 const d0=buildOwnerWhatsappV2({id,to,kind:'daily_agenda',facts:{day:'2026-11-30',tomorrow_count:0,items:[]}});
 assert.deepEqual([d0.template,d0.params.length],['clinica_agenda_dia_0',2]);
 const d9=buildOwnerWhatsappV2({id,to,kind:'daily_agenda',facts:{day:'2026-11-30',tomorrow_count:0,items:items(9)}});
 assert.equal(d9.template,'clinica_agenda_dia_6');assert.equal(d9.params[7],'+ 4 atendimentos (veja no painel)');assert.equal(d9.params[1],'9 atendimentos');
 const alert=buildOwnerWhatsappV2({id,to,kind:'booked',facts:{customer_name:'Bia',service_name:'Brow Lamination',starts_at:'2026-11-26T14:00:00Z'}},new Date('2026-11-25T16:00:00Z'));
 assert.deepEqual(alert,{template:'clinica_aviso_agenda_v2',params:['Boa tarde','Novo agendamento','Bia','Brow Lamination','26/11 às 11:00']});
 assert.equal(buildOwnerWhatsappV2({id,to,kind:'booked',facts:{customer_name:'B',service_name:'S',starts_at:'2026-11-26T14:00:00Z'}},new Date('2026-11-25T10:00:00Z')).params[0],'Bom dia');
});

test('retorno de status: segredo conferido no banco, status só avança, motivo da recusa não se perde',async()=>{
 const f=await fixture();try{
  await f.as(f.ana,()=>f.rpc('public.set_whatsapp_consent($1)',[true]));
  const b=(await f.book(f.at('14:00'))).appointment;assert.ok(b?.id);
  await f.pg.query("update private.client_whatsapp_messages set status='sent',provider_id='wamid.TESTE1' where appointment_id=$1 and kind='confirmation'",[b.id]);
  const rec=(secret,list)=>q(f,'select private.record_whatsapp_statuses($1,$2::jsonb) n',[secret,JSON.stringify(list)]).then(r=>r[0].n);
  const st=async()=>(await q(f,"select delivery_status s,delivery_code c from private.client_whatsapp_messages where provider_id='wamid.TESTE1'"))[0];
  const SECRET='segredo-ficticio-de-teste-0123456789abcdef';
  assert.equal(await rec(SECRET,[{id:'wamid.TESTE1',status:'delivered'}]),-1,'sem segredo configurado, nada é gravado');
  await f.pg.query("update private.whatsapp_webhook_settings set secret_sha256=encode(sha256(convert_to($1,'utf8')),'hex')",[SECRET]);
  assert.equal(await rec('outro-segredo-qualquer-0123456789abcdef',[{id:'wamid.TESTE1',status:'delivered'}]),-2);
  assert.equal((await st()).s,null);
  assert.equal(await rec(SECRET,[{id:'wamid.TESTE1',status:'delivered',at:'2026-11-26T21:40:10Z',code:null},{id:'wamid.DESCONHECIDO',status:'read'}]),1);
  assert.deepEqual(await st(),{s:'delivered',c:null});
  assert.equal(await rec(SECRET,[{id:'wamid.TESTE1',status:'sent'}]),0,'status atrasado não desfaz o mais novo');
  assert.equal(await rec(SECRET,[{id:'wamid.TESTE1',status:'read'}]),1);
  assert.equal(await rec(SECRET,[{id:'wamid.TESTE1',status:'failed',code:'131026'},{id:'wamid.TESTE1',status:'bogus'}]),1);
  assert.deepEqual(await st(),{s:'failed',c:131026});
  // Mensagem com recusa do provedor descartada por remarcação: o motivo fica junto.
  await f.pg.query("update private.client_whatsapp_messages set last_code='http_429_130429' where appointment_id=$1 and kind='reminder_2h' and status='pending'",[b.id]);
  await f.as(f.ana,()=>f.rpc('public.reschedule_appointment($1,$2)',[b.id,f.at('17:00')]));
  assert.equal((await q(f,"select last_code from private.client_whatsapp_messages where appointment_id=$1 and kind='reminder_2h' and status='cancelled'",[b.id]))[0].last_code,'http_429_130429;appointment_changed');
  // Ninguém além do servidor chama a função.
  await f.pg.exec('set role authenticated');await assert.rejects(f.pg.query("select private.record_whatsapp_statuses('x','[]'::jsonb)"),/permission denied/);await f.pg.exec('reset role');
  assert.equal((await q(f,"select count(*)::int n from pg_tables where schemaname='private' and tablename='whatsapp_webhook_settings' and rowsecurity"))[0].n,1);
 }finally{await f.pg.close();}
});
