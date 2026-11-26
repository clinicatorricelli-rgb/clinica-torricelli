-- Ajustes de agenda pedidos pelo usuário em 26/11/2026:
-- 1. Sem intervalo entre atendimentos (era 15 min) e início de meia em meia hora (era 15 em 15).
-- 2. Agenda paralela: a Eduarda cadastra no painel os horários de clientes que não usam o site
--    (sem conta, sem e-mail ou WhatsApp). Esses horários ocupam a agenda como qualquer outro:
--    somem do site, aparecem no calendário, nos avisos e na agenda das 6h30. Nenhuma mensagem
--    automática vai para essas clientes e não há taxa automática (elas não aceitaram a regra pelo site).
--    Também é por aqui que entra a agenda que a Eduarda já tinha antes do site.

-- 1. Intervalo zero (vale para novos agendamentos) e os futuros já marcados também liberam os 15 min.
update public.clinic_settings set buffer_minutes=0 where id;
update public.appointments set buffer_minutes=0,busy_until=ends_at where status in ('held','confirmed') and starts_at>now() and buffer_minutes<>0;

create or replace function private.day_slots(p_day date,p_minutes integer,p_ignore uuid default null)
returns setof timestamptz language plpgsql stable security definer set search_path='' as $$
declare w public.weekly_availability;cfg public.clinic_settings;t timestamp;stamp timestamptz;today date;
begin
 select * into cfg from public.clinic_settings where id;
 today:=(now() at time zone 'America/Sao_Paulo')::date;
 if p_day is null or p_minutes is null or p_minutes<=0 or p_day<today or p_day>today+cfg.availability_horizon_days then return;end if;
 select * into w from public.weekly_availability where weekday=extract(isodow from p_day)::integer;if not found then return;end if;
 for t in select generate_series(p_day+w.opens_at,p_day+w.closes_at-p_minutes*interval '1 minute',interval '30 minutes') loop
  stamp:=t at time zone 'America/Sao_Paulo';
  if stamp>now()+cfg.min_notice_minutes*interval '1 minute' and private.slot_allowed(p_day,t::time,p_minutes,cfg.buffer_minutes,p_ignore) then return next stamp;end if;
 end loop;
end;$$;

-- 2. Agenda paralela.
alter table public.appointments
 add column source text not null default 'site' check(source in ('site','manual')),
 add column manual_name text check(manual_name is null or length(btrim(manual_name)) between 1 and 100),
 add column manual_phone text check(manual_phone is null or manual_phone ~ '^\+55[1-9][1-9][0-9]{8,9}$'),
 add column manual_notes text check(manual_notes is null or length(manual_notes)<=500);
alter table public.appointments drop constraint appointments_shape;
alter table public.appointments add constraint appointments_shape check(
 (status='blocked' and customer_id is null and service_id is null and price_cents is null and fee_cents is null) or
 (status<>'blocked' and service_id is not null and price_cents is not null and fee_cents is not null and fee_cents between 0 and price_cents and (
  (source='site' and customer_id is not null and manual_name is null) or
  (source='manual' and customer_id is null and manual_name is not null and fee_cents=0))));

-- O horário de funcionamento vale para o site; na agenda paralela quem decide é a Eduarda.
create or replace function private.validate_appointment() returns trigger language plpgsql set search_path='' as $$
declare local_start timestamp; local_end timestamp; closing time;
begin
 if new.status='blocked' or new.source='manual' then return new; end if;
 local_start:=new.starts_at at time zone 'America/Sao_Paulo'; local_end:=new.ends_at at time zone 'America/Sao_Paulo';
 closing:=case when extract(isodow from local_start)=6 then '18:00'::time else '22:00'::time end;
 if extract(isodow from local_start)=7 or local_start::date<>local_end::date or local_start::time<'07:00'::time or local_end::time>closing then
 raise exception 'Outside clinic operating limits'; end if;
 return new;
end; $$;

