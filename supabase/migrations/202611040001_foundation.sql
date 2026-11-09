-- No customer write access to financial, scheduling or authorization records.
create extension if not exists btree_gist;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table private.admin_members (user_id uuid primary key references auth.users(id) on delete cascade);
create function public.has_admin_role() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.admin_members where user_id=(select auth.uid()));
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select public.has_admin_role() and coalesce((select auth.jwt()->>'aal')='aal2',false);
$$;
revoke all on function public.has_admin_role() from public;
grant execute on function public.has_admin_role() to authenticated;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=100),
 created_at timestamptz not null default now()
);
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id) values(new.id); return new; end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

create table public.services (
 id integer primary key, name text not null, variant text not null,
 price_cents integer not null check(price_cents>0), duration_minutes integer not null check(duration_minutes>0),
 maintenance_min_days integer, maintenance_max_days integer, active boolean not null default true,
 check((maintenance_min_days is null and maintenance_max_days is null) or
 (maintenance_min_days>0 and maintenance_max_days>=maintenance_min_days))
);
create table public.clinic_settings (
 id boolean primary key default true check(id), timezone text not null default 'America/Sao_Paulo' check(timezone='America/Sao_Paulo'),
 buffer_minutes integer not null default 15 check(buffer_minutes>=0),
 deposit_percent integer not null default 30 check(deposit_percent between 0 and 100),
 hold_minutes integer check(hold_minutes>0), booking_enabled boolean not null default false check(not booking_enabled),
 morning_saturday_applies boolean not null default false, restriction_review_date date not null default '2026-12-05'
);
insert into public.clinic_settings(id) values(true);
create table public.weekly_availability (
 weekday integer primary key check(weekday between 1 and 6), opens_at time not null, closes_at time not null,
 check(opens_at<closes_at)
);
insert into public.weekly_availability values (1,'07:00','22:00'),(2,'07:00','22:00'),(3,'07:00','22:00'),(4,'07:00','22:00'),(5,'07:00','22:00'),(6,'07:00','18:00');
create table public.availability_restrictions (
 id uuid primary key default gen_random_uuid(), label text not null,
 from_date date not null, until_date date, weekdays integer[] not null,
 from_time time not null, until_time time not null, requires_explicit_release boolean not null default true,
 check(until_date is null or until_date>=from_date), check(from_time<until_time),
 check(weekdays <@ array[1,2,3,4,5,6])
);
-- Open-ended: review on Dec 5 is NOT an expiration. Morning restriction applies Mon-Fri only.
insert into public.availability_restrictions(label,from_date,weekdays,from_time,until_time)
 values('Estágio: manhã fechada; revisar em 05/12 sem liberação automática','2026-11-04',array[1,2,3,4,5],'07:00','11:00');
create table public.availability_exceptions (
 id uuid primary key default gen_random_uuid(), day date not null,
 kind text not null check(kind in ('open','block','closed_day')),
 from_time time, until_time time, reason text not null,
 overrides_restriction_id uuid references public.availability_restrictions(id),
 check((kind='closed_day' and from_time is null and until_time is null) or
 (kind in ('open','block') and from_time is not null and until_time>from_time)),
 check(kind='open' or overrides_restriction_id is null)
);

-- Single practitioner. All busy time, including blocks, lives in one exclusion domain.
create table public.appointments (
 id uuid primary key default gen_random_uuid(), customer_id uuid references public.profiles(id),
 service_id integer references public.services(id),
 starts_at timestamptz not null, ends_at timestamptz not null, busy_until timestamptz not null,
 status text not null check(status in ('held','confirmed','completed','cancelled','expired','blocked')),
 hold_expires_at timestamptz,
 price_cents integer check(price_cents>0), deposit_cents integer,
 buffer_minutes integer not null default 15 check(buffer_minutes>=0),
 created_at timestamptz not null default now(),
 check(ends_at>starts_at and busy_until=ends_at+buffer_minutes*interval '1 minute'),
 check((status='blocked' and customer_id is null and service_id is null and price_cents is null and deposit_cents is null) or
 (status<>'blocked' and customer_id is not null and service_id is not null and price_cents is not null and deposit_cents is not null and deposit_cents=(price_cents*30+50)/100)),
 check(status<>'held' or hold_expires_at is not null),
 exclude using gist(tstzrange(starts_at,busy_until,'[)') with &&) where(status in ('held','confirmed','blocked'))
);
create index on public.appointments(customer_id);
create function private.validate_appointment() returns trigger language plpgsql set search_path='' as $$
declare local_start timestamp; local_end timestamp; closing time;
begin
 if new.status='blocked' then return new; end if;
 local_start:=new.starts_at at time zone 'America/Sao_Paulo'; local_end:=new.ends_at at time zone 'America/Sao_Paulo';
 closing:=case when extract(isodow from local_start)=6 then '18:00'::time else '22:00'::time end;
 if extract(isodow from local_start)=7 or local_start::date<>local_end::date or local_start::time<'07:00'::time or local_end::time>closing then
 raise exception 'Outside clinic operating limits'; end if;
 return new;
