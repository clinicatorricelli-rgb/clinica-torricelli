-- WhatsApp das clientes: remarcação e cancelamento (textos aprovados pelo usuário em 26/11/2026,
-- modelos enviados à Meta no mesmo dia). Enquanto a chave changes_enabled estiver desligada, nada
-- muda: a remarcação segue com a mensagem de confirmação e o cancelamento não gera mensagem.
-- Ligada: remarcar envia clinica_remarcacao_cliente (no lugar da confirmação) e refaz os lembretes;
-- cancelar um horário futuro envia clinica_cancelamento_cliente ou, se foi a clínica,
-- clinica_cancelamento_clinica. Só para quem aceitou receber, como as demais.

alter table private.client_whatsapp_settings add column changes_enabled boolean not null default false;

alter table private.client_whatsapp_messages drop constraint client_whatsapp_messages_kind_check;
alter table private.client_whatsapp_messages add constraint client_whatsapp_messages_kind_check
 check(kind in ('confirmation','reminder_27h','reminder_2h','reminder_20m','rescheduled','cancelled_client','cancelled_clinic'));

create or replace function private.enqueue_client_whatsapp() returns trigger
language plpgsql security definer set search_path='' as $$
declare changes boolean;consent boolean;
begin
 if new.status='blocked' or new.customer_id is null then return new;end if;
 if tg_op='UPDATE' and (old.status is distinct from new.status or old.starts_at is distinct from new.starts_at) then
  -- Mudou o horário ou deixou de valer: o que ainda não saiu é descartado.
  update private.client_whatsapp_messages set status='cancelled',last_code=concat_ws(';',last_code,'appointment_changed')
   where appointment_id=new.id and status in ('pending','sending');
 end if;
 select coalesce(bool_or(changes_enabled),false) into changes from private.client_whatsapp_settings;
 consent:=exists(select 1 from private.client_whatsapp_consent c join public.profiles p on p.id=c.customer_id
  where c.customer_id=new.customer_id and c.enabled and p.phone_e164 like '+55%');
 -- Cancelou um horário que ainda não passou: aviso de cancelamento (modelo conforme quem cancelou).
 if tg_op='UPDATE' and old.status='confirmed' and new.status='cancelled' then
  if changes and consent and new.starts_at>now() then
   insert into private.client_whatsapp_messages(appointment_id,kind,starts_at,send_at,next_attempt_at)
    values(new.id,case when new.cancel_kind='clinic' then 'cancelled_clinic' else 'cancelled_client' end,new.starts_at,now(),now());
  end if;
  return new;
 end if;
 if new.status<>'confirmed' then return new;end if;
 if tg_op='UPDATE' and old.status='confirmed' and old.starts_at=new.starts_at then return new;end if;
 if not consent then return new;end if;
 -- Remarcação: no lugar da confirmação, o modelo de horário remarcado; os lembretes são refeitos.
 insert into private.client_whatsapp_messages(appointment_id,kind,starts_at,send_at,next_attempt_at)
  select new.id,case when changes and tg_op='UPDATE' and old.status='confirmed' and s.kind='confirmation' then 'rescheduled' else s.kind end,
   new.starts_at,s.send_at,s.send_at from private.client_whatsapp_schedule(new.starts_at,now()) s;
 return new;
end;$$;

create or replace function private.prepare_client_whatsapp(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.client_whatsapp_messages;a public.appointments;p public.profiles;s public.services;
begin
 if not exists(select 1 from private.client_whatsapp_settings where enabled) then return null;end if;
 -- Atrasada demais perde o sentido (ex.: lembrete de 20 min depois do horário).
 update private.client_whatsapp_messages set status='skipped',last_code='stale'
  where status in ('pending','sending') and send_at<p_now-case kind when 'reminder_27h' then interval '3 hours'
   when 'reminder_2h' then interval '40 minutes' when 'reminder_20m' then interval '10 minutes' else interval '2 hours' end;
 select * into m from private.client_whatsapp_messages where status in ('pending','sending') and next_attempt_at<=p_now
  order by send_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into a from public.appointments where id=m.appointment_id;
 -- Aviso de cancelamento só vale para atendimento cancelado; o resto, só para confirmado no mesmo horário.
 if (m.kind in ('cancelled_client','cancelled_clinic') and a.status is distinct from 'cancelled')
  or (m.kind not in ('cancelled_client','cancelled_clinic') and (a.status is distinct from 'confirmed' or a.starts_at is distinct from m.starts_at)) then
  update private.client_whatsapp_messages set status='cancelled',last_code=concat_ws(';',last_code,'appointment_changed') where id=m.id;
  return jsonb_build_object('id',m.id,'skip',true);
 end if;
 select * into p from public.profiles where id=a.customer_id;
 if p.phone_e164 is null or not exists(select 1 from private.client_whatsapp_consent where customer_id=a.customer_id and enabled) then
  update private.client_whatsapp_messages set status='skipped',last_code='no_consent' where id=m.id;
  return jsonb_build_object('id',m.id,'skip',true);
 end if;
 if m.attempts>=5 then
  update private.client_whatsapp_messages set status='failed',last_code=coalesce(last_code,'too_many_attempts') where id=m.id;
  return jsonb_build_object('id',m.id,'skip',true);
 end if;
 select * into s from public.services where id=a.service_id;
 update private.client_whatsapp_messages set status='sending',attempts=attempts+1,next_attempt_at=p_now+interval '2 minutes' where id=m.id;
 return jsonb_build_object('id',m.id,'kind',m.kind,'to',p.phone_e164,'attempt',m.attempts+1,
  'facts',jsonb_build_object('customer_name',p.display_name,'service_name',s.name,'starts_at',a.starts_at));
end;$$;

revoke all on function private.enqueue_client_whatsapp(),private.prepare_client_whatsapp(timestamptz) from public,anon,authenticated;
