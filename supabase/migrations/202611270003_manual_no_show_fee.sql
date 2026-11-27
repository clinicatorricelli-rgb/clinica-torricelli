-- Falta na agenda paralela com taxa (pedido do usuário em 27/11/2026). Antes, o botão "Faltou:
-- cobrar taxa" só existia para quem agendou pelo site; os atendimentos cadastrados pela Eduarda
-- (sem conta da cliente) só tinham "Compareceu" e "Faltou: dispensar taxa".
-- Agora a falta na agenda paralela também pode gerar a taxa (30% do valor do serviço, pela regra
-- em vigor), que aparece em "Taxas em aberto" para baixa ou dispensa. Como a cliente não tem
-- conta, o site não bloqueia novos horários dela: a cobrança é combinada pela Eduarda.

alter table public.appointment_fees alter column customer_id drop not null;

create or replace function public.admin_mark_attendance(p_id uuid,p_outcome text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;fee public.appointment_fees;note text:=nullif(btrim(coalesce(p_note,'')),'');fee_status text;pct integer;amount integer;
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
 elsif p_outcome<>'completed' then
  -- Agenda paralela: a taxa sai do valor do serviço pela regra em vigor (o horário foi marcado sem taxa).
  amount:=a.fee_cents;
  if a.source='manual' and p_outcome='no_show_fee' then
   select r.fee_percent into pct from public.clinic_settings c join public.booking_rules r on r.version=c.booking_rule_version where c.id;
   amount:=(a.price_cents*coalesce(pct,30)+50)/100;
  end if;
  if amount>0 then
   insert into public.appointment_fees(appointment_id,customer_id,reason,amount_cents,status,decided_at,decided_by)
   values(a.id,a.customer_id,'no_show',amount,fee_status,now(),auth.uid()) returning * into fee;
  end if;
 end if;
 if note is not null then insert into private.booking_notes(appointment_id,fee_id,actor_id,action,note) values(a.id,fee.id,auth.uid(),'attendance',note);end if;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),'appointment.attendance',a.id);
 return jsonb_build_object('ok',true,'status',case when p_outcome='completed' then 'completed' else 'no_show' end,'fee_status',fee.status);
end;$$;

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
   'reminders_sent',f.reminders_sent,'customer',jsonb_build_object('id',p.id,'name',coalesce(p.display_name,a.manual_name),'phone',coalesce(p.phone_e164,a.manual_phone)),
   'source',a.source,
   'appointment',jsonb_build_object('id',a.id,'starts_at',a.starts_at,'service',case when a.manual_service is not null then jsonb_build_object('name',a.manual_service,'variant','') else jsonb_build_object('name',s.name,'variant',s.variant) end)) as item
  from public.appointment_fees f join public.appointments a on a.id=f.appointment_id join public.services s on s.id=a.service_id left join public.profiles p on p.id=f.customer_id
  where f.status in ('proposed','confirmed')) q;
 return jsonb_build_object('enabled',cfg.booking_enabled,'rule_version',cfg.booking_rule_version,'min_notice_minutes',cfg.min_notice_minutes,
  'max_future_bookings',cfg.max_future_bookings,'items',items,'open_fees',open_fees);
end;$$;
