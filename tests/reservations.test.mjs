import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {catalog,lateFee} from '../src/catalog.mjs';
// Real embedded Postgres with every migration applied in order. People, phones and answers are
// synthetic. Nothing here sends a message, charges anyone or reaches the network.
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
const questions=['pregnant_or_breastfeeding','previous_eye_procedure','cosmetic_allergy','eye_condition','cancer_treatment','wearing_mascara'];
const intake=()=>({birth_date:'2000-01-01',sex:'prefer_not_to_say',address:'Endereço fictício',answers:Object.fromEntries(questions.map(k=>[k,{value:'no',details:''}])),signed_name:'Pessoa Fictícia',privacy_accepted:true,declaration_accepted:true,procedure_authorized:false,photo_record_authorized:false});
const RULE='falta-rascunho-2026-11';
async function fixture({enabled=true}={}){
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
 const [ana,bia,admin]=[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()];
 for(const id of [ana,bia,admin])await pg.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`fixture-reserva-${id}@example.test`]);
 await pg.query('insert into private.admin_members(user_id) values($1)',[admin]);
 await pg.query("update public.profiles set display_name='Ana Fictícia',phone_e164='+5511900000001' where id=$1",[ana]);
 await pg.query("update public.profiles set display_name='Bia Fictícia',phone_e164='+5511900000002' where id=$1",[bia]);
 async function as(id,fn,aal='aal1'){
  await pg.exec('set role authenticated');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',aal})]);
  try{return await fn();}finally{await pg.exec('reset role');await pg.query("select set_config('request.jwt.claims','',false)");}
 }
 const rpc=async(sql,params=[])=>(await pg.query(`select ${sql} as r`,params)).rows[0].r;
 const asAdmin=fn=>as(admin,fn,'aal2');
 if(enabled)await asAdmin(()=>rpc('public.admin_set_booking_enabled(true)'));
 // Two Mondays ahead: always open, always more than 24 hours away, inside the 90-day horizon.
 const monday=(await pg.query("select to_char(date_trunc('week',now() at time zone 'America/Sao_Paulo')::date+14,'YYYY-MM-DD') as d")).rows[0].d;
 const at=(time,day=monday)=>`${day}T${time}:00-03:00`;
 const book=(id,service,start,request=crypto.randomUUID(),rule=RULE)=>as(id,()=>rpc('public.book_appointment($1,$2,$3,$4)',[service,start,rule,request]));
 const cancel=(id,appointment)=>as(id,()=>rpc('public.cancel_appointment($1)',[appointment]));
 const move=(id,appointment,start)=>as(id,()=>rpc('public.reschedule_appointment($1,$2)',[appointment,start]));
 const mine=id=>as(id,()=>rpc('public.my_appointments()'));
 const slots=async(service,day=monday)=>(await pg.query('select * from public.available_slots($1,$2)',[service,day])).rows.map(s=>new Date(s.starts_at).toISOString());
 // Moves an appointment in time without the opening-hours trigger, to simulate "now" being close to it.
 async function shift(appointment,startsIn,bookedAgo='0 minutes'){
  await pg.exec('set session_replication_role=replica');
  try{await pg.query(`update public.appointments set starts_at=now()+$2::interval,ends_at=now()+$2::interval+interval '60 minutes',busy_until=now()+$2::interval+interval '75 minutes',booked_at=now()-$3::interval where id=$1`,[appointment,startsIn,bookedAgo]);}
  finally{await pg.exec('set session_replication_role=origin');}
 }
 const row=async appointment=>(await pg.query('select * from public.appointments where id=$1',[appointment])).rows[0];
 const fee=async appointment=>(await pg.query('select * from public.appointment_fees where appointment_id=$1',[appointment])).rows[0];
 return{pg,ana,bia,admin,as,asAdmin,rpc,monday,at,book,cancel,move,mine,slots,shift,row,fee};
}
const iso=s=>new Date(s).toISOString();

