-- Mensagens de WhatsApp para as clientes (decisão do usuário em 25/11/2026), enviadas pelo
-- número da clínica com modelos aprovados pela Meta, só para quem aceitou recebê-las:
--   confirmação ao agendar; lembrete 27 h antes; lembrete 2 h antes; mensagem 20 min antes.
-- Horários sempre entre 6h e 22h (São Paulo). O lembrete de 27 h sempre sai com mais de 24 h
-- de antecedência (ainda dá para remarcar sem taxa); se cair de madrugada, vai às 6h, ou às
-- 22h da véspera se às 6h já faltariam menos de 24 h. Remarcar refaz tudo; cancelar descarta.
-- Nada de ficha ou dado de saúde. A Eduarda não recebe aviso dessas mensagens.

create table private.client_whatsapp_settings(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into private.client_whatsapp_settings(id) values(true);
alter table private.client_whatsapp_settings enable row level security;
revoke all on private.client_whatsapp_settings from public,anon,authenticated;

-- Consentimento da cliente (marcado por ela no agendamento ou em Minha conta).
create table private.client_whatsapp_consent(
 customer_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null,
 notice_version text not null,
 updated_at timestamptz not null default now()
);
alter table private.client_whatsapp_consent enable row level security;
revoke all on private.client_whatsapp_consent from public,anon,authenticated;

create table private.client_whatsapp_messages(
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 kind text not null check(kind in ('confirmation','reminder_27h','reminder_2h','reminder_20m')),
 starts_at timestamptz not null,
 send_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 6),
 next_attempt_at timestamptz not null,
 provider_id text,
 last_code text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index client_whatsapp_due on private.client_whatsapp_messages(next_attempt_at) where status in ('pending','sending');
create index client_whatsapp_appointment on private.client_whatsapp_messages(appointment_id);
alter table private.client_whatsapp_messages enable row level security;
revoke all on private.client_whatsapp_messages from public,anon,authenticated;

-- Horários de envio de um atendimento, calculados no momento do agendamento (p_now).
create function private.client_whatsapp_schedule(p_starts timestamptz,p_now timestamptz)
returns table(kind text,send_at timestamptz) language plpgsql stable set search_path='' as $$
declare tz text:='America/Sao_Paulo';t timestamptz;l timestamp;
begin
 kind:='confirmation';send_at:=p_now;return next;
 -- 27 h antes, dentro de 6h–22h e sempre com mais de 24 h de antecedência.
 t:=p_starts-interval '27 hours';l:=t at time zone tz;
 if l::time<'06:00' then
  t:=(l::date+time '06:00') at time zone tz;
  if p_starts-t<interval '24 hours' then t:=((l::date-1)+time '22:00') at time zone tz;end if;
 elsif l::time>='22:00' then
  t:=(l::date+time '22:00') at time zone tz;
 end if;
 -- Agendou com menos de 27 h (ou o lembrete sairia quase junto com a confirmação): não envia.
 if t>p_now+interval '2 hours' then kind:='reminder_27h';send_at:=t;return next;end if;
 -- 2 h antes; se cair antes das 6h, vai às 6h.
 t:=p_starts-interval '2 hours';l:=t at time zone tz;
 if l::time<'06:00' then t:=(l::date+time '06:00') at time zone tz;end if;
 if t>p_now+interval '30 minutes' and t<p_starts then kind:='reminder_2h';send_at:=t;return next;end if;
 -- 20 min antes.
 t:=p_starts-interval '20 minutes';
 if t>p_now and (t at time zone tz)::time>='06:00' then kind:='reminder_20m';send_at:=t;return next;end if;
end;$$;

create function private.enqueue_client_whatsapp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='blocked' or new.customer_id is null then return new;end if;
 if tg_op='UPDATE' and (old.status is distinct from new.status or old.starts_at is distinct from new.starts_at) then
  -- Mudou o horário ou deixou de valer: o que ainda não saiu é descartado.
  update private.client_whatsapp_messages set status='cancelled',last_code='appointment_changed'
   where appointment_id=new.id and status in ('pending','sending');
 end if;
 if new.status<>'confirmed' then return new;end if;
 if tg_op='UPDATE' and old.status='confirmed' and old.starts_at=new.starts_at then return new;end if;
 if not exists(select 1 from private.client_whatsapp_consent c join public.profiles p on p.id=c.customer_id
  where c.customer_id=new.customer_id and c.enabled and p.phone_e164 like '+55%') then return new;end if;
 insert into private.client_whatsapp_messages(appointment_id,kind,starts_at,send_at,next_attempt_at)
  select new.id,s.kind,new.starts_at,s.send_at,s.send_at from private.client_whatsapp_schedule(new.starts_at,now()) s;
 return new;
end;$$;
create trigger client_whatsapp_after_insert after insert on public.appointments for each row execute function private.enqueue_client_whatsapp();
create trigger client_whatsapp_after_update after update of status,starts_at on public.appointments for each row execute function private.enqueue_client_whatsapp();

-- Próxima mensagem devida, com os dados atuais da cliente. Com o envio desligado, nada é consumido.
create function private.prepare_client_whatsapp(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.client_whatsapp_messages;a public.appointments;p public.profiles;s public.services;
begin
 if not exists(select 1 from private.client_whatsapp_settings where enabled) then return null;end if;
 -- Atrasada demais perde o sentido (ex.: lembrete de 20 min depois do horário).
 update private.client_whatsapp_messages set status='skipped',last_code='stale'
  where status in ('pending','sending') and send_at<p_now-case kind when 'confirmation' then interval '2 hours' when 'reminder_27h' then interval '3 hours'
   when 'reminder_2h' then interval '40 minutes' else interval '10 minutes' end;
 select * into m from private.client_whatsapp_messages where status in ('pending','sending') and next_attempt_at<=p_now
  order by send_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into a from public.appointments where id=m.appointment_id;
 if a.status is distinct from 'confirmed' or a.starts_at is distinct from m.starts_at then
  update private.client_whatsapp_messages set status='cancelled',last_code='appointment_changed' where id=m.id;
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

create function private.finish_client_whatsapp(p_id uuid,p_outcome text,p_provider_id text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' then
  update private.client_whatsapp_messages set status='sent',provider_id=p_provider_id,last_code=null,sent_at=now() where id=p_id and status='sending';
 elsif p_outcome='retry' then
  update private.client_whatsapp_messages set status=case when attempts>=5 then 'failed' else 'pending' end,last_code=p_code,
   next_attempt_at=greatest(next_attempt_at,now()+(power(2,attempts)::int*interval '1 minute')) where id=p_id and status='sending';
 else
  update private.client_whatsapp_messages set status='failed',last_code=p_code where id=p_id and status='sending';
 end if;
end;$$;

-- A cliente escolhe receber ou não (agendamento e Minha conta).
create function public.my_whatsapp_consent() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',coalesce((select enabled from private.client_whatsapp_consent where customer_id=auth.uid()),false));
$$;
create function public.set_whatsapp_consent(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_enabled is null then raise exception 'Invalid consent';end if;
 insert into private.client_whatsapp_consent(customer_id,enabled,notice_version) values(uid,p_enabled,'whatsapp-agendamento-v1')
  on conflict(customer_id) do update set enabled=excluded.enabled,notice_version=excluded.notice_version,updated_at=now();
 -- Desligou: o que estava agendado para ela deixa de sair.
 if not p_enabled then
  update private.client_whatsapp_messages m set status='cancelled',last_code='consent_withdrawn'
   from public.appointments a where a.id=m.appointment_id and a.customer_id=uid and m.status in ('pending','sending');
 end if;
 return jsonb_build_object('ok',true,'enabled',p_enabled);
end;$$;

revoke all on function private.client_whatsapp_schedule(timestamptz,timestamptz),private.enqueue_client_whatsapp(),private.prepare_client_whatsapp(timestamptz),
 private.finish_client_whatsapp(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.my_whatsapp_consent(),public.set_whatsapp_consent(boolean) from public,anon;
grant execute on function public.my_whatsapp_consent(),public.set_whatsapp_consent(boolean) to authenticated;
