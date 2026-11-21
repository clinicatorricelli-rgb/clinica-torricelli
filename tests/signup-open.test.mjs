import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
import {LEGAL_VERSION} from '../src/legal.mjs';
// Cadastro aberto (21/11): qualquer e-mail, desde que o site registre o aceite dos textos legais.
test('cadastro aberto exige e-mail e aceite dos textos legais, sem abrir porta para visitante ou papel',async()=>{
 const pg=new PGlite();try{
  await pg.exec('create role anon;create role authenticated;create role supabase_auth_admin;create schema private;revoke all on schema private from public;');
  for(const m of ['202611050001_controlled_signup.sql','202611210002_open_signup.sql'])
   await pg.exec(readFileSync(new URL(`../supabase/migrations/${m}`,import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']){
   await pg.exec(`set role ${role}`);
   await assert.rejects(pg.query('select public.before_user_created_test_gate($1)',[{user:{email:'qualquer@example.test'}}]),/permission denied/);
   await pg.exec('reset role');
  }
  await pg.exec('set role supabase_auth_admin');
  const check=async user=>(await pg.query('select public.before_user_created_test_gate($1) as outcome',[{user}])).rows[0].outcome;
  assert.deepEqual(await check({email:'nova-cliente@example.test',user_metadata:{legal_version:LEGAL_VERSION}}),{});
  assert.equal((await check({email:'nova-cliente@example.test'})).error.http_code,400,'sem aceite, sem conta');
  assert.equal((await check({email:'nova-cliente@example.test',user_metadata:{legal_version:'sim'}})).error.http_code,400);
  assert.equal((await check({email:'nova-cliente@example.test',is_anonymous:true,user_metadata:{legal_version:LEGAL_VERSION}})).error.http_code,403);
  assert.equal((await check({user_metadata:{legal_version:LEGAL_VERSION}})).error.http_code,403);
 }finally{await pg.close();}
});
