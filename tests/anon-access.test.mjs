import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
// What a visitor without login (role "anon") can reach after every migration, with
// Supabase's default privileges reproduced: on the hosted project every new table and
// function in "public" is granted to anon automatically, so each migration must take
// back what anon should not have. Mirrors the black-box check run against the hosted
// project on 16/11/2026 (only the catalog and the rule text answer; everything else
// is "permission denied").
const migrations=readdirSync(new URL('../supabase/migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();

async function database(){
 const pg=new PGlite({extensions:{btree_gist}});
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
 alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
 grant usage on schema public to anon,authenticated,service_role;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean not null default false);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth to anon,authenticated,service_role;grant execute on all functions in schema auth to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;`);
 for(const name of migrations)await pg.exec(readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
 return pg;
}
const list=async(pg,sql)=>(await pg.query(sql)).rows.map(r=>r.name).sort();

test('visitante sem login só alcança o catálogo, a regra e a consulta de horários',async()=>{
 const pg=await database();
 assert.deepEqual(await list(pg,`select p.proname as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('anon',p.oid,'execute') and p.prokind='f'
  and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`),['available_slots','booking_info'],
  'funções executáveis pelo anônimo');
 assert.deepEqual(await list(pg,`select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p','v') and has_table_privilege('anon',c.oid,'select')`),['booking_rules','services'],
  'tabelas legíveis pelo anônimo');
 for(const fn of ['has_admin_role()','set_availability_alert_preference(text,boolean,text)'])
  assert.equal((await pg.query(`select has_function_privilege('authenticated','public.${fn}','execute') as ok`)).rows[0].ok,true,`${fn} continua para quem está logado`);
});

test('toda tabela pública tem proteção por linha',async()=>{
 const pg=await database();
 assert.deepEqual(await list(pg,`select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity`),[]);
});
