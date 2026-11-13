-- Reservations without upfront payment (decisions of 2026-11-11 and 2026-11-13, docs/DECISOES.md).
-- The customer accepts a versioned rule when booking. A late notice or a no-show creates a fee
-- record that only becomes a charge after Eduarda decides. An open fee blocks new bookings.
-- Nothing here sends a message or talks to a payment provider.

-- 1. Versioned rule accepted at booking. A new text is a new version; rows are never edited.
create table public.booking_rules (
 version text primary key check(version ~ '^[a-z0-9-]{3,40}$'),
 body text not null check(length(body) between 50 and 4000),
 late_notice_hours integer not null check(late_notice_hours between 1 and 168),
 fee_percent integer not null check(fee_percent between 1 and 100),
 grace_minutes integer not null check(grace_minutes between 0 and 1440),
 created_at timestamptz not null default now()
);
-- Draft wording for the test environment. It still needs professional review before real customers.
insert into public.booking_rules(version,body,late_notice_hours,fee_percent,grace_minutes) values('falta-rascunho-2026-11',
$rule$Rascunho para testes, ainda sem revisão jurídica.

1. Não há pagamento para agendar.
2. Para remarcar ou cancelar sem custo, avise com pelo menos 24 horas de antecedência. Com esse aviso, você pode escolher outro horário disponível.
3. Aviso com menos de 24 horas: o horário é cancelado e pode ser cobrada uma taxa de 30% do valor do serviço agendado.
4. Falta sem justificativa: pode ser cobrada a mesma taxa de 30%.
5. Se você desistir em até 1 hora depois de marcar, não há taxa.
6. A taxa só é cobrada depois da confirmação da Eduarda, que avalia a justificativa apresentada.
7. Enquanto houver taxa em aberto, não é possível fazer novo agendamento pelo site.
8. A cobrança é enviada ao WhatsApp informado no cadastro, em até três lembretes. A baixa é feita pela clínica depois de conferir o pagamento.$rule$,24,30,60);
alter table public.booking_rules enable row level security;
create policy booking_rules_read on public.booking_rules for select to anon,authenticated using(true);
revoke all on public.booking_rules from public,anon,authenticated;
grant select on public.booking_rules to anon,authenticated;

-- 2. Settings: the deposit and the payment hold are gone. Booking stays off until an
-- administrator turns it on, and it can never be on without a rule to accept.
do $$ declare c text; begin
 select conname into strict c from pg_constraint where conrelid='public.clinic_settings'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%not booking_enabled%';
 execute format('alter table public.clinic_settings drop constraint %I',c);
end $$;
alter table public.clinic_settings drop column deposit_percent, drop column hold_minutes;
alter table public.clinic_settings
 add column booking_rule_version text references public.booking_rules(version),
 add column max_future_bookings integer not null default 2 check(max_future_bookings between 1 and 20);
update public.clinic_settings set booking_rule_version='falta-rascunho-2026-11' where id;
alter table public.clinic_settings add constraint booking_requires_rule check(not booking_enabled or booking_rule_version is not null);

-- 3. Lash-extension services need the intake form on file before booking.
alter table public.services add column requires_intake boolean not null default false;
update public.services set requires_intake=true where id between 2 and 15;

-- 4. Appointments: the frozen 30% is now the fee quoted in the accepted rule, not a deposit.
do $$ declare c text; begin
 select conname into strict c from pg_constraint where conrelid='public.appointments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%deposit_cents%';
 execute format('alter table public.appointments drop constraint %I',c);
end $$;
alter table public.appointments drop constraint appointments_status_check;
alter table public.appointments rename column deposit_cents to fee_cents;
alter table public.appointments
 add column rule_version text references public.booking_rules(version),
 add column rule_accepted_at timestamptz,
 add column booked_at timestamptz not null default now(),
 add column intake_revision integer,
 add column request_id uuid,
 add column reschedule_count integer not null default 0 check(reschedule_count>=0),
 add column cancelled_at timestamptz,
 add column cancel_kind text check(cancel_kind in ('client_early','client_grace','client_late','clinic')),
 add column attendance_marked_at timestamptz,
 add constraint appointments_status_check check(status in ('held','confirmed','completed','cancelled','expired','blocked','no_show')),
 add constraint appointments_shape check(
  (status='blocked' and customer_id is null and service_id is null and price_cents is null and fee_cents is null) or
  (status<>'blocked' and customer_id is not null and service_id is not null and price_cents is not null and fee_cents is not null and fee_cents between 0 and price_cents)),
 add constraint appointments_cancel_shape check(status='cancelled' or (cancelled_at is null and cancel_kind is null));