test('migração completa mantém reservas desligadas e expõe só o necessário a visitantes',async()=>{
 const f=await fixture({enabled:false});try{
  const cfg=(await f.pg.query('select * from public.clinic_settings')).rows[0];
  assert.equal(cfg.booking_enabled,false);assert.equal(cfg.booking_rule_version,RULE);assert.equal(cfg.max_future_bookings,2);
  assert.ok(!('deposit_percent' in cfg)&&!('hold_minutes' in cfg),'sinal e retenção não existem mais');
  await f.pg.exec('set role anon');
  const info=(await f.pg.query('select public.booking_info() as r')).rows[0].r;
  assert.equal(info.enabled,false);assert.equal(info.rule.version,RULE);assert.equal(info.rule.late_notice_hours,24);assert.equal(info.rule.fee_percent,30);assert.equal(info.rule.grace_minutes,60);
  assert.match(info.rule.body,/Não há pagamento para agendar/);
  const open=(await f.pg.query('select * from public.available_slots(1,$1)',[f.monday])).rows;
  assert.ok(open.length>0);assert.equal(open[0].price_cents,15000);assert.equal(open[0].fee_cents,4500);assert.ok(!('deposit_cents' in open[0]));
  await assert.rejects(f.pg.query('select * from public.appointments'),/permission denied/);
  await assert.rejects(f.pg.query('select * from public.appointment_fees'),/permission denied/);
  await assert.rejects(f.pg.query('select public.my_appointments()'),/permission denied/);
  await assert.rejects(f.pg.query('select public.book_appointment(1,$1,$2,$3)',[f.at('14:00'),RULE,crypto.randomUUID()]),/permission denied/);
  await f.pg.exec('reset role');
  const refused=await f.book(f.ana,1,f.at('14:00'));assert.deepEqual(refused,{ok:false,reason:'booking_disabled'});
  await assert.rejects(f.as(f.ana,()=>f.rpc('public.admin_set_booking_enabled(true)')),/Admin MFA required/);
  await assert.rejects(f.as(f.admin,()=>f.rpc('public.admin_set_booking_enabled(true)'),'aal1'),/Admin MFA required/);
  await assert.rejects(f.pg.query('update public.clinic_settings set booking_enabled=true,booking_rule_version=null'),/booking_requires_rule/);
  assert.equal((await f.asAdmin(()=>f.rpc('public.admin_set_booking_enabled(true)'))).enabled,true);
  assert.equal((await f.book(f.ana,1,f.at('14:00'))).ok,true);
  assert.equal((await f.pg.query('select count(*)::int as n from public.appointments')).rows[0].n,1);
  const flags=(await f.pg.query('select id,price_cents,requires_intake from public.services order by id')).rows;
  for(const s of flags){const c=catalog.find(x=>x.id===s.id);assert.equal(s.requires_intake,c.requires_intake,`ficha exigida no serviço ${s.id}`);assert.equal(lateFee(s.price_cents),Math.floor((s.price_cents*30+50)/100));}
 }finally{await f.pg.close();}
});

test('agendamento usa identidade da sessão, congela valores, é idempotente e respeita ficha, cadastro e limite',async()=>{
 const f=await fixture();try{
  const request=crypto.randomUUID();
  const first=await f.book(f.ana,1,f.at('14:00'),request);
  assert.equal(first.ok,true);const a=first.appointment;
  assert.equal(a.status,'confirmed');assert.equal(a.price_cents,15000);assert.equal(a.fee_cents,4500);assert.equal(a.rule_version,RULE);
  const again=await f.book(f.ana,1,f.at('14:00'),request);assert.equal(again.repeated,true);assert.equal(again.appointment.id,a.id);
  const stored=await f.row(a.id);assert.equal(stored.customer_id,f.ana);assert.ok(stored.rule_accepted_at);assert.equal(stored.busy_until.getTime()-stored.ends_at.getTime(),15*60000);
  assert.ok(!(await f.slots(1)).includes(iso(f.at('14:00'))),'horário marcado sai da lista');
  assert.ok(!(await f.slots(1)).includes(iso(f.at('13:00'))),'intervalo de 15 minutos também é respeitado');
  assert.deepEqual(await f.book(f.bia,1,f.at('14:00')),{ok:false,reason:'slot_unavailable'});
  assert.deepEqual(await f.book(f.bia,1,f.at('14:05')),{ok:false,reason:'slot_unavailable'},'fora da grade de 15 minutos');
  assert.deepEqual(await f.book(f.bia,1,f.at('08:00')),{ok:false,reason:'slot_unavailable'},'manhã restrita continua fechada');
  assert.deepEqual(await f.book(f.bia,1,f.at('14:00'),crypto.randomUUID(),'versao-antiga'),{ok:false,reason:'rule_changed'});
  assert.deepEqual(await f.book(f.admin,1,f.at('18:00')),{ok:false,reason:'profile_incomplete'},'sem nome e WhatsApp não agenda');
  assert.deepEqual(await f.book(f.ana,2,f.at('16:00')),{ok:false,reason:'intake_required'},'extensão de cílios exige ficha');
  await f.as(f.ana,()=>f.pg.query('select public.save_client_intake($1::jsonb,0)',[JSON.stringify(intake())]));
  const second=await f.book(f.ana,2,f.at('16:00'));assert.equal(second.ok,true);assert.equal((await f.row(second.appointment.id)).intake_revision,1);
  assert.deepEqual(await f.book(f.ana,1,f.at('19:00')),{ok:false,reason:'limit_reached',limit:2});
  assert.equal((await f.pg.query('select count(*)::int as n from public.appointments where customer_id=$1',[f.ana])).rows[0].n,2,'recusas não gravam nada');
  // A customer never sees or changes someone else's records, and cannot write directly.
  await f.as(f.bia,async()=>{
   assert.equal((await f.pg.query('select * from public.appointments')).rows.length,0);
   assert.equal((await f.pg.query('select * from public.appointment_fees')).rows.length,0);
   await assert.rejects(f.pg.query('update public.appointments set status=$1',['cancelled']),/permission denied/);
   await assert.rejects(f.pg.query('insert into public.appointment_fees(appointment_id,customer_id,reason,amount_cents) values($1,$2,$3,1)',[a.id,f.bia,'no_show']),/permission denied/);
   await assert.rejects(f.pg.query('select * from private.booking_notes'),/permission denied/);
   assert.deepEqual(await f.rpc('public.cancel_appointment($1)',[a.id]),{ok:false,reason:'not_found'});
   assert.deepEqual(await f.rpc('public.reschedule_appointment($1,$2)',[a.id,f.at('20:00')]),{ok:false,reason:'not_found'});
   assert.equal((await f.pg.query('select * from public.reschedule_slots($1,$2)',[a.id,f.monday])).rows.length,0);
  });
  const mine=await f.mine(f.ana);
  assert.equal(mine.items.length,2);assert.equal(mine.future_count,2);assert.equal(mine.open_fee_cents,0);
  assert.ok(mine.items.every(i=>i.free_change&&i.can_change&&i.fee===null));
 }finally{await f.pg.close();}
});

