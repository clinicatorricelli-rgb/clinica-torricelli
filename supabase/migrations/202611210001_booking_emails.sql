-- E-mails de agendamento (pedido do usuário em 21/11/2026): a cliente e a Eduarda recebem
-- um e-mail quando um horário é marcado, remarcado ou cancelado.
-- O banco registra o evento com um retrato dos dados naquele momento; a função
-- availability-email (chamada pelo cron a cada minuto) monta e envia pelo Resend.
-- Nenhuma tela escolhe destinatário ou texto: a cliente recebe no e-mail confirmado da
-- conta dela, e a clínica no e-mail de login das contas administrativas.

create table private.booking_emails(
 id uuid primary key default gen_random_uuid(),
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 event text not null check(event in ('booked','rescheduled','cancelled')),
 audience text not null check(audience in ('client','clinic')),
 facts jsonb not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
 attempts integer not null default 0 check(attempts between 0 and 6),
 next_attempt_at timestamptz not null default now(),
 provider_id text,
 last_code text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
create index booking_emails_due on private.booking_emails(next_attempt_at) where status in ('pending','sending');
alter table private.booking_emails enable row level security;
revoke all on private.booking_emails from public,anon,authenticated;

-- Retrato do agendamento: o e-mail mostra o que valia no momento do evento,
-- mesmo que o cadastro ou o catálogo mudem depois.
create function private.booking_email_facts(a public.appointments,p_old_starts_at timestamptz default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'customer_name',p.display_name,'customer_phone',p.phone_e164,
  'service_name',s.name,'service_variant',s.variant,'price_cents',a.price_cents,'fee_cents',a.fee_cents,
  'starts_at',a.starts_at,'ends_at',a.ends_at,'old_starts_at',p_old_starts_at,'cancel_kind',a.cancel_kind)
 from public.profiles p, public.services s where p.id=a.customer_id and s.id=a.service_id;
$$;

create function private.enqueue_booking_emails() returns trigger
language plpgsql security definer set search_path='' as $$
declare ev text;old_start timestamptz;
begin
 if new.status='blocked' or new.customer_id is null then return new;end if;
 if tg_op='INSERT' then
  if new.status<>'confirmed' then return new;end if;
  ev:='booked';
 elsif old.status='confirmed' and new.status='cancelled' then
  ev:='cancelled';
 elsif new.status='confirmed' and old.status='confirmed' and new.starts_at is distinct from old.starts_at then
  ev:='rescheduled';old_start:=old.starts_at;
 else
  return new;
 end if;
 insert into private.booking_emails(appointment_id,event,audience,facts)
  values(new.id,ev,'client',private.booking_email_facts(new,old_start));
 -- Quando a própria clínica cancela, a Eduarda já sabe: só a cliente é avisada.
 if not (ev='cancelled' and new.cancel_kind='clinic') then
  insert into private.booking_emails(appointment_id,event,audience,facts)
   values(new.id,ev,'clinic',private.booking_email_facts(new,old_start));
 end if;
 return new;
end;$$;

create trigger booking_emails_after_insert after insert on public.appointments
 for each row execute function private.enqueue_booking_emails();
create trigger booking_emails_after_update after update of status,starts_at on public.appointments
 for each row execute function private.enqueue_booking_emails();

-- Pega o próximo e-mail pendente, já com os destinatários. Eventos com mais de 24 h sem
-- envio são descartados ("skipped"): avisar um agendamento antigo confunde mais do que ajuda.
create function private.prepare_booking_email() returns jsonb
language plpgsql security definer set search_path='' as $$
declare e private.booking_emails;recipients text[];c uuid;
begin
 update private.booking_emails set status='skipped',last_code='stale'
  where status in ('pending','sending') and created_at<now()-interval '24 hours';
 select * into e from private.booking_emails
  where status in ('pending','sending') and next_attempt_at<=now()
  order by created_at,audience,id limit 1 for update skip locked; -- a cliente primeiro
 if not found then return null;end if;
 -- Um envio interrompido no meio volta como "sending"; depois de 5 tentativas, desiste.
 if e.attempts>=5 then
  update private.booking_emails set status='failed',last_code=coalesce(last_code,'too_many_attempts') where id=e.id;
  return jsonb_build_object('id',e.id,'skip',true);
 end if;
 if e.audience='client' then
  select a.customer_id into c from public.appointments a where a.id=e.appointment_id;
  select array_agg(u.email) into recipients from auth.users u where u.id=c and u.email is not null and u.email_confirmed_at is not null;
 else
  select array_agg(distinct u.email order by u.email) into recipients from private.admin_members m join auth.users u on u.id=m.user_id
   where u.email is not null and u.email_confirmed_at is not null;
 end if;
 if recipients is null or cardinality(recipients)=0 then
  update private.booking_emails set status='failed',last_code='no_recipient' where id=e.id;
  return jsonb_build_object('id',e.id,'skip',true);
 end if;
 update private.booking_emails set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' where id=e.id;
 return jsonb_build_object('id',e.id,'event',e.event,'audience',e.audience,'facts',e.facts,'to',to_jsonb(recipients),'attempt',e.attempts+1);
end;$$;

-- accepted: enviado. retry: tenta de novo com espera crescente, no máximo 5 vezes. failed: desiste.
create function private.finish_booking_email(p_id uuid,p_outcome text,p_provider_id text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' then
  update private.booking_emails set status='sent',provider_id=p_provider_id,last_code=null,sent_at=now() where id=p_id and status='sending';
 elsif p_outcome='retry' then
  update private.booking_emails set status=case when attempts>=5 then 'failed' else 'pending' end,last_code=p_code,
   next_attempt_at=now()+(power(2,attempts)::int*interval '1 minute') where id=p_id and status='sending';
 else
  update private.booking_emails set status='failed',last_code=p_code where id=p_id and status='sending';
 end if;
end;$$;

revoke all on function private.booking_email_facts(public.appointments,timestamptz),private.enqueue_booking_emails(),
 private.prepare_booking_email(),private.finish_booking_email(uuid,text,text,text) from public,anon,authenticated;