update public.appointments set booked_at=created_at;
-- Opening hours are checked when an appointment is created or moved, not on a status change:
-- cancelling or marking attendance must keep working even if the hours change later.
drop trigger appointment_limits on public.appointments;
create trigger appointment_limits before insert or update of starts_at,ends_at on public.appointments for each row execute function private.validate_appointment();
create unique index appointments_request_once on public.appointments(customer_id,request_id) where request_id is not null;

-- 5. Fee for a late notice or a no-show. Born as a proposal; only an administrator confirms,
-- waives or settles it. Internal notes live in a private table the customer never reads.
create table public.appointment_fees (
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null unique references public.appointments(id),
 customer_id uuid not null references public.profiles(id),
 reason text not null check(reason in ('late_cancellation','no_show')),
 amount_cents integer not null check(amount_cents>0),
 status text not null default 'proposed' check(status in ('proposed','confirmed','waived','paid')),
 created_at timestamptz not null default now(),
 decided_at timestamptz, decided_by uuid,
 paid_at timestamptz, paid_by uuid,
 reminders_sent integer not null default 0 check(reminders_sent between 0 and 3),
 last_reminder_at timestamptz,
 check((status='proposed')=(decided_at is null)),
 check((status='paid')=(paid_at is not null))
);
create index appointment_fees_open on public.appointment_fees(customer_id) where status='confirmed';
create table private.booking_notes (
 id bigint generated always as identity primary key,
 appointment_id uuid not null references public.appointments(id),
 fee_id uuid references public.appointment_fees(id),
 actor_id uuid not null,
 action text not null check(action in ('attendance','fee_confirm','fee_waive','fee_settle','clinic_cancel')),
 note text not null check(length(note) between 1 and 500),
 created_at timestamptz not null default now()
);
alter table public.appointment_fees enable row level security;
alter table private.booking_notes enable row level security;
create policy fees_read on public.appointment_fees for select to authenticated using(customer_id=(select auth.uid()) or private.is_admin());
revoke all on public.appointment_fees,private.booking_notes from public,anon,authenticated;
grant select on public.appointment_fees to authenticated;

-- 6. Slot search able to ignore one appointment, so that it can be moved over its own time.
drop function public.available_slots(integer,date);
drop function private.slot_allowed(date,time,integer,integer);
create function private.slot_allowed(p_day date,p_start time,p_minutes integer,p_buffer integer,p_ignore uuid default null)
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
 if exists(select 1 from public.appointments a where a.status in ('held','confirmed','blocked') and (p_ignore is null or a.id<>p_ignore)
  and tstzrange(s,b,'[)')&&tstzrange(a.starts_at,a.busy_until,'[)')) then return false;end if;
 return true;
end;$$;
create function private.day_slots(p_day date,p_minutes integer,p_ignore uuid default null)
returns setof timestamptz language plpgsql stable security definer set search_path='' as $$
declare w public.weekly_availability;cfg public.clinic_settings;t timestamp;stamp timestamptz;today date;
begin
 select * into cfg from public.clinic_settings where id;
 today:=(now() at time zone 'America/Sao_Paulo')::date;
 if p_day is null or p_minutes is null or p_minutes<=0 or p_day<today or p_day>today+cfg.availability_horizon_days then return;end if;
 select * into w from public.weekly_availability where weekday=extract(isodow from p_day)::integer;if not found then return;end if;
 for t in select generate_series(p_day+w.opens_at,p_day+w.closes_at-p_minutes*interval '1 minute',interval '15 minutes') loop
  stamp:=t at time zone 'America/Sao_Paulo';
  if stamp>now() and private.slot_allowed(p_day,t::time,p_minutes,cfg.buffer_minutes,p_ignore) then return next stamp;end if;
 end loop;
