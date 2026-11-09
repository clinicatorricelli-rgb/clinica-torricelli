import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';

// Real Postgres semantics for the private queue. These tests do not send email.
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
 for(const name of ['202611040001_foundation.sql','202611040002_catalog.sql','202611040003_notification_preferences.sql','202611040004_availability_workflow.sql','202611050002_email_notifications.sql']){
  await pg.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
 }
 const admin=crypto.randomUUID();
 await pg.query("insert into auth.users(id,email,email_confirmed_at) values($1,'fixture-admin@example.test',now())",[admin]);
 await pg.query('insert into private.admin_members(user_id) values($1)',[admin]);
 const day=(await pg.query("select to_char(date_trunc('week',now() at time zone 'America/Sao_Paulo')::date+7,'YYYY-MM-DD') as day")).rows[0].day;
 async function asUser(id,fn,aal='aal1'){
  await pg.exec('set role authenticated');
  await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal,role:'authenticated'})]);
  try{return await fn();}finally{await pg.exec('reset role');}
 }
 async function user(label,{confirmed=true}={}){
  const id=crypto.randomUUID(),email=`fixture-${label}-${id}@example.test`;
  await pg.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)',[id,email,confirmed]);
  return {id,email};
 }
 async function preference(customer,channel,enabled){
  return asUser(customer.id,()=>pg.query('select public.set_availability_alert_preference($1,$2,$3)',[channel,enabled,'new-availability-v1']));
 }
 async function publish(offset=0,kind='open'){
  return asUser(admin,async()=>{
   const d=(await pg.query("select * from public.save_availability_draft(($1::date+$2::integer),$3,case when $3='closed_day' then null else '07:00'::time end,case when $3='closed_day' then null else '11:00'::time end,'Fixture email')",[day,offset,kind])).rows[0];
   const result=(await pg.query('select public.publish_availability_draft($1,$2) as result',[d.id,d.revision])).rows[0].result;
   assert.equal(result.published,true);
   return {...result,draft:d};
  },'aal2');
 }
 return {pg,admin,day,asUser,user,preference,publish};
}

async function activate(pg){
 await pg.exec(`update private.availability_email_settings set enabled=true,provider_ready=true,
 activated_at=clock_timestamp(),start_hour=0,end_hour=24,consolidation_minutes=0;`);
}
async function prepare(pg){return (await pg.query('select private.prepare_availability_email() as job')).rows[0].job;}
async function enqueue(pg){return (await pg.query('select private.enqueue_availability_emails() as count')).rows[0].count;}
async function deliveries(pg){return (await pg.query('select * from private.availability_email_deliveries order by created_at,id')).rows;}
async function freeze(pg){
 await pg.exec('begin');
 try{
  const job=await prepare(pg);
  if(job&&!job.payload){
   job.payload={from:'Clínica Torricelli <acesso@clinicatorricelli.com.br>',to:[job.to],subject:'Novas vagas de teste',text:`Datas: ${job.days.join(', ')}. Aviso não garante reserva.`,headers:{'List-Unsubscribe':`<https://example.test/unsubscribe?token=${job.unsubscribe_token}>`}};
   await pg.query('update private.availability_email_deliveries set payload=$2::jsonb where id=$1',[job.id,JSON.stringify(job.payload)]);
  }
  await pg.exec('commit');return job;
 }catch(error){await pg.exec('rollback');throw error;}
}
async function claim(pg,id){return (await pg.query('select private.claim_availability_email($1) as job',[id])).rows[0].job;}
async function finish(pg,id,outcome,providerId=null,code='test'){
 await pg.query('select private.finish_availability_email($1,$2,$3,$4)',[id,outcome,providerId,code]);
}

test('avisos começam desligados e a ativação não dispara o histórico anterior',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const settings=(await pg.query('select * from private.availability_email_settings')).rows[0];
  assert.equal(settings.enabled,false);assert.equal(settings.provider_ready,false);assert.equal(settings.daily_limit,1);
  assert.equal(settings.start_hour,8);assert.equal(settings.end_hour,20);
  const customer=await f.user('history');await f.preference(customer,'email',true);
  await f.publish();await enqueue(pg);assert.equal(await prepare(pg),null);
  await activate(pg);
  await enqueue(pg);
  assert.equal(await prepare(pg),null,'Publicação anterior ao instante de ativação não vira campanha');
  assert.equal((await deliveries(pg)).length,0);
  await f.publish(1);
  await enqueue(pg);
  const job=await prepare(pg);assert.ok(job);assert.equal(job.to,customer.email);
 }finally{await pg.close();}
});

