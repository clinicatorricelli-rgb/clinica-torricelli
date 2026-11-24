-- Alertas de gestão no WhatsApp particular da Eduarda (pedido do usuário em 25/11/2026).
-- Quem envia é o número da clínica (360dialog, modelos aprovados pela Meta). Vão para ela:
-- a agenda do dia (6h30, seg–sáb), cada agendamento novo e cada remarcação ou cancelamento
-- feito pela cliente. O número particular é digitado por ela no painel e fica só aqui;
-- nunca vai para o código, para o site público nem para as clientes.
-- Nada de ficha ou dado de saúde entra nas mensagens.

create table private.owner_whatsapp_settings(
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 phone_e164 text check(phone_e164 is null or phone_e164 ~ '^\+55[1-9][1-9][0-9]{8,9}$'),
 provider_ready boolean not null default false,
 last_worker_at timestamptz,
 updated_at timestamptz not null default now(),
 check(not enabled or phone_e164 is not null)
);
insert into private.owner_whatsapp_settings(id) values(true);
alter table private.owner_whatsapp_settings enable row level security;
revoke all on private.owner_whatsapp_settings from public,anon,authenticated;

create table private.owner_whatsapp_messages(
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('daily_agenda','booked','rescheduled','cancelled','test')),
 day date,
 appointment_id uuid references public.appointments(id) on delete cascade,
 facts jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 6),
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 last_code text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create unique index owner_whatsapp_one_daily on private.owner_whatsapp_messages(day) where kind='daily_agenda';
create index owner_whatsapp_due on private.owner_whatsapp_messages(next_attempt_at) where status in ('pending','sending');
alter table private.owner_whatsapp_messages enable row level security;
revoke all on private.owner_whatsapp_messages from public,anon,authenticated;

-- Agenda de um dia (sem dados de saúde): horário, serviço e nome da cliente.
create function private.owner_day_items(p_day date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('starts_at',a.starts_at,'service_name',s.name,'customer_name',p.display_name) order by a.starts_at),'[]'::jsonb)
 from public.appointments a join public.services s on s.id=a.service_id join public.profiles p on p.id=a.customer_id
 where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=p_day;
$$;

-- Agendamento novo, remarcação ou cancelamento pela cliente: um alerta, se os alertas estiverem ligados.
create function private.enqueue_owner_whatsapp() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev text;old_start timestamptz;
begin
 if new.status='blocked' or new.customer_id is null then return new;end if;
 if not exists(select 1 from private.owner_whatsapp_settings where enabled) then return new;end if;
 if tg_op='INSERT' then
  if new.status<>'confirmed' then return new;end if;ev:='booked';
 elsif old.status='confirmed' and new.status='cancelled' then
  if new.cancel_kind='clinic' then return new;end if;ev:='cancelled';
 elsif new.status='confirmed' and old.status='confirmed' and new.starts_at is distinct from old.starts_at then
  ev:='rescheduled';old_start:=old.starts_at;
 else return new;end if;
 insert into private.owner_whatsapp_messages(kind,appointment_id,facts) values(ev,new.id,private.booking_email_facts(new,old_start));
 return new;
end;$$;
create trigger owner_whatsapp_after_insert after insert on public.appointments for each row execute function private.enqueue_owner_whatsapp();
create trigger owner_whatsapp_after_update after update of status,starts_at on public.appointments for each row execute function private.enqueue_owner_whatsapp();

-- Chamada a cada minuto: cria a agenda do dia uma vez, de segunda a sábado, entre 6h30 e meio-dia.
create function private.enqueue_owner_daily_whatsapp(p_now timestamptz default now()) returns boolean
language plpgsql security definer set search_path='' as $$
declare local timestamp:=p_now at time zone 'America/Sao_Paulo';d date:=local::date;
begin
 if not exists(select 1 from private.owner_whatsapp_settings where enabled) then return false;end if;
 if extract(isodow from d)=7 or local::time<'06:30' or local::time>='12:00' then return false;end if;
 insert into private.owner_whatsapp_messages(kind,day,facts)
  values('daily_agenda',d,jsonb_build_object('day',d,'items',private.owner_day_items(d),
   'tomorrow_count',(select count(*) from public.appointments a where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=d+1)))
  on conflict (day) where kind='daily_agenda' do nothing;
 return found;
end;$$;