test('cancelamento: aviso com 24 h ou na 1ª hora após marcar é grátis; depois disso só gera proposta de taxa',async()=>{
 const f=await fixture();try{
  const early=(await f.book(f.ana,1,f.at('14:00'))).appointment;
  const r1=await f.cancel(f.ana,early.id);assert.equal(r1.ok,true);assert.equal(r1.kind,'client_early');assert.equal(r1.fee_proposed_cents,null);
  assert.equal((await f.cancel(f.ana,early.id)).repeated,true);
  assert.ok((await f.slots(1)).includes(iso(f.at('14:00'))),'horário cancelado volta a ficar livre');
  assert.equal(await f.fee(early.id),undefined);
  const grace=(await f.book(f.ana,1,f.at('15:00'))).appointment;
  await f.shift(grace.id,'5 hours','30 minutes');
  const r2=await f.cancel(f.ana,grace.id);assert.equal(r2.kind,'client_grace');assert.equal(await f.fee(grace.id),undefined);
  const late=(await f.book(f.ana,1,f.at('16:00'))).appointment;
  await f.shift(late.id,'10 hours','3 hours');
  const r3=await f.cancel(f.ana,late.id);assert.equal(r3.kind,'client_late');assert.equal(r3.fee_proposed_cents,4500);
  const proposed=await f.fee(late.id);assert.equal(proposed.status,'proposed');assert.equal(proposed.reason,'late_cancellation');assert.equal(proposed.amount_cents,4500);
  assert.equal((await f.book(f.ana,1,f.at('18:00'))).ok,true,'proposta ainda não confirmada não bloqueia');
  const started=(await f.book(f.bia,1,f.at('20:00'))).appointment;await f.shift(started.id,'-10 minutes','2 days');
  assert.deepEqual(await f.cancel(f.bia,started.id),{ok:false,reason:'already_started'});
 }finally{await f.pg.close();}
});