end;$$;
create function public.available_slots(p_service_id integer,p_day date)
returns table(starts_at timestamptz,ends_at timestamptz,price_cents integer,fee_cents integer)
language plpgsql stable security definer set search_path='' as $$
declare svc public.services;pct integer;stamp timestamptz;
begin
 select * into svc from public.services where id=p_service_id and active;if not found then return;end if;
 select r.fee_percent into pct from public.clinic_settings c join public.booking_rules r on r.version=c.booking_rule_version where c.id;
 for stamp in select slot from private.day_slots(p_day,svc.duration_minutes) slot loop
  starts_at:=stamp;ends_at:=stamp+svc.duration_minutes*interval '1 minute';price_cents:=svc.price_cents;fee_cents:=(svc.price_cents*pct+50)/100;return next;
 end loop;
end;$$;
revoke all on function private.slot_allowed(date,time,integer,integer,uuid),private.day_slots(date,integer,uuid) from public,anon,authenticated;
revoke all on function public.available_slots(integer,date) from public;
grant execute on function public.available_slots(integer,date) to anon,authenticated;

-- 7. What any visitor may know before booking: whether booking is open and the rule to accept.
create function public.booking_info() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',c.booking_enabled,'max_future_bookings',c.max_future_bookings,
  'rule',case when r.version is null then null else jsonb_build_object('version',r.version,'body',r.body,
   'late_notice_hours',r.late_notice_hours,'fee_percent',r.fee_percent,'grace_minutes',r.grace_minutes) end)
 from public.clinic_settings c left join public.booking_rules r on r.version=c.booking_rule_version where c.id;
$$;
revoke all on function public.booking_info() from public;
grant execute on function public.booking_info() to anon,authenticated;

create function private.appointment_json(a public.appointments) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',a.id,'service_id',a.service_id,'starts_at',a.starts_at,'ends_at',a.ends_at,'status',a.status,
  'price_cents',a.price_cents,'fee_cents',a.fee_cents,'rule_version',a.rule_version);
$$;
-- Until when a change is free: the late-notice limit, or the grace period right after booking.
create function private.free_change_until(a public.appointments,r public.booking_rules) returns timestamptz language sql immutable set search_path='' as $$
 select case when r.version is null then a.starts_at else
  greatest(a.starts_at-r.late_notice_hours*interval '1 hour',least(a.booked_at+r.grace_minutes*interval '1 minute',a.starts_at)) end;
$$;
revoke all on function private.appointment_json(public.appointments),private.free_change_until(public.appointments,public.booking_rules) from public,anon,authenticated;

-- 8. Customer actions. Identity always comes from the session; price, duration, fee and status
-- are read on the server. Expected refusals return {ok:false,reason}; nothing is written then.
create function public.book_appointment(p_service_id integer,p_start timestamptz,p_rule_version text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();cfg public.clinic_settings;svc public.services;rule public.booking_rules;prof public.profiles;
 a public.appointments;day date;intake integer;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_service_id is null or p_start is null or p_rule_version is null or p_request_id is null then raise exception 'Invalid booking request';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,43));
 select * into a from public.appointments where customer_id=uid and request_id=p_request_id;
 if found then return jsonb_build_object('ok',true,'repeated',true,'appointment',private.appointment_json(a));end if;
 select * into cfg from public.clinic_settings where id;
 if not cfg.booking_enabled then return jsonb_build_object('ok',false,'reason','booking_disabled');end if;
 if p_rule_version is distinct from cfg.booking_rule_version then return jsonb_build_object('ok',false,'reason','rule_changed');end if;
 select * into rule from public.booking_rules where version=cfg.booking_rule_version;
 select * into svc from public.services where id=p_service_id and active;
 if not found then return jsonb_build_object('ok',false,'reason','service_unavailable');end if;
 select * into prof from public.profiles where id=uid;
 if not found or btrim(prof.display_name)='' or prof.phone_e164 is null then return jsonb_build_object('ok',false,'reason','profile_incomplete');end if;
 if exists(select 1 from public.appointment_fees f where f.customer_id=uid and f.status='confirmed') then return jsonb_build_object('ok',false,'reason','outstanding_fee');end if;
 if (select count(*) from public.appointments x where x.customer_id=uid and x.status='confirmed' and x.starts_at>now())>=cfg.max_future_bookings then
  return jsonb_build_object('ok',false,'reason','limit_reached','limit',cfg.max_future_bookings);end if;
 if svc.requires_intake then
  select i.revision into intake from public.client_intake_current i where i.customer_id=uid;
  if not found then return jsonb_build_object('ok',false,'reason','intake_required');end if;
 end if;
 day:=(p_start at time zone 'America/Sao_Paulo')::date;
 perform pg_advisory_xact_lock(hashtextextended(day::text,41));
 if not exists(select 1 from private.day_slots(day,svc.duration_minutes) slot where slot=p_start) then return jsonb_build_object('ok',false,'reason','slot_unavailable');end if;
 begin
  insert into public.appointments(customer_id,service_id,starts_at,ends_at,busy_until,status,price_cents,fee_cents,buffer_minutes,rule_version,rule_accepted_at,intake_revision,request_id)
  values(uid,svc.id,p_start,p_start+svc.duration_minutes*interval '1 minute',p_start+(svc.duration_minutes+cfg.buffer_minutes)*interval '1 minute','confirmed',
   svc.price_cents,(svc.price_cents*rule.fee_percent+50)/100,cfg.buffer_minutes,rule.version,now(),intake,p_request_id) returning * into a;
 exception when exclusion_violation then return jsonb_build_object('ok',false,'reason','slot_unavailable');
 end;
 insert into public.audit_log(actor_id,action,entity_id) values(uid,'appointment.booked',a.id);
 return jsonb_build_object('ok',true,'appointment',private.appointment_json(a));