end; $$;
create trigger appointment_limits before insert or update on public.appointments for each row execute function private.validate_appointment();
create table public.payments (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id),
 provider text not null, provider_payment_id text not null,
 amount_cents integer not null check(amount_cents>0), currency text not null default 'BRL' check(currency='BRL'),
 status text not null check(status in ('pending','validated','refunded','failed')),
 validated_at timestamptz, unique(provider,provider_payment_id),
 check(status<>'validated' or validated_at is not null)
);
create table private.payment_events (
 provider text not null, event_id text not null, received_at timestamptz not null default now(),
 processed_at timestamptz, primary key(provider,event_id)
);
create table public.reschedule_requests (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id),
 requested_start timestamptz not null, requested_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','approved','declined','withdrawn')),
 decided_at timestamptz
);
create unique index one_pending_reschedule on public.reschedule_requests(appointment_id) where status='pending';
-- Financial decision independent from scheduling decision; no automatic forfeiture.
create table public.financial_decisions (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id),
 decision text not null check(decision in ('pending','transfer','refund','retain_with_reason')),
 reason text not null, created_at timestamptz not null default now()
);
create table public.audit_log (
 id bigint generated always as identity primary key, actor_id uuid, action text not null,
 entity_id uuid, created_at timestamptz not null default now()
);
create function private.audit_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'profile.updated',new.id);return new;end; $$;
create trigger audit_profile_update after update on public.profiles for each row execute function private.audit_profile();

alter table public.profiles enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or private.is_admin());
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter table public.services enable row level security;
create policy catalog_read on public.services for select to anon,authenticated using(active);
create policy catalog_admin_read on public.services for select to authenticated using(private.is_admin());
alter table public.appointments enable row level security;
create policy appointments_read on public.appointments for select to authenticated using(customer_id=(select auth.uid()) or private.is_admin());
alter table public.payments enable row level security;
create policy payments_read on public.payments for select to authenticated using(private.is_admin() or exists(select 1 from public.appointments a where a.id=appointment_id and a.customer_id=(select auth.uid())));
alter table public.reschedule_requests enable row level security;
create policy requests_read on public.reschedule_requests for select to authenticated using(private.is_admin() or exists(select 1 from public.appointments a where a.id=appointment_id and a.customer_id=(select auth.uid())));
alter table public.financial_decisions enable row level security;
create policy finance_read on public.financial_decisions for select to authenticated using(private.is_admin() or exists(select 1 from public.appointments a where a.id=appointment_id and a.customer_id=(select auth.uid())));

do $$ declare t text; begin
 foreach t in array array['clinic_settings','weekly_availability','availability_restrictions','availability_exceptions','audit_log'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy admin_read on public.%I for select to authenticated using(private.is_admin())',t);
 end loop;
end $$;
-- Explicit grants: no client scheduling/payment/admin mutation endpoints in phase 1.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.services to anon,authenticated;
grant select on public.profiles,public.appointments,public.payments,public.reschedule_requests,public.financial_decisions,
 public.clinic_settings,public.weekly_availability,public.availability_restrictions,public.availability_exceptions,public.audit_log to authenticated;
grant update(display_name) on public.profiles to authenticated;
revoke all on all tables in schema private from anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('client-files','client-files',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('public-gallery','public-gallery',true,5242880,array['image/jpeg','image/png','image/webp']);
-- Private files: read only; uploads deliberately disabled pending purpose/retention policy.
create policy client_file_read on storage.objects for select to authenticated using(
 bucket_id='client-files' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.is_admin()));
create policy gallery_admin_insert on storage.objects for insert to authenticated with check(bucket_id='public-gallery' and private.is_admin());
create policy gallery_admin_update on storage.objects for update to authenticated using(bucket_id='public-gallery' and private.is_admin()) with check(bucket_id='public-gallery' and private.is_admin());
create policy gallery_admin_delete on storage.objects for delete to authenticated using(bucket_id='public-gallery' and private.is_admin());
create policy gallery_admin_read on storage.objects for select to authenticated using(bucket_id='public-gallery' and private.is_admin());
