-- Individual, consent-bound email digests. No provider credential belongs in SQL/source.
alter table public.notification_preferences add column email_destination_hash text;
update public.notification_preferences p set email_destination_hash=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex')
from auth.users u where u.id=p.customer_id and p.email_enabled and u.email_confirmed_at is not null
and exists(select 1 from public.notification_consent_events e where e.customer_id=u.id and e.channel='email' and e.granted and e.recorded_at>=u.email_confirmed_at);

create table private.availability_email_settings (
 id boolean primary key default true check(id),enabled boolean not null default false,
 activated_at timestamptz,provider_ready boolean not null default false,last_worker_at timestamptz,paused_until timestamptz,
 daily_limit integer not null default 1 check(daily_limit=1),
 start_hour integer not null default 8 check(start_hour between 0 and 23),
 end_hour integer not null default 20 check(end_hour between 1 and 24 and end_hour>start_hour),
 global_daily_limit integer not null default 50 check(global_daily_limit between 1 and 100),
 consolidation_minutes integer not null default 5 check(consolidation_minutes between 0 and 60)
);
insert into private.availability_email_settings(id) values(true);
create table private.availability_email_deliveries (
 id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id) on delete cascade,
 send_day date not null,recipient_hash text not null,
 status text not null default 'pending' check(status in ('pending','prepared','retry','accepted','delivered','suppressed','failed','unknown')),
 unsubscribe_token text not null unique default replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') check(unsubscribe_token ~ '^[0-9a-f]{64}$'),
 attempts integer not null default 0,first_attempt_at timestamptz,next_attempt_at timestamptz not null,lease_until timestamptz,
 payload jsonb,provider_id text unique,last_code text,accepted_at timestamptz,delivered_at timestamptz,
 created_at timestamptz not null default now(),unique(customer_id,send_day)
);
create table private.availability_email_items (
 delivery_id uuid not null references private.availability_email_deliveries(id) on delete cascade,
 publication_id uuid not null references public.availability_publications(id),primary key(delivery_id,publication_id)
);
create table private.availability_email_suppressions (
 recipient_hash text primary key,reason text not null check(reason in ('bounced','complained','failed')),created_at timestamptz not null default now()
);
create table private.availability_email_events (
 event_id text primary key,provider_id text not null,event_type text not null,created_at timestamptz not null default now(),processed_at timestamptz
);
revoke all on private.availability_email_settings,private.availability_email_deliveries,private.availability_email_items,private.availability_email_suppressions,private.availability_email_events from public,anon,authenticated,service_role;
alter table private.availability_email_settings enable row level security;
alter table private.availability_email_deliveries enable row level security;
alter table private.availability_email_items enable row level security;
alter table private.availability_email_suppressions enable row level security;
alter table private.availability_email_events enable row level security;
alter table private.availability_outbox drop constraint availability_outbox_status_check;
alter table private.availability_outbox add constraint availability_outbox_status_check check(status in ('awaiting_provider','cancelled','queued','ignored_before_activation'));

-- Revocation locks the same preference row held throughout the provider request.
create function private.suppress_revoked_availability_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.email_enabled or new.email_destination_hash is distinct from old.email_destination_hash then
  update private.availability_email_deliveries set status='suppressed',last_code='consent_revoked',lease_until=null
  where customer_id=new.customer_id and status in ('pending','prepared','retry');
 end if;return new;
end;$$;
create trigger suppress_revoked_availability_email after update on public.notification_preferences for each row execute function private.suppress_revoked_availability_email();

