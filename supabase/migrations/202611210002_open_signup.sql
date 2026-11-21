-- Abertura do cadastro (pedido do usuário em 21/11/2026, depois de ligar o captcha no Supabase).
-- O gancho "antes de criar usuário" do Auth continua apontando para esta mesma função, então a
-- configuração do Auth não muda. Ela deixa de exigir a lista de e-mails autorizados e passa a
-- exigir o registro do aceite dos Termos de uso e do Aviso de privacidade (legal_version, enviado
-- pelo site no cadastro). Nada aqui concede papel: administração continua só por private.admin_members.
-- A tabela private.signup_test_access fica guardada, sem uso, para histórico.
create or replace function public.before_user_created_test_gate(event jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
begin
 if coalesce((event->'user'->>'is_anonymous')::boolean,false) or nullif(btrim(event->'user'->>'email'),'') is null then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Cadastro disponível somente com e-mail.'));
 end if;
 if coalesce(event->'user'->'user_metadata'->>'legal_version','') !~ '^legal-[0-9]{4}-[0-9]{2}-v[0-9]+$' then
  return jsonb_build_object('error',jsonb_build_object('http_code',400,'message','Aceite os Termos de uso e o Aviso de privacidade para criar a conta.'));
 end if;
 return '{}'::jsonb;
end;$$;
revoke all on function public.before_user_created_test_gate(jsonb) from public,anon,authenticated;
grant execute on function public.before_user_created_test_gate(jsonb) to supabase_auth_admin;
