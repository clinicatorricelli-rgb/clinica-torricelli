-- Closed beta: operator-approved addresses only. This is not an admin-role grant.
-- Real addresses are registered privately at runtime, never seeded in source.
create table private.signup_test_access (
 email_hash text primary key check(email_hash ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table private.signup_test_access enable row level security;
revoke all on private.signup_test_access from public,anon,authenticated;
grant usage on schema public,private to supabase_auth_admin;
grant select on private.signup_test_access to supabase_auth_admin;
create policy auth_signup_gate_read on private.signup_test_access for select to supabase_auth_admin using(true);

-- Security invoker: Auth receives only SELECT on the private allowlist.
create function public.before_user_created_test_gate(event jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare candidate text;
begin
 candidate:=lower(btrim(event->'user'->>'email'));
 if coalesce((event->'user'->>'is_anonymous')::boolean,false)=false
 and candidate is not null and exists(
  select 1 from private.signup_test_access a
  where a.email_hash=encode(sha256(convert_to(candidate,'UTF8')),'hex') and a.expires_at>now()
 ) then return '{}'::jsonb;end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Cadastro de testes disponível somente para endereços previamente autorizados.'));
end;$$;
revoke all on function public.before_user_created_test_gate(jsonb) from public,anon,authenticated;
grant execute on function public.before_user_created_test_gate(jsonb) to supabase_auth_admin;