test('remarcação livre até 24 h antes, inclusive sobre o próprio horário; depois disso é recusada',async()=>{
 const f=await fixture();try{
  const a=(await f.book(f.ana,1,f.at('14:00'))).appointment;
  await f.book(f.bia,1,f.at('18:00'));
  const options=(await f.as(f.ana,()=>f.pg.query('select * from public.reschedule_slots($1,$2)',[a.id,f.monday]))).rows.map(s=>iso(s.starts_at));
  assert.ok(options.includes(iso(f.at('14:30'))),'pode deslocar 30 minutos sobre o próprio horário');
  assert.ok(!options.includes(iso(f.at('14:00')))&&!options.includes(iso(f.at('18:00'))));
  const moved=await f.move(f.ana,a.id,f.at('14:30'));assert.equal(moved.ok,true);assert.equal(iso(moved.appointment.starts_at),iso(f.at('14:30')));
  assert.equal((await f.row(a.id)).reschedule_count,1);
  assert.equal((await f.move(f.ana,a.id,f.at('14:30'))).repeated,true);
  assert.deepEqual(await f.move(f.ana,a.id,f.at('18:00')),{ok:false,reason:'slot_unavailable'});
  assert.ok((await f.slots(1)).includes(iso(f.at('13:15'))),'faixa que só conflitava com o horário antigo foi liberada');
  await f.shift(a.id,'10 hours','3 hours');
  assert.deepEqual(await f.move(f.ana,a.id,f.at('20:00')),{ok:false,reason:'too_late'});
  assert.equal((await f.mine(f.ana)).items[0].free_change,false);
 }finally{await f.pg.close();}
});

test('falta, taxa e baixa dependem sempre da Eduarda com segundo fator; taxa confirmada bloqueia novo agendamento',async()=>{
 const f=await fixture();try{
  const a=(await f.book(f.ana,1,f.at('14:00'))).appointment;
  const decide=(sql,params,aal='aal2',who=f.admin)=>f.as(who,()=>f.rpc(sql,params),aal);
  assert.deepEqual(await decide('public.admin_mark_attendance($1,$2,$3)',[a.id,'no_show_fee',null]),{ok:false,reason:'not_started'});
  await f.shift(a.id,'-2 hours','3 days');
  for(const [who,aal] of [[f.ana,'aal2'],[f.admin,'aal1']])await assert.rejects(decide('public.admin_mark_attendance($1,$2,$3)',[a.id,'no_show_fee',null],aal,who),/Admin MFA required/);
  assert.deepEqual(await decide('public.admin_mark_attendance($1,$2,$3)',[a.id,'no_show_waived',' ']),{ok:false,reason:'note_required'});
  const marked=await decide('public.admin_mark_attendance($1,$2,$3)',[a.id,'no_show_fee','Não avisou']);
  assert.deepEqual(marked,{ok:true,status:'no_show',fee_status:'confirmed'});
  const fee=await f.fee(a.id);assert.equal(fee.reason,'no_show');assert.equal(fee.amount_cents,4500);assert.equal(fee.decided_by,f.admin);
  assert.deepEqual(await f.book(f.ana,1,f.at('15:00')),{ok:false,reason:'outstanding_fee'});
  const mine=await f.mine(f.ana);assert.equal(mine.open_fee_cents,4500);assert.equal(mine.items[0].fee.status,'confirmed');
  assert.ok(!JSON.stringify(mine).includes('Não avisou'),'anotação interna não chega à cliente');
  const overview=await decide('public.admin_booking_overview($1,$2)',[new Date().toISOString().slice(0,10),f.monday]);
  assert.equal(overview.open_fees.length,1);assert.equal(overview.open_fees[0].customer.phone,'+5511900000001');
  assert.equal(overview.items.find(i=>i.id===a.id).notes[0].note,'Não avisou');
  await assert.rejects(f.as(f.ana,()=>f.rpc('public.admin_booking_overview($1,$2)',[f.monday,f.monday])),/Admin MFA required/);
  assert.deepEqual(await decide('public.admin_settle_fee($1,$2)',[fee.id,'Conferido no extrato']),{ok:true,status:'paid'});
  assert.equal((await decide('public.admin_settle_fee($1,$2)',[fee.id,null])).repeated,true);
  assert.deepEqual(await decide('public.admin_mark_attendance($1,$2,$3)',[a.id,'completed',null]),{ok:false,reason:'fee_already_paid'});
  assert.equal((await f.book(f.ana,1,f.at('15:00'))).ok,true,'baixa libera novos agendamentos');
  const b=(await f.book(f.bia,1,f.at('17:00'))).appointment;await f.shift(b.id,'10 hours','3 hours');
  await f.cancel(f.bia,b.id);const proposal=await f.fee(b.id);
  assert.deepEqual(await decide('public.admin_settle_fee($1,$2)',[proposal.id,null]),{ok:false,reason:'not_open',status:'proposed'});
  assert.deepEqual(await decide('public.admin_decide_fee($1,$2,$3)',[proposal.id,'confirm',null]),{ok:true,status:'confirmed'});
  assert.equal((await decide('public.admin_decide_fee($1,$2,$3)',[proposal.id,'confirm',null])).repeated,true);
  assert.deepEqual(await f.book(f.bia,1,f.at('19:00')),{ok:false,reason:'outstanding_fee'});
  assert.deepEqual(await decide('public.admin_decide_fee($1,$2,$3)',[proposal.id,'waive','Justificou depois']),{ok:true,status:'waived'});
  assert.deepEqual(await decide('public.admin_decide_fee($1,$2,$3)',[proposal.id,'confirm',null]),{ok:false,reason:'not_decidable',status:'waived'});
  assert.equal((await f.book(f.bia,1,f.at('19:00'))).ok,true);
  const c=(await f.book(f.bia,2,f.at('11:00'))).ok;assert.equal(c,false,'Bia ainda sem ficha');
  const future=(await f.mine(f.bia)).items.find(i=>i.status==='confirmed');
  await assert.rejects(decide('public.admin_cancel_appointment($1,$2)',[future.id,'  ']),/reason required/);
  assert.deepEqual(await decide('public.admin_cancel_appointment($1,$2)',[future.id,'Eduarda indisponível']),{ok:true});
  assert.equal((await f.row(future.id)).cancel_kind,'clinic');assert.equal(await f.fee(future.id),undefined);
  assert.deepEqual(await decide('public.admin_set_booking_enabled(false)',[]),{ok:true,enabled:false});
  assert.deepEqual(await f.book(f.bia,1,f.at('20:00')),{ok:false,reason:'booking_disabled'});
  const log=(await f.pg.query("select action from public.audit_log where action like 'fee.%' or action like 'appointment.%' order by id")).rows.map(r=>r.action);
  for(const action of ['appointment.booked','appointment.attendance','fee.paid','fee.confirmed','fee.waived','appointment.cancelled_by_clinic'])assert.ok(log.includes(action),action);
 }finally{await f.pg.close();}
});

