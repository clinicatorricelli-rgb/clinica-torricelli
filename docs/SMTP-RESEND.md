# SMTP Resend — 05/11/2026

**DNS no Cloudflare — 13/11/2026:** o domínio passou a usar os servidores do Cloudflare. Os três registros do Resend foram recriados lá, todos sem proxy (nuvem cinza): CNAME `send`→`send.forge.rmta.net`, CNAME `rsend`→`rsend-sae1.forge.rmta.net` e TXT `resend._domainkey`. O `send` foi gravado primeiro com dois destinos colados e corrigido logo depois da ativação. Se o Resend acusar falha de verificação, conferir esses três registros antes de mexer em qualquer outra coisa. Ligar o proxy (nuvem laranja) em qualquer um deles quebra o envio.

**Teste de cliente concluído:** usuário cadastrou a segunda conta pelo site, confirmou o e-mail, salvou dados e preferências. Em seguida configurou a chave da API de avisos, publicou uma manhã de segunda e confirmou recebimento do aviso. SMTP/Auth e API de avisos validados separadamente; ver `CADASTRO-TESTES.md` e `AVISOS-EMAIL.md`. Restam os webhooks de entrega/bounce e a próxima integração oficial WhatsApp.

**Atualização:** usuário confirmou recebimento na caixa de entrada por captura do Gmail, remetente Clínica Torricelli `<acesso@clinicatorricelli.com.br>`. Entrega SMTP real confirmada para o destinatário administrativo autorizado. Mensagens de confirmação, convite e recuperação foram então localizadas para português e aplicadas no Auth com custom SMTP, sem alterar a credencial. Teste integrado de links Auth voltou a passar; nenhum segundo e-mail de teste foi enviado nesta localização.

Usuário registrou `clinicatorricelli.com.br`, publicou TXT DKIM e dois CNAME solicitados pelo Resend no Registro.br e apresentou painel do Resend com status Verified. Nenhuma chave de API foi pedida ou recebida pelo chat. A configuração SMTP foi salva pelo próprio usuário no projeto Supabase de testes.

## Conferido no serviço

Leitura oficial por Supabase CLI `config diff` em diretório de inspeção ignorado pelo Git, sem puxar/gravar senha SMTP. Valores remotos confirmados:

- SMTP ativado; host `smtp.resend.com`, porta465, usuário `resend`.
- Remetente `acesso@clinicatorricelli.com.br`, nome Clínica Torricelli.
- Projeto dedicado `clinica-torriceli-testes` em São Paulo. Nenhuma configuração aplicada em projeto inicial de outra região.
- Nenhuma chave SMTP ou service-role em fonte, bundle ou documentação.

## Teste de envio solicitado

Solicitada uma recuperação de senha via Supabase Auth para o destinatário administrativo previamente autorizado. API aceitou a solicitação sem erro SMTP. Registro de controle em `artifacts/smtp-recovery-check-status.json` evita repetição imediata; não contém endereço, token ou senha. Não foram enviadas mensagens a clientes ou endereços de teste inventados.

Aceitação da solicitação, isoladamente, não comprova recebimento. Neste caso, o usuário posteriormente apresentou o e-mail na caixa de entrada, confirmando a entrega. Não foi necessário alterar a senha para esse teste. A solicitação não mudou a senha existente nem retirou MFA.

## Próximas verificações

Segundo endereço de teste fornecido pelo usuário e autorizado privadamente. Cadastro de cliente preparado com restrição no servidor por hook Before User Created; ver `CADASTRO-TESTES.md`. Aguardar o usuário cadastrar e confirmar o endereço pelo site. Não marcar e-mail real como verificado para contornar confirmação. Abertura geral depende de concluir esse ciclo e revisar proteções de abuso. Preferências de avisos de novas vagas continuam separadas de e-mails transacionais; nenhum envio de campanha ou WhatsApp habilitado por esta configuração.

Templates em português de `supabase/templates/` foram aplicados após confirmação do SMTP. Usam `{{ .ConfirmationURL }}` para preservar os fluxos oficiais PKCE/implicit já suportados, em vez de introduzir token_hash no endereço do site estático. Marca escrita Torricelli, com dois L. Comparação prévia permitiu apenas mudanças de templates; resultado do push confirmou Auth atualizado e zero atualizações de segredos. O teste integrado de signup/confirm/recovery/invite passou novamente com fixtures removidas, sem enviar mensagens a endereços fictícios. Mensagens já recebidas permanecem no idioma anterior; as futuras usam os novos templates.

Não sobrescrever configurações SMTP e senha do usuário ao fazer config push; o arquivo hosted-config declara apenas propriedades conhecidas e deve ser revisado por diff antes de qualquer alteração.

Fontes oficiais verificadas em 05/11/2026: https://resend.com/docs/send-with-supabase-smtp e https://supabase.com/docs/guides/auth/auth-smtp . Nenhum upgrade de plano ou pagamento adicional executado.
