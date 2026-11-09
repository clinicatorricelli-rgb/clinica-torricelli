-- Optional new-availability announcements; unrelated to transactional confirmations.
create table public.notification_preferences (
 customer_id uuid primary key references public.profiles(id) on delete cascade,
 email_enabled boolean not null default false,
 whatsapp_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.notification_consent_events (
 id bigint generated always as identity primary key,
 customer_id uuid not null references public.profiles(id) on delete cascade,
 channel text not null check(channel in ('email','whatsapp')),
 granted boolean not null,
 purpose text not null check(purpose='new_availability'),
 notice_version text not null,
 notice_text text not null,
 recorded_at timestamptz not null default now()
);
create index on public.notification_consent_events(customer_id,recorded_at);
alter table public.notification_preferences enable row level security;
alter table public.notification_consent_events enable row level security;
create policy own_preferences_read on public.notification_preferences for select to authenticated using(customer_id=(select auth.uid()));
create policy own_consent_read on public.notification_consent_events for select to authenticated using(customer_id=(select auth.uid()));
revoke all on public.notification_preferences,public.notification_consent_events from anon,authenticated;
grant select on public.notification_preferences,public.notification_consent_events to authenticated;

-- No customer_id argument: a clinic administrator cannot grant consent on behalf of a customer.
-- The server stamps purpose, notice and time; clients cannot edit the evidence.
create function public.set_availability_alert_preference(channel text,enabled boolean,notice_version text)
returns void language plpgsql security definer set search_path='' as $$
declare customer uuid := auth.uid(); previous boolean; notice constant text :=
 'Quero receber avisos opcionais de novas vagas da Clínica Torriceli por este canal, incluindo manhãs abertas em datas específicas. Posso desligar a qualquer momento em Minha conta. O aviso não garante reserva. Não é necessário aceitar para cadastrar ou agendar.';
begin
 if customer is null then raise exception 'Authentication required'; end if;
 if channel is null or channel not in ('email','whatsapp') or enabled is null then raise exception 'Invalid preference'; end if;
 -- Revocation must keep working even after a future notice version changes.
 if enabled and notice_version is distinct from 'new-availability-v1' then raise exception 'Notice version changed; review before accepting'; end if;
 insert into public.notification_preferences(customer_id) values(customer) on conflict do nothing;
 select case when channel='email' then p.email_enabled else p.whatsapp_enabled end into previous
 from public.notification_preferences p where p.customer_id=customer for update;
 if previous=enabled then return; end if;
 update public.notification_preferences p set
  email_enabled=case when channel='email' then enabled else p.email_enabled end,
  whatsapp_enabled=case when channel='whatsapp' then enabled else p.whatsapp_enabled end,
  updated_at=clock_timestamp() where p.customer_id=customer;
 insert into public.notification_consent_events(customer_id,channel,granted,purpose,notice_version,notice_text)
 values(customer,channel,enabled,'new_availability','new-availability-v1',notice);
end; $$;
revoke all on function public.set_availability_alert_preference(text,boolean,text) from public;
grant execute on function public.set_availability_alert_preference(text,boolean,text) to authenticated;
