-- Availability can be published independently of reservations/payments.
alter table public.profiles add column phone_e164 text check(phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
grant update(phone_e164) on public.profiles to authenticated;
alter table public.clinic_settings add column availability_horizon_days integer not null default 90 check(availability_horizon_days between 1 and 365);
alter table public.availability_exceptions add column active boolean not null default true;
alter table public.availability_exceptions add column busy_block_id uuid references public.appointments(id);

create table public.availability_drafts (
 id uuid primary key default gen_random_uuid(), day date not null,
 kind text not null check(kind in ('open','block','closed_day')),
 from_time time, until_time time, reason text not null check(length(reason) between 1 and 200),
 status text not null default 'draft' check(status in ('draft','published','withdrawn')),
 revision integer not null default 1,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((kind='closed_day' and from_time is null and until_time is null) or
 (kind in ('open','block') and from_time is not null and until_time>from_time))
);
create table public.availability_publications (
 id uuid primary key default gen_random_uuid(),draft_id uuid not null unique references public.availability_drafts(id),
 exception_id uuid not null unique references public.availability_exceptions(id),
 published_by uuid not null references auth.users(id),published_at timestamptz not null default now(),withdrawn_at timestamptz
);
create table private.availability_outbox (
 publication_id uuid primary key references public.availability_publications(id),
 event_type text not null default 'new_availability' check(event_type='new_availability'),
 status text not null default 'awaiting_provider' check(status in ('awaiting_provider','cancelled')),
 created_at timestamptz not null default now()
);
revoke all on public.availability_drafts,public.availability_publications,private.availability_outbox from anon,authenticated;
alter table public.availability_drafts enable row level security;
alter table public.availability_publications enable row level security;
create policy admin_drafts_read on public.availability_drafts for select to authenticated using(private.is_admin());
create policy admin_publications_read on public.availability_publications for select to authenticated using(private.is_admin());
grant select on public.availability_drafts,public.availability_publications to authenticated;

create function private.slot_allowed(p_day date,p_start time,p_minutes integer,p_buffer integer)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare w public.weekly_availability; r public.availability_restrictions; s timestamptz; e timestamptz; b timestamptz; dow integer;
begin
 dow:=extract(isodow from p_day)::integer;
 select * into w from public.weekly_availability where weekday=dow;
 if not found or p_minutes<=0 or p_buffer<0 then return false;end if;
 s:=(p_day+p_start) at time zone 'America/Sao_Paulo';e:=s+p_minutes*interval '1 minute';b:=e+p_buffer*interval '1 minute';
 if p_start<w.opens_at or (e at time zone 'America/Sao_Paulo')::date<>p_day or (e at time zone 'America/Sao_Paulo')::time>w.closes_at then return false;end if;
 if exists(select 1 from public.availability_exceptions x where x.active and x.day=p_day and
 (x.kind='closed_day' or (x.kind='block' and tstzrange(s,b,'[)')&&tstzrange((p_day+x.from_time) at time zone 'America/Sao_Paulo',(p_day+x.until_time) at time zone 'America/Sao_Paulo','[)')))) then return false;end if;
 for r in select * from public.availability_restrictions where p_day>=from_date and (until_date is null or p_day<=until_date) and dow=any(weekdays) loop
  if tsrange(p_day+p_start,(e at time zone 'America/Sao_Paulo'),'[)')&&tsrange(p_day+r.from_time,p_day+r.until_time,'[)') and not exists(
   select 1 from public.availability_exceptions x where x.active and x.day=p_day and x.kind='open' and x.overrides_restriction_id=r.id
    and p_start>=x.from_time and (e at time zone 'America/Sao_Paulo')::time<=x.until_time
  ) then return false;end if;
 end loop;
 if exists(select 1 from public.appointments a where a.status in ('held','confirmed','blocked') and tstzrange(s,b,'[)')&&tstzrange(a.starts_at,a.busy_until,'[)')) then return false;end if;
 return true;
end;$$;
revoke all on function private.slot_allowed(date,time,integer,integer) from public,anon,authenticated;

create function public.available_slots(p_service_id integer,p_day date)
returns table(starts_at timestamptz,ends_at timestamptz,price_cents integer,deposit_cents integer)
language plpgsql stable security definer set search_path='' as $$
declare svc public.services;w public.weekly_availability;cfg public.clinic_settings;t timestamp;stamp timestamptz;today date;
begin
 select * into cfg from public.clinic_settings where id;
 today:=(now() at time zone 'America/Sao_Paulo')::date;
 if p_day is null or p_day<today or p_day>today+cfg.availability_horizon_days then return;end if;
 select * into svc from public.services where id=p_service_id and active;if not found then return;end if;
 select * into w from public.weekly_availability where weekday=extract(isodow from p_day)::integer;if not found then return;end if;
 for t in select generate_series(p_day+w.opens_at,p_day+w.closes_at-svc.duration_minutes*interval '1 minute',interval '15 minutes') loop
  stamp:=t at time zone 'America/Sao_Paulo';
  if stamp>now() and private.slot_allowed(p_day,t::time,svc.duration_minutes,cfg.buffer_minutes) then
   starts_at:=stamp;ends_at:=stamp+svc.duration_minutes*interval '1 minute';price_cents:=svc.price_cents;deposit_cents:=(svc.price_cents*30+50)/100;return next;
  end if;
 end loop;
end;$$;
revoke all on function public.available_slots(integer,date) from public;
grant execute on function public.available_slots(integer,date) to anon,authenticated;

create function public.save_availability_draft(p_day date,p_kind text,p_from time,p_until time,p_reason text,p_id uuid default null,p_revision integer default null)
returns public.availability_drafts language plpgsql security definer set search_path='' as $$
declare result public.availability_drafts;w public.weekly_availability;today date;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 today:=(now() at time zone 'America/Sao_Paulo')::date;
 if p_day is null or p_day<today or p_day>today+365 or p_kind is null or p_kind not in ('open','block','closed_day') or p_reason is null or length(trim(p_reason)) not between 1 and 200 then raise exception 'Invalid availability draft';end if;
 select * into w from public.weekly_availability where weekday=extract(isodow from p_day)::integer;if not found then raise exception 'Sunday is closed';end if;
 if p_kind='closed_day' then p_from:=null;p_until:=null;
 elsif p_from is null or p_until is null or p_until<=p_from or p_from<w.opens_at or p_until>w.closes_at then raise exception 'Outside operating hours';end if;
 if p_kind='open' and (extract(isodow from p_day)>5 or p_from<'07:00'::time or p_until>'11:00'::time) then raise exception 'Morning openings are Monday to Friday 07-11';end if;
 if p_id is null then
  insert into public.availability_drafts(day,kind,from_time,until_time,reason,created_by) values(p_day,p_kind,p_from,p_until,trim(p_reason),auth.uid()) returning * into result;
 else
  update public.availability_drafts set day=p_day,kind=p_kind,from_time=p_from,until_time=p_until,reason=trim(p_reason),revision=revision+1,updated_at=now()
   where id=p_id and status='draft' and revision=p_revision returning * into result;
  if not found then raise exception 'Draft changed; reload before editing';end if;
 end if;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'availability.draft_saved',result.id);
 return result;
