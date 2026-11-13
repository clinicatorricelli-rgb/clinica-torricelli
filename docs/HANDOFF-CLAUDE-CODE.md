# Handoff técnico — Clínica Torricelli

Preparado em **09/11/2026**, fuso `America/Sao_Paulo`, para continuar o trabalho no Claude Code a partir do mesmo diretório. Última entrega de aplicação publicada e validada: **06/11/2026**. Este documento foi confrontado com os arquivos locais atuais; não representa uma nova consulta ao estado remoto em 09/11.

**Atualização 11/11/2026:** o usuário e a Eduarda extinguiram o sinal de 30% e qualquer pagamento no agendamento. Vale a regra de falta e cancelamento com taxa de 30% cobrada depois, registrada no topo de `docs/DECISOES.md`. Os trechos deste handoff sobre sinal, gateway, retenção (`held`/`hold_minutes`), webhook financeiro e remarcação com 12 h (seções 1 e 8 e item 6 da seção 16) são históricos e não devem ser implementados como estão. O site deixou de exibir "sinal previsto". Em 13/11 as reservas sem pagamento foram implementadas no código (`docs/RESERVAS.md`), com migração ainda não aplicada no hospedado.

## 1. Missão e contexto do produto

Continuar um sistema de atendimento/agendamento da **Clínica Torricelli**, de Eduarda, que é a única profissional na modelagem atual. O usuário é o desenvolvedor responsável pelo projeto. A marca pública usa **Torricelli com dois L**; nomes técnicos legados com um L em projeto, URL e alguns identificadores são intencionais e não devem ser renomeados em massa.

O site deve reunir catálogo, conta da cliente, ficha inicial/revisável, disponibilidade e, futuramente, reserva com sinal de 30%, pagamento, remarcação e comunicação por e-mail/WhatsApp. O WhatsApp comercial também deverá servir para conversas humanas com Eduarda, separado do pessoal. Não se trata apenas de um disparador de vagas.

Requisitos recentes e já registrados:

- Clientes novas preenchem ficha; clientes existentes reaproveitam dados e revisam o que mudou.
- Ficha de referência recebida é de **extensão de cílios**; não presumir que seus seis campos clínicos sirvam como triagem completa de todos os outros procedimentos.
- Nome/contato vêm do cadastro. Dados técnicos de procedimento são preenchidos pela profissional.
- O menu **Eduarda** deve aparecer somente após login de uma conta administrativa autorizada.
- Uma apresentação real da Eduarda deve aparecer na primeira visita do navegador, com opção de continuar/pular e de rever.
- Boas-vindas carinhosas, eventualmente com áudio gravado pela Eduarda, e lembretes **na véspera e duas horas antes** do atendimento.

O usuário prefere que tarefas rotineiras autorizadas avancem sem confirmações repetidas. Pedir informações quando forem realmente necessárias, sem pedir senhas, tokens ou códigos pelo chat. Não contratar planos, linhas, provedores ou envios pagos por inferência.

## 2. Diretório, Git e infraestrutura

Workspace principal:

```text
C:\Users\LUCASCORTS\Documents\ChatGPT\SISTEMA DE AGENDAMENTOS CLINICA
```

**Atualização 09/11 (Claude Code):** primeiro commit feito e enviado; branch `main` no repositório privado `clinicatorricelli-rgb/clinica-torricelli`. A publicação do frontend passou a ser automática pelo GitHub Actions a cada push em `main` (ver §15). Preservar os arquivos ignorados locais; `git clean -fdx` apagaria os metadados em `artifacts/`.

| Recurso | Estado conhecido |
| --- | --- |
| Frontend | Cloudflare Pages, Direct Upload por Wrangler; projeto existente `clinica-torriceli-previa` |
| URL estável | https://clinica-torriceli-previa.pages.dev/ |
| Último deployment validado | https://4484cbf7.clinica-torriceli-previa.pages.dev/ |
| Bundle desse deployment | `index-BPV7Af5X.js`, CSS `index-C8RNTIgb.css` |
| Backend | Supabase dedicado `clinica-torriceli-testes`, região São Paulo `sa-east-1`; plano gratuito quando criado |
| Outro Supabase | Projeto inicial em outra região foi preservado; não é o alvo dos scripts |
| Domínio comprado pelo usuário | `clinicatorricelli.com.br`, Registro.br |
| Domínio próprio | Verificado para e-mail no Resend; não foi confirmado como domínio do frontend |
| E-mail | Resend SMTP para Auth e API Resend para avisos de vagas, integrações separadas |
| WhatsApp | App Meta criado, integração ainda não operacional |
| Reservas/gateway | Desativados/não implementados operacionalmente |

O alvo `--branch main` no upload do Pages não significa que a branch Git local seja `main`. O site existente não é um projeto do plugin Sites nem um serviço Render. Não migrar/recriar a infraestrutura apenas porque outro conector estiver disponível.

## 3. Estado funcional canônico

