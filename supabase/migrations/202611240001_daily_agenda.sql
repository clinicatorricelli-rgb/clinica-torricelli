-- Agenda do dia por e-mail para a clínica (pedido do usuário em 24/11/2026): de segunda a
-- sábado, a partir das 6h30 (horário de São Paulo), um e-mail com os atendimentos do dia para
-- conferir e falar com as clientes. Usa o mesmo cron de 1 minuto da função availability-email:
-- nenhum agendamento novo de tarefa. Se o envio falhar, tenta de novo até o meio-dia.

create table private.daily_agenda_runs(
 day date primary key,
 status text not null default 'sending' check(status in ('sending','sent','failed')),
 attempts integer not null default 1 check(attempts between 1 and 10),
 next_attempt_at timestamptz not null default now()+interval '3 minutes',
 provider_id text,
 last_code text,
 sent_at timestamptz
);
alter table private.daily_agenda_runs enable row level security;
revoke all on private.daily_agenda_runs from public,anon,authenticated;

-- Retorna o e-mail do dia quando é hora de enviar; senão, null. Destinatários: e-mails
-- confirmados das contas administrativas. Domingo não há envio (clínica fechada).
create function private.prepare_daily_agenda(p_now timestamptz default now()) returns jsonb
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
   'customer_name',p.display_name,'customer_phone',p.phone_e164) order by a.starts_at),'[]'::jsonb) into items
  from public.appointments a join public.services s on s.id=a.service_id join public.profiles p on p.id=a.customer_id
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

create function private.finish_daily_agenda(p_day date,p_outcome text,p_provider_id text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' then
  update private.daily_agenda_runs set status='sent',provider_id=p_provider_id,last_code=null,sent_at=now() where day=p_day and status='sending';
 elsif p_outcome='retry' then
  update private.daily_agenda_runs set last_code=p_code,next_attempt_at=greatest(next_attempt_at,now()+interval '3 minutes') where day=p_day and status='sending';
 else
  update private.daily_agenda_runs set status='failed',last_code=p_code where day=p_day and status='sending';
 end if;
end;$$;

revoke all on function private.prepare_daily_agenda(timestamptz),private.finish_daily_agenda(date,text,text,text) from public,anon,authenticated;
