-- Agenda paralela com horário de término e descrição livres (26/11/2026): a agenda que a Eduarda
-- já tinha tem combos e durações próprias (ex.: "Manutenção Volume Brasileiro, Design de sobrancelha
-- com henna", 09:00 às 10:50). O horário ocupado passa a ser exatamente o informado por ela, e a
-- descrição aparece no painel e na agenda do dia no lugar do nome do serviço do site.

alter table public.appointments add column manual_service text check(manual_service is null or length(btrim(manual_service)) between 1 and 200);
alter table public.appointments add constraint appointments_manual_service_only check(manual_service is null or source='manual');

create function public.admin_save_manual_appointment_v2(p_id uuid,p_service_id integer,p_start timestamptz,p_end timestamptz,p_service_text text,p_name text,p_phone text,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare svc public.services;a public.appointments;fim timestamptz;
 nm text:=nullif(btrim(coalesce(p_name,'')),'');ph text:=nullif(btrim(coalesce(p_phone,'')),'');nt text:=nullif(btrim(coalesce(p_notes,'')),'');st text:=nullif(btrim(coalesce(p_service_text,'')),'');
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if nm is null or length(nm)>100 then return jsonb_build_object('ok',false,'reason','name_required');end if;
 if ph is not null and ph !~ '^\+55[1-9][1-9][0-9]{8,9}$' then return jsonb_build_object('ok',false,'reason','invalid_phone');end if;
 if nt is not null and length(nt)>500 then return jsonb_build_object('ok',false,'reason','notes_too_long');end if;
 if st is not null and length(st)>200 then return jsonb_build_object('ok',false,'reason','service_text_too_long');end if;
 if p_start is null or p_start<now()-interval '1 day' then return jsonb_build_object('ok',false,'reason','invalid_time');end if;
 select * into svc from public.services where id=p_service_id;
 if not found then return jsonb_build_object('ok',false,'reason','service_not_found');end if;
 fim:=coalesce(p_end,p_start+svc.duration_minutes*interval '1 minute');
 if fim<=p_start or fim>p_start+interval '12 hours' then return jsonb_build_object('ok',false,'reason','invalid_end');end if;
 begin
  if p_id is null then
   insert into public.appointments(customer_id,service_id,starts_at,ends_at,busy_until,status,price_cents,fee_cents,buffer_minutes,source,manual_name,manual_phone,manual_notes,manual_service)
   values(null,svc.id,p_start,fim,fim,'confirmed',svc.price_cents,0,0,'manual',nm,ph,nt,st) returning * into a;
   insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.manual_created',a.id);
  else
   select * into a from public.appointments where id=p_id and source='manual' for update;
   if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
   if a.status<>'confirmed' then return jsonb_build_object('ok',false,'reason','not_editable');end if;
   update public.appointments set service_id=svc.id,starts_at=p_start,ends_at=fim,busy_until=fim,buffer_minutes=0,price_cents=svc.price_cents,
    manual_name=nm,manual_phone=ph,manual_notes=nt,manual_service=st where id=a.id returning * into a;
   insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.manual_updated',a.id);
  end if;
 exception when exclusion_violation then
  return jsonb_build_object('ok',false,'reason','slot_unavailable');
 end;
 return jsonb_build_object('ok',true,'id',a.id);
end;$$;
revoke all on function public.admin_save_manual_appointment_v2(uuid,integer,timestamptz,timestamptz,text,text,text,text) from public,anon;
grant execute on function public.admin_save_manual_appointment_v2(uuid,integer,timestamptz,timestamptz,text,text,text,text) to authenticated;

create or replace function public.admin_booking_overview(p_from date,p_until date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg public.clinic_settings;items jsonb;open_fees jsonb;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_from is null or p_until is null or p_until<p_from or p_until-p_from>92 then raise exception 'Invalid period';end if;
 select * into cfg from public.clinic_settings where id;
 select coalesce(jsonb_agg(q.item order by q.starts_at),'[]'::jsonb) into items from (
  select a.starts_at,private.appointment_json(a)||jsonb_build_object(
   'service',case when a.manual_service is not null then jsonb_build_object('name',a.manual_service,'variant','') else jsonb_build_object('name',s.name,'variant',s.variant) end,'customer',jsonb_build_object('id',p.id,'name',coalesce(p.display_name,a.manual_name),'phone',coalesce(p.phone_e164,a.manual_phone)),
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
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'ends_at',a.ends_at,'service_name',coalesce(a.manual_service,s.name),'service_variant',case when a.manual_service is null then s.variant end,
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
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'service_name',coalesce(a.manual_service,s.name),'customer_name',coalesce(p.display_name,a.manual_name)) order by a.starts_at),'[]'::jsonb)
 from public.appointments a join public.services s on s.id=a.service_id left join public.profiles p on p.id=a.customer_id
 where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=p_day;
$$;
