-- Retorno de status do WhatsApp (pedido do usuário em 26/11/2026): a 360dialog avisa quando
-- cada mensagem enviada pelo site foi entregue, lida ou falhou. Só se grava o status, o número
-- do erro e a hora, ligados à mensagem que o site mandou (pelo id do provedor). Mensagens que
-- as clientes mandam para a clínica chegam no mesmo endereço e são ignoradas: nada é gravado.
-- O endereço só aceita chamadas com o cabeçalho secreto combinado com a 360dialog; aqui fica
-- apenas o SHA-256 desse segredo, gravado fora do repositório.

create table private.whatsapp_webhook_settings(
 id boolean primary key default true check(id),
 secret_sha256 text check(secret_sha256 is null or secret_sha256 ~ '^[0-9a-f]{64}$'),
 last_event_at timestamptz,
 updated_at timestamptz not null default now()
);
insert into private.whatsapp_webhook_settings(id) values(true);
alter table private.whatsapp_webhook_settings enable row level security;
revoke all on private.whatsapp_webhook_settings from public,anon,authenticated;

alter table private.client_whatsapp_messages
 add column delivery_status text check(delivery_status in ('sent','delivered','read','failed')),
 add column delivery_code integer,
 add column delivery_at timestamptz;
alter table private.owner_whatsapp_messages
 add column delivery_status text check(delivery_status in ('sent','delivered','read','failed')),
 add column delivery_code integer,
 add column delivery_at timestamptz;
create index client_whatsapp_provider on private.client_whatsapp_messages(provider_id) where provider_id is not null;
create index owner_whatsapp_provider on private.owner_whatsapp_messages(provider_id) where provider_id is not null;

-- Ordem: enviado < entregue < lido; falha sempre vale. Status atrasado não desfaz um mais novo.
create function private.whatsapp_status_rank(p text) returns integer
language sql immutable set search_path='' as $$
 select case p when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end
$$;

-- Recebe a lista já filtrada pela função (id, status, at, code). Devolve quantas mensagens do
-- site foram atualizadas, -1 se o retorno não estiver configurado e -2 se o segredo não confere.
create function private.record_whatsapp_statuses(p_secret text,p_statuses jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare s private.whatsapp_webhook_settings;e jsonb;st text;pid text;at timestamptz;code integer;n integer:=0;k integer;
begin
 select * into s from private.whatsapp_webhook_settings where id;
 if s.secret_sha256 is null then return -1;end if;
 if p_secret is null or encode(sha256(convert_to(p_secret,'utf8')),'hex')<>s.secret_sha256 then return -2;end if;
 update private.whatsapp_webhook_settings set last_event_at=now() where id;
 if jsonb_typeof(p_statuses)<>'array' then return 0;end if;
 for e in select value from jsonb_array_elements(p_statuses) limit 100 loop
  st:=e->>'status';pid:=e->>'id';
  if st not in ('sent','delivered','read','failed') or pid is null or length(pid)>200 then continue;end if;
  at:=coalesce((e->>'at')::timestamptz,now());
  code:=case when (e->>'code') ~ '^[0-9]{1,7}$' then (e->>'code')::integer end;
  update private.client_whatsapp_messages set delivery_status=st,delivery_code=coalesce(code,delivery_code),delivery_at=at
   where provider_id=pid and private.whatsapp_status_rank(st)>private.whatsapp_status_rank(delivery_status);
  get diagnostics k=row_count;n:=n+k;
  update private.owner_whatsapp_messages set delivery_status=st,delivery_code=coalesce(code,delivery_code),delivery_at=at
   where provider_id=pid and private.whatsapp_status_rank(st)>private.whatsapp_status_rank(delivery_status);
  get diagnostics k=row_count;n:=n+k;
 end loop;
 return n;
end;$$;

-- Ao descartar uma mensagem (remarcação, cancelamento, consentimento retirado), o motivo de uma
-- recusa anterior do provedor fica guardado junto (ex.: http_429_130429;appointment_changed).
create or replace function private.enqueue_client_whatsapp() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='blocked' or new.customer_id is null then return new;end if;
 if tg_op='UPDATE' and (old.status is distinct from new.status or old.starts_at is distinct from new.starts_at) then
  -- Mudou o horário ou deixou de valer: o que ainda não saiu é descartado.
  update private.client_whatsapp_messages set status='cancelled',last_code=concat_ws(';',last_code,'appointment_changed')
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

create or replace function public.set_whatsapp_consent(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_enabled is null then raise exception 'Invalid consent';end if;
 insert into private.client_whatsapp_consent(customer_id,enabled,notice_version) values(uid,p_enabled,'whatsapp-agendamento-v1')
  on conflict(customer_id) do update set enabled=excluded.enabled,notice_version=excluded.notice_version,updated_at=now();
 -- Desligou: o que estava agendado para ela deixa de sair.
 if not p_enabled then
  update private.client_whatsapp_messages m set status='cancelled',last_code=concat_ws(';',m.last_code,'consent_withdrawn')
   from public.appointments a where a.id=m.appointment_id and a.customer_id=uid and m.status in ('pending','sending');
 end if;
 return jsonb_build_object('ok',true,'enabled',p_enabled);
end;$$;

revoke all on function private.whatsapp_status_rank(text),private.record_whatsapp_statuses(text,jsonb) from public,anon,authenticated;