end;$$;

create function public.cancel_appointment(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();a public.appointments;rule public.booking_rules;kind text;proposed integer;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.appointments where id=p_id and customer_id=uid for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 if a.status='cancelled' then return jsonb_build_object('ok',true,'repeated',true,'kind',a.cancel_kind);end if;
 if a.status<>'confirmed' then return jsonb_build_object('ok',false,'reason','not_cancellable');end if;
 if a.starts_at<=now() then return jsonb_build_object('ok',false,'reason','already_started');end if;
 select * into rule from public.booking_rules where version=coalesce(a.rule_version,(select booking_rule_version from public.clinic_settings where id));
 kind:=case when rule.version is null or now()<=a.starts_at-rule.late_notice_hours*interval '1 hour' then 'client_early'
  when now()<=a.booked_at+rule.grace_minutes*interval '1 minute' then 'client_grace' else 'client_late' end;
 update public.appointments set status='cancelled',cancelled_at=now(),cancel_kind=kind where id=a.id;
 if kind='client_late' and a.fee_cents>0 then
  insert into public.appointment_fees(appointment_id,customer_id,reason,amount_cents) values(a.id,uid,'late_cancellation',a.fee_cents) returning amount_cents into proposed;
 end if;
 insert into public.audit_log(actor_id,action,entity_id) values(uid,'appointment.cancelled',a.id);
 return jsonb_build_object('ok',true,'kind',kind,'fee_proposed_cents',proposed);
end;$$;

create function public.reschedule_appointment(p_id uuid,p_start timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();a public.appointments;rule public.booking_rules;cfg public.clinic_settings;minutes integer;day date;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_id is null or p_start is null then raise exception 'Invalid reschedule request';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,43));
 select * into a from public.appointments where id=p_id and customer_id=uid for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 if a.status<>'confirmed' or a.starts_at<=now() then return jsonb_build_object('ok',false,'reason','not_reschedulable');end if;
 if a.starts_at=p_start then return jsonb_build_object('ok',true,'repeated',true,'appointment',private.appointment_json(a));end if;
 select * into cfg from public.clinic_settings where id;
 if not cfg.booking_enabled then return jsonb_build_object('ok',false,'reason','booking_disabled');end if;
 select * into rule from public.booking_rules where version=coalesce(a.rule_version,cfg.booking_rule_version);
 if now()>private.free_change_until(a,rule) then return jsonb_build_object('ok',false,'reason','too_late');end if;
 minutes:=(extract(epoch from a.ends_at-a.starts_at)/60)::integer;
 day:=(p_start at time zone 'America/Sao_Paulo')::date;
 perform pg_advisory_xact_lock(hashtextextended(day::text,41));
 if not exists(select 1 from private.day_slots(day,minutes,a.id) slot where slot=p_start) then return jsonb_build_object('ok',false,'reason','slot_unavailable');end if;
 begin
  update public.appointments set starts_at=p_start,ends_at=p_start+minutes*interval '1 minute',busy_until=p_start+(minutes+cfg.buffer_minutes)*interval '1 minute',
   buffer_minutes=cfg.buffer_minutes,booked_at=now(),reschedule_count=reschedule_count+1 where id=a.id returning * into a;
 exception when exclusion_violation then return jsonb_build_object('ok',false,'reason','slot_unavailable');
 end;
 insert into public.audit_log(actor_id,action,entity_id) values(uid,'appointment.rescheduled',a.id);
 return jsonb_build_object('ok',true,'appointment',private.appointment_json(a));
