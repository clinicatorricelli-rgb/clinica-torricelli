-- Contas no painel da Eduarda (pedido do usuário em 22/11/2026): busca por nome ou e-mail e
-- exclusão de cadastros feitos por engano.
-- Decisão do usuário (22/11): a clínica pode excluir QUALQUER cadastro de cliente, inclusive com
-- histórico; nesse caso somem junto agendamentos, taxas, anotações e a ficha. A tela pede uma
-- confirmação mais forte quando há histórico. Contas administrativas e a própria conta continuam
-- fora do alcance desta função, para a Eduarda não se trancar fora do painel por engano.
-- Exige sessão administrativa com segundo fator (private.is_admin).

create function public.admin_list_accounts(p_search text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare term text:=nullif(btrim(coalesce(p_search,'')),'');total integer;items jsonb;
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if term is not null and length(term)>100 then raise exception 'Invalid search';end if;
 select count(*)::integer into total from public.profiles;
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into items from (
  select p.created_at,jsonb_build_object(
   'id',p.id,'name',p.display_name,'email',u.email,'created_at',p.created_at,
   'email_confirmed',u.email_confirmed_at is not null,
   'is_admin',exists(select 1 from private.admin_members m where m.user_id=p.id),
   'has_history',exists(select 1 from public.appointments a where a.customer_id=p.id)
     or exists(select 1 from public.appointment_fees f where f.customer_id=p.id)) as item
  from public.profiles p join auth.users u on u.id=p.id
  where term is null or p.display_name ilike '%'||term||'%' or u.email ilike '%'||term||'%'
  order by p.created_at desc limit 50) x;
 return jsonb_build_object('total',total,'items',items);
end;$$;

create function public.admin_delete_account(p_id uuid,p_confirm text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if not private.is_admin() then raise exception 'Admin MFA required' using errcode='42501';end if;
 if p_confirm is distinct from 'EXCLUIR' then return jsonb_build_object('ok',false,'reason','confirmation_required');end if;
 if p_id is null or p_id=uid then return jsonb_build_object('ok',false,'reason','not_allowed');end if;
 if exists(select 1 from private.admin_members where user_id=p_id) then return jsonb_build_object('ok',false,'reason','admin_account');end if;
 perform 1 from public.profiles where id=p_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','not_found');end if;
 -- Histórico da cliente: primeiro o que aponta para os agendamentos, depois os agendamentos.
 -- (Os e-mails de agendamento na fila somem em cascata; nenhum aviso é enviado por uma exclusão.)
 delete from private.booking_notes where appointment_id in (select id from public.appointments where customer_id=p_id);
 delete from public.appointment_fees where customer_id=p_id or appointment_id in (select id from public.appointments where customer_id=p_id);
 delete from public.payments where appointment_id in (select id from public.appointments where customer_id=p_id);
 delete from public.reschedule_requests where appointment_id in (select id from public.appointments where customer_id=p_id);
 delete from public.financial_decisions where appointment_id in (select id from public.appointments where customer_id=p_id);
 delete from public.appointments where customer_id=p_id;
 -- O registro guarda só quem excluiu, o quê e quando; nenhum nome ou e-mail.
 insert into public.audit_log(actor_id,action,entity_id) values(uid,'account.deleted',p_id);
 -- Apagar o usuário apaga em cascata o cadastro, a ficha, as preferências e os avisos dele.
 delete from auth.users where id=p_id;
 return jsonb_build_object('ok',true);
end;$$;

revoke all on function public.admin_list_accounts(text),public.admin_delete_account(uuid,text) from public,anon;
grant execute on function public.admin_list_accounts(text),public.admin_delete_account(uuid,text) to authenticated;
