-- Run after migrations in an isolated local database: psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_rls.sql
-- All fixtures roll back. Tests permissions using a forged LOCAL JWT claim, never remote JWT tokens.
begin;
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','admin-fixture@example.test');
insert into private.admin_members values('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
do $$ begin
 if not public.has_admin_role() then raise exception 'Role missing';end if;
 if exists(select 1 from public.clinic_settings) then raise exception 'Admin aal1 bypass';end if;
 if exists(select 1 from public.audit_log) then raise exception 'Audit aal1 bypass';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',true);
do $$ begin
 if (select count(*) from public.clinic_settings)<>1 then raise exception 'Admin aal2 denied';end if;
end $$;
reset role;
rollback;