test('publicação de horários e avisos por e-mail continuam funcionando depois da migração',async()=>{
 const f=await fixture();try{
  const before=await f.slots(1);
  const result=await f.asAdmin(async()=>{
   const draft=(await f.pg.query("select * from public.save_availability_draft($1,'open','07:00','11:00','Fixture manhã')",[f.monday])).rows[0];
   return f.rpc('public.publish_availability_draft($1,$2)',[draft.id,draft.revision]);
  });
  assert.equal(result.published,true);assert.equal(result.notice_pending,true);
  const after=await f.slots(1);assert.ok(after.length>before.length);assert.ok(after.includes(iso(f.at('07:00'))));
  assert.equal((await f.pg.query('select private.email_publication_available($1) as ok',[result.publication_id])).rows[0].ok,true);
  assert.equal((await f.book(f.ana,1,f.at('07:00'))).ok,true,'manhã publicada pode ser agendada');
 }finally{await f.pg.close();}
});

test('antecedência mínima esconde e recusa horários próximos; só a Eduarda ajusta os limites',async()=>{
 const f=await fixture();try{
  const info=(await f.pg.query('select public.booking_info() as r')).rows[0].r;assert.equal(info.min_notice_minutes,120);
  await assert.rejects(f.as(f.ana,()=>f.rpc('public.admin_set_booking_limits(2880,2)')),/Admin MFA required/);
  assert.deepEqual(await f.asAdmin(()=>f.rpc('public.admin_set_booking_limits(5000,2)')),{ok:false,reason:'invalid_limits'});
  assert.deepEqual(await f.asAdmin(()=>f.rpc('public.admin_set_booking_limits(2880,3)')),{ok:true,min_notice_minutes:2880,max_future_bookings:3});
  // With 48 hours of notice, nothing today or tomorrow can be offered or booked.
  const today=(await f.pg.query("select to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM-DD') as d")).rows[0].d;
  const tomorrow=(await f.pg.query("select to_char((now() at time zone 'America/Sao_Paulo')::date+1,'YYYY-MM-DD') as d")).rows[0].d;
  assert.equal((await f.slots(1,today)).length,0);assert.equal((await f.slots(1,tomorrow)).length,0);
  assert.deepEqual(await f.book(f.ana,1,`${tomorrow}T19:00:00-03:00`),{ok:false,reason:'slot_unavailable'});
  assert.ok((await f.slots(1)).length>0,'datas distantes continuam abertas');
  const overview=await f.asAdmin(()=>f.rpc('public.admin_booking_overview($1,$2)',[today,f.monday]));
  assert.equal(overview.min_notice_minutes,2880);assert.equal(overview.max_future_bookings,3);
  assert.ok((await f.pg.query("select 1 from public.audit_log where action='booking.limits_changed'")).rows.length===1);
 }finally{await f.pg.close();}
});
