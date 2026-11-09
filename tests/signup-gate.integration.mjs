import test from 'node:test';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';import {fixtureSignupAccess} from './fixture-signup-access.mjs';
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_ANON_KEY,secret=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,ref=process.env.TEST_ISOLATED_PROJECT_REF;
test('hook hospedado rejeita cadastro direto não autorizado; confirmação exigida e cliente sem admin',{skip:!url||!key||!secret||process.env.TEST_ALLOW_REMOTE_FIXTURES!=='true'},async()=>{
 assert.ok(/^[a-z]{20}$/.test(ref||'')&&url===`https://${ref}.supabase.co`);
 const opts={auth:{persistSession:false,autoRefreshToken:false}},root=createClient(url,secret,opts),client=createClient(url,key,opts);
 const deniedEmail=`fixture-denied-${crypto.randomUUID()}@example.test`,email=`fixture-gate-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID()+'aA!9';let id;
 try{
  const denied=await client.auth.signUp({email:deniedEmail,password,options:{data:{is_admin:true,approved:true}}});
  assert.ok(denied.error);assert.ok(denied.error.message.includes('Cadastro de testes disponível somente para endereços previamente autorizados.'),'O bloqueio precisa vir do hook, não de SMTP ou signup desabilitado');
  assert.equal(denied.data.user,null);console.log('Cadastro não autorizado negado antes de criação/envio.');
  fixtureSignupAccess(email,ref);
  const link=await root.auth.admin.generateLink({type:'signup',email,password});assert.equal(link.error,null);id=link.data.user.id;
  assert.equal((await client.auth.signInWithPassword({email,password})).error?.code,'email_not_confirmed');
  assert.equal((await client.auth.verifyOtp({type:'signup',token_hash:link.data.properties.hashed_token})).error,null);
  assert.equal((await client.rpc('has_admin_role')).data,false);
  assert.deepEqual((await client.from('clinic_settings').select('*')).data,[]);
  assert.equal((await client.from('profiles').select('id')).data.length,1);
  assert.ok((await client.from('signup_test_access').select('*')).error);
 }finally{await client.auth.signOut();if(id)assert.equal((await root.auth.admin.deleteUser(id)).error,null);fixtureSignupAccess(email,ref,false);}
});