| Módulo | Implementação | Evidência/limite |
| --- | --- | --- |
| Catálogo | 23 opções, valores/duração/sinal | Fonte em código e seed; não inventar serviços |
| Login/cadastro/recovery | Supabase Auth, PKCE, confirmação de e-mail | Usuário cadastrou/confirmou conta de cliente; cadastro geral continua restrito por hook |
| Administração | UUID confiável + TOTP/AAL2 | Usuário confirmou acesso ao painel real |
| Cadastro pessoal | Nome e telefone próprio, leitura de conta | Dados de outra conta não são reutilizados na UI |
| Preferências | E-mail e WhatsApp independentes, histórico de consentimento | Usuário ativou ambos; isso não significa que WhatsApp já envie |
| Disponibilidade | Consulta de horários, rascunho, publicação, bloqueios e retirada | Usuário testou abertura/bloqueio; publicar não cria reserva |
| E-mail de vagas | Fila, cron, Resend, descadastro e verificação de webhook | Aviso real recebido e confirmado; configuração do webhook de entrega ainda pendente |
| Ficha de cílios | Cliente + técnico administrativo + revisões privadas | Publicada para testes com dados fictícios, sem aprovação clínica automática |
| Menu Eduarda | Condicionado ao papel confirmado para o UUID atual | Dados continuam protegidos por RLS/MFA |
| Vídeo de resultados | V4 publicado | É montagem de resultados, não apresentação falada |
| Vídeo de boas-vindas | Componente preparado | Arquivo real não foi enviado; não há popup vazio/falso em produção |
| WhatsApp automático/manual | Especificação e onboarding inicial | Conta empresarial/número/API/modelos/credenciais ainda pendentes |
| Reserva/pagamento/remarcação | Contratos e tabelas-base | Sem fluxo operacional; não remover bloqueios preventivos |

## 4. Stack, ambiente e comandos

Stack local observada: Node **24.22.1**, React/React DOM **19.3.1**, Vite **7.3.7**, `@supabase/supabase-js` **2.118.0**, Supabase CLI **3.0.0**, Wrangler **4.157.0**. Dependências e versão de instalação são governadas por `package.json`/`pnpm-lock.yaml`; não atualizar sem necessidade.

Nesta máquina existe pnpm no runtime do Codex, mesmo que `npm`/`pnpm` globais não estejam disponíveis:

```powershell
Set-Location 'C:\Users\LUCASCORTS\Documents\ChatGPT\SISTEMA DE AGENDAMENTOS CLINICA'

# Instalar somente se necessário; preservar lockfile.
node C:/Users/LUCASCORTS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs install --frozen-lockfile

# Desenvolvimento sem configuração Supabase: demonstração desconectada.
node node_modules/vite/bin/vite.js --host 127.0.0.1

# Testes locais: sem chamadas ao projeto hospedado.
node --test tests/*.test.mjs

# Build explicitamente desconectado.
node node_modules/vite/bin/vite.js build --mode demo

# Build da homologação conectada, mantendo cadastro restrito no servidor.
node scripts/build-staging.mjs --signup-test
```

`scripts/build-staging.mjs` valida o projeto, captura chaves da CLI em memória, usa somente URL/publishable key no frontend e procura segredos reais privilegiados no bundle. Não executar a busca de chaves com saída revelada no terminal/chat. Sem `--signup-test`, o formulário de criação de conta fica desabilitado no build.

`vite.config.js` força desconexão no modo `demo`, mesmo se existirem variáveis Supabase no ambiente. Um build Vite comum sem as variáveis pode gerar demonstração e, se publicado, substituir indevidamente a homologação conectada. Escolher o modo conscientemente.

`pnpm-workspace.yaml` permite os builds de `esbuild`, `workerd` e `supabase`. Já ocorreu de uma ferramenta adicionar configuração duplicada inválida de workerd; preservar o YAML válido.

## 5. Mapa dos arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/main.jsx` | App principal, navegação interna, sessão/perfil/catálogo, MFA e composição das telas |
| `src/supabase.js` | Cliente público, flags de build e URLs de retorno |
| `src/auth-callback.mjs` | Parse de PKCE/OTP/fragmento para convite, signup e recovery |
| `src/auth-errors.mjs` | Erros seguros e mensagens de Auth sem conteúdo privado bruto |
| `src/mfa.mjs` | Retomar TOTP confirmado ou pendente por `listFactors().all` |
| `src/catalog.mjs` | Catálogo canônico, centavos e cálculo de sinal |
| `src/AvailabilityPanel.jsx` | Consulta pública e gestão administrativa de disponibilidade |
| `src/availability.mjs` | Helpers de regras e conflitos; não substituem servidor |
| `src/AdminDashboard.jsx` | Contagens/listas administrativas e composição dos módulos |
| `src/AlertPreferences.jsx` | Preferências próprias e disponibilidade dos canais |
| `src/NotificationStatus.jsx` | Contagens/limites/estado do e-mail para admin |
| `src/UnsubscribePanel.jsx` | Confirmação de descadastro em página do frontend |
| `src/ClientIntake.jsx` | Ficha própria, dados reutilizados e reconfirmação |
| `src/AdminIntake.jsx` | Leitura protegida da ficha e escrita técnica separada |
| `src/intake.css`, `src/style.css` | Visual responsivo marfim/dourado e estilos gerais |
| `src/HeroVideo.jsx` | Resultados V4 e preferência por movimento reduzido |
| `src/WelcomePresentation.jsx` | Apresentação inicial, aguardando mídia aprovada |
| `supabase/functions/availability-email/index.ts` | Adaptador Deno/Postgres da função de e-mail |
| `supabase/functions/_shared/availability-email.mjs` | Handler, mensagem, envio e descadastro |
| `supabase/functions/_shared/resend-webhook.mjs` | Verificação Svix e tratamento mínimo de eventos |
| `scripts/provision-email-notifications.mjs` | Provisiona/ativa cron e segredo; é mutação remota |
| `scripts/test-hosted.mjs` | Wrapper de testes com chaves privadas em memória |
| `supabase/hosted-config.toml` | Intenção de Auth hospedado, hooks e templates |
| `supabase/config.toml` | Configuração local; não sobrescrever o serviço com ela |
| `supabase/templates/` | Confirmação, convite e recuperação em português |

