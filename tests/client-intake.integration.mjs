import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {fixtureSignupAccess} from './fixture-signup-access.mjs';

const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_ANON_KEY,secret=process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,ref=process.env.TEST_ISOLATED_PROJECT_REF;
const questions=['pregnant_or_breastfeeding','previous_eye_procedure','cosmetic_allergy','eye_condition','cancer_treatment','wearing_mascara'];
const intake=name=>({birth_date:null,sex:'prefer_not_to_say',address:'Endereço fictício de teste',answers:Object.fromEntries(questions.map(q=>[q,{value:'discuss',details:'Resposta fictícia de teste'}])),signed_name:name,privacy_accepted:true,declaration_accepted:true,procedure_authorized:false,photo_record_authorized:false});
const row=data=>Array.isArray(data)?data[0]:data;

// Real Auth JWTs and PostgREST; synthetic fixtures only, no signup email or medical data.
test('ficha hospedada: JWT real, isolamento entre clientes e mutações indevidas recusadas',{
 skip:!url||!key||!secret||process.env.TEST_ALLOW_REMOTE_FIXTURES!=='true',timeout:120000,
},async()=>{
 assert.ok(/^[a-z]{20}$/.test(ref||'')&&url===`https://${ref}.supabase.co`,'Projeto isolado explicitamente autorizado e correspondente ao ref');
 let stage='bootstrap';
 const mark=label=>{stage=label;console.log(`[intake] ${label}`);};
 const boundedFetch=async(input,init={})=>{
  const signal=init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000);
  try{const response=await fetch(input,{...init,signal});console.log(`[intake] ${stage} HTTP ${response.status}`);return response;}
  catch(error){console.log(`[intake] ${stage} fetch ${error?.name==='TimeoutError'?'timeout':'failed'}`);throw error;}
 };
 const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}};
 const root=createClient(url,secret,options),a=createClient(url,key,options),b=createClient(url,key,options),guest=createClient(url,key,options);
 const ids=[],allowed=[],clients=[a,b],password=crypto.randomUUID()+'aA!9',suffix=crypto.randomUUID();
 try{
  for(const [client,label] of [[a,'a'],[b,'b']]){
   mark(`fixture-authorize-${label}`);const email=`fixture-intake-${label}-${suffix}@example.test`;allowed.push(email);fixtureSignupAccess(email,ref);
   mark(`fixture-create-${label}`);
   const created=await root.auth.admin.createUser({email,password,email_confirm:true});
   if(created.data?.user?.id)ids.push(created.data.user.id);
   assert.ok(!created.error&&created.data?.user,'Criação de fixture Auth deve passar');
   mark(`fixture-login-${label}`);const login=await client.auth.signInWithPassword({email,password});assert.ok(!login.error&&login.data.session,'Login real da fixture deve passar');
  }
  mark('anonymous-read');const anonymousRead=await guest.from('client_intake_current').select('customer_id');assert.equal(anonymousRead.error?.code,'42501');
  mark('anonymous-save');const anonymousSave=await guest.rpc('save_client_intake',{p_data:intake('Pessoa Fictícia Anônima'),p_revision:0});assert.equal(anonymousSave.error?.code,'42501');
  mark('customer-role');
  assert.equal((await a.rpc('has_admin_role')).data,false);
  mark('save-own-a');const saved=await a.rpc('save_client_intake',{p_data:intake('Pessoa Fictícia A'),p_revision:0});assert.ok(!saved.error,'RPC própria de ficha deve passar');
  const current=row(saved.data);assert.equal(current?.customer_id===ids[0],true);assert.equal(current.revision,1);assert.equal(current.notice_version,'client-intake-v1');
  assert.equal(current.procedure_authorized,false);assert.equal(current.photo_record_authorized,false);
  mark('cross-customer-read');const otherRead=await b.from('client_intake_current').select('customer_id').eq('customer_id',ids[0]);assert.equal(otherRead.error,null);assert.deepEqual(otherRead.data,[]);
  mark('direct-update');const directUpdate=await a.from('client_intake_current').update({signed_name:'Alteração forjada'}).eq('customer_id',ids[0]);assert.equal(directUpdate.error?.code,'42501');
  mark('direct-delete');const directDelete=await b.from('client_intake_current').delete().eq('customer_id',ids[0]);assert.equal(directDelete.error?.code,'42501');
  mark('direct-insert');const directInsert=await b.from('client_intake_current').insert({customer_id:ids[0],...intake('Inserção forjada'),revision:1});assert.equal(directInsert.error?.code,'42501');
  mark('forged-customer');const forged=await a.rpc('save_client_intake',{p_data:{...intake('Pessoa Fictícia A'),customer_id:ids[1]},p_revision:1});assert.ok(forged.error,'UUID de outra cliente não pode ser aceito no JSON');
  mark('stale-revision');const stale=await a.rpc('save_client_intake',{p_data:intake('Formulário antigo fictício'),p_revision:0});assert.equal(stale.error?.code,'PT409');assert.equal(stale.status,409);
  mark('unauthorized-technical');const technical=await a.rpc('save_client_intake_procedure',{p_customer_id:ids[0],p_data:{style:'Estilo fictício'},p_revision:0,p_intake_revision:1});assert.equal(technical.error?.code,'42501');
  mark('save-own-b');const savedB=await b.rpc('save_client_intake',{p_data:intake('Pessoa Fictícia B'),p_revision:0});assert.ok(!savedB.error,'Segunda cliente deve salvar somente a própria ficha');assert.equal(row(savedB.data)?.customer_id===ids[1],true);
  mark('read-own-a');
  const ownA=await a.from('client_intake_current').select('customer_id,revision');assert.equal(ownA.error,null);assert.equal(ownA.data.length,1);assert.equal(ownA.data[0].customer_id===ids[0],true);assert.equal(ownA.data[0].revision,1);
  mark('read-own-b');const ownB=await b.from('client_intake_current').select('customer_id,revision');assert.equal(ownB.error,null);assert.equal(ownB.data.length,1);assert.equal(ownB.data[0].customer_id===ids[1],true);
  mark('technical-read');
  assert.deepEqual((await a.from('client_intake_procedure').select('*')).data,[]);
  mark('private-history');assert.ok((await a.schema('private').from('client_intake_revisions').select('*')).error,'Histórico privado não deve ser exposto pelo REST');
 }finally{
  const failures=[];
  mark('cleanup-signout');for(const client of clients){try{const result=await client.auth.signOut();if(result.error)failures.push('logout');}catch{failures.push('logout');}}
  mark('cleanup-delete');for(const id of ids){try{const result=await root.auth.admin.deleteUser(id);if(result.error)failures.push('delete');}catch{failures.push('delete');}}
  mark('cleanup-allowlist');for(const email of allowed){try{fixtureSignupAccess(email,ref,false);}catch{failures.push('allowlist');}}
  assert.equal(failures.length,0,'Limpeza completa de fixtures e autorizações deve passar');
 }
});
