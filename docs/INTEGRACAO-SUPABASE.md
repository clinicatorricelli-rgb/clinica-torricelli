# Integração real — preparação, ainda sem conexão

**SUPERADO:** a integração hospedada e o acesso administrativo foram concluídos/testados posteriormente. Estado real atual e pendências em `INTEGRACAO-VALIDADA.md`. Este arquivo registra a preparação anterior, não o status final.

**Atualização:** usuário confirmou conta criada e dashboard aberto. CLI login oficial iniciado com `--agent no --output-format text` para permitir o fluxo humano interativo; navegador aberto no domínio oficial Supabase e processo aguardando código de verificação no próprio terminal. Solicitada abertura do painel de terminal deste chat. Não enviar código/token/senha pelo chat. Nenhum projeto ainda criado/selecionado, nenhuma migração aplicada remotamente ou convite enviado. As referências à criação da conta abaixo descrevem a preparação anterior.

Estado em 04/11/2026: usuário ainda criando conta Supabase pela plataforma oficial. O destinatário administrativo foi confirmado na conversa principal e não é gravado em código, bundle ou neste documento. Nenhum projeto hospedado selecionado/criado, recurso pago contratado, convite enviado ou autenticação real habilitada na prévia. Autorização Cloudflare não autentica Supabase.

## Ferramentas e próximo ponto de autorização

Supabase CLI oficial 3.0.0 instalada e fixada como devDependency; versão e help de login executados com sucesso. Com pnpm: `pnpm exec supabase login`. Nesta máquina também funciona `node node_modules/supabase/dist/supabase.js login`. Executar quando a conta estiver criada; usuário conclui o fluxo oficial no navegador. Não pedir senha/token no chat, nem extrair credenciais do navegador. Não usar `--debug` ou imprimir configuração autenticada. Não executar `projects api-keys` diretamente em saída visível.

Projeto de homologação deve ser separado e identificado, com plano gratuito se disponível na organização, região São Paulo (sa-east-1 quando oferecida), só dados fictícios. Se criação exigir upgrade/cobrança, parar antes de contratar. A decisão planejada Supabase Pro para produção não é autorização para cobrar automaticamente. Não selecionar projeto desconhecido. Depois de criado, confirmar o ref do projeto correto e só então fazer link/migrações; verificar dry-run antes de aplicar. Nenhum reset em banco remoto.

Esta máquina não tem Docker instalado/disponível. CLI v3 tem runtime nativo experimental apenas para Linux/macOS compatíveis segundo documentação vigente, não para este Windows. Não foi instalado Docker nem alterado o sistema. O teste Postgres embarcado não é a stack Supabase inteira.

## Sequência de habilitação

