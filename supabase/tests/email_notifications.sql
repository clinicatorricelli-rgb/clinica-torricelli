-- Trusted operator smoke test; no HTTP/SMTP. Fixtures and all queue changes roll back.
begin;
set local statement_timeout='30s';
do $$
declare
 customer uuid:=gen_random_uuid();admin_id uuid:=gen_random_uuid();provider text:=gen_random_uuid()::text;
 address text:='fixture-email-'||customer::text||'@example.test';event text:='fixture-'||gen_random_uuid()::text;
 day date:=date_trunc('week',now() at time zone 'America/Sao_Paulo')::date+14;
 draft public.availability_drafts;publication jsonb;job jsonb;delivery uuid;token text;role_name text;
begin
 insert into auth.users(id,email,email_confirmed_at) values(customer,address,now()),(admin_id,'fixture-admin-'||admin_id::text||'@example.test',now());
 insert into private.admin_members(user_id) values(admin_id);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',customer,'role','authenticated','aal','aal1')::text,true);
 perform public.set_availability_alert_preference('email',true,'new-availability-v1');
 perform public.set_availability_alert_preference('whatsapp',true,'new-availability-v1');
 assert (select email_destination_hash=encode(sha256(convert_to(address,'UTF8')),'hex') from public.notification_preferences where customer_id=customer),'Verified destination binding missing';
 update private.availability_email_settings set enabled=true,provider_ready=true,paused_until=null,activated_at=now(),start_hour=0,end_hour=24,global_daily_limit=100,consolidation_minutes=0;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','aal','aal2')::text,true);
 select * into draft from public.save_availability_draft(day,'open','07:00','11:00','Fixture email smoke');
 publication:=public.publish_availability_draft(draft.id,draft.revision);
 assert (publication->>'notice_pending')::boolean,'Fixture publication produced no capacity';
 perform private.enqueue_availability_emails();
 select id,unsubscribe_token into delivery,token from private.availability_email_deliveries where customer_id=customer;
 assert delivery is not null,'Fixture queue missing';
 -- Prefer only our synthetic job; do not prepare/read any real recipient.
 update private.availability_email_deliveries set next_attempt_at='-infinity'::timestamptz where id=delivery;
 job:=private.prepare_availability_email();
 assert (job->>'id')::uuid=delivery and job->>'to'=address,'Wrong smoke job';
 update private.availability_email_deliveries set payload=jsonb_build_object('to',jsonb_build_array(address),'subject','Smoke only','text','No provider call') where id=delivery;
 assert private.claim_availability_email(delivery) is not null,'Fixture claim denied';
 perform private.record_availability_email_event(event,provider,'email.complained');
 perform private.finish_availability_email(delivery,'accepted',provider,'fixture_only');
 perform private.record_availability_email_event(event,provider,'email.complained');
 assert (select status='failed' from private.availability_email_deliveries where id=delivery),'Early complaint not reconciled';
 assert (select count(*)=1 from private.availability_email_events where event_id=event),'Event replay duplicated';
 assert not private.unsubscribe_availability_email(repeat('0',64)),'Forged token accepted';
 assert private.unsubscribe_availability_email(token) and private.unsubscribe_availability_email(token),'Unsubscribe not idempotent';
 assert (select not email_enabled and whatsapp_enabled from public.notification_preferences where customer_id=customer),'Unsubscribe changed wrong channel';
 assert (select count(*)=1 from public.notification_consent_events where customer_id=customer and channel='email' and not granted),'Duplicate revocation event';
 foreach role_name in array array['anon','authenticated','service_role'] loop
  assert not has_function_privilege(role_name,'private.prepare_availability_email()','EXECUTE'),'Private preparation exposed';
  assert not has_function_privilege(role_name,'private.unsubscribe_availability_email(text)','EXECUTE'),'Private unsubscribe exposed';
 end loop;
end $$;
rollback;
select true as smoke_passed;