A navegação é estado React, não um router completo. Links diretos reconhecidos: `?view=services` e `?view=unsubscribe`; callbacks Auth são tratados explicitamente. `_redirects` serve a SPA, mas não transforma qualquer pathname em uma tela real automaticamente.

## 6. Banco e migrações aplicadas

Estas oito migrações foram aplicadas no Supabase dedicado. Mudanças novas devem usar nova migração, não editar o passado:

1. `202611040001_foundation.sql`: perfis, catálogo-base, regras de agenda, appointments, pagamentos/remarcação/decisões financeiras, autorização, RLS, auditoria e Storage.
2. `202611040002_catalog.sql`: seed das 23 opções do catálogo.
3. `202611040003_notification_preferences.sql`: preferências e evidências de consentimento.
4. `202611040004_availability_workflow.sql`: telefone opcional, horizonte, consulta, rascunhos/publicação/bloqueios e outbox.
5. `202611050001_controlled_signup.sql`: beta por hash de endereço autorizado e expiração.
6. `202611050002_email_notifications.sql`: fila de digest, despacho, supressão, descadastro e eventos.
7. `202611060001_client_intake.sql`: ficha, parte técnica e revisões privadas.
8. `202611060002_client_intake_conflicts.sql`: conflitos `PT409` e referências históricas de autores sem FK bloqueante para Auth.

Principais objetos:

- Públicos protegidos: `profiles`, `services`, `clinic_settings`, `weekly_availability`, `availability_restrictions`, `availability_exceptions`, `appointments`, `payments`, `reschedule_requests`, `financial_decisions`, `audit_log`, `notification_preferences`, `notification_consent_events`, `availability_drafts`, `availability_publications`, `client_intake_current`, `client_intake_procedure`.
- Privados: `admin_members`, `signup_test_access`, `payment_events`, `availability_outbox`, tabelas `availability_email_*`, `client_intake_revisions`.
- Storage: `client-files` privado com leitura autorizada por proprietário/admin; uploads de cliente não foram liberados. Galeria pública separada `public-gallery`, com escrita administrativa protegida. Fotos de pacientes não foram adicionadas por esta etapa.

## 7. Autenticação e autorização

- `private.admin_members(user_id)` é a associação confiável. `public.has_admin_role()` consulta somente a associação da sessão atual; `private.is_admin()` exige associação **e JWT `aal2`**.
- O botão Eduarda exige o UUID administrativo confirmado igual ao UUID da sessão atual. Login comum não mostra o botão; logout/troca de conta não reutiliza o papel anterior. Esconder o botão não é a proteção dos dados: RLS/RPC continuam obrigatórios.
- Conta administrativa convidada foi aceita, e-mail confirmado e TOTP validado pelo usuário. Por escolha dele, os testes continuam nessa conta; posteriormente criar conta própria do desenvolvedor e transferir/configurar o autenticador da Eduarda com segurança. Não remover MFA antes de validar substituição.
- Senha mínima 12 caracteres; confirmação de e-mail obrigatória; sessão persistida pelo SDK. Links PKCE precisam da sessão do navegador onde o fluxo começou, inclusive janela anônima quando usada.
- `auth-callback.mjs` suporta código PKCE, OTP de tipos permitidos e fragmentos oficiais de sessão. Convite/recovery exigem definição de senha; URLs são limpas após leitura. O flag `torriceli-password-setup` em sessionStorage retoma a definição de senha após reload.
- Convite é de uso único. Se já consumido, usar recuperação, sem insistir no convite antigo. Não enviar recuperações repetidas como diagnóstico.
- Bug TOTP corrigido: o atalho `data.totp` lista apenas fatores verificados; fatores pendentes ficam em `data.all`. Retomar o pendente antes de criar outro. Reinício explícito só remove fator não verificado; não apagar autenticador confirmado automaticamente.
- Houve diferença de aproximadamente 45s entre relógio do computador e serviço num teste inicial. Fixtures TOTP usam horário do serviço; data/hora automática do celular ajuda. Não alterar relógio do sistema sem solicitação.

Cadastro beta: hosted `auth.enable_signup=true`, porém o hook **Before User Created** `public.before_user_created_test_gate(event)` restringe criação a hash normalizado do e-mail em `private.signup_test_access` com expiração válida. Somente Auth executa/lê essa autorização. Uma autorização de cliente foi concedida por sete dias em 05/11; consultar privadamente a expiração antes de novos testes. Isso não expira a conta já criada e não concede administração.

Não abrir cadastro geral removendo o hook. Antes da abertura pública, revisar proteção contra abuso/CAPTCHA, mensagens e privacidade. A flag frontend `VITE_ENABLE_PUBLIC_SIGNUP` não é um controle de autorização.

## 8. Catálogo, horários e contratos da futura reserva

Fonte canônica: `src/catalog.mjs`; seed gerado por `scripts/seed.mjs`. São 23 opções: Lash Lifting; Efeito Rímel, Europeu, Brasileiro, Egípcio e Fox Eyes, com suas aplicações/manutenções; Capping Cleópatra/Brasileiro; Brow Lamination; Limpeza de Pele; Design simples/Henna; Hydra Gloss; Micropigmentação Labial; remoção própria/de outra profissional. Consultar o arquivo para preços e minutos exatos, sem criar variantes não fornecidas.