test('fila, segredos e despacho são privados; admin com MFA vê somente resumo',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('privacy');await f.preference(customer,'email',true);await activate(pg);await f.publish();await enqueue(pg);
  for(const role of ['anon','authenticated','service_role']){
   await pg.exec(`set role ${role}`);
   for(const table of ['availability_email_settings','availability_email_deliveries','availability_email_items']){
    await assert.rejects(pg.query(`select * from private.${table}`),/permission denied/);
   }
   await assert.rejects(pg.query('select private.prepare_availability_email()'),/permission denied/);
   await pg.exec('reset role');
  }
  await assert.rejects(f.asUser(customer.id,()=>pg.query('select public.availability_email_status()')),/Admin|MFA|permission/i);
  await assert.rejects(f.asUser(f.admin,()=>pg.query('select public.availability_email_status()')),/Admin|MFA|permission/i);
  const summary=(await f.asUser(f.admin,()=>pg.query('select public.availability_email_status() as summary'),'aal2')).rows[0].summary;
  assert.ok(summary&&typeof summary==='object');
  assert.ok(!JSON.stringify(summary).includes(customer.email));
  assert.ok(!JSON.stringify(summary).includes('unsubscribe_token'));
 }finally{await pg.close();}
});

test('só entra na fila quem já autorizou e-mail com destino confirmado na publicação',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const enabled=await f.user('enabled'),whatsapp=await f.user('whatsapp'),none=await f.user('none'),late=await f.user('late'),unconfirmed=await f.user('unconfirmed',{confirmed:false});
  await assert.rejects(f.preference(unconfirmed,'email',true),/Confirmed email required/);
  await f.preference(enabled,'email',true);await f.preference(enabled,'whatsapp',true);
  await f.preference(whatsapp,'whatsapp',true);
  await activate(pg);await f.publish();await f.preference(late,'email',true);await enqueue(pg);
  const queue=await deliveries(pg);
  assert.equal(queue.length,1);assert.equal(queue[0].customer_id,enabled.id);
  const job=await prepare(pg);assert.equal(job.to,enabled.email);
  assert.equal((await pg.query('select count(*)::integer as n from private.availability_email_deliveries where customer_id=any($1::uuid[])',[[whatsapp.id,none.id,late.id]])).rows[0].n,0);
  assert.match(job.unsubscribe_token,/^[0-9a-f]{64}$/);
 }finally{await pg.close();}
});

test('consolida publicações, congela o corpo e repete com a mesma identidade até aceite',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('retry');await f.preference(customer,'email',true);await activate(pg);
  const first=await f.publish(),second=await f.publish(1);await enqueue(pg);await enqueue(pg);
  const repeated=(await f.asUser(f.admin,()=>pg.query('select public.publish_availability_draft($1,$2) as result',[first.draft.id,first.draft.revision]),'aal2')).rows[0].result;
  assert.equal(repeated.already_published,true);
  assert.equal((await deliveries(pg)).length,1);assert.equal((await pg.query('select * from private.availability_email_items')).rows.length,2);
  const initial=await freeze(pg);assert.equal(initial.days.length,2);
  assert.equal(await prepare(pg),null,'Lease ativo não pode preparar o mesmo envio de novo');
  await pg.exec('begin');
  try{
   const locked=await claim(pg,initial.id);assert.deepEqual(locked.payload,initial.payload);
   assert.ok((await pg.query("select count(*)::integer as n from pg_locks where locktype='advisory' and pid=pg_backend_pid() and granted")).rows[0].n>=2,'Mantém os locks dos dias durante o despacho');
   await finish(pg,initial.id,'retry',null,'network_timeout');await pg.exec('commit');
  }catch(error){await pg.exec('rollback');throw error;}
  assert.equal(await prepare(pg),null,'Retry respeita o backoff');
  await f.publish(2);await enqueue(pg);
  assert.equal((await pg.query('select * from private.availability_email_items')).rows.length,2,'Publicação posterior não altera o corpo já congelado');
  await pg.query("update private.availability_email_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[initial.id]);
  const retry=await freeze(pg);
  assert.equal(retry.id,initial.id);assert.equal(retry.unsubscribe_token,initial.unsubscribe_token);assert.deepEqual(retry.payload,initial.payload);assert.deepEqual(retry.days,initial.days);
  await pg.exec('begin');try{assert.ok(await claim(pg,retry.id));await finish(pg,retry.id,'accepted',crypto.randomUUID(),'http_200');await pg.exec('commit');}catch(error){await pg.exec('rollback');throw error;}
  const accepted=(await deliveries(pg))[0];assert.equal(accepted.status,'accepted');assert.ok(accepted.accepted_at);assert.equal(accepted.attempts,2);
  assert.equal(await prepare(pg),null);
  assert.notEqual(first.publication_id,second.publication_id);
 }finally{await pg.close();}
});