end;$$;

create function public.publish_availability_draft(p_id uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.availability_drafts;pub public.availability_publications;w public.weekly_availability;
 s timestamptz;e timestamptz;block_id uuid;exception_id uuid;restriction_id uuid;conflicts jsonb;
 shortest_service integer;previous_slots timestamptz[];notice_pending boolean:=false;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 select * into d from public.availability_drafts where id=p_id for update;if not found then raise exception 'Draft not found';end if;
 if d.status='published' then return jsonb_build_object('published',true,'already_published',true);end if;
 if d.status<>'draft' or d.revision is distinct from p_revision then raise exception 'Draft changed; reload before publishing';end if;
 if d.day<(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Date is in the past';end if;
 perform pg_advisory_xact_lock(hashtextextended(d.day::text,41));
 select * into w from public.weekly_availability where weekday=extract(isodow from d.day)::integer;
 s:=(d.day+coalesce(d.from_time,w.opens_at)) at time zone 'America/Sao_Paulo';e:=(d.day+coalesce(d.until_time,w.closes_at)) at time zone 'America/Sao_Paulo';
 if d.kind='open' then
  if exists(select 1 from public.availability_exceptions x where x.active and x.day=d.day and (x.kind='closed_day' or (x.kind='block' and tstzrange(s,e,'[)')&&tstzrange((d.day+x.from_time) at time zone 'America/Sao_Paulo',(d.day+x.until_time) at time zone 'America/Sao_Paulo','[)'))))
  or exists(select 1 from public.appointments a where a.status='blocked' and tstzrange(s,e,'[)')&&tstzrange(a.starts_at,a.busy_until,'[)')) then return jsonb_build_object('published',false,'blocked',true,'message','Existe bloqueio nesse período. A abertura não remove esse bloqueio.');end if;
  select id into restriction_id from public.availability_restrictions r where d.day>=r.from_date and (r.until_date is null or d.day<=r.until_date) and extract(isodow from d.day)::integer=any(r.weekdays) and d.from_time>=r.from_time and d.until_time<=r.until_time limit 1;
  if restriction_id is null then raise exception 'No matching morning restriction';end if;
  select id into shortest_service from public.services where active order by duration_minutes,id limit 1;
  select coalesce(array_agg(slots.starts_at),'{}'::timestamptz[]) into previous_slots from public.available_slots(shortest_service,d.day) slots;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status)),'[]'::jsonb) into conflicts from public.appointments a where a.status in ('held','confirmed','blocked') and tstzrange(s,e,'[)')&&tstzrange(a.starts_at,a.busy_until,'[)');
  if jsonb_array_length(conflicts)>0 then return jsonb_build_object('published',false,'conflicts',conflicts,'message','Resolva os conflitos antes de publicar. Nenhum agendamento foi alterado.');end if;
  insert into public.appointments(starts_at,ends_at,busy_until,status,buffer_minutes) values(s,e,e,'blocked',0) returning id into block_id;
 end if;
 insert into public.availability_exceptions(day,kind,from_time,until_time,reason,overrides_restriction_id,busy_block_id) values(d.day,d.kind,d.from_time,d.until_time,d.reason,restriction_id,block_id) returning id into exception_id;
 insert into public.availability_publications(draft_id,exception_id,published_by) values(d.id,exception_id,auth.uid()) returning * into pub;
 update public.availability_drafts set status='published',updated_at=now() where id=d.id;
 if d.kind='open' and exists(select 1 from public.available_slots(shortest_service,d.day) slots where slots.starts_at>=s and slots.ends_at<=e and not(slots.starts_at=any(previous_slots))) then
  insert into private.availability_outbox(publication_id) values(pub.id) on conflict do nothing;
  notice_pending:=true;
 end if;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'availability.published',pub.id);
 return jsonb_build_object('published',true,'publication_id',pub.id,'notice_pending',notice_pending,'notifications','no_messages_sent');
