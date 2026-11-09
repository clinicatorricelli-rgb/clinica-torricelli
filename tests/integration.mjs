import {fixtureSignupAccess} from './fixture-signup-access.mjs';
// Destructive fixture creation only against an isolated LOCAL Supabase. No real customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {totp} from './totp-helper.mjs';
const url=process.env.TEST_SUPABASE_URL, key=process.env.TEST_SUPABASE_ANON_KEY, secret=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
test('isolamento direto pela API Supabase com duas contas fictícias', {skip:!url||!key||!secret},async()=>{
 const local=/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url);
 const ref=process.env.TEST_ISOLATED_PROJECT_REF;
 const remote=process.env.TEST_ALLOW_REMOTE_FIXTURES==='true'&&/^[a-z]{20}$/.test(ref||'')&&url===`https://${ref}.supabase.co`;
 assert.ok(local||remote,'Exige stack local ou projeto hospedado de testes explicitamente autorizado e correspondente ao ref');
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const root=createClient(url,secret,options),a=createClient(url,key,options),b=createClient(url,key,options),guest=createClient(url,key,options),ids=[],allowed=[];
 const suffix=crypto.randomUUID(),password=crypto.randomUUID()+'aA!9';
 try{
  for(const [client,label] of [[a,'a'],[b,'b']]){
   const email=`fixture-${label}-${suffix}@example.test`;
   fixtureSignupAccess(email,ref);allowed.push(email);
   const {data,error}=await root.auth.admin.createUser({email,password,email_confirm:true});assert.equal(error,null);ids.push(data.user.id);
   assert.equal((await client.auth.signInWithPassword({email,password})).error,null);
  }
  assert.equal((await guest.from('services').select('*')).data.length,23);
  const own=await a.from('profiles').select('*');assert.equal(own.error,null);assert.deepEqual(own.data.map(x=>x.id),[ids[0]]);
  assert.deepEqual((await a.from('profiles').select('*').eq('id',ids[1])).data,[]);
  assert.deepEqual((await b.from('profiles').select('*').eq('id',ids[0])).data,[]);
  assert.ok((await guest.from('profiles').select('*')).error);
  assert.equal((await a.from('profiles').update({display_name:'Cliente fictícia A'}).eq('id',ids[0])).error,null);
  await a.from('profiles').update({display_name:'INVASAO'}).eq('id',ids[1]);
  assert.equal((await b.from('profiles').select('display_name').single()).data.display_name,'');
  assert.ok((await a.from('profiles').update({id:ids[1]}).eq('id',ids[0])).error);
  assert.ok((await a.from('profiles').update({is_admin:true}).eq('id',ids[0])).error);
  assert.equal((await a.rpc('has_admin_role')).data,false);
  assert.equal((await a.rpc('set_availability_alert_preference',{channel:'email',enabled:true,notice_version:'new-availability-v1'})).error,null);
  assert.equal((await a.from('notification_preferences').select('email_enabled,whatsapp_enabled').single()).data.email_enabled,true);
  assert.deepEqual((await b.from('notification_preferences').select('*').eq('customer_id',ids[0])).data,[]);
  assert.ok((await b.from('notification_preferences').update({email_enabled:false}).eq('customer_id',ids[0])).error);
  assert.ok((await a.from('notification_consent_events').delete().eq('customer_id',ids[0])).error);
  assert.equal((await a.rpc('set_availability_alert_preference',{channel:'email',enabled:false,notice_version:'new-availability-v1'})).error,null);
  assert.deepEqual((await a.from('audit_log').select('*')).data,[]);
  const start=new Date('2030-01-07T14:00:00-03:00');
  const row={customer_id:ids[1],service_id:1,starts_at:start.toISOString(),ends_at:new Date(+start+3600000).toISOString(),busy_until:new Date(+start+4500000).toISOString(),status:'confirmed',price_cents:15000,deposit_cents:4500};
  const inserted=await root.from('appointments').insert(row).select('id').single();assert.equal(inserted.error,null);
  try{
   assert.deepEqual((await a.from('appointments').select('*')).data,[]);
   assert.equal((await b.from('appointments').select('*')).data.length,1);
   assert.ok((await a.from('appointments').insert(row)).error);
   assert.ok((await b.from('appointments').update({status:'confirmed',price_cents:1}).eq('id',inserted.data.id)).error);
   assert.ok((await root.from('appointments').insert(row)).error,'sobreposição deve falhar');
  }finally{await root.from('appointments').delete().eq('id',inserted.data.id);}
  for(const table of ['payments','reschedule_requests','financial_decisions','availability_exceptions'])assert.ok((await a.from(table).insert({})).error);
  const file=`${ids[1]}/fixture.txt`;
  assert.ok((await a.storage.from('client-files').upload(file,new Blob(['fixture']))).error);
  assert.ok((await a.storage.from('public-gallery').upload('fixture.txt',new Blob(['fixture']))).error);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=','base64');
  const object=`${ids[1]}/fixture-${suffix}.png`;
  assert.equal((await root.storage.from('client-files').upload(object,png,{contentType:'image/png'})).error,null);
  try{
   assert.ok((await guest.storage.from('client-files').download(object)).error);
   assert.ok((await a.storage.from('client-files').download(object)).error);
   assert.ok((await a.storage.from('client-files').createSignedUrl(object,60)).error);
   assert.equal((await b.storage.from('client-files').download(object)).error,null);
  }finally{assert.equal((await root.storage.from('client-files').remove([object])).error,null);}
  assert.equal((await a.auth.mfa.getAuthenticatorAssuranceLevel()).data.currentLevel,'aal1');
  const factor=await a.auth.mfa.enroll({factorType:'totp',friendlyName:`fixture-${suffix}`});assert.equal(factor.error,null);
  // Secret stays in memory. Never print QR, secret, code or session.
  const health=await fetch(`${url}/auth/v1/health`,{headers:{apikey:key}});
  const serverTime=Date.parse(health.headers.get('date'));
  assert.ok(Number.isFinite(serverTime),'Timestamp confiável do serviço para fixture TOTP');
  const verified=await a.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret,Math.floor(serverTime/1000))});assert.equal(verified.error,null);
  assert.equal((await a.auth.mfa.getAuthenticatorAssuranceLevel()).data.currentLevel,'aal2');
  assert.equal((await a.rpc('has_admin_role')).data,false,'MFA isolado não concede papel');
  assert.deepEqual((await a.from('clinic_settings').select('*')).data,[],'AAL2 sem associação não autoriza admin');
  const refreshed=await a.auth.refreshSession();assert.equal(refreshed.error,null);
  assert.equal((await a.auth.signOut()).error,null);
 }finally{for(const id of ids)assert.equal((await root.auth.admin.deleteUser(id)).error,null);for(const address of allowed)fixtureSignupAccess(address,ref,false);}
});