test('revogar ou trocar o destino suprime inclusive um envio preparado',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const revoked=await f.user('revoked');await f.preference(revoked,'email',true);await f.preference(revoked,'whatsapp',true);
  await activate(pg);await f.publish();await enqueue(pg);const prepared=await freeze(pg);assert.ok(prepared);
  await f.preference(revoked,'email',false);
  assert.equal(await claim(pg,prepared.id),null);
  const prefs=(await pg.query('select email_enabled,whatsapp_enabled from public.notification_preferences where customer_id=$1',[revoked.id])).rows[0];
  assert.deepEqual(prefs,{email_enabled:false,whatsapp_enabled:true});assert.equal((await deliveries(pg))[0].status,'suppressed');
  const changed=await f.user('changed');await f.preference(changed,'email',true);await f.preference(changed,'whatsapp',true);
  await f.publish(1);await enqueue(pg);const second=await freeze(pg);assert.equal(second.to,changed.email);
  await pg.query('update auth.users set email=$2,email_confirmed_at=null where id=$1',[changed.id,`fixture-new-${changed.id}@example.test`]);
  assert.equal(await claim(pg,second.id),null);
  const after=(await pg.query('select email_enabled,whatsapp_enabled,email_destination_hash from public.notification_preferences where customer_id=$1',[changed.id])).rows[0];
  assert.deepEqual(after,{email_enabled:false,whatsapp_enabled:true,email_destination_hash:null});
  assert.equal((await pg.query('select status from private.availability_email_deliveries where id=$1',[second.id])).rows[0].status,'suppressed');
 }finally{await pg.close();}
});

test('descadastro por token só revoga e-mail e é idempotente e não forjável',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('unsubscribe');await f.preference(customer,'email',true);await f.preference(customer,'whatsapp',true);
  await activate(pg);await f.publish();await enqueue(pg);const job=await freeze(pg);
  for(const token of [null,'',job.id,'0'.repeat(64)])assert.equal((await pg.query('select private.unsubscribe_availability_email($1) as changed',[token])).rows[0].changed,false);
  assert.equal((await pg.query('select email_enabled from public.notification_preferences where customer_id=$1',[customer.id])).rows[0].email_enabled,true);
  for(let i=0;i<2;i++)assert.equal((await pg.query('select private.unsubscribe_availability_email($1) as changed',[job.unsubscribe_token])).rows[0].changed,true);
  assert.deepEqual((await pg.query('select email_enabled,whatsapp_enabled from public.notification_preferences where customer_id=$1',[customer.id])).rows[0],{email_enabled:false,whatsapp_enabled:true});
  assert.equal((await pg.query("select count(*)::integer as n from public.notification_consent_events where customer_id=$1 and channel='email' and not granted",[customer.id])).rows[0].n,1);
  assert.equal((await deliveries(pg))[0].status,'suppressed');assert.equal(await claim(pg,job.id),null);
 }finally{await pg.close();}
});