end;$$;

create function public.withdraw_availability_publication(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pub public.availability_publications;x public.availability_exceptions;conflicts jsonb;s timestamptz;e timestamptz;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 select * into pub from public.availability_publications where id=p_id for update;if not found then raise exception 'Publication not found';end if;
 if pub.withdrawn_at is not null then return jsonb_build_object('withdrawn',true);end if;
 select * into x from public.availability_exceptions where id=pub.exception_id;
 perform pg_advisory_xact_lock(hashtextextended(x.day::text,41));
 if x.kind='open' then
  s:=(x.day+x.from_time) at time zone 'America/Sao_Paulo';e:=(x.day+x.until_time) at time zone 'America/Sao_Paulo';
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'starts_at',a.starts_at,'status',a.status)),'[]'::jsonb) into conflicts from public.appointments a where a.status in ('held','confirmed') and tstzrange(s,e,'[)')&&tstzrange(a.starts_at,a.busy_until,'[)');
  if jsonb_array_length(conflicts)>0 then return jsonb_build_object('withdrawn',false,'conflicts',conflicts);end if;
 end if;
 -- The exception/publication/audit retain the history. Remove only the synthetic
 -- occupancy row for this block; never delete or cancel a customer appointment.
 update public.availability_exceptions set active=false,busy_block_id=null where id=x.id;
 if x.busy_block_id is not null then delete from public.appointments where id=x.busy_block_id and status='blocked' and customer_id is null;end if;
 update public.availability_publications set withdrawn_at=now() where id=pub.id;
 update public.availability_drafts set status='withdrawn',updated_at=now() where id=pub.draft_id;
 update private.availability_outbox set status='cancelled' where publication_id=pub.id;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'availability.withdrawn',pub.id);
 return jsonb_build_object('withdrawn',true);
end;$$;
revoke all on function public.save_availability_draft(date,text,time,time,text,uuid,integer),public.publish_availability_draft(uuid,integer),public.withdraw_availability_publication(uuid) from public,anon;
grant execute on function public.save_availability_draft(date,text,time,time,text,uuid,integer),public.publish_availability_draft(uuid,integer),public.withdraw_availability_publication(uuid) to authenticated;