- Dinheiro em centavos inteiros; BRL; sinal previsto 30% com arredondamento half-up: `Math.floor((cents*30+50)/100)`.
- Capping aplicação ocupa 120 minutos. Cílios: manutenção de 15–25 dias; Capping: 25–30. Fora do máximo, nova aplicação; não incluir um retoque labial inexistente.
- Única profissional: exclusão GiST global sobre `tstzrange(starts_at,busy_until,'[)')` para `held`, `confirmed`, `blocked`.
- Fuso único `America/Sao_Paulo`. Seg–sex limite semanal 07–22, com estágio fechando 07–11 por restrição aberta; padrão efetivo 11–22. Manhã pode ser aberta por exceção da data. Sábado 07–18; domingo fechado.
- Revisão de estágio em **05/12/2026** não é expiração: não abrir manhãs automaticamente em 06/12.
- Pós-graduação um sábado por mês em datas variáveis não informadas; não criar recorrência presumida.
- Serviço termina até o encerramento; buffer de 15 minutos pode se estender depois do último atendimento. Grade de início de 15 minutos e horizonte padrão de consulta de 90 dias.
- Bloqueio/fechamento prevalece sobre abertura. Não cancelar ou remarcar compromisso silenciosamente ao bloquear.

RPCs existentes: `available_slots(p_service_id,p_day)`, `save_availability_draft(...)`, `publish_availability_draft(p_id,p_revision)`, `withdraw_availability_publication(p_id)`.

Publicação/retirada usa `pg_advisory_xact_lock(hashtextextended(day::text,41))`. **O futuro endpoint de reserva deve usar o mesmo lock por data**, revalidar slots e usar a exclusão GiST na mesma transação. Bloqueios administrativos materializam ocupação na tabela appointments. Retirar um bloqueio apaga somente sua ocupação sintética, preservando histórico.

Reservas ainda não podem ser criadas pelo navegador: `booking_enabled=false` é travado por CHECK e `hold_minutes=null`. Para continuar:

1. Definir duração explícita de retenção; expirar `held` vencidos transacionalmente e por worker. Só consultar `hold_expires_at` sem mudar status não libera a exclusão GiST.
2. Aceitar identidade do JWT, nunca `customer_id`, preço, duração, sinal ou status enviado pelo cliente. Ler catálogo/regras no servidor, congelar valores e exigir ficha/revisão pertinente ao serviço.
3. Garantir idempotência de retenção/pagamento. Confirmar atendimento pelo evento confiável do servidor, nunca por retorno visual do checkout.
4. Gateway ainda não está contratado/integrado. Mercado Pago foi citado preliminarmente; não tratar como decisão final. Nenhum gateway está pronto apenas porque existem tabelas.
5. Webhook financeiro deve verificar assinatura e consultar provedor: pagamento, moeda BRL, sinal congelado, vínculo, ambiente e status; deduplicar. Pagamento atrasado não ressuscita reserva que perdeu disponibilidade.
6. Regra planejada de remarcação: com antecedência >=12h, troca segura/transacional e transferência do sinal; abaixo de 12h, solicitação para decisão de Eduarda, preservando o horário original. Decisão financeira é separada, sem perda automática do sinal. Termos finais ainda precisam ser definidos.

## 9. Avisos de vagas por e-mail: IMPLEMENTADOS E VALIDADOS

O usuário registrou o domínio, configurou registros DNS do Resend no Registro.br e comprovou status Verified. Registros criados: TXT `resend._domainkey` e CNAMEs `rsend` → `rsend-sae1.forge.rmta.net`, `send` → `send.forge.rmta.net`. Valores de chave DKIM completos ficam no provedor, não precisam ser copiados neste handoff.

Auth SMTP: `smtp.resend.com`, porta465, usuário `resend`, remetente `acesso@clinicatorricelli.com.br`, nome Clínica Torricelli. Credencial foi inserida privadamente pelo usuário no Supabase. Templates de confirmação/convite/recovery em português foram aplicados e mantêm `{{ .ConfirmationURL }}`. Não pedir senha Gmail nem resetar a senha SMTP por config push.

Avisos de vagas usam API Resend separada, na Edge Function `availability-email`; não herdam automaticamente o segredo SMTP. `RESEND_API_KEY` foi configurada pelo usuário e um aviso real da abertura de segunda 09/11 foi aceito e recebido em 05/11. Aceite da API e chegada na caixa de entrada são evidências diferentes; o recebimento foi confirmado pelo usuário, não inferido pelo agente.

Contrato da fila:

