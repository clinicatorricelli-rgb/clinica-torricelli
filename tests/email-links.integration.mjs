import {fixtureSignupAccess} from './fixture-signup-access.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';
import {emailCallback} from '../src/auth-callback.mjs';
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_ANON_KEY,secret=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,ref=process.env.TEST_ISOLATED_PROJECT_REF;
test('links Auth reais de confirmação, recovery e convite sem envio a endereços fictícios',{skip:!url||!key||!secret||process.env.TEST_ALLOW_REMOTE_FIXTURES!=='true'},async()=>{
 assert.ok(/^[a-z]{20}$/.test(ref||'')&&url===`https://${ref}.supabase.co`);
 const opts={auth:{persistSession:false,autoRefreshToken:false}},root=createClient(url,secret,opts),client=createClient(url,key,opts);const ids=[],allowed=[];
 const email=`fixture-links-${crypto.randomUUID()}@example.test`,password=crypto.randomUUID()+'aA!9';
 try{
  // generateLink exercises the real verification service without sending fake mail.
  fixtureSignupAccess(email,ref);allowed.push(email);
  const signup=await root.auth.admin.generateLink({type:'signup',email,password});assert.equal(signup.error,null);ids.push(signup.data.user.id);
  assert.equal(signup.data.user.email_confirmed_at,undefined);
  assert.equal((await client.auth.signInWithPassword({email,password})).error?.code,'email_not_confirmed');
  const confirmed=await client.auth.verifyOtp({token_hash:signup.data.properties.hashed_token,type:'signup'});assert.equal(confirmed.error,null);assert.ok(confirmed.data.user.email_confirmed_at);
  assert.ok((await client.auth.verifyOtp({token_hash:signup.data.properties.hashed_token,type:'signup'})).error,'link usado não deve ser reutilizável');
  const recovery=await root.auth.admin.generateLink({type:'recovery',email});assert.equal(recovery.error,null);
  assert.equal((await client.auth.verifyOtp({token_hash:recovery.data.properties.hashed_token,type:'recovery'})).error,null);
  const replacement=crypto.randomUUID()+'bB!8';assert.equal((await client.auth.updateUser({password:replacement})).error,null);
  await client.auth.signOut();assert.ok((await client.auth.signInWithPassword({email,password})).error);assert.equal((await client.auth.signInWithPassword({email,password:replacement})).error,null);await client.auth.signOut();
  const invitationEmail=`fixture-invite-${crypto.randomUUID()}@example.test`;fixtureSignupAccess(invitationEmail,ref);allowed.push(invitationEmail);
  const invitation=await root.auth.admin.generateLink({type:'invite',email:invitationEmail});assert.equal(invitation.error,null);ids.push(invitation.data.user.id);
  const redirect=await fetch(invitation.data.properties.action_link,{redirect:'manual'});
  assert.ok([302,303].includes(redirect.status),'Link de convite deve redirecionar para o site configurado');
  const destination=new URL(redirect.headers.get('location'));
  assert.equal(destination.origin,'https://clinicatorricelli.com.br');
  const callback=emailCallback(destination.search,destination.hash);assert.equal(callback.kind,'session');assert.equal(callback.requiresPassword,true);
  const accepted=await client.auth.setSession({access_token:callback.access_token,refresh_token:callback.refresh_token});assert.equal(accepted.error,null);assert.ok(accepted.data.user.email_confirmed_at);
  assert.equal((await client.auth.updateUser({password:replacement})).error,null);
  assert.equal((await client.rpc('has_admin_role')).data,false,'Convite isolado não atribui papel');
 }finally{await client.auth.signOut();for(const id of ids)assert.equal((await root.auth.admin.deleteUser(id)).error,null);for(const address of allowed)fixtureSignupAccess(address,ref,false);}
});
