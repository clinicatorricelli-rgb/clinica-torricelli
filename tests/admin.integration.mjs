import {fixtureSignupAccess} from './fixture-signup-access.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';import {totp} from './totp-helper.mjs';
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_ANON_KEY,secret=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,ref=process.env.TEST_ISOLATED_PROJECT_REF;
test('admin hospedado: grant confiável, AAL1 negado, AAL2 permitido e revogação imediata',{skip:!url||!key||!secret||process.env.TEST_ALLOW_REMOTE_FIXTURES!=='true'},async()=>{
 assert.ok(/^[a-z]{20}$/.test(ref||'')&&url===`https://${ref}.supabase.co`,'Projeto isolado explicitamente autorizado');
 const opts={auth:{persistSession:false,autoRefreshToken:false}},root=createClient(url,secret,opts),client=createClient(url,key,opts);
 const email=`fixture-admin-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID()+'aA!9';let id;
 const query=sql=>{const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query',sql,`--remote=${ref}`,'--yes','--output-format','json'],{encoding:'utf8',timeout:60000});assert.equal(r.status,0,'Operação SQL confiável de fixture deve passar');};
 try{
  fixtureSignupAccess(email,ref);
  const user=await root.auth.admin.createUser({email,password,email_confirm:true});assert.equal(user.error,null);id=user.data.user.id;assert.ok(/^[0-9a-f-]{36}$/.test(id));
  query(`insert into private.admin_members(user_id) values('${id}')`);
  assert.equal((await client.auth.signInWithPassword({email,password})).error,null);
  assert.equal((await client.rpc('has_admin_role')).data,true);
  assert.deepEqual((await client.from('clinic_settings').select('*')).data,[]);
  const factor=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'fixture-admin'});assert.equal(factor.error,null);
  const health=await fetch(`${url}/auth/v1/health`,{headers:{apikey:key}}),server=Math.floor(Date.parse(health.headers.get('date'))/1000);
  assert.equal((await client.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret,server)})).error,null);
  assert.equal((await client.from('clinic_settings').select('*')).data.length,1);
  assert.ok((await client.from('clinic_settings').update({booking_enabled:true}).eq('id',true)).error,'MFA não libera mutação perigosa da agenda');
  query(`delete from private.admin_members where user_id='${id}'`);
  assert.deepEqual((await client.from('clinic_settings').select('*')).data,[]);
 }finally{if(id){query(`delete from private.admin_members where user_id='${id}'`);assert.equal((await root.auth.admin.deleteUser(id)).error,null);}fixtureSignupAccess(email,ref,false);}
});
