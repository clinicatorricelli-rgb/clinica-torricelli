import {fixtureSignupAccess} from './fixture-signup-access.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';import {totp} from './totp-helper.mjs';
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_ANON_KEY,secret=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,ref=process.env.TEST_ISOLATED_PROJECT_REF;
test('agenda hospedada: rascunho/publicação, bloqueios, conflitos e retirada sem mensagens',{skip:!url||!key||!secret||process.env.TEST_ALLOW_REMOTE_FIXTURES!=='true'},async()=>{
 assert.ok(/^[a-z]{20}$/.test(ref||'')&&url===`https://${ref}.supabase.co`);
 const options={auth:{persistSession:false,autoRefreshToken:false}},root=createClient(url,secret,options),admin=createClient(url,key,options),guest=createClient(url,key,options);let id;const visits=[];
 function sql(query){const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query',query,`--remote=${ref}`,'--yes','--output-format','json'],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,'SQL confiável de fixture deve concluir');return JSON.parse(r.stdout).rows;}
 const date=new Date(Date.now()+60*86400000);while([0,6].includes(date.getUTCDay()))date.setUTCDate(date.getUTCDate()+1);const day=date.toISOString().slice(0,10);
 const email=`fixture-calendar-${crypto.randomUUID()}@example.test`;
 const args={p_day:day,p_kind:'open',p_from:'07:00',p_until:'11:00',p_reason:'Fixture de disponibilidade'};
 const slots=async()=>{const r=await guest.rpc('available_slots',{p_service_id:1,p_day:day});assert.equal(r.error,null);return r.data;};
 try{
  fixtureSignupAccess(email,ref);const password=crypto.randomUUID()+'aA!9';const user=await root.auth.admin.createUser({email,password,email_confirm:true});assert.equal(user.error,null);id=user.data.user.id;assert.ok(/^[0-9a-f-]{36}$/.test(id));
  sql(`insert into private.admin_members(user_id) values('${id}')`);assert.equal((await admin.auth.signInWithPassword({email,password})).error,null);
  assert.ok((await admin.rpc('save_availability_draft',args)).error,'AAL1 não altera disponibilidade');
  const factor=await admin.auth.mfa.enroll({factorType:'totp',friendlyName:'fixture-calendar'});assert.equal(factor.error,null);const health=await fetch(`${url}/auth/v1/health`,{headers:{apikey:key}});assert.equal((await admin.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret,Math.floor(Date.parse(health.headers.get('date'))/1000))})).error,null);
  assert.equal((await admin.from('profiles').update({phone_e164:'+12025550123'}).eq('id',id)).error,null);
  assert.ok((await admin.from('profiles').update({phone_e164:'invalid'}).eq('id',id)).error,'Validação de telefone também no banco');
  const baseline=await slots();assert.ok(baseline.length>0);assert.ok(baseline.every(s=>Date.parse(s.starts_at)>=Date.parse(`${day}T11:00:00-03:00`)));
  const save=await admin.rpc('save_availability_draft',args);assert.equal(save.error,null);const draft=save.data;assert.equal((await slots()).length,baseline.length);
  const published=await admin.rpc('publish_availability_draft',{p_id:draft.id,p_revision:draft.revision});assert.equal(published.error,null);assert.equal(published.data.published,true);assert.equal(published.data.notice_pending,true);assert.ok((await slots()).length>baseline.length);
  const repeated=await admin.rpc('publish_availability_draft',{p_id:draft.id,p_revision:draft.revision});assert.equal(repeated.data.already_published,true);
  assert.equal(sql(`select count(*)::integer as n from private.availability_outbox o join public.availability_publications p on p.id=o.publication_id join public.availability_drafts d on d.id=p.draft_id where d.created_by='${id}'`)[0].n,1);
  const withdrawn=await admin.rpc('withdraw_availability_publication',{p_id:published.data.publication_id});assert.equal(withdrawn.error,null);assert.equal(withdrawn.data.withdrawn,true);assert.equal((await slots()).length,baseline.length);
  const close=await admin.rpc('save_availability_draft',{...args,p_kind:'closed_day',p_from:null,p_until:null});assert.equal(close.error,null);const closing=await admin.rpc('publish_availability_draft',{p_id:close.data.id,p_revision:close.data.revision});assert.equal(closing.error,null);assert.equal(closing.data.published,true);assert.equal((await slots()).length,0);
  const next=await admin.rpc('save_availability_draft',args);const refused=await admin.rpc('publish_availability_draft',{p_id:next.data.id,p_revision:next.data.revision});assert.equal(refused.data.blocked,true);assert.equal((await slots()).length,0);
  assert.equal((await admin.rpc('withdraw_availability_publication',{p_id:closing.data.publication_id})).data.withdrawn,true);
  const row={customer_id:id,service_id:1,starts_at:`${day}T11:00:00-03:00`,ends_at:`${day}T12:00:00-03:00`,busy_until:`${day}T12:15:00-03:00`,status:'confirmed',price_cents:15000,deposit_cents:4500};
  const visit=await root.from('appointments').insert(row).select('id').single();assert.equal(visit.error,null);visits.push(visit.data.id);
  const block=await admin.rpc('save_availability_draft',{...args,p_kind:'block',p_from:'10:45',p_until:'11:15'});const conflict=await admin.rpc('publish_availability_draft',{p_id:block.data.id,p_revision:block.data.revision});assert.equal(conflict.error,null);assert.equal(conflict.data.published,false);assert.equal(conflict.data.conflicts.length,1);
  assert.equal((await root.from('appointments').select('status').eq('id',visit.data.id).single()).data.status,'confirmed');
 }finally{
  for(const visit of visits)await root.from('appointments').delete().eq('id',visit);
  if(id){sql(`do $$ declare ex uuid[];busy uuid[];begin select array_agg(x.id),array_agg(x.busy_block_id) into ex,busy from public.availability_exceptions x join public.availability_publications p on p.exception_id=x.id join public.availability_drafts d on d.id=p.draft_id where d.created_by='${id}';delete from private.availability_outbox where publication_id in(select p.id from public.availability_publications p join public.availability_drafts d on d.id=p.draft_id where d.created_by='${id}');delete from public.availability_publications where draft_id in(select id from public.availability_drafts where created_by='${id}');delete from public.availability_exceptions where id=any(ex);delete from public.appointments where id=any(busy) and status='blocked' and customer_id is null;delete from public.availability_drafts where created_by='${id}';delete from private.admin_members where user_id='${id}';end $$;`);assert.equal((await root.auth.admin.deleteUser(id)).error,null);}
  fixtureSignupAccess(email,ref,false);
 }
});