test('retirada e bloqueio posterior impedem avisar disponibilidade que deixou de existir',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('withdrawn');await f.preference(customer,'email',true);await activate(pg);
  const first=await f.publish();await enqueue(pg);const job=await freeze(pg);
  await f.asUser(f.admin,()=>pg.query('select public.withdraw_availability_publication($1)',[first.publication_id]),'aal2');
  assert.equal(await claim(pg,job.id),null);assert.equal((await deliveries(pg))[0].status,'suppressed');
  const blocked=await f.user('blocked');await f.preference(blocked,'email',true);await f.publish(1);await enqueue(pg);const next=await freeze(pg);assert.equal(next.to,blocked.email);
  await f.publish(1,'closed_day');assert.equal(await claim(pg,next.id),null);
  assert.equal((await pg.query('select status from private.availability_email_deliveries where id=$1',[next.id])).rows[0].status,'suppressed');
 }finally{await pg.close();}
});

test('ambiguidade fora da janela de idempotência e credencial recusada bloqueiam repetição',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('horizon');await f.preference(customer,'email',true);await activate(pg);await f.publish();await enqueue(pg);const job=await freeze(pg);
  await pg.query("update private.availability_email_deliveries set status='retry',first_attempt_at=now()-interval '24 hours',next_attempt_at=now()-interval '1 second',lease_until=null where id=$1",[job.id]);
  assert.equal(await prepare(pg),null);assert.equal((await deliveries(pg))[0].status,'unknown');
  const other=await f.user('invalid-credential');await f.preference(other,'email',true);await f.publish(1);await enqueue(pg);const failed=await freeze(pg);assert.equal(failed.to,other.email);
  await finish(pg,failed.id,'failed',null,'http_401');
  const settings=(await pg.query('select provider_ready,paused_until from private.availability_email_settings')).rows[0];assert.equal(settings.provider_ready,false);assert.ok(settings.paused_until);
  assert.equal(await prepare(pg),null);
 }finally{await pg.close();}
});

test('cota global e janela de horário adiam o despacho sem consumir tentativas do provedor',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const a=await f.user('quota-a'),b=await f.user('quota-b');await f.preference(a,'email',true);await f.preference(b,'email',true);
  await activate(pg);await pg.exec('update private.availability_email_settings set global_daily_limit=1');await f.publish();await enqueue(pg);
  const hour=(await pg.query("select extract(hour from now() at time zone 'America/Sao_Paulo')::integer as hour")).rows[0].hour;
  await pg.query('update private.availability_email_settings set start_hour=$1,end_hour=$2',[hour===0?1:0,hour===0?24:1]);
  assert.equal(await prepare(pg),null);assert.ok((await deliveries(pg)).every(j=>j.attempts===0));
  await pg.exec('update private.availability_email_settings set start_hour=0,end_hour=24');
  const first=await freeze(pg);assert.ok(await claim(pg,first.id));await finish(pg,first.id,'accepted',crypto.randomUUID(),'http_200');
  assert.equal(await prepare(pg),null,'Cota global preenchida deve adiar o próximo job');
  const next=(await deliveries(pg)).find(j=>j.id!==first.id);assert.equal(next.attempts,0);assert.equal(next.first_attempt_at,null);assert.equal(next.status,'pending');
 }finally{await pg.close();}
});

test('webhook anterior ao aceite é reconciliado e replay não desfaz supressão por reclamação',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('webhook');await f.preference(customer,'email',true);await activate(pg);await f.publish();await enqueue(pg);const job=await freeze(pg);
  const providerId=crypto.randomUUID(),eventId='evt-'+crypto.randomUUID();
  await pg.query("select private.record_availability_email_event($1,$2,'email.complained')",[eventId,providerId]);
  assert.ok(await claim(pg,job.id));await finish(pg,job.id,'accepted',providerId,'http_200');
  assert.equal((await deliveries(pg))[0].status,'failed','Evento que chegou antes do provider_id precisa ser reaplicado após o aceite');
  assert.equal((await pg.query('select reason from private.availability_email_suppressions')).rows[0].reason,'complained');
  await pg.query("select private.record_availability_email_event($1,$2,'email.complained')",[eventId,providerId]);
  await pg.query("select private.record_availability_email_event($1,$2,'email.delivered')",['evt-'+crypto.randomUUID(),providerId]);
  assert.equal((await deliveries(pg))[0].status,'failed','Entrega atrasada não pode retirar supressão');
  assert.equal((await pg.query('select count(*)::integer as n from private.availability_email_events where event_id=$1',[eventId])).rows[0].n,1);
  assert.equal((await pg.query('select count(*)::integer as n from private.availability_email_suppressions')).rows[0].n,1);
 }finally{await pg.close();}
});

