# Clínica Torricelli — contexto para continuar

Leia primeiro `docs/HANDOFF-CLAUDE-CODE.md`. Ele consolida o estado da implementação e as decisões desta conversa. Alguns trechos antigos do README e de `docs/` descrevem etapas já superadas.

## Estado essencial

- Projeto existente em React/Vite + Supabase/Postgres/Auth/Storage; frontend publicado no Cloudflare Pages. Preservar essa infraestrutura.
- URL estável: https://clinica-torriceli-previa.pages.dev/ . Última publicação validada em 13/11/2026: merge do PR #2 (`e4be911`, reservas), bundle `index-DZ7umDca.js`; HTTP 200, CSP, noindex, vídeo v4 e telas novas conferidos. **Domínio próprio em migração (13/11):** zona `clinicatorricelli.com.br` criada no Cloudflare (plano Free, mesma conta), servidores `ines.ns.cloudflare.com` e `peyton.ns.cloudflare.com` gravados no Registro.br com DNSSEC removido; registros de e-mail do Resend copiados (CNAME `send`→`send.forge.rmta.net`, CNAME `rsend`→`rsend-sae1.forge.rmta.net`, TXT `resend._domainkey`), todos sem proxy. Falta: zona ficar ativa, o usuário ligar o domínio ao projeto Pages pelo painel (o token da nuvem não tem permissão), atualizar URLs do Auth e publicar a função de e-mail com o domínio novo (exigem aprovação). Remetente dos e-mails: acesso@clinicatorricelli.com.br.
- Administração por associação confiável de UUID + MFA/AAL2; menu Eduarda só para a sessão administrativa. Nunca conceder papel por e-mail, metadata ou parâmetro do navegador.
- Disponibilidade, rascunhos/publicação, bloqueios, cadastro controlado, ficha de extensão de cílios e avisos de novas vagas por e-mail implementados.
- O usuário confirmou recebimento real dos avisos por e-mail. O cron de envio deve ser tratado como ativo até checagem privada em contrário.
- WhatsApp ainda NÃO integrado. App Meta criado; em 13/11 o portfólio empresarial "Clinica Torricelli" já existia na Meta, ainda sem verificação da empresa. Conta no Positus Studio criada em 13/11; a tela "Ativar número" de lá pede número sem WhatsApp ativo (caminho que tira o número do app), por isso não usar o número da clínica nela. Não registrar o número real sem conferir o atendimento manual + API/Coexistência.
- Reservas NÃO operacionais: `booking_enabled=false` é protegido por CHECK. **Decisão de 11/11/2026: nenhum pagamento no agendamento; o sinal de 30% foi extinto.** No lugar, regra aceita antes de agendar: aviso com menos de 24 h ou falta sem justificativa gera taxa de 30% do serviço, cobrada depois; aviso com mais de 24 h permite remanejar. **Reservas aplicadas no Supabase hospedado e publicadas em 13/11** (migração `202611130001_reservations_without_deposit.sql`, PR #2; ver `docs/RESERVAS.md`), com aprovação do usuário. O agendamento continua desligado até a Eduarda (MFA) ligar no painel; antecedência mínima 2 h e 2 agendamentos futuros por cliente, ajustáveis no painel. Em 13/11 o usuário aceitou: trava de novo agendamento com taxa em aberto, taxa só após confirmação da Eduarda, no máximo três cobranças, baixa manual pela Eduarda e 1 h de tolerância para quem agenda a menos de 24 h. Regra completa e detalhes ainda a definir no topo de `docs/DECISOES.md`. Consulta de horários não reserva atendimento.
- Ficha de anamnese somente com dados fictícios nesta homologação; sem aprovação clínica automática. Produção com dados reais depende de concluir privacidade, termos e retenção.
- Vídeo de apresentação real ainda não foi enviado. `WelcomePresentation.jsx` está preparado, mas não é ativado sem `VITE_WELCOME_VIDEO`. Preservar o vídeo de resultados v4 existente.

## Cuidados ao trabalhar

- O usuário não entende de Git nem de terminal: execute você mesmo os comandos, explique resultados em linguagem simples e peça só o que depender dele (login no navegador, dados de conta). Antes de qualquer coisa que altere Supabase, Cloudflare ou envios de e-mail, explique e espere aprovação.
- Git: branch `main`, repositório privado `clinicatorricelli-rgb/clinica-torricelli` no GitHub (primeiro commit em 09/11/2026). Não executar limpeza/reset que apague trabalho; `artifacts/` e outros arquivos ignorados existem só no computador do escritório.
- **Publicação automática:** todo push/merge em `main` roda `.github/workflows/publicar-site.yml` (testes locais → build `staging` conectado → `scripts/check-bundle.mjs` → `wrangler pages deploy` no projeto existente `clinica-torriceli-previa`, mesmo endereço). Pull requests só testam e montam, sem publicar. Portanto: trabalhar em branch + PR e só mesclar em `main` o que pode ir ao ar. Voltar versão: painel do Cloudflare Pages → Deployments → Rollback. O fluxo publica apenas o frontend; não altera banco, funções, Auth ou e-mails.
- Sessões na nuvem não têm `artifacts/`, login da CLI Supabase nem do Wrangler. **Desde 13/11 há um token pessoal do Supabase salvo nas configurações da nuvem** (salvo pelo usuário no formulário seguro; nunca aparece para o agente): a Management API (`api.supabase.com`, projeto `zpgzndrgsvynfomjqods` = `clinica-torriceli-testes`, `sa-east-1`) permite ler o estado, aplicar migrações e publicar funções daqui, sempre com aprovação prévia. Aplicar migração: bloco `do` com `execute` da migração + `insert` em `supabase_migrations.schema_migrations` (versão = prefixo do arquivo), para ser tudo-ou-nada e manter o histórico igual ao da CLI; ensaiar antes com o mesmo bloco terminando em `raise exception`. A conexão de leitura (`/database/query/read-only`) não executa funções `security definer`; para conferências use `/database/query` só com `select`. O Postgres direto (TCP) não passa pelo proxy desta nuvem.
- Nunca imprimir/copiar senhas, tokens, QR/códigos MFA, service-role, SMTP, payloads privados ou dados clínicos para chat, logs, bundle ou documentação. `VITE_*` contém somente configuração pública.
- Metadados do projeto correto ficam em `artifacts/project-create-response.json`, ignorado pelo Git. Validar nome `clinica-torriceli-testes` e região `sa-east-1` antes de qualquer mutação remota. Existe outro projeto inicial em outra região: preservá-lo.
- Nove migrações aplicadas no hospedado (a nona, `202611130001`, em 13/11 pela Management API). Alterações novas exigem migração nova. Conflitos de ficha são `PT409`/HTTP409; não regredir para `40001`.
- NÃO executar `node scripts/test-hosted.mjs` sem argumentos por enquanto. O teste de disponibilidade padrão publica eventos reais e não isola o cron de e-mails ativo; pode enfileirar avisos e deixar FKs de limpeza. Corrigir esse isolamento antes da suíte remota completa. Os testes locais não usam rede.
- `scripts/provision-email-notifications.mjs` modifica Vault/cron e habilita envios; não é uma consulta de diagnóstico.
- Não fazer push de `supabase/config.toml` local sobre o serviço hospedado. A configuração hospedada usa hook de cadastro e SMTP privado que devem ser preservados.

## Comandos iniciais

```powershell
node --test tests/*.test.mjs
node node_modules/vite/bin/vite.js --host 127.0.0.1
```

Última validação registrada: 59 testes locais passaram em 13/11 (eram 48); teste real Auth/PostgREST da ficha e smoke SQL com rollback passaram. O handoff apenas inspecionou os arquivos, sem reexecutar testes ou alterar serviços remotos.

Para histórico técnico, comandos de build/deploy, modelo dos dados, pendências e roteiro de continuidade, use `docs/HANDOFF-CLAUDE-CODE.md`.
