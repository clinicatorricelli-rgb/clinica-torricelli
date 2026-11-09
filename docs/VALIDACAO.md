# Verificação realizada — 04/11/2026

Complemento: terceira migração de preferências de avisos aplicada e testada no PostgreSQL embarcado, dentro da suíte de 8 testes. Novas verificações de consentimento, revogação e isolamento descritas em `NOTIFICACOES.md`. A referência a duas migrações abaixo corresponde à primeira entrega, antes desse complemento.

## Executado e aprovado

- Instalação com lockfile por pnpm; somente build do esbuild autorizado em `pnpm-workspace.yaml`.
- `node --test tests/*.test.mjs`: **8 testes passaram**, zero falhas, zero skips. Inclui catálogo/seeds/sinal e regras de disponibilidade com liberação pontual, sábado 18h, domingo, bloqueio prioritário e nenhuma abertura automática após 05/12.
- PostgreSQL embarcado PGlite: as duas migrações reais aplicadas sem alteração. Usados schemas mínimos de Auth/Storage simulados. Duas contas fictícias; leitura/alteração cruzada negadas; alteração do UUID e inserção de papel negadas; mutações financeiras/agenda negadas; próprio nome atualizável; auditoria sem conteúdo do perfil; arquivo de outra cliente invisível; upload privado negado; catálogo anônimo legível; dados privados anônimos negados. Admin AAL1 negado e AAL2 permitido. Sobreposição de reservas e atendimento fora dos limites/sábado/domingo rejeitados pelo banco.
- `node node_modules/vite/bin/vite.js build`: build de produção aprovado. Bundle JS ~235 KB bruto/~74 KB gzip; vídeo ~0,39 MB; não é benchmark de carregamento em rede móvel.
- Navegador real na URL local: home → catálogo, 23 opções; busca Capping retorna 4; conta, criar conta e recovery mostram formulários desabilitados sem backend; Eduarda não mostra dados sem sessão. Navegação via Tab/Enter até Serviços, outline de foco 3px verificado. Vídeo v2 reproduz em loop sem áudio; pausar troca o controle para reproduzir. Homepage pública não contém campos privados nem dados de contas. Em modo demonstração não há dados remotos para inspecionar.
- Viewport solicitado 390×844: vídeo de 330×150 CSS px, raio 20 px; CTA acima de 821 px; largura de conteúdo 375 px (scrollbar), sem overflow horizontal. Captura desktop no topo com viewport 1280×950. Overrides do navegador removidos após QA.

Capturas reais: `docs/qa/home-desktop.jpg` e `docs/qa/home-mobile.jpg`. A versão anterior da captura desktop foi substituída pela captura no topo completo. Mídia aprovada para integração recebida da conversa principal: v2; v1 não utilizada.

## Não executado / limites

Sem credenciais de Supabase ou Docker/CLI disponíveis nesta máquina. `node --test tests/integration.mjs` resultou em **1 teste SKIP**, pois variáveis de conexão não existem. Não representa aprovação da integração real. PGlite verifica SQL, grants, triggers e RLS num motor Postgres, mas os helpers Auth/Storage são simulados, não os serviços reais. Nenhum login remoto, e-mail, confirmação, recovery completo, TOTP real, refresh/revogação de sessão, PostgREST ou download Storage foi validado ponta a ponta.

Movimento reduzido tem proteção na implementação (`autoPlay` condicionado à preferência do navegador e CSS sem animação), mas não foi alternada a configuração do sistema durante QA. CSP e demais `_headers` não são aplicados pelo servidor Vite; precisam de homologação no Pages. Não houve teste de carga, auditoria externa nem benchmark de acessibilidade completo. Build não prova segurança.

## Reproduzir integração completa quando houver serviço local

Instalar Docker e Supabase CLI oficiais; `supabase start` e `supabase db reset` em ambiente LOCAL descartável. Usar credenciais emitidas por `supabase status` em variáveis temporárias do shell, nunca em Git, prints ou `VITE_*`:

```powershell
# Preencher somente valores LOCAIS; não colar segredos em logs ou documentação.
$env:TEST_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:TEST_SUPABASE_ANON_KEY = '<anon-local>'
$env:TEST_SUPABASE_SERVICE_ROLE_KEY = '<service-role-local>'
node --test tests/integration.mjs
# Limpar as variáveis da sessão depois do teste.
Remove-Item Env:TEST_SUPABASE_SERVICE_ROLE_KEY
```

O teste recusa URLs fora de localhost, cria duas contas com endereços `example.test`, verifica acesso REST direto e apaga fixtures ao terminar. Só usa contas fictícias. Complemento SQL: `psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/admin_rls.sql` testa associação administrativa e AAL1/AAL2 com rollback. Em homologação, testar também MFA real, recuperação e URLs de Storage diretamente; não confiar só no menu oculto.

Checklist manual conectado: criar duas clientes; confirmar e-mail; sair/entrar; erro de senha sem enumeração de conta; pedir recovery; abrir link no mesmo navegador; atualizar senha; confirmar sessão antiga revogada conforme configuração; confirmar link expirado; promover conta fictícia de admin via SQL confiável; testar leitura administrativa AAL1 negada pela REST; configurar TOTP, verificar AAL2 e repetir; usuário sem papel com AAL2 continua sem acesso; leitura de arquivo privado alheio negada por download e signed URL; galeria pública contém só mídia autorizada. Registrar resultados antes de clientes reais.

## Próxima etapa

Agenda visual por data e horários, edição administrativa de disponibilidade com conflitos, retenção/expiração, remarcação e gateway não estão operacionais. O cálculo puro e as constraints testadas nesta entrega são a base, não um fluxo de reserva concluído. Prazo de retenção e provedor ainda precisam ser definidos. Documentação de setup, fontes e recuperação em `OPERACAO.md`.
