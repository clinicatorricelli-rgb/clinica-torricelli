import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
// All answers and personal data here are synthetic; no HTTP or real health data.
const questions=['pregnant_or_breastfeeding','previous_eye_procedure','cosmetic_allergy','eye_condition','cancer_treatment','wearing_mascara'];
const valid=()=>({birth_date:'2000-01-01',sex:'prefer_not_to_say',address:'Endereço fictício de teste',answers:Object.fromEntries(questions.map(k=>[k,{value:'no',details:''}])),signed_name:'Pessoa Fictícia',privacy_accepted:true,declaration_accepted:true,procedure_authorized:false,photo_record_authorized:false});
async function fixture(){
 const pg=new PGlite({extensions:{btree_gist}});
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean not null default false);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const name of ['202611040001_foundation.sql','202611060001_client_intake.sql','202611060002_client_intake_conflicts.sql'])await pg.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
 const a=crypto.randomUUID(),b=crypto.randomUUID(),admin=crypto.randomUUID();
 for(const id of [a,b,admin])await pg.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`fixture-intake-${id}@example.test`]);
 await pg.query('insert into private.admin_members(user_id) values($1)',[admin]);
 async function asUser(id,fn,aal='aal1'){
  await pg.exec('set role authenticated');await pg.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,role:'authenticated',aal})]);
  try{return await fn();}finally{await pg.exec('reset role');}
 }
 const save=(id,data=valid(),revision=0)=>asUser(id,async()=>(await pg.query('select * from public.save_client_intake($1::jsonb,$2)',[JSON.stringify(data),revision])).rows[0]);
 const technical=async(id,data={},revision=0,actor=admin,aal='aal2',intakeRevision=undefined)=>{
  const sourceRevision=intakeRevision===undefined?(await pg.query('select revision from public.client_intake_current where customer_id=$1',[id])).rows[0]?.revision??null:intakeRevision;
  return asUser(actor,async()=>(await pg.query('select * from public.save_client_intake_procedure($1,$2::jsonb,$3,$4)',[id,JSON.stringify(data),revision,sourceRevision])).rows[0],aal);
 };
 return{pg,a,b,admin,asUser,save,technical};
}

test('ficha própria registra escolhas independentes e histórico de cada revisão sem aprovação automática',async()=>{
 const f=await fixture();try{
  const data=valid();delete data.procedure_authorized;delete data.photo_record_authorized;delete data.answers.eye_condition.details;
  data.answers.eye_condition.value='discuss';
  const first=await f.save(f.a,data);assert.equal(first.customer_id,f.a);assert.equal(first.revision,1);assert.equal(first.notice_version,'client-intake-v1');assert.ok(first.submitted_at);
  assert.equal(first.procedure_authorized,false);assert.equal(first.photo_record_authorized,false);assert.deepEqual(first.answers.eye_condition,{value:'discuss',details:''});assert.ok(!('approved' in first));
  const second=await f.save(f.a,{...valid(),procedure_authorized:true,photo_record_authorized:false},1);
  assert.equal(second.revision,2);assert.equal(second.procedure_authorized,true);assert.equal(second.photo_record_authorized,false);
  const history=(await f.pg.query("select revision,snapshot from private.client_intake_revisions where customer_id=$1 and kind='intake' order by revision",[f.a])).rows;
  assert.equal(history.length,2);assert.equal(history[0].snapshot.procedure_authorized,false);assert.equal(history[1].snapshot.procedure_authorized,true);
  const audit=(await f.pg.query('select action from public.audit_log where entity_id=$1',[f.a])).rows;assert.deepEqual(audit.map(a=>a.action),['intake.submitted','intake.submitted']);
 }finally{await f.pg.close();}
});