1. Autenticar a conta e confirmar organização/projeto isolado de testes. Conferir custo gratuito/região antes da criação. Linkar só esse projeto e aplicar as três migrações versionadas com histórico, sem recriar banco/alterar outro projeto. Rever grants/RLS e buckets no serviço real.
2. Configurar URLs HTTPS exatas da homologação, confirmação de e-mail, mínimo de 12 caracteres, TOTP e proteção de Auth. Configurar SMTP de testes/contatos autorizados; o serviço padrão de e-mail pode restringir destinatários e não deve ser assumido suficiente para convidar a Eduarda. Nada é enviado durante os testes automáticos de fixtures.
3. Template de convite deve apontar para `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=invite`. Recovery pode usar `{{ .SiteURL }}/?token_hash={{ .TokenHash }}&type=recovery`, ou PKCE atual configurado. A aplicação verifica OTP no Supabase e só depois mostra definição de senha; para PKCE troca code e trata PASSWORD_RECOVERY. URLs da sessão removidas do endereço sem logar token. Configurar templates corretos e testar expiração/reutilização antes de envio à Eduarda.
4. Rodar `tests/integration.mjs` no projeto isolado, além dos testes SQL de admin com AAL1/AAL2. Para remoto, exige explicitamente `TEST_ALLOW_REMOTE_FIXTURES=true`, `TEST_ISOLATED_PROJECT_REF` igual ao ref de 20 letras do projeto autorizado, URL exatamente correspondente e credenciais em ambiente privado do processo. Nunca colocar service-role em VITE, Git, chat ou URL. O guard recusa qualquer outro destino. Script cria/remove apenas suas próprias contas fictícias e arquivos com UUIDs; não envia e-mails de confirmação ou convite às fixtures.
5. Teste automatizado real previsto: Auth login/refresh/logout, duas clientes por REST direto, RLS/grants, preço/status forjado negado, sobreposição rejeitada, consentimento próprio, upload proibido, download/signed URL de arquivo alheio negados, próprio download permitido; TOTP real enroll/challenge/verify com segredo só na memória e AAL2 sem papel ainda negado. Administrador AAL1/AAL2 deve também ser verificado via teste SQL/REST após associação confiável de fixture no projeto isolado. Nenhum desses testes integrados foi aprovado ainda.
6. Validar manualmente com caixa de e-mail de testes controlada: signup/confirmação, recovery, senha nova, convite, sessão/expiração/reuso, links no mesmo navegador quando PKCE, erros neutros, proteção de abuso e TOTP real. Testar integração em versão/branch de homologação antes de substituir a prévia pública. Nunca liberar reservas junto apenas porque Auth funciona.
7. Somente após os testes, convidar para o e-mail administrativo confirmado usando `auth.admin.inviteUserByEmail` em operador/servidor confiável. Destinatário precisa estar confirmado e o envio deve ser rastreado para evitar repetição automática. Não é mensagem enviada nesta preparação. Eduarda aceita, define a própria senha e confirma o endereço; o operador confere UUID/e-mail verificado e executa `scripts/grant-admin.sql` no projeto correto. Nenhuma senha dela é criada/lida pela clínica.
8. Script de grant recebe parâmetro `admin_email` privado, exige exatamente uma conta com e-mail confirmado, grava associação na tabela privada e evento de auditoria. Não há endpoint público de promoção nem promoção por metadata. Depois disso, Eduarda cadastra TOTP: RLS administrativa continua negando AAL1 até verificar AAL2. Fazer teste direto na API, não apenas do menu.
9. Somente habilitar frontend real quando a cadeia inteira estiver validada. Build demo atual segue desconectado, inclusive com variáveis no ambiente. Build normal é separado, com apenas URL e publishable key da homologação; segredo fica no servidor/operador. Agenda, confirmação de pagamento e notificações continuam desabilitadas até suas entregas seguras.

## Verificações realizadas nesta preparação

- CLI instalada/versão/help confirmados, sem iniciar autenticação/selecionar conta desconhecida.
- 10 testes locais passaram, incluindo migrações/RLS em PGlite, callbacks invite/recovery sem escalada e vetor RFC6238 do helper de teste TOTP.
- Build demo passou e permanece igual ao publicado em termos de funcionalidades desconectadas. Callback novo fica disponível para teste conectado local/homologação; não habilita backend público.
- Teste de integração rodado sem variáveis resultou em 1 SKIP, não aprovação. Sem e-mail, Auth remoto, PostgREST, Storage real, login administrativo ou convite validado ainda.

## Gateway futuro

Recomendação preliminar recebida da conversa principal: Mercado Pago Checkout Pro para testes de Pix/cartão em checkout hospedado. Não é contratação nem decisão irreversível. Tarifas, disponibilidade para o CPF da Eduarda e elegibilidade devem ser conferidas na conta e nas fontes oficiais antes de contratar. Nenhuma conta de pagamento, cobrança ou integração criada nesta etapa. Preservar sinal 30%, centavos inteiros, validação confiável de webhook e reconciliação; checkout do navegador nunca confirma reserva.

## Fontes oficiais consultadas

- https://supabase.com/docs/guides/local-development/cli/getting-started
- https://supabase.com/docs/reference/cli/supabase-login
- https://supabase.com/docs/guides/deployment/managing-environments
- https://supabase.com/docs/guides/auth/auth-mfa/totp
- https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- https://supabase.com/docs/guides/auth/auth-email-templates
- Recomendação de gateway fornecida pela coordenação com pesquisa oficial: https://www.mercadopago.com.br/ferramentas-para-vender/check-out e https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/test-accounts . Não foram implementadas chamadas ao provedor.