end;$$;

-- Times the owner may move an appointment to, ignoring the appointment's own current time.
create function public.reschedule_slots(p_id uuid,p_day date)
returns table(starts_at timestamptz,ends_at timestamptz) language plpgsql stable security definer set search_path='' as $$
declare a public.appointments;minutes integer;stamp timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into a from public.appointments x where x.id=p_id and x.customer_id=auth.uid() and x.status='confirmed' and x.starts_at>now();
 if not found then return;end if;
 minutes:=(extract(epoch from a.ends_at-a.starts_at)/60)::integer;
 for stamp in select slot from private.day_slots(p_day,minutes,a.id) slot loop
  if stamp<>a.starts_at then starts_at:=stamp;ends_at:=stamp+minutes*interval '1 minute';return next;end if;
 end loop;
end;$$;

create function public.my_appointments()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();cfg public.clinic_settings;items jsonb;open_cents integer;future integer;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 select * into cfg from public.clinic_settings where id;
 select coalesce(sum(f.amount_cents),0)::integer into open_cents from public.appointment_fees f where f.customer_id=uid and f.status='confirmed';
 select count(*)::integer into future from public.appointments x where x.customer_id=uid and x.status='confirmed' and x.starts_at>now();
 select coalesce(jsonb_agg(q.item order by q.starts_at desc),'[]'::jsonb) into items from (
  select a.starts_at,private.appointment_json(a)||jsonb_build_object(
   'service',jsonb_build_object('name',s.name,'variant',s.variant),'cancel_kind',a.cancel_kind,'reschedule_count',a.reschedule_count,
   'can_change',a.status='confirmed' and a.starts_at>now(),
   'free_change_until',private.free_change_until(a,r),
   'free_change',a.status='confirmed' and a.starts_at>now() and now()<=private.free_change_until(a,r),
   'fee',case when f.id is null then null else jsonb_build_object('status',f.status,'reason',f.reason,'amount_cents',f.amount_cents) end) as item
  from public.appointments a join public.services s on s.id=a.service_id
  left join public.booking_rules r on r.version=coalesce(a.rule_version,cfg.booking_rule_version)
  left join public.appointment_fees f on f.appointment_id=a.id
  where a.customer_id=uid order by a.starts_at desc limit 50) q;
 return jsonb_build_object('booking_enabled',cfg.booking_enabled,'open_fee_cents',open_cents,'future_count',future,
  'max_future_bookings',cfg.max_future_bookings,'items',items);
end;$$;