test('RLS isola clientes, admin sem MFA e histórico; nenhum cliente grava tabelas diretamente',async()=>{
 const f=await fixture();try{
  await f.save(f.a);await f.save(f.b);await f.technical(f.a,{style:'Estilo fictício'});
  await f.pg.exec('set role anon');await assert.rejects(f.pg.query('select * from public.client_intake_current'),/permission denied/);await assert.rejects(f.pg.query('select public.save_client_intake($1)',[JSON.stringify(valid())]),/permission denied/);await f.pg.exec('reset role');
  await f.asUser(f.a,async()=>{
   assert.deepEqual((await f.pg.query('select customer_id from public.client_intake_current')).rows,[{customer_id:f.a}]);
   assert.deepEqual((await f.pg.query('select * from public.client_intake_procedure')).rows,[]);
   for(const operation of ['update public.client_intake_current set revision=9','delete from public.client_intake_current','update public.client_intake_procedure set style=\'Forged\'','delete from private.client_intake_revisions'])await assert.rejects(f.pg.exec(operation),/permission denied/);
   await assert.rejects(f.pg.query('select * from private.client_intake_revisions'),/permission denied/);
  });
  assert.deepEqual((await f.asUser(f.admin,()=>f.pg.query('select * from public.client_intake_current'))).rows,[]);
  assert.equal((await f.asUser(f.admin,()=>f.pg.query('select * from public.client_intake_current'),'aal2')).rows.length,2);
  assert.equal((await f.asUser(f.admin,()=>f.pg.query('select * from public.client_intake_procedure'),'aal2')).rows.length,1);
  await f.asUser(f.admin,async()=>{await assert.rejects(f.pg.query('update public.client_intake_current set signed_name=$1',['Alterado']),/permission denied/);await assert.rejects(f.pg.query('update private.client_intake_revisions set snapshot=\'{}\'::jsonb'),/permission denied/);},'aal2');
 }finally{await f.pg.close();}
});

test('servidor rejeita campos forjados, respostas incompletas, autorização textual e dados inválidos',async()=>{
 const f=await fixture();try{
  for(const patch of [{customer_id:f.b},{is_admin:true},{style:'Forged'},{revision:5},{notice_version:'other'},{privacy_accepted:false},{declaration_accepted:'true'},{procedure_authorized:'true'},{photo_record_authorized:null},{signed_name:' '},{signed_name:'x'.repeat(101)},{birth_date:'2999-01-01'},{birth_date:'2025-02-30'},{birth_date:'01/01/2000'},{sex:'unexpected'},{address:'x'.repeat(501)}])await assert.rejects(f.save(f.a,{...valid(),...patch}));
  for(const answers of [{},Object.fromEntries(questions.slice(1).map(k=>[k,{value:'no'}])),{...valid().answers,extra:{value:'no'}},{...valid().answers,eye_condition:{value:'maybe'}},{...valid().answers,eye_condition:{value:'yes',details:'x'.repeat(501)}},{...valid().answers,eye_condition:{value:'no',is_admin:true}}])await assert.rejects(f.save(f.a,{...valid(),answers}));
  assert.equal((await f.pg.query('select count(*)::integer as n from public.client_intake_current')).rows[0].n,0);
  assert.equal((await f.pg.query('select count(*)::integer as n from private.client_intake_revisions')).rows[0].n,0);
  const row=await f.save(f.a,{...valid(),birth_date:null,sex:null,address:null});assert.equal(row.birth_date,null);assert.equal(row.sex,null);
 }finally{await f.pg.close();}
});

test('revisão otimista impede sobrescrever ficha ou autorização com formulário antigo',async()=>{
 const f=await fixture();try{
  await f.save(f.a);await assert.rejects(f.save(f.a,{...valid(),procedure_authorized:true},0),{code:'PT409'});
  await f.save(f.a,{...valid(),photo_record_authorized:true},1);await assert.rejects(f.save(f.a,valid(),1),{code:'PT409'});
  const current=(await f.pg.query('select * from public.client_intake_current where customer_id=$1',[f.a])).rows[0];assert.equal(current.revision,2);assert.equal(current.photo_record_authorized,true);
  assert.equal((await f.pg.query('select count(*)::integer as n from private.client_intake_revisions where customer_id=$1',[f.a])).rows[0].n,2);
 }finally{await f.pg.close();}
});