test('jobs de outro dia expiram sem iniciar envio e despacho preparado antigo fica incerto',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const pending=await f.user('old-pending'),retried=await f.user('old-retry'),prepared=await f.user('old-prepared');
  for(const customer of [pending,retried,prepared])await f.preference(customer,'email',true);
  await activate(pg);await f.publish();await enqueue(pg);
  await pg.query("update private.availability_email_deliveries set send_day=(now() at time zone 'America/Sao_Paulo')::date-1,next_attempt_at='-infinity'::timestamptz where customer_id=any($1::uuid[])",[[pending.id,retried.id]]);
  await pg.query("update private.availability_email_deliveries set status='retry',attempts=1,first_attempt_at=now()-interval '1 hour' where customer_id=$1",[retried.id]);
  assert.equal(await prepare(pg),null);assert.equal(await prepare(pg),null);
  const before=await deliveries(pg);
  assert.equal(before.find(j=>j.customer_id===pending.id).status,'suppressed');assert.equal(before.find(j=>j.customer_id===pending.id).attempts,0);
  assert.equal(before.find(j=>j.customer_id===retried.id).status,'unknown');
  const frozen=await freeze(pg);assert.equal(frozen.to,prepared.email);
  await pg.query("update private.availability_email_deliveries set send_day=(now() at time zone 'America/Sao_Paulo')::date-1 where id=$1",[frozen.id]);
  assert.equal(await claim(pg,frozen.id),null);
  assert.equal((await pg.query('select status from private.availability_email_deliveries where id=$1',[frozen.id])).rows[0].status,'unknown');
 }finally{await pg.close();}
});

test('reserva durável de tentativa conta na cota mesmo se o aceite não foi persistido',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const a=await f.user('reservation-a'),b=await f.user('reservation-b');await f.preference(a,'email',true);await f.preference(b,'email',true);
  await activate(pg);await pg.exec('update private.availability_email_settings set global_daily_limit=1');await f.publish();await enqueue(pg);
  const first=await freeze(pg);assert.ok(first);
  assert.ok(await claim(pg,first.id));
  // Simulate lost accepted COMMIT: the durable preparation remains, no finish call.
  assert.equal(await prepare(pg),null);
  const queue=await deliveries(pg),second=queue.find(j=>j.id!==first.id);
  assert.equal(queue.find(j=>j.id===first.id).status,'prepared');assert.equal(queue.find(j=>j.id===first.id).accepted_at,null);
  assert.equal(second.status,'pending');assert.equal(second.attempts,0);assert.equal(second.first_attempt_at,null);
 }finally{await pg.close();}
});

test('link do endereço antigo não revoga consentimento renovado para um novo endereço',async()=>{
 const f=await fixture();const {pg}=f;
 try{
  const customer=await f.user('old-link');await f.preference(customer,'email',true);await f.preference(customer,'whatsapp',true);
  await activate(pg);await f.publish();await enqueue(pg);const old=(await deliveries(pg))[0];
  const newAddress=`fixture-new-address-${customer.id}@example.test`;
  await pg.query('update auth.users set email=$2,email_confirmed_at=now() where id=$1',[customer.id,newAddress]);
  assert.equal((await pg.query('select email_enabled from public.notification_preferences where customer_id=$1',[customer.id])).rows[0].email_enabled,false);
  await f.preference(customer,'email',true);
  assert.equal((await pg.query('select private.unsubscribe_availability_email($1) as valid',[old.unsubscribe_token])).rows[0].valid,true);
  const prefs=(await pg.query('select email_enabled,whatsapp_enabled,email_destination_hash from public.notification_preferences where customer_id=$1',[customer.id])).rows[0];
  assert.equal(prefs.email_enabled,true);assert.equal(prefs.whatsapp_enabled,true);
  assert.equal(prefs.email_destination_hash,(await pg.query("select encode(sha256(convert_to($1,'UTF8')),'hex') as hash",[newAddress])).rows[0].hash);
  assert.notEqual(prefs.email_destination_hash,old.recipient_hash);
  assert.equal((await pg.query("select count(*)::integer as n from public.notification_consent_events where customer_id=$1 and channel='email' and not granted",[customer.id])).rows[0].n,1,'Somente a troca de endereço revogou a autorização antiga');
 }finally{await pg.close();}
});