create function public.admin_save_manual_appointment(p_id uuid,p_service_id integer,p_start timestamptz,p_name text,p_phone text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare svc public.services;cfg public.clinic_settings;a public.appointments;
 nm text:=nullif(btrim(coalesce(p_name,'')),'');ph text:=nullif(btrim(coalesce(p_phone,'')),'');nt text:=nullif(btrim(coalesce(p_notes,'')),'');
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if nm is null or length(nm)>100 then return jsonb_build_object('ok',false,'reason','name_required');end if;
 if ph is not null and ph !~ '^\+55[1-9][1-9][0-9]{8,9}$' then return jsonb_build_object('ok',false,'reason','invalid_phone');end if;
 if nt is not null and length(nt)>500 then return jsonb_build_object('ok',false,'reason','notes_too_long');end if;
 if p_start is null or p_start<now()-interval '1 day' then return jsonb_build_object('ok',false,'reason','invalid_time');end if;
 select * into svc from public.services where id=p_service_id;
 if not found then return jsonb_build_object('ok',false,'reason','service_not_found');end if;
 select * into cfg from public.clinic_settings where id;
 begin
  if p_id is null then
   insert into public.appointments(customer_id,service_id,starts_at,ends_at,busy_until,status,price_cents,fee_cents,buffer_minutes,source,manual_name,manual_phone,manual_notes)
   values(null,svc.id,p_start,p_start+svc.duration_minutes*interval '1 minute',p_start+(svc.duration_minutes+cfg.buffer_minutes)*interval '1 minute','confirmed',
    svc.price_cents,0,cfg.buffer_minutes,'manual',nm,ph,nt) returning * into a;
   insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.manual_created',a.id);
  else
   select * into a from public.appointments where id=p_id and source='manual' for update;
   if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
   if a.status<>'confirmed' then return jsonb_build_object('ok',false,'reason','not_editable');end if;
   update public.appointments set service_id=svc.id,starts_at=p_start,ends_at=p_start+svc.duration_minutes*interval '1 minute',
    busy_until=p_start+(svc.duration_minutes+cfg.buffer_minutes)*interval '1 minute',buffer_minutes=cfg.buffer_minutes,price_cents=svc.price_cents,
    manual_name=nm,manual_phone=ph,manual_notes=nt where id=a.id returning * into a;
   insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.manual_updated',a.id);
  end if;
 exception when exclusion_violation then
  return jsonb_build_object('ok',false,'reason','slot_unavailable');
 end;
 return jsonb_build_object('ok',true,'id',a.id);
end;$$;
revoke all on function public.admin_save_manual_appointment(uuid,integer,timestamptz,text,text,text) from public,anon;
grant execute on function public.admin_save_manual_appointment(uuid,integer,timestamptz,text,text,text) to authenticated;

-- Painel, agenda das 6h30 (e-mail e WhatsApp) passam a incluir a agenda paralela.
create or replace function public.admin_booking_overview(p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.clinic_settings;items jsonb;open_fees jsonb;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_from is null or p_until is null or p_until<p_from or p_until-p_from>92 then raise exception 'Invalid period';end if;
 select * into cfg from public.clinic_settings where id;
 select coalesce(jsonb_agg(q.item order by q.starts_at),'[]'::jsonb) into items from (
  select a.starts_at,private.appointment_json(a)||jsonb_build_object(
   'service',jsonb_build_object('name',s.name,'variant',s.variant),'customer',jsonb_build_object('id',p.id,'name',coalesce(p.display_name,a.manual_name),'phone',coalesce(p.phone_e164,a.manual_phone)),
   'source',a.source,'manual_notes',a.manual_notes,'booked_at',a.booked_at,'cancel_kind',a.cancel_kind,'reschedule_count',a.reschedule_count,
   'fee',case when f.id is null then null else jsonb_build_object('id',f.id,'status',f.status,'reason',f.reason,'amount_cents',f.amount_cents,'reminders_sent',f.reminders_sent) end,
   'notes',(select coalesce(jsonb_agg(jsonb_build_object('action',n.action,'note',n.note,'created_at',n.created_at) order by n.id),'[]'::jsonb) from private.booking_notes n where n.appointment_id=a.id)) as item
  from public.appointments a join public.services s on s.id=a.service_id left join public.profiles p on p.id=a.customer_id
  left join public.appointment_fees f on f.appointment_id=a.id
  where a.status<>'blocked' and a.starts_at>=(p_from+time '00:00') at time zone 'America/Sao_Paulo' and a.starts_at<(p_until+1+time '00:00') at time zone 'America/Sao_Paulo') q;
 select coalesce(jsonb_agg(q.item order by q.created_at),'[]'::jsonb) into open_fees from (
  select f.created_at,jsonb_build_object('id',f.id,'status',f.status,'reason',f.reason,'amount_cents',f.amount_cents,'created_at',f.created_at,'decided_at',f.decided_at,
   'reminders_sent',f.reminders_sent,'customer',jsonb_build_object('id',p.id,'name',p.display_name,'phone',p.phone_e164),
   'appointment',jsonb_build_object('id',a.id,'starts_at',a.starts_at,'service',jsonb_build_object('name',s.name,'variant',s.variant))) as item
  from public.appointment_fees f join public.appointments a on a.id=f.appointment_id join public.services s on s.id=a.service_id join public.profiles p on p.id=f.customer_id
  where f.status in ('proposed','confirmed')) q;
 return jsonb_build_object('enabled',cfg.booking_enabled,'rule_version',cfg.booking_rule_version,'min_notice_minutes',cfg.min_notice_minutes,
  'max_future_bookings',cfg.max_future_bookings,'items',items,'open_fees',open_fees);
end;$$;

create or replace function private.prepare_daily_agenda(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare local timestamp:=p_now at time zone 'America/Sao_Paulo';d date:=local::date;r private.daily_agenda_runs;existed boolean;recipients text[];items jsonb;tomorrow integer;
begin
 if extract(isodow from d)=7 or local::time<'06:30' or local::time>='12:00' then return null;end if;
 select * into r from private.daily_agenda_runs where day=d for update;
 existed:=found;
 if existed and (r.status<>'sending' or r.next_attempt_at>p_now or r.attempts>=5) then
  if r.status='sending' and r.attempts>=5 and r.next_attempt_at<=p_now then update private.daily_agenda_runs set status='failed',last_code=coalesce(last_code,'too_many_attempts') where day=d;end if;
  return null;
 end if;
 select array_agg(distinct u.email order by u.email) into recipients from private.admin_members m join auth.users u on u.id=m.user_id
  where u.email is not null and u.email_confirmed_at is not null;
 if recipients is null then return null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'service_name',s.name,'service_variant',s.variant,
   'customer_name',coalesce(p.display_name,a.manual_name),'customer_phone',coalesce(p.phone_e164,a.manual_phone)) order by a.starts_at),'[]'::jsonb) into items
  from public.appointments a join public.services s on s.id=a.service_id left join public.profiles p on p.id=a.customer_id
  where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=d;
 select count(*)::integer into tomorrow from public.appointments a
  where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=d+1;
 if existed then
  update private.daily_agenda_runs set attempts=attempts+1,next_attempt_at=p_now+interval '3 minutes' where day=d;
 else
  insert into private.daily_agenda_runs(day,next_attempt_at) values(d,p_now+interval '3 minutes');
 end if;
 return jsonb_build_object('day',d,'to',to_jsonb(recipients),'items',items,'tomorrow_count',tomorrow,
  'attempt',case when existed then r.attempts+1 else 1 end);
end;$$;

create or replace function private.owner_day_items(p_day date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'service_name',s.name,'customer_name',coalesce(p.display_name,a.manual_name)) order by a.starts_at),'[]'::jsonb)
 from public.appointments a join public.services s on s.id=a.service_id left join public.profiles p on p.id=a.customer_id
 where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=p_day;
$$;
