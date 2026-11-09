-- TRUSTED OPERATOR ONLY. Run against the explicitly selected clinic TEST project.
-- No hardcoded customer email. psql variable admin_email is supplied privately.
-- Invite/accept and verify email first; this script sends no email.
begin;
select set_config('torriceli.admin_email', :'admin_email', true);
do $$
declare target uuid; matches integer;
begin
 select count(*),min(id::text)::uuid into matches,target from auth.users
 where lower(email)=lower(current_setting('torriceli.admin_email')) and email_confirmed_at is not null;
 if matches<>1 then raise exception 'Exactly one verified target account required'; end if;
 insert into private.admin_members(user_id) values(target) on conflict do nothing;
 insert into public.audit_log(actor_id,action,entity_id) values(null,'admin.granted_by_trusted_operator',target);
end $$;
commit;