create or replace function public.set_availability_alert_preference(channel text,enabled boolean,notice_version text)
returns void language plpgsql security definer set search_path='' as $$
declare customer uuid:=auth.uid();previous boolean;destination text;notice text:='Quero receber avisos opcionais de novas vagas da Clínica Torriceli por este canal, incluindo manhãs abertas em datas específicas. Posso desligar a qualquer momento em Minha conta. O aviso não garante reserva. Não é necessário aceitar para cadastrar ou agendar.';
begin
 if customer is null then raise exception 'Authentication required' using errcode='42501';end if;
 if channel is null or channel not in ('email','whatsapp') or enabled is null then raise exception 'Invalid preference';end if;
 if enabled and notice_version is distinct from 'new-availability-v1' then raise exception 'Notice version changed; review before accepting';end if;
 insert into public.notification_preferences(customer_id) values(customer) on conflict do nothing;
 select case when channel='email' then p.email_enabled else p.whatsapp_enabled end into previous from public.notification_preferences p where p.customer_id=customer for update;
 if channel='email' and enabled then
  select encode(sha256(convert_to(lower(u.email),'UTF8')),'hex') into destination from auth.users u where u.id=customer and u.email_confirmed_at is not null;
  if destination is null then raise exception 'Confirmed email required';end if;
 end if;
 if previous=enabled then return;end if;
 update public.notification_preferences p set email_enabled=case when channel='email' then enabled else p.email_enabled end,
  whatsapp_enabled=case when channel='whatsapp' then enabled else p.whatsapp_enabled end,
  email_destination_hash=case when channel='email' then destination else p.email_destination_hash end,updated_at=now() where p.customer_id=customer;
 insert into public.notification_consent_events(customer_id,channel,granted,purpose,notice_version,notice_text) values(customer,channel,enabled,'new_availability','new-availability-v1',notice);
end;$$;

create function private.revoke_alerts_after_email_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(new.email) is distinct from lower(old.email) then
  update public.notification_preferences set email_enabled=false,email_destination_hash=null,updated_at=now() where customer_id=new.id and email_enabled;
  if found then insert into public.notification_consent_events(customer_id,channel,granted,purpose,notice_version,notice_text)
   values(new.id,'email',false,'new_availability','new-availability-v1','Avisos por e-mail desativados após mudança do endereço. Nova autorização necessária.');end if;
 end if;return new;
end;$$;
create trigger revoke_alerts_after_email_change after update of email on auth.users for each row execute function private.revoke_alerts_after_email_change();

create function private.email_publication_available(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.availability_publications p join public.availability_exceptions x on x.id=p.exception_id
 cross join lateral public.available_slots((select id from public.services where active order by duration_minutes,id limit 1),x.day) s
 where p.id=p_id and p.withdrawn_at is null and x.active and x.kind='open'
 and s.starts_at>now() and (s.starts_at at time zone 'America/Sao_Paulo')::time>=x.from_time and (s.ends_at at time zone 'America/Sao_Paulo')::time<=x.until_time);
$$;

create function private.enqueue_availability_emails() returns integer language plpgsql security definer set search_path='' as $$
declare cfg private.availability_email_settings;o record;r record;j private.availability_email_deliveries;due timestamptz;local_due timestamp;total integer:=0;provider text;
begin
 -- Reconcile events that arrived between acceptance processing and HTTP commit.
 for provider in select distinct e.provider_id from private.availability_email_events e join private.availability_email_deliveries d on d.provider_id=e.provider_id where e.processed_at is null loop perform private.apply_availability_email_events(provider);end loop;
 select * into cfg from private.availability_email_settings where id;
 if not cfg.enabled or cfg.activated_at is null then return 0;end if;
 for o in select b.publication_id,b.created_at,p.published_at from private.availability_outbox b join public.availability_publications p on p.id=b.publication_id where b.status='awaiting_provider' order by b.created_at limit 100 for update of b skip locked loop
  if o.created_at<cfg.activated_at or o.published_at<cfg.activated_at then update private.availability_outbox set status='ignored_before_activation' where publication_id=o.publication_id;continue;end if;
  if not private.email_publication_available(o.publication_id) then update private.availability_outbox set status='cancelled' where publication_id=o.publication_id;continue;end if;
  local_due:=(now()+make_interval(mins=>cfg.consolidation_minutes)) at time zone 'America/Sao_Paulo';
  if extract(hour from local_due)<cfg.start_hour then local_due:=local_due::date+make_time(cfg.start_hour,0,0);
  elsif extract(hour from local_due)>=cfg.end_hour then local_due:=local_due::date+1+make_time(cfg.start_hour,0,0);end if;
  due:=local_due at time zone 'America/Sao_Paulo';
  for r in select u.id,encode(sha256(convert_to(lower(u.email),'UTF8')),'hex') as destination
   from auth.users u join public.notification_preferences n on n.customer_id=u.id
   where n.email_enabled and u.email_confirmed_at is not null and n.email_destination_hash=encode(sha256(convert_to(lower(u.email),'UTF8')),'hex')
   and not exists(select 1 from private.availability_email_suppressions z where z.recipient_hash=n.email_destination_hash)
   and (select e.granted and e.recorded_at<=o.published_at from public.notification_consent_events e where e.customer_id=u.id and e.channel='email' order by e.recorded_at desc,e.id desc limit 1) for update of n loop
   insert into private.availability_email_deliveries(customer_id,send_day,recipient_hash,next_attempt_at) values(r.id,local_due::date,r.destination,due)
    on conflict(customer_id,send_day) do nothing;
   select * into j from private.availability_email_deliveries where customer_id=r.id and send_day=local_due::date for update;
   -- Freeze before the first attempt; later publications cannot mutate retry bodies.
   if j.status='pending' and j.attempts=0 and j.recipient_hash=r.destination then
    insert into private.availability_email_items(delivery_id,publication_id) values(j.id,o.publication_id) on conflict do nothing;total:=total+1;
   end if;
  end loop;
  update private.availability_outbox set status='queued' where publication_id=o.publication_id;
 end loop;return total;