-- 9. Administrator actions (role + second factor). Every decision is explicit and audited.
create function public.admin_set_booking_enabled(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_enabled is null then raise exception 'Invalid booking switch';end if;
 update public.clinic_settings set booking_enabled=p_enabled where id;
 insert into public.audit_log(actor_id,action) values(auth.uid(),case when p_enabled then 'booking.enabled' else 'booking.disabled' end);
 return jsonb_build_object('ok',true,'enabled',p_enabled);
end;$$;

create function public.admin_mark_attendance(p_id uuid,p_outcome text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;fee public.appointment_fees;note text:=nullif(btrim(coalesce(p_note,'')),'');fee_status text;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_outcome is null or p_outcome not in ('completed','no_show_fee','no_show_waived') or length(coalesce(note,''))>500 then raise exception 'Invalid attendance';end if;
 select * into a from public.appointments where id=p_id for update;
 if not found or a.status not in ('confirmed','completed','no_show') then return jsonb_build_object('ok',false,'reason','not_markable');end if;
 if a.starts_at>now() then return jsonb_build_object('ok',false,'reason','not_started');end if;
 if p_outcome='no_show_waived' and note is null then return jsonb_build_object('ok',false,'reason','note_required');end if;
 select * into fee from public.appointment_fees where appointment_id=a.id for update;
 if fee.status='paid' then return jsonb_build_object('ok',false,'reason','fee_already_paid');end if;
 update public.appointments set status=case when p_outcome='completed' then 'completed' else 'no_show' end,attendance_marked_at=now() where id=a.id;
 fee_status:=case p_outcome when 'no_show_fee' then 'confirmed' else 'waived' end;
 if fee.id is not null then
  update public.appointment_fees set status=fee_status,decided_at=now(),decided_by=auth.uid() where id=fee.id returning * into fee;
 elsif p_outcome<>'completed' and a.fee_cents>0 then
  insert into public.appointment_fees(appointment_id,customer_id,reason,amount_cents,status,decided_at,decided_by)
  values(a.id,a.customer_id,'no_show',a.fee_cents,fee_status,now(),auth.uid()) returning * into fee;
 end if;
 if note is not null then insert into private.booking_notes(appointment_id,fee_id,actor_id,action,note) values(a.id,fee.id,auth.uid(),'attendance',note);end if;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.attendance',a.id);
 return jsonb_build_object('ok',true,'status',case when p_outcome='completed' then 'completed' else 'no_show' end,'fee_status',fee.status);
end;$$;

create function public.admin_decide_fee(p_fee_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare fee public.appointment_fees;note text:=nullif(btrim(coalesce(p_note,'')),'');target text;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_decision is null or p_decision not in ('confirm','waive') or length(coalesce(note,''))>500 then raise exception 'Invalid fee decision';end if;
 target:=case p_decision when 'confirm' then 'confirmed' else 'waived' end;
 select * into fee from public.appointment_fees where id=p_fee_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 if fee.status=target then return jsonb_build_object('ok',true,'repeated',true,'status',fee.status);end if;
 if (p_decision='confirm' and fee.status<>'proposed') or (p_decision='waive' and fee.status not in ('proposed','confirmed')) then
  return jsonb_build_object('ok',false,'reason','not_decidable','status',fee.status);end if;
 update public.appointment_fees set status=target,decided_at=now(),decided_by=auth.uid() where id=fee.id;
 if note is not null then insert into private.booking_notes(appointment_id,fee_id,actor_id,action,note)
  values(fee.appointment_id,fee.id,auth.uid(),case p_decision when 'confirm' then 'fee_confirm' else 'fee_waive' end,note);end if;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'fee.'||target,fee.id);
 return jsonb_build_object('ok',true,'status',target);
end;$$;

-- Settlement is a manual statement by the administrator after checking the bank statement.
create function public.admin_settle_fee(p_fee_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare fee public.appointment_fees;note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if length(coalesce(note,''))>500 then raise exception 'Invalid settlement note';end if;
 select * into fee from public.appointment_fees where id=p_fee_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 if fee.status='paid' then return jsonb_build_object('ok',true,'repeated',true,'status','paid');end if;
 if fee.status<>'confirmed' then return jsonb_build_object('ok',false,'reason','not_open','status',fee.status);end if;
 update public.appointment_fees set status='paid',paid_at=now(),paid_by=auth.uid() where id=fee.id;
 if note is not null then insert into private.booking_notes(appointment_id,fee_id,actor_id,action,note) values(fee.appointment_id,fee.id,auth.uid(),'fee_settle',note);end if;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'fee.paid',fee.id);
 return jsonb_build_object('ok',true,'status','paid');
end;$$;

-- The clinic calls an appointment off: the slot is released and no fee exists.
create function public.admin_cancel_appointment(p_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if note is null or length(note)>500 then raise exception 'Cancellation reason required';end if;
 select * into a from public.appointments where id=p_id for update;
 if not found or a.status='blocked' then return jsonb_build_object('ok',false,'reason','not_found');end if;
 if a.status='cancelled' then return jsonb_build_object('ok',true,'repeated',true);end if;
 if a.status<>'confirmed' then return jsonb_build_object('ok',false,'reason','not_cancellable');end if;
 if a.starts_at<=now() then return jsonb_build_object('ok',false,'reason','already_started');end if;
 update public.appointments set status='cancelled',cancelled_at=now(),cancel_kind='clinic' where id=a.id;
 insert into private.booking_notes(appointment_id,actor_id,action,note) values(a.id,auth.uid(),'clinic_cancel',note);
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.cancelled_by_clinic',a.id);
 return jsonb_build_object('ok',true);
end;$$;

create function public.admin_booking_overview(p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.clinic_settings;items jsonb;open_fees jsonb;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_from is null or p_until is null or p_until<p_from or p_until-p_from>92 then raise exception 'Invalid period';end if;
 select * into cfg from public.clinic_settings where id;
 select coalesce(jsonb_agg(q.item order by q.starts_at),'[]'::jsonb) into items from (
  select a.starts_at,private.appointment_json(a)||jsonb_build_object(
   'service',jsonb_build_object('name',s.name,'variant',s.variant),'customer',jsonb_build_object('id',p.id,'name',p.display_name,'phone',p.phone_e164),
   'booked_at',a.booked_at,'cancel_kind',a.cancel_kind,'reschedule_count',a.reschedule_count,
   'fee',case when f.id is null then null else jsonb_build_object('id',f.id,'status',f.status,'reason',f.reason,'amount_cents',f.amount_cents,'reminders_sent',f.reminders_sent) end,
   'notes',(select coalesce(jsonb_agg(jsonb_build_object('action',n.action,'note',n.note,'created_at',n.created_at) order by n.id),'[]'::jsonb) from private.booking_notes n where n.appointment_id=a.id)) as item
  from public.appointments a join public.services s on s.id=a.service_id join public.profiles p on p.id=a.customer_id
  left join public.appointment_fees f on f.appointment_id=a.id
  where a.status<>'blocked' and a.starts_at>=(p_from+time '00:00') at time zone 'America/Sao_Paulo' and a.starts_at<(p_until+1+time '00:00') at time zone 'America/Sao_Paulo') q;
 select coalesce(jsonb_agg(q.item order by q.created_at),'[]'::jsonb) into open_fees from (
  select f.created_at,jsonb_build_object('id',f.id,'status',f.status,'reason',f.reason,'amount_cents',f.amount_cents,'created_at',f.created_at,'decided_at',f.decided_at,
   'reminders_sent',f.reminders_sent,'customer',jsonb_build_object('id',p.id,'name',p.display_name,'phone',p.phone_e164),
   'appointment',jsonb_build_object('id',a.id,'starts_at',a.starts_at,'service',jsonb_build_object('name',s.name,'variant',s.variant))) as item
  from public.appointment_fees f join public.appointments a on a.id=f.appointment_id join public.services s on s.id=a.service_id join public.profiles p on p.id=f.customer_id
  where f.status in ('proposed','confirmed')) q;
 return jsonb_build_object('enabled',cfg.booking_enabled,'rule_version',cfg.booking_rule_version,'items',items,'open_fees',open_fees);
end;$$;

revoke all on function public.book_appointment(integer,timestamptz,text,uuid),public.cancel_appointment(uuid),public.reschedule_appointment(uuid,timestamptz),
 public.reschedule_slots(uuid,date),public.my_appointments(),public.admin_set_booking_enabled(boolean),public.admin_mark_attendance(uuid,text,text),public.admin_decide_fee(uuid,text,text),
 public.admin_settle_fee(uuid,text),public.admin_cancel_appointment(uuid,text),public.admin_booking_overview(date,date) from public,anon;
grant execute on function public.book_appointment(integer,timestamptz,text,uuid),public.cancel_appointment(uuid),public.reschedule_appointment(uuid,timestamptz),
 public.reschedule_slots(uuid,date),public.my_appointments(),public.admin_set_booking_enabled(boolean),public.admin_mark_attendance(uuid,text,text),public.admin_decide_fee(uuid,text,text),
 public.admin_settle_fee(uuid,text),public.admin_cancel_appointment(uuid,text),public.admin_booking_overview(date,date) to authenticated;
