export function authError(error){
 if(error?.message?.includes('Cadastro de testes disponível somente para endereços previamente autorizados.'))return 'Este e-mail ainda não está autorizado para o cadastro de testes.';
 switch(error?.code){
  case 'email_not_confirmed':return 'Confirme seu cadastro pelo link enviado ao seu e-mail antes de entrar.';
  case 'mfa_verification_failed':return 'Código do autenticador não conferiu. Use o código atual da conta Clínica Torriceli no aplicativo, com data e hora automáticas no celular.';
  case 'mfa_factor_name_conflict':return 'Já existe uma configuração iniciada. Atualize a página para retomar a validação do autenticador.';
  case 'mfa_factor_not_found':return 'Essa configuração não está mais disponível. Prepare o autenticador novamente.';
  case 'same_password':return 'Essa já é a senha atual. Use Entrar para acessar sua conta, ou escolha uma senha diferente.';
  case 'weak_password':return 'A senha não atende aos requisitos. Use pelo menos 12 caracteres e evite uma senha comum.';
  case 'reauthentication_needed':case 'reauthentication_not_valid':return 'Precisamos renovar a confirmação de segurança. Use Recuperar senha para receber um novo link.';
  case 'otp_expired':case 'refresh_token_not_found':case 'session_not_found':case 'bad_jwt':return 'Este acesso expirou. Use Recuperar senha para receber um novo link.';
  case 'over_request_rate_limit':case 'over_email_send_rate_limit':return 'O serviço limitou as tentativas. Aguarde antes de tentar novamente.';
  case 'invalid_credentials':return 'E-mail ou senha não conferem. Verifique os dados ou use Recuperar senha.';
  default:return error?.name==='AuthSessionMissingError'?'A confirmação do link expirou. Use Recuperar senha para continuar.':'Não foi possível concluir. Confira os dados e tente novamente.';
 }
}