- Outbox nasce na mesma transação da publicação efetiva de novas vagas. Rascunho/bloqueio/refresh não é disparo. Abertura redundante sem nova capacidade não gera aviso.
- Só destinatários com opt-in vigente já no momento da publicação, endereço confirmado e consentimento vinculado ao endereço atual. Mudança de e-mail revoga autorização do destino anterior.
- Limite escolhido pelo usuário: **1 aviso por cliente/dia, 08–20 São Paulo**. Consolidação de 5 minutos e teto global inicial de 50 destinatários/reservas duráveis por dia. Limite de novas vagas não deve ser aplicado cegamente à futura confirmação e lembretes de atendimento.
- Digest único por cliente/dia; corpo congelado não é alterado por novas publicações. Histórico anterior à ativação é excluído.
- Enqueue confirma em transação própria; depois uma preparação confirma payload/token/horizonte antes da rede. Despacho revalida tudo e mantém locks de preferência/data durante o HTTP limitado a8s. Essa separação evita deadlock com revogação e conserva idempotência se o provedor aceitar mas o COMMIT falhar.
- Chave `availability-email/<delivery_id>`, mesmo payload nas tentativas; até4 preparações, horizonte conservador23h, backoff e nenhum envio transportado para outro dia. Resend mantém idempotência24h; não prometer exactly-once.
- Retirada/mudança de disponibilidade ou revogação suprime pendências. Corpo congelado contendo abertura que deixou de valer é suprimido, sem editar o conteúdo da tentativa anterior.
- GET de descadastro não muda preferências. Link visível abre `?view=unsubscribe#token=...` no Pages; o fragmento é removido da barra. POST por token opaco revoga só e-mail, respeita destino e mantém WhatsApp/Auth separados. Header one-click usa endpoint próprio. CORS restrito à origem exata.
- Eventos Svix assinados, raw body, tolerância5min e deduplicação; entrega atrasada não desfaz reclamação/bounce. Eventos antecipados ao COMMIT são reconciliados.

URLs da função, derivadas privadamente de `SUPABASE_URL`:

```text
/functions/v1/availability-email               POST, segredo de cron
/functions/v1/availability-email/unsubscribe   GET/POST, token de finalidade limitada
/functions/v1/availability-email/webhook       POST, assinatura Resend/Svix
```

`verify_jwt=false` é intencional para permitir descadastro/webhook públicos, mas o despacho exige `AVAILABILITY_CRON_SECRET`. Não remover a autenticação interna. Função usa Postgres de servidor (`SUPABASE_DB_URL`, `postgres@3.4.7`, SSL, prepare:false), sem grants privilegiados de fila ao navegador/service-role.

Cron `availability-email-minute` chama a função a cada minuto por `pg_cron` + `pg_net`. Segredo e origem no Vault; segredo equivalente nos secrets da função. `private.invoke_availability_email_worker()` e o job são instalados pelo script de provisionamento, fora das migrações principais.

RPCs de observação: `availability_email_status()` para admin AAL2 e `availability_alert_channels()` para canais da cliente.

**Pendente:** criar/configurar webhook no Resend para `email.delivered`, `email.bounced`, `email.complained`, `email.failed` e salvar `RESEND_WEBHOOK_SECRET`. Código existe; configuração privada não foi concluída. Não marcar `delivered_at` manualmente. `provider_ready` indica que o worker reconheceu configuração, não prova universal de entrega nem validade eterna da chave.

## 10. Ficha de atendimento: IMPLEMENTADA EM HOMOLOGAÇÃO

Referência original, recebida em branco e inspecionada por extração e renderização de sua única página:

```text
C:\Users\LUCASCORTS\Downloads\Ficha de Anamnese Extensão de Cílios Moderna Rosa.pdf.pdf
```

O arquivo tem visual branco/dourado, apesar do nome mencionar rosa. Não foi copiado para o site. Não publicar seu telefone/endereço/logotipo automaticamente. A marca do site foi padronizada para dois L sem alterar a identidade pessoal da titular.

`client_intake_current` guarda DOB opcional (idade calculada), sexo/endereço opcionais, seis respostas JSON, nome digitado, declarações, flags independentes de procedimento/fotos, versão de aviso, revisão e timestamps. Nome/telefone/e-mail são reutilizados do cadastro, não duplicados nessa tabela.

Perguntas e chaves:

| Pergunta | Chave |
| --- | --- |
| Gestante/lactante, há quanto tempo | `pregnant_or_breastfeeding` |
| Procedimento anterior nos olhos | `previous_eye_procedure` |
| Alergia a esmalte ou cosméticos | `cosmetic_allergy` |
| Glaucoma ou problema ocular | `eye_condition` |
| Tratamento oncológico | `cancer_treatment` |
| Rímel no dia | `wearing_mascara` |

Cada resposta: `{value:'yes'|'no'|'discuss',details:string}`. Sem pré-marcar Não. Pergunta de rímel e confirmações são renovadas a cada envio; dados persistentes são reaproveitados. Fotos internas não autorizam redes sociais. Preencher ficha não autoriza clinicamente o atendimento; o nome digitado não é apresentado como certificado de assinatura.

RPC da cliente: `save_client_intake(p_data jsonb,p_revision integer)`. Identidade vem de `auth.uid()`. Campos/booleans/limites/JSON estritamente validados. Rejeita IDs e parâmetros técnicos forjados. Cliente vê a própria ficha; admin só vê fichas alheias com AAL2. Escrita direta é revogada.

`client_intake_procedure`: estilo, curvatura, espessura, modelo dos fios, data e observações, revisão técnica, revisão da ficha de origem e autor. RPC `save_client_intake_procedure(p_customer_id,p_data,p_revision,p_intake_revision)` exige admin AAL2 e ambas as revisões atuais. Não remover a quarta verificação: uma cliente pode atualizar respostas enquanto a profissional está com uma tela antiga.

Histórico `private.client_intake_revisions` não é disponibilizado diretamente nem ao admin no navegador. Cada envio/edição gera snapshot imutável; logs genéricos não carregam respostas. UUIDs históricos de autor são preservados sem FKs vivas para Auth, como no audit_log; exclusão do titular ainda elimina dados próprios pelas relações de profile.