-- Pega o próximo alerta devido, já com o número atual da Eduarda. Alertas com mais de 12 h ficam de fora.
create function private.prepare_owner_whatsapp(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.owner_whatsapp_messages;cfg private.owner_whatsapp_settings;
begin
 update private.owner_whatsapp_messages set status='skipped',last_code='stale'
  where status in ('pending','sending') and created_at<p_now-interval '12 hours';
 select * into m from private.owner_whatsapp_messages where status in ('pending','sending') and next_attempt_at<=p_now
  order by created_at,id limit 1 for update skip locked;
 if not found then return null;end if;
 select * into cfg from private.owner_whatsapp_settings where id;
 if not cfg.enabled or cfg.phone_e164 is null then
  update private.owner_whatsapp_messages set status='skipped',last_code='disabled' where id=m.id;
  return jsonb_build_object('id',m.id,'skip',true);
 end if;
 if m.attempts>=5 then
  update private.owner_whatsapp_messages set status='failed',last_code=coalesce(last_code,'too_many_attempts') where id=m.id;
  return jsonb_build_object('id',m.id,'skip',true);
 end if;
 update private.owner_whatsapp_messages set status='sending',attempts=attempts+1,next_attempt_at=p_now+interval '2 minutes' where id=m.id;
 return jsonb_build_object('id',m.id,'kind',m.kind,'to',cfg.phone_e164,'facts',m.facts,'attempt',m.attempts+1);
end;$$;

create function private.finish_owner_whatsapp(p_id uuid,p_outcome text,p_provider_id text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' then
  update private.owner_whatsapp_messages set status='sent',provider_id=p_provider_id,last_code=null,sent_at=now() where id=p_id and status='sending';
 elsif p_outcome='retry' then
  update private.owner_whatsapp_messages set status=case when attempts>=5 then 'failed' else 'pending' end,last_code=p_code,
   next_attempt_at=greatest(next_attempt_at,now()+(power(2,attempts)::int*interval '1 minute')) where id=p_id and status='sending';
 else
  update private.owner_whatsapp_messages set status='failed',last_code=p_code where id=p_id and status='sending';
 end if;
end;$$;

create function private.mark_owner_whatsapp_provider(p_ready boolean) returns void
language sql security definer set search_path='' as $$
 update private.owner_whatsapp_settings set provider_ready=p_ready,last_worker_at=now() where id;
$$;

-- Painel da Eduarda (papel + segundo fator).
create function public.admin_owner_whatsapp() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cfg private.owner_whatsapp_settings;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 select * into cfg from private.owner_whatsapp_settings where id;
 return jsonb_build_object('enabled',cfg.enabled,'phone',cfg.phone_e164,
  'provider_ready',cfg.provider_ready and coalesce(cfg.last_worker_at>now()-interval '5 minutes',false),
  'recent',(select coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'status',x.status,'code',x.last_code,'at',x.created_at) order by x.created_at desc),'[]'::jsonb)
   from (select * from private.owner_whatsapp_messages order by created_at desc limit 5) x));
end;$$;

create function public.admin_set_owner_whatsapp(p_enabled boolean,p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare phone text:=nullif(btrim(coalesce(p_phone,'')),'');
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if phone is not null and phone !~ '^\+55[1-9][1-9][0-9]{8,9}$' then return jsonb_build_object('ok',false,'reason','invalid_phone');end if;
 if p_enabled and phone is null then return jsonb_build_object('ok',false,'reason','phone_required');end if;
 -- O número que envia não consegue mandar mensagem para ele mesmo.
 if phone='+5519990347698' then return jsonb_build_object('ok',false,'reason','same_as_clinic');end if;
 update private.owner_whatsapp_settings set enabled=coalesce(p_enabled,false),phone_e164=phone,updated_at=now() where id;
 insert into public.audit_log(actor_id,action,entity_id) values(auth.uid(),case when p_enabled then 'owner_whatsapp.enabled' else 'owner_whatsapp.disabled' end,null);
 return jsonb_build_object('ok',true);
end;$$;

-- Teste: manda agora a agenda de hoje, fora do horário das 6h30.
create function public.admin_test_owner_whatsapp() returns jsonb
language plpgsql security definer set search_path='' as $$
declare d date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if not exists(select 1 from private.owner_whatsapp_settings where enabled) then return jsonb_build_object('ok',false,'reason','disabled');end if;
 if exists(select 1 from private.owner_whatsapp_messages where kind='test' and created_at>now()-interval '2 minutes') then return jsonb_build_object('ok',false,'reason','too_soon');end if;
 insert into private.owner_whatsapp_messages(kind,day,facts) values('test',d,jsonb_build_object('day',d,'items',private.owner_day_items(d),
  'tomorrow_count',(select count(*) from public.appointments a where a.status='confirmed' and (a.starts_at at time zone 'America/Sao_Paulo')::date=d+1)));
 return jsonb_build_object('ok',true);
end;$$;

revoke all on function private.owner_day_items(date),private.enqueue_owner_whatsapp(),private.enqueue_owner_daily_whatsapp(timestamptz),
 private.prepare_owner_whatsapp(timestamptz),private.finish_owner_whatsapp(uuid,text,text,text),private.mark_owner_whatsapp_provider(boolean) from public,anon,authenticated;
revoke all on function public.admin_owner_whatsapp(),public.admin_set_owner_whatsapp(boolean,text),public.admin_test_owner_whatsapp() from public,anon;
grant execute on function public.admin_owner_whatsapp(),public.admin_set_owner_whatsapp(boolean,text),public.admin_test_owner_whatsapp() to authenticated;
