# Clínica Torricelli — contexto para continuar

Leia primeiro `docs/HANDOFF-CLAUDE-CODE.md`. Ele consolida o estado da implementação e as decisões desta conversa. Alguns trechos antigos do README e de `docs/` descrevem etapas já superadas.

## Estado essencial

- Projeto existente em React/Vite + Supabase/Postgres/Auth/Storage; frontend publicado no Cloudflare Pages. Preservar essa infraestrutura.
- URL estável: https://clinica-torriceli-previa.pages.dev/ . Última publicação validada em 09/11/2026, a primeira feita pelo GitHub Actions (commit `ceceb10`): https://0af4593a.clinica-torriceli-previa.pages.dev/ , com bundle `index-BPV7Af5X.js` idêntico ao da publicação manual de 06/11 (4484cbf7); HTTP200, CSP, noindex e vídeo v4 conferidos.
- Administração por associação confiável de UUID + MFA/AAL2; menu Eduarda só para a sessão administrativa. Nunca conceder papel por e-mail, metadata ou parâmetro do navegador.
- Disponibilidade, rascunhos/publicação, bloqueios, cadastro controlado, ficha de extensão de cílios e avisos de novas vagas por e-mail implementados.
- O usuário confirmou recebimento real dos avisos por e-mail. O cron de envio deve ser tratado como ativo até checagem privada em contrário.
- WhatsApp ainda NÃO integrado. App Meta criado, portfólio empresarial bloqueado temporariamente por perfil Facebook novo na última tentativa. Não registrar o número real sem conferir o atendimento manual + API/Coexistência.
- Reservas NÃO operacionais: `booking_enabled=false` é protegido por CHECK. **Decisão de 11/11/2026: nenhum pagamento no agendamento; o sinal de 30% foi extinto.** No lugar, regra aceita antes de agendar: aviso com menos de 24 h ou falta sem justificativa gera taxa de 30% do serviço, cobrada depois; aviso com mais de 24 h permite remanejar. Banco e testes ainda seguem o desenho antigo do sinal (`deposit_cents`, `held`, `hold_minutes`, `payments`); mudar só por migração nova. Regra, pontos em aberto e recomendações no topo de `docs/DECISOES.md`. Consulta de horários não reserva atendimento.
- Ficha de anamnese somente com dados fictícios nesta homologação; sem aprovação clínica automática. Produção com dados reais depende de concluir privacidade, termos e retenção.
- Vídeo de apresentação real ainda não foi enviado. `WelcomePresentation.jsx` está preparado, mas não é ativado sem `VITE_WELCOME_VIDEO`. Preservar o vídeo de resultados v4 existente.

## Cuidados ao trabalhar

- O usuário não entende de Git nem de terminal: execute você mesmo os comandos, explique resultados em linguagem simples e peça só o que depender dele (login no navegador, dados de conta). Antes de qualquer coisa que altere Supabase, Cloudflare ou envios de e-mail, explique e espere aprovação.
- Git: branch `main`, repositório privado `clinicatorricelli-rgb/clinica-torricelli` no GitHub (primeiro commit em 09/11/2026). Não executar limpeza/reset que apague trabalho; `artifacts/` e outros arquivos ignorados existem só no computador do escritório.
- **Publicação automática:** todo push/merge em `main` roda `.github/workflows/publicar-site.yml` (testes locais → build `staging` conectado → `scripts/check-bundle.mjs` → `wrangler pages deploy` no projeto existente `clinica-torriceli-previa`, mesmo endereço). Pull requests só testam e montam, sem publicar. Portanto: trabalhar em branch + PR e só mesclar em `main` o que pode ir ao ar. Voltar versão: painel do Cloudflare Pages → Deployments → Rollback. O fluxo publica apenas o frontend; não altera banco, funções, Auth ou e-mails.
- Sessões na nuvem (celular/claude.ai) não têm `artifacts/`, login da CLI Supabase nem do Wrangler. Nelas, editar código, rodar testes locais e abrir PR; migrações, funções e scripts do Supabase continuam exigindo o computador do escritório (ou um fluxo próprio a ser criado com aprovação).
- Nunca imprimir/copiar senhas, tokens, QR/códigos MFA, service-role, SMTP, payloads privados ou dados clínicos para chat, logs, bundle ou documentação. `VITE_*` contém somente configuração pública.
- Metadados do projeto correto ficam em `artifacts/project-create-response.json`, ignorado pelo Git. Validar nome `clinica-torriceli-testes` e região `sa-east-1` antes de qualquer mutação remota. Existe outro projeto inicial em outra região: preservá-lo.
- Oito migrações já foram aplicadas. Alterações novas exigem migração nova. Conflitos de ficha são `PT409`/HTTP409; não regredir para `40001`.
- NÃO executar `node scripts/test-hosted.mjs` sem argumentos por enquanto. O teste de disponibilidade padrão publica eventos reais e não isola o cron de e-mails ativo; pode enfileirar avisos e deixar FKs de limpeza. Corrigir esse isolamento antes da suíte remota completa. Os testes locais não usam rede.
- `scripts/provision-email-notifications.mjs` modifica Vault/cron e habilita envios; não é uma consulta de diagnóstico.
- Não fazer push de `supabase/config.toml` local sobre o serviço hospedado. A configuração hospedada usa hook de cadastro e SMTP privado que devem ser preservados.

## Comandos iniciais

```powershell
node --test tests/*.test.mjs
node node_modules/vite/bin/vite.js --host 127.0.0.1
```

Última validação registrada: 48 testes locais passaram; teste real Auth/PostgREST da ficha e smoke SQL com rollback passaram. O handoff apenas inspecionou os arquivos, sem reexecutar testes ou alterar serviços remotos.

Para histórico técnico, comandos de build/deploy, modelo dos dados, pendências e roteiro de continuidade, use `docs/HANDOFF-CLAUDE-CODE.md`.