Bug importante já resolvido: SQLSTATE40001 para conflito funcional provocou timeout na chamada real hospedada. A migração de correção mudou para **PT409/HTTP409**, validado pela API; UI reconhece esse código e limita espera de salvamento20s. Não regredir.

O módulo avisa **usar somente dados fictícios**. Produção com dados reais depende de aviso de privacidade, finalidade/base/retencão e fluxo de atendimento completos. Não colocar respostas clínicas em WhatsApp/e-mail. A ficha ainda não está integrada como precondição transacional de uma reserva, pois esse endpoint não existe.

## 11. Vídeos e layout

Design atual: marfim/branco/dourado/marrom, Georgia700 para títulos e DM Sans para corpo/controles. Usuário pediu ajustes de layout; homepage ganhou percurso serviços → cadastro/ficha → avaliação e ficha tem visual derivado da referência. Menu público: clínica, serviços e Minha conta; Eduarda somente na sessão administrativa.

**Resultados existentes:** `public/media/abertura-v4.mp4`, 800×480 (5:3), ~13,64s, 25fps, sem áudio, 371.460 bytes. Poster próprio. `HeroVideo` usa autoplay muted loop playsInline sem controle sobreposto; movimento reduzido do sistema ou checkbox no rodapé troca por imagem. Manter integridade/centralização dos resultados, sem distorção/zoom/cortes agressivos. V2/V3 e fontes originais foram preservados.

**Apresentação da Eduarda:** ainda não fornecida. Última orientação ao usuário foi gravação horizontal16:9, FullHD1920×1080,30–45s, boa luz e áudio, MP4 ou MOV original. Não criar fala/voz/imagem fictícia como se fosse vídeo dela. Não substituir resultados V4 pelo vídeo de apresentação.

`WelcomePresentation.jsx` retorna null sem fonte. Quando houver gravação aprovada, otimizar e configurar:

```dotenv
VITE_WELCOME_VIDEO=/media/<arquivo-aprovado>.mp4
VITE_WELCOME_CAPTIONS=/media/<legenda-aprovada>.vtt
VITE_WELCOME_VIDEO_VERSION=v1
```

Esses nomes são exemplos, não arquivos existentes. Primeira visita é por navegador/versão em localStorage, não identidade biométrica nem garantia de uma vez por pessoa em todos os dispositivos. Há diálogo nativo, reprodução manual com som, continuar/pular/Esc e rever em Conheça Eduarda. Respeitar o formato e a acessibilidade após receber a mídia. Roteiro está em `docs/APRESENTACAO-EDUARDA.md`.

## 12. WhatsApp: ONDE A CONVERSA PAROU

Foi criado o app **Clínica Torricelli** em Meta Developers com caso de uso conectar-se com clientes pelo WhatsApp. O usuário chegou ao início rápido, que exigiu criar um portfólio empresarial. O formulário foi preenchido, mas Meta retornou que o Facebook era muito novo e orientou tentar em uma hora. **Não há confirmação posterior de criação do portfólio**, apesar de agora ser09/11. Retomar a tela real, sem assumir que o bloqueio continua ou já sumiu. Não recriar outro app por falta de contexto.

O usuário informou que ainda não tem número exclusivo da clínica. Planejamento: começar com número de teste Meta quando disponibilizado; escolher linha definitiva de operadora, chip/eSIM conforme aparelho. Para o Business no celular, não presumir que número virtual/VoIP será aceito. Não comprar nada automaticamente.

Requisito decisivo: Eduarda quer atender manualmente pelo mesmo número comercial que o sistema utilizará. Conferir o caminho oficial de **Coexistência** (Business app + API) e elegibilidade antes de registrar o número real apenas na Cloud API. Alternativa exige caixa de entrada de atendimento; não prometer que a API sozinha equivale a um WhatsApp no celular.

Automação desejada:

- Boas-vindas/confirmacão somente quando a reserva estiver realmente confirmada.
- Saudação conforme horário de envio em São Paulo e tom da Eduarda, como “Olá, cilhuda”/“Amore”.
- Lembretes **na véspera e duas horas antes**; cancelamentos/remarcações devem cancelar/reprogramar jobs; evitar lembretes retroativos.
- Preferências de novas vagas são independentes de mensagens de atendimento; não reutilizar marketing como autorização irrestrita para tudo.
- Cliente precisa controlar/verificar o número de destino e poder parar mensagens; mudar contato exige reconfirmação apropriada. Ter telefone no profile e checkbox ativo ainda não verifica esse destino.
- Áudio pode ser gravação real da Eduarda, com versões dia/tarde/noite se ela enviar. Não existe gravação fornecida nem autorização para inventar clonagem de voz.
- A janela de atendimento livre depende de mensagem da cliente no WhatsApp e dura24h. Cadastro/reserva no site não a abre por si só. Fora dela, iniciativa exige modelo aprovado; áudio proativo fora da janela não foi validado. Desenho proposto: texto aprovado → cliente inicia/responde via botão pós-reserva → áudio permitido dentro da conversa.
- Nenhum template foi aprovado/submetido e nenhum envio WhatsApp foi testado. Custos, consentimento, modelos e limites vigentes precisam ser verificados em fontes oficiais antes de ativar.

Documentos: `docs/WHATSAPP-PREPARACAO.md`, `docs/ATENDIMENTO-WHATSAPP.md`. Os links oficiais ali são referência de06/11; UI/política/elegibilidade podem mudar. Não automatizar WhatsApp Web como substituto da integração oficial.