end;$$;

-- Preparation commits the frozen provider payload and retry horizon BEFORE HTTP.
create function private.prepare_availability_email() returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg private.availability_email_settings;j private.availability_email_deliveries;n public.notification_preferences;address text;days jsonb;
begin
 select * into cfg from private.availability_email_settings where id for update;
 if not cfg.enabled or not cfg.provider_ready or coalesce(cfg.paused_until>now(),false) or extract(hour from now() at time zone 'America/Sao_Paulo')<cfg.start_hour or extract(hour from now() at time zone 'America/Sao_Paulo')>=cfg.end_hour then return null;end if;
 select * into j from private.availability_email_deliveries where (status in ('pending','retry') and next_attempt_at<=now()) or (status='prepared' and lease_until<now()) order by next_attempt_at,id limit 1;
 if not found then return null;end if;
 select * into n from public.notification_preferences where customer_id=j.customer_id for update;
 select * into j from private.availability_email_deliveries where id=j.id for update;
 if j.send_day<>(now() at time zone 'America/Sao_Paulo')::date then update private.availability_email_deliveries set status=case when attempts>0 then 'unknown' else 'suppressed' end,last_code='dispatch_day_expired',lease_until=null where id=j.id;return null;end if;
 -- Durable first-attempt reservations also count if HTTP succeeds but COMMIT fails.
 if j.first_attempt_at is null and (select count(*) from private.availability_email_deliveries a where a.first_attempt_at>=(now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')>=cfg.global_daily_limit then return null;end if;
 select email into address from auth.users where id=j.customer_id and email_confirmed_at is not null;
 if not coalesce(n.email_enabled,false) or address is null or n.email_destination_hash is distinct from j.recipient_hash or j.recipient_hash<>encode(sha256(convert_to(lower(address),'UTF8')),'hex') or exists(select 1 from private.availability_email_suppressions where recipient_hash=j.recipient_hash) then
  update private.availability_email_deliveries set status='suppressed',last_code='destination_or_consent' where id=j.id;return null;end if;
 if j.first_attempt_at<now()-interval '23 hours' or j.attempts>=4 then update private.availability_email_deliveries set status='unknown',last_code='retry_horizon' where id=j.id;return null;end if;
 if j.payload is null then delete from private.availability_email_items i where i.delivery_id=j.id and not private.email_publication_available(i.publication_id);end if;
 if not exists(select 1 from private.availability_email_items where delivery_id=j.id) or exists(select 1 from private.availability_email_items i where i.delivery_id=j.id and not private.email_publication_available(i.publication_id)) then
  update private.availability_email_deliveries set status='suppressed',last_code='availability_changed' where id=j.id;return null;end if;
 select jsonb_agg(distinct x.day order by x.day) into days from private.availability_email_items i join public.availability_publications p on p.id=i.publication_id join public.availability_exceptions x on x.id=p.exception_id where i.delivery_id=j.id;
 update private.availability_email_deliveries set status='prepared',lease_until=now()+interval '2 minutes',first_attempt_at=coalesce(first_attempt_at,now()),attempts=attempts+1 where id=j.id;
 return jsonb_build_object('id',j.id,'to',address,'days',days,'unsubscribe_token',j.unsubscribe_token,'payload',j.payload);
end;$$;

create function private.claim_availability_email(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg private.availability_email_settings;j private.availability_email_deliveries;n public.notification_preferences;address text;d date;
begin
 select * into cfg from private.availability_email_settings where id for update;
 if not cfg.enabled or not cfg.provider_ready or coalesce(cfg.paused_until>now(),false) or extract(hour from now() at time zone 'America/Sao_Paulo')<cfg.start_hour or extract(hour from now() at time zone 'America/Sao_Paulo')>=cfg.end_hour then return null;end if;
 select * into j from private.availability_email_deliveries where id=p_id;if not found then return null;end if;
 -- Same day lock as availability publication/withdrawal, held throughout HTTP.
 for d in select distinct x.day from private.availability_email_items i join public.availability_publications p on p.id=i.publication_id join public.availability_exceptions x on x.id=p.exception_id where i.delivery_id=p_id order by x.day loop perform pg_advisory_xact_lock(hashtextextended(d::text,41));end loop;
 select * into n from public.notification_preferences where customer_id=j.customer_id for update;
 select * into j from private.availability_email_deliveries where id=p_id for update;
 if j.status<>'prepared' or j.lease_until is null or j.lease_until<now() or j.payload is null then return null;end if;
 if j.send_day<>(now() at time zone 'America/Sao_Paulo')::date then update private.availability_email_deliveries set status='unknown',last_code='dispatch_day_expired',lease_until=null where id=p_id;return null;end if;
 select email into address from auth.users where id=j.customer_id and email_confirmed_at is not null;
 if not coalesce(n.email_enabled,false) or address is null or n.email_destination_hash is distinct from j.recipient_hash or j.recipient_hash<>encode(sha256(convert_to(lower(address),'UTF8')),'hex') or exists(select 1 from private.availability_email_suppressions where recipient_hash=j.recipient_hash) then
  update private.availability_email_deliveries set status='suppressed',last_code='destination_or_consent',lease_until=null where id=p_id;return null;end if;
 if j.first_attempt_at<now()-interval '23 hours' then update private.availability_email_deliveries set status='unknown',last_code='retry_horizon' where id=p_id;return null;end if;
 if exists(select 1 from private.availability_email_items i where i.delivery_id=p_id and not private.email_publication_available(i.publication_id)) then
  update private.availability_email_deliveries set status='suppressed',last_code='availability_changed',lease_until=null where id=p_id;return null;end if;
 if exists(select 1 from private.availability_email_deliveries a where a.customer_id=j.customer_id and a.accepted_at>=(now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo') then
  update private.availability_email_deliveries set status='suppressed',last_code='daily_limit',lease_until=null where id=p_id;return null;end if;
 if (select count(*) from private.availability_email_deliveries a where a.accepted_at>=(now() at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')>=cfg.global_daily_limit then
  update private.availability_email_deliveries set status='retry',lease_until=null,attempts=greatest(0,attempts-1),next_attempt_at=now()+interval '1 hour',last_code='global_limit' where id=p_id;return null;end if;
 return jsonb_build_object('id',j.id,'payload',j.payload);
end;$$;

create function private.finish_availability_email(p_id uuid,p_outcome text,p_provider_id text,p_code text) returns void language plpgsql security definer set search_path='' as $$
declare j private.availability_email_deliveries;
begin
 if p_outcome not in ('accepted','retry','failed','unknown') then raise exception 'Invalid outcome';end if;
 select * into j from private.availability_email_deliveries where id=p_id for update;
 if not found or j.status<>'prepared' then raise exception 'Delivery not prepared';end if;
 update private.availability_email_deliveries set status=p_outcome,provider_id=case when p_outcome='accepted' then p_provider_id else provider_id end,
  accepted_at=case when p_outcome='accepted' then now() else accepted_at end,last_code=left(p_code,60),lease_until=null,
  next_attempt_at=case when p_outcome='retry' then now()+make_interval(mins=>least(60,power(2,j.attempts)::integer)) else next_attempt_at end where id=p_id;
 if p_code in ('http_401','http_403','http_429') then update private.availability_email_settings set paused_until=now()+interval '1 hour',provider_ready=case when p_code='http_429' then provider_ready else false end where id;end if;
 if p_outcome='accepted' then perform private.apply_availability_email_events(p_provider_id);end if;
end;$$;

create function private.unsubscribe_availability_email(p_token text) returns boolean language plpgsql security definer set search_path='' as $$
declare customer uuid;destination text;changed boolean;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false;end if;
 select customer_id,recipient_hash into customer,destination from private.availability_email_deliveries where unsubscribe_token=p_token;if not found then return false;end if;
 perform 1 from public.notification_preferences where customer_id=customer for update;
 update public.notification_preferences set email_enabled=false,email_destination_hash=null,updated_at=now() where customer_id=customer and email_enabled and email_destination_hash=destination;changed:=found;
 if changed then insert into public.notification_consent_events(customer_id,channel,granted,purpose,notice_version,notice_text)
  values(customer,'email',false,'new_availability','new-availability-v1','Avisos de novas vagas por e-mail desativados pelo link de descadastro.');end if;
 return true;
end;$$;

create function private.apply_availability_email_events(p_provider_id text) returns void language plpgsql security definer set search_path='' as $$
declare j private.availability_email_deliveries;problem text;delivered_time timestamptz;
begin
 select * into j from private.availability_email_deliveries where provider_id=p_provider_id;if not found then return;end if;
 perform 1 from public.notification_preferences where customer_id=j.customer_id for update;
 select replace(event_type,'email.','') into problem from private.availability_email_events where provider_id=p_provider_id and event_type in ('email.bounced','email.complained','email.failed') order by case when event_type='email.complained' then 0 else 1 end limit 1;
 if problem is not null then
  insert into private.availability_email_suppressions(recipient_hash,reason) values(j.recipient_hash,problem) on conflict do nothing;
  update private.availability_email_deliveries set status='failed',last_code=problem where id=j.id;
  update private.availability_email_deliveries set status='suppressed',last_code='provider_suppression',lease_until=null where recipient_hash=j.recipient_hash and status in ('pending','prepared','retry');
 else
  select min(created_at) into delivered_time from private.availability_email_events where provider_id=p_provider_id and event_type='email.delivered';
  if delivered_time is not null then update private.availability_email_deliveries set status=case when status='accepted' then 'delivered' else status end,delivered_at=coalesce(delivered_at,delivered_time) where id=j.id;end if;
 end if;
 update private.availability_email_events set processed_at=now() where provider_id=p_provider_id and processed_at is null;
end;$$;
create function private.record_availability_email_event(p_event_id text,p_provider_id text,p_type text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_event_id is null or length(p_event_id)>200 or p_provider_id is null or length(p_provider_id)>200 or p_type not in ('email.delivered','email.bounced','email.complained','email.failed') then return;end if;
 insert into private.availability_email_events(event_id,provider_id,event_type) values(p_event_id,p_provider_id,p_type) on conflict do nothing;
 -- Replay pending events after acceptance too: a webhook may precede the HTTP commit.
 perform private.apply_availability_email_events(p_provider_id);
end;$$;

create function public.availability_email_status() returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg private.availability_email_settings;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 select * into cfg from private.availability_email_settings where id;
 return jsonb_build_object('enabled',cfg.enabled,'provider_ready',cfg.provider_ready,'start_hour',cfg.start_hour,'end_hour',cfg.end_hour,'daily_limit',cfg.daily_limit,'global_daily_limit',cfg.global_daily_limit,'consolidation_minutes',cfg.consolidation_minutes,
 'last_worker_at',cfg.last_worker_at,'paused_until',cfg.paused_until,
 'pending',(select count(*) from private.availability_email_deliveries where status in ('pending','prepared','retry')),
 'accepted',(select count(*) from private.availability_email_deliveries where status in ('accepted','delivered')),
 'delivered',(select count(*) from private.availability_email_deliveries where status='delivered'),
 'attention',(select count(*) from private.availability_email_deliveries where status in ('failed','unknown')));
end;$$;
revoke all on function public.availability_email_status() from public,anon;
grant execute on function public.availability_email_status() to authenticated;
create function public.availability_alert_channels() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',enabled and provider_ready and coalesce(last_worker_at>now()-interval '5 minutes',false) and not coalesce(paused_until>now(),false),'whatsapp',false) from private.availability_email_settings where id;
$$;
revoke all on function public.availability_alert_channels() from public,anon;
grant execute on function public.availability_alert_channels() to authenticated;
revoke all on function private.suppress_revoked_availability_email(),private.revoke_alerts_after_email_change(),private.email_publication_available(uuid),private.enqueue_availability_emails(),private.prepare_availability_email(),private.claim_availability_email(uuid),private.finish_availability_email(uuid,text,text,text),private.unsubscribe_availability_email(text),private.apply_availability_email_events(text),private.record_availability_email_event(text,text,text) from public,anon,authenticated,service_role;