test('anotação técnica exige administração com MFA, ficha existente e revisão própria',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.technical(f.a),/Submitted intake required/);await f.save(f.a);
  await assert.rejects(f.technical(f.a,{},0,f.a),/Admin MFA required/);await assert.rejects(f.technical(f.a,{},0,f.admin,'aal1'),/Admin MFA required/);
  for(const data of [{customer_id:f.b},{answers:valid().answers},{approved:true},{style:'x'.repeat(101)},{notes:'x'.repeat(2001)},{procedure_date:'2025-02-30'}])await assert.rejects(f.technical(f.a,data));
  const first=await f.technical(f.a,{style:'Clássico fictício',curvature:'C',thickness:'0.1',fiber_model:'Fibra fictícia',notes:'Anotação técnica fictícia'});assert.equal(first.revision,1);assert.equal(first.updated_by,f.admin);
  await assert.rejects(f.technical(f.a,{style:'Antigo'},0),{code:'PT409'});const second=await f.technical(f.a,{style:'Ajuste fictício'},1);assert.equal(second.revision,2);
  assert.equal((await f.pg.query("select count(*)::integer as n from private.client_intake_revisions where customer_id=$1 and kind='procedure'",[f.a])).rows[0].n,2);
  assert.equal((await f.pg.query('select revision from public.client_intake_current where customer_id=$1',[f.a])).rows[0].revision,1,'Anotação não altera declarações da cliente');
 }finally{await f.pg.close();}
});

test('anotação técnica rejeita respostas da cliente alteradas depois de abrir o formulário',async()=>{
 const f=await fixture();try{
  const source=await f.save(f.a);
  const revised=valid();revised.answers.cosmetic_allergy={value:'discuss',details:'Revisão fictícia para conversar'};
  await f.save(f.a,revised,source.revision);
  await assert.rejects(f.technical(f.a,{style:'Contexto antigo'},0,f.admin,'aal2',source.revision),{code:'PT409'});
  await assert.rejects(f.technical(f.a,{},0,f.admin,'aal2',null),{code:'PT409'});
  assert.equal((await f.pg.query('select count(*)::integer as n from public.client_intake_procedure')).rows[0].n,0);
  const technical=await f.technical(f.a,{style:'Contexto atualizado'},0,f.admin,'aal2',2);assert.equal(technical.intake_revision,2);
  assert.equal((await f.pg.query("select snapshot->>'intake_revision' as revision from private.client_intake_revisions where customer_id=$1 and kind='procedure'",[f.a])).rows[0].revision,'2');
 }finally{await f.pg.close();}
});

test('excluir conta não bloqueia cascata da ficha e preserva UUID histórico de administradora excluída',async()=>{
 const f=await fixture();try{
  await f.save(f.a);await f.technical(f.a,{style:'Registro fictício'});
  await f.pg.query('delete from auth.users where id=$1',[f.admin]);
  const technical=(await f.pg.query('select updated_by from public.client_intake_procedure where customer_id=$1',[f.a])).rows[0];assert.equal(technical.updated_by,f.admin);
  const historical=(await f.pg.query("select actor_id from private.client_intake_revisions where customer_id=$1 and kind='procedure'",[f.a])).rows[0];assert.equal(historical.actor_id,f.admin,'UUID auditável permanece imutável sem depender da conta ativa');
  assert.equal((await f.pg.query('select count(*)::integer as n from public.client_intake_current where customer_id=$1',[f.a])).rows[0].n,1);
  await f.pg.query('delete from auth.users where id=$1',[f.a]);
  for(const table of ['public.client_intake_current','public.client_intake_procedure','private.client_intake_revisions'])assert.equal((await f.pg.query(`select count(*)::integer as n from ${table} where customer_id=$1`,[f.a])).rows[0].n,0);
  assert.equal((await f.pg.query('select count(*)::integer as n from public.profiles where id=$1',[f.a])).rows[0].n,0);
  assert.equal((await f.pg.query('select count(*)::integer as n from public.profiles where id=$1',[f.b])).rows[0].n,1,'Outras clientes permanecem intactas');
 }finally{await f.pg.close();}
});