## 13. Verificação existente e cuidado CRÍTICO com testes remotos

Última validação registrada em06/11:

- **48 testes locais passaram**, sem falha/skip, incluindo Postgres real embarcado/PGlite, RLS/grants, MFA, agenda, consentimentos, worker, Svix, ficha, conflitos e exclusão.
- Testes Auth/PostgREST reais anteriores passaram para isolamento, admin/MFA/revogação, links, beta e disponibilidade em suas respectivas entregas.
- Teste novo `tests/client-intake.integration.mjs` passou com duas contas sintéticas, nenhum envio SMTP: salvar200, leitura cruzada vazia, escrita direta403, visitante401, ID forjado400, revisão antiga409, técnico não autorizado403 e histórico privado406. Fixtures/autorizações removidas.
- `supabase/tests/client_intake.sql` e `email_notifications.sql` passaram como testes com rollback na época da entrega.
- HTTP/hash/CSP/noindex do deployment final foram verificados.

Não reexecutamos esses testes nem serviços remotos na criação deste handoff.

**ATENÇÃO: não executar a suíte hospedada padrão de forma cega.** `node scripts/test-hosted.mjs` sem argumentos inclui `tests/availability.integration.mjs`. Esse teste publica aberturas normais enquanto o worker de e-mail agora está ativo. Uma passagem do cron pode enfileirar destinatários reais de teste; a FK `availability_email_items → availability_publications` também pode impedir a limpeza do teste. O rótulo antigo “sem mensagens” não garante isolamento. Esse risco foi identificado na revisão do handoff e não foi corrigido nesta tarefa de documentação.

Primeiro corrigir a estratégia: isolamento de publicações/recipientes e cleanup, ambiente separado ou pausa coordenada segura com restauração. Não mudar preferências reais, não fingir consentimento e não usar envios reais como sonda. Scripts de provisionamento podem ativar envios; não são diagnósticos.

Para validar a ficha de maneira seletiva, depois de conferir o alvo e o próprio teste:

```powershell
node scripts/test-hosted.mjs tests/client-intake.integration.mjs
```

Essa chamada ainda cria/remove fixtures e exige autenticação CLI, mas não publica horários nem envia e-mails no código atual. As fixtures só podem ser sintéticas, autorizadas temporariamente pelo helper `tests/fixture-signup-access.mjs`, no projeto dedicado; finalizar sua limpeza mesmo após erro.

Smoke SQL de rollback: executar pela CLI oficial com `db query --file ...` e alvo privado validado. Não passar arquivo com comentário inicial `--` como argumento SQL literal, pois a CLI o interpreta como flag. Confirmar `smoke_passed=true`; não inferir sucesso por timeout.

`scripts/test-hosted.mjs` captura chaves em memória e mascara saída; foi corrigido para falhar em erro/sinal/status nulo do subprocesso. O script não resolve o risco de isolamento do teste de publicação.

QA visual real v4 foi feita antes dos módulos novos, com capturas em `docs/qa/`. Depois, a automação de navegador ficou indisponível/desabilitada. Nenhuma captura antiga comprova a nova UI de ficha. O PDF foi renderizado/inspecionado localmente, o que não equivale a testar o site no navegador. Verificar novamente a disponibilidade de ferramentas autorizadas no novo ambiente, sem contornar restrições de acesso.

## 14. Segredos e metadados locais

Não há segredos intencionalmente em código/documentação/bundle. `.env.example` é somente modelo. Na inspeção de09/11 havia apenas esse arquivo `.env*` no diretório, sem `.env.local` confirmado.

Preservar privadamente os arquivos ignorados úteis:

- `artifacts/project-create-response.json`: identificador/nome/região do projeto alvo; scripts dependem dele.
- `artifacts/org-create-response.json`: contexto da organização criada.
- `artifacts/admin-invite-status.json`, `admin-recovery-status.json`, `smtp-recovery-check-status.json`: controles históricos para não repetir convites/recuperações/envios.
- Metadados CLI/Wrangler sob gerenciamento das ferramentas no perfil do usuário. Autenticação em outra sessão/máquina não é garantida.
- Banco: arquivo DPAPI em `C:\Users\LUCASCORTS\.codex\secrets\clinica-torriceli-testes-db.dpapi`, cuja existência foi confirmada sem leitura do valor. Está fora do repo e depende do contexto Windows; não mover para fonte/frontend.

Nunca publicar `artifacts/`, `.wrangler/`, `.env*` reais, tokens CLI, chaves privadas, dumps de configurações ou DPAPI. Ao transferir de máquina, reautenticar ferramentas/estabelecer acesso com o usuário; não recriar banco para substituir metadados ausentes. O ZIP demo antigo em artifacts não representa o código atual.

Secrets conhecidos na função: `RESEND_API_KEY`, `AVAILABILITY_CRON_SECRET`; configuração futura `RESEND_WEBHOOK_SECRET`. `SUPABASE_URL`/`SUPABASE_DB_URL` são injetados no runtime. Credencial SMTP Auth foi salva separadamente no dashboard. Não extrair ou imprimir para documentação.

Antes de qualquer mutação Supabase, validar nome `clinica-torriceli-testes` e região `sa-east-1` com metadados privados e alvo real. Capturar stdout quando houver risco de chaves/identificadores; não despejar `api-keys --reveal` ou config pull completo na conversa. Revisar `config diff` antes de Auth config push e preservar senha SMTP/hooks/redirects existentes.

