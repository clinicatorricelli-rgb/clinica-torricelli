# Clínica Torricelli — homologação

**Ficha e navegação — 06/11:** ficha baseada no PDF recebido, revisão por cliente, parte técnica restrita a Eduarda/MFA e histórico protegido. Homepage reorganizada; menu administrativo visível só para a conta autorizada. Tudo em homologação com dados fictícios. Ver [ficha e validação](docs/FICHA-CLIENTE.md). Estrutura de apresentação inicial preparada, aguardando o vídeo real; [roteiro sugerido](docs/APRESENTACAO-EDUARDA.md). Atendimento WhatsApp comercial/manual, boas-vindas e lembretes na véspera/duas horas antes estão [especificados](docs/ATENDIMENTO-WHATSAPP.md), ainda sem ativação na Meta.

**Avisos por e-mail validados:** chave configurada pelo usuário; publicação real da manhã de segunda gerou avisos aceitos pelo Resend, e o usuário confirmou recebimento. Um aviso por cliente/dia, das 8h às 20h. Webhook de entrega/bounce permanece pendente de configuração. Ver [operação e validação](docs/AVISOS-EMAIL.md). Próxima etapa: WhatsApp oficial; usuário informou ainda não ter um número para a clínica.

**Nova entrega:** [disponibilidade, rascunhos/publicação, bloqueios e ficha essencial](docs/AGENDA-DISPONIBILIDADE.md) publicados e testados no Supabase hospedado. Consulta de horários disponível; reservas/pagamentos e envio de avisos ainda não.

**Estado atual:** homologação conectada ao Supabase de testes em São Paulo. Acesso administrativo com segundo fator e entrega de e-mail pelo SMTP Resend confirmados pelo usuário. Cadastro de cliente liberado somente para endereços previamente autorizados por hook no servidor; reservas e pagamentos seguem fechados. Ver [cadastro de testes e validação pendente pelo usuário](docs/CADASTRO-TESTES.md) e [integração validada e limites](docs/INTEGRACAO-VALIDADA.md).

Prévia pública conectada ao banco de testes: https://clinica-torriceli-previa.pages.dev/ . O domínio próprio está verificado para envio de e-mail; a prévia continua no Cloudflare Pages.

Base em React/Vite + Supabase Auth/Postgres. Sem configuração, a interface mostra uma demonstração identificada. Disponibilidade e bloqueios funcionam em homologação. Não há gateway ou cobranças.

## Executar

Node 22.12+ ou 24 e pnpm. Nesta máquina o pnpm está no runtime do Codex e não no PATH:

```powershell
node C:/Users/LUCASCORTS/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs install --frozen-lockfile
node node_modules/vite/bin/vite.js --host 127.0.0.1
```

Em um ambiente com pnpm no PATH: `pnpm install --frozen-lockfile` e `pnpm dev`. Abrir http://127.0.0.1:5173. A demonstração não exige `.env`. Copiar `.env.example` para `.env.local` apenas ao configurar Supabase. URL e publishable/anon key são públicas; nunca usar service-role, senha do banco ou segredo do gateway em variáveis `VITE_*`.

```powershell
node --test tests/*.test.mjs
node node_modules/vite/bin/vite.js build
```

Saída: `dist/`, compatível com Cloudflare Pages. O arquivo `public/_headers` aplica CSP e cabeçalhos quando servido pelo Pages; Vite não simula esses cabeçalhos. Para o cadastro controlado conectado: `node scripts/build-staging.mjs --signup-test`, preservando o hook no servidor. Publicação via Wrangler; ver os registros de entrega em `docs/`.

## Conteúdo e decisões

- Catálogo canônico: `src/catalog.mjs`, 23 opções, dinheiro em centavos, sinal 30% com arredondamento meio para cima. Para atualizar seed antes de aplicar a primeira instalação: `node scripts/seed.mjs`. Em bancos já migrados, criar NOVA migração.
- Autenticação: cadastro com confirmação de e-mail, entrada, recuperação PKCE, nova senha e saída. Somente e-mail obrigatório; nome opcional. Não há tabela de senhas própria.
- Conta: alteração apenas do próprio nome e leitura dos próprios agendamentos. Operações financeiras e criação/alteração de reservas não têm permissões de escrita pelo navegador.
- Administração: conta explicitamente autorizada por operador confiável + TOTP/AAL2. Navegação e preparação do autenticador implementadas; operação da agenda, catálogo e bloqueios virá na etapa 2.
- Banco: migrações versionadas, RLS e grants por coluna; arquivos privados separados da galeria pública. Exclusão GiST impede reservas/retensões/bloqueios sobrepostos para a única profissional.
- Vídeo v2 integrado em `public/media/abertura-v2.mp4`, preservando a origem. Compacto, cantos arredondados, loop sem áudio e controle de pausa. Não inicia automaticamente com movimento reduzido. CTA independente da reprodução. `.env` pode substituir o caminho por mídia local aprovada.

Veja [decisões e regras](docs/DECISOES.md), [configuração e segurança](docs/OPERACAO.md) e [evidências e limites](docs/VALIDACAO.md).

Avisos de novas vagas: preferências opcionais por e-mail/WhatsApp em Minha conta, ambos desligados inicialmente, com histórico de consentimento e RLS. Nenhum envio conectado. Veja o [contrato de notificações e fila futura](docs/NOTIFICACOES.md).