## 15. Publicação

Depois de testes apropriados e build conectado correto:

```powershell
node scripts/build-staging.mjs --signup-test
node node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name clinica-torriceli-previa --branch main --commit-dirty=true
```

**Desde 09/11 a publicação normal é automática:** `.github/workflows/publicar-site.yml` roda a cada push em `main` (testes locais, build `--mode staging` com URL/chave publicável fixadas no próprio workflow, `scripts/check-bundle.mjs` e `wrangler pages deploy` com o segredo `CLOUDFLARE_API_TOKEN` do GitHub). Pull requests só testam e montam. A montagem do workflow foi comparada com o deploy 4484cbf7 e saiu byte a byte idêntica (`index-BPV7Af5X.js`, `index-C8RNTIgb.css`). O projeto Pages é Direct Upload e não pode ser ligado ao Git pelo painel; por isso o deploy é feito pelo Actions, preservando projeto e URL. Os comandos manuais acima continuam válidos para emergência no computador do escritório, mas evite misturar: o próximo push em `main` substitui o que foi publicado à mão. Não recriar o projeto Pages; `--force` foi necessário apenas na criação inicial.

`public/_headers`: CSP, nosniff, noindex/nofollow/noarchive e outras restrições. Noindex não é controle de acesso. `_redirects`: `/* /index.html 200`.

Domínio definitivo do site ainda é pendência. Mudar apenas DNS não conclui a migração: revisar URLs exatas de Auth, `redirectUrl()`, links fixos de e-mail, origem CORS do descadastro e endpoint do worker. Backend já contém links para a URL Pages atual.

Backend/novas migrações/funções devem usar CLI oficial no projeto validado, com dry-run e revisão; `--use-api` permite bundle da função sem Docker. Não substituir a configuração hospedada pela local e não rotacionar segredos/reprovisionar cron por mera tentativa de fazer um deploy frontend.

## 16. Próximos passos recomendados

1. Ler este handoff e inspecionar o working tree; preservar o projeto sem commits. Rodar a suíte **local**, se for trabalhar em código.
2. Corrigir o isolamento da suíte remota de disponibilidade antes de usar o wrapper padrão com notificações ligadas.
3. Configurar/validar webhook Resend para entrega/bounce/reclamação, sem reenviar avisos já aceitos. Manter distinção accepted/delivered.
4. Se o usuário enviar o vídeo real, otimizar original, integrar apresentação/legendas, rever layout responsivo e publicar. Até lá não mostrar placeholder como vídeo real.
5. Retomar Meta no app já criado: confirmar se portfólio foi liberado, recursos de teste e caminho de atendimento manual+API; só então número definitivo, modelos, credenciais e testes controlados.
6. Implementar retenção/reserva/triagem/gateway em ambiente de teste com as invariantes acima. Definir pendências de prazo de retenção, provedor e termos; não habilitar `booking_enabled` antes da segurança transacional.
7. Implementar confirmação/boas-vindas e os dois lembretes após existir agendamento realmente confirmado e integração WhatsApp validada.
8. Concluir privacidade/retencão/termos, proteção de cadastro público e QA de ponta a ponta antes de produção clínica/dados reais.
9. Separar conta do desenvolvedor e transferir a operação/MFA para Eduarda no momento combinado, sem perder acesso nem reduzir proteção.

## 17. Precedência documental e referências internas

Este handoff é o resumo canônico da conversa até09/11. Os arquivos de código/migrações são a fonte da implementação; estado remoto futuro deve ser conferido antes de novas mutações. Não interpretar texto desatualizado como instrução para desfazer o que já funciona.

Há trechos históricos contraditórios em README, `NOTIFICACOES.md`, `INTEGRACAO-VALIDADA.md`, `AGENDA-DISPONIBILIDADE.md`, `CADASTRO-TESTES.md`, `VIDEO-V4.md` e deploys antigos. Exemplos: “sem backend”, “nenhum envio”, “sem SMTP”, “cadastro ainda será feito”, “vídeo v2”, “agenda futura” e “RESEND_API_KEY ausente”. Eles descrevem etapas anteriores. E-mail foi realmente recebido; existem oito migrações; o vídeo de resultados atual é v4; cadastro é beta por hook; ficha já está publicada.

Documentos úteis por assunto:

- `docs/FICHA-CLIENTE.md`: entrega mais recente, bugs corrigidos e evidências da ficha/nav.
- `docs/AVISOS-EMAIL.md`: considerar primeiro a evidência mais recente de recebimento; parágrafos antigos sem chave/envio são históricos.
- `docs/ATENDIMENTO-WHATSAPP.md`: atendimento manual, lembretes e áudio.
- `docs/WHATSAPP-PREPARACAO.md`: início da configuração e modelos de rascunho.
- `docs/APRESENTACAO-EDUARDA.md`: roteiro de gravação real pendente.
- `docs/AGENDA-DISPONIBILIDADE.md`: regras/RPCs da agenda, com ressalvas históricas.
- `docs/DECISOES.md`: contratos de reserva/remarcação/financeiro; não confundir pendências antigas resolvidas com faltas atuais.
- `docs/DEPLOY-CLOUDFLARE.md`, `docs/VIDEO-V4.md`: histórico de publicação e mídia.

Não apagar esse histórico sem necessidade; ao mantê-lo, sinalizar o que já foi superado. Não transportar senhas, e-mails pessoais, tokens, códigos MFA ou respostas de pacientes para o resumo público.
