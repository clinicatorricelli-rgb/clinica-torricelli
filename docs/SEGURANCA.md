# Segurança — auditoria de 16/11/2026

O usuário mandou dois vídeos (Instagram): "7 portas que ficam abertas em sites feitos com IA" e "ataque DDoS: filtrar antes com Cloudflare e Turnstile". Cada ponto foi conferido no site publicado e no Supabase hospedado, só com leituras e chamadas que não alteram nada.

## Resultado por ponto

| Ponto do vídeo | Situação | Como foi conferido |
| --- | --- | --- |
| 1. Chave secreta no código do navegador | Fechado | Código publicado varrido: só a chave publicável (`sb_publishable_…`). `scripts/check-bundle.mjs` barra a publicação se aparecer chave secreta, token, segredo de webhook ou chave privada. Histórico do Git varrido: o único `whsec_` é o vetor público de teste da Svix. |
| 2. Supabase sem RLS | Fechado | As 19 tabelas de `public` têm RLS. Como visitante sem login, cada tabela respondeu "permission denied", menos `services` e `booking_rules` (catálogo e texto da regra, públicos de propósito). |
| 3. `.env` publicado | Fechado | 18 caminhos sensíveis (`/.env`, `/.git/config`, `/supabase/config.toml`, `/artifacts/…` etc.) devolvem a página inicial. Só `dist/` vai ao ar e não há mapas de código-fonte. |
| 4. Login que só confere no navegador | Fechado | Toda permissão é decidida no banco (RLS e funções). Funções da Eduarda conferem `private.is_admin()` (papel + segundo fator) por dentro. |
| 5. Número na URL (pedido de outra pessoa) | Fechado | Identificadores são UUID aleatórios e o banco só devolve o que é da própria cliente (testado em `tests/reservations.test.mjs`). |
| 6. Formulário sem limite | Era parcial; corrigido no código | Cadastro fechado por lista e limites do Supabase (30 e-mails/hora). Faltava proteção contra robôs: alguém podia gastar o limite de e-mails com "Recuperar senha". Turnstile preparado (abaixo). |
| 7. Painel escondido, não trancado | Fechado | Visitante sem login recebe "permission denied" nas funções da Eduarda; logada sem segundo fator, "Admin MFA required". |
| Vídeo 2: proxy da Cloudflare | Fechado | O site está no Cloudflare Pages e o registro do domínio usa proxy (nuvem laranja). Os registros de e-mail ficam sem proxy, como devem. |
| Vídeo 2: IP da origem exposto | Não se aplica | Não há servidor próprio: o site é estático no Cloudflare. O endereço do Supabase é público por desenho e protegido por RLS, não por esconder. |
| Vídeo 2: Turnstile | Corrigido no código | Ver abaixo. |

## Publicado em 16/11/2026

Com aprovação do usuário: PR #3 mesclado (`cf506c6`), site com o bundle `index-yPqdcdCc.js` nos dois endereços, já com `Strict-Transport-Security` e a CSP nova. Migração `202611160001` aplicada pela Management API, depois de um ensaio que não gravou nada. Conferido como visitante sem login: as duas funções agora respondem "permission denied", e `available_slots` e `booking_info` continuam respondendo. O conselheiro de segurança do Supabase caiu de 36 para 34 apontamentos. No navegador, o site novo carrega sem erro.

Achado na conferência: a Cloudflare tenta injetar o contador de visitas (`static.cloudflareinsights.com`, Web Analytics automático da zona), e a CSP bloqueia. O bloqueio já acontecia com a CSP anterior e não afeta o site. Para sumir o aviso no console, o usuário pode desligar o Web Analytics automático no painel. Liberar na CSP exigiria citar mais um terceiro no aviso de privacidade.

## Ajustes feitos

- **Turnstile** (`src/Turnstile.jsx`): login, cadastro e "Recuperar senha" pedem um token de uso único, que segue para o Supabase em `captchaToken`. Roda escondido (`interaction-only`) e só carrega com `VITE_TURNSTILE_SITE_KEY`; sem ela, nada muda. Conferido em navegador com a chave de teste da Cloudflare (`1x00000000000000000000AA`): token enviado no login e na recuperação, sem violação de CSP e sem rolagem lateral no celular.
- **Cabeçalhos** (`public/_headers`): `Strict-Transport-Security` de 1 ano; CSP só conversa com o projeto Supabase da clínica (antes `*.supabase.co`) e libera `challenges.cloudflare.com` apenas para o Turnstile. `check-bundle` falha se a CSP não liberar o endereço do Supabase da montagem. Testes em `tests/security-headers.test.mjs`.
- **Banco** (`202611160001_restrict_anon_helpers.sql`, ainda não aplicada): tira do visitante sem login duas funções que ele alcançava sem necessidade (`has_admin_role`, `set_availability_alert_preference`). Nenhuma das duas vazava dados. `tests/anon-access.test.mjs` reproduz as permissões padrão do Supabase e confere que o visitante só alcança `available_slots` e `booking_info` e só lê `services` e `booking_rules`. Sem a migração, o teste falha do mesmo jeito que o hospedado está hoje.
- Teste noturno corrigido: `tests/reservations.test.mjs` usava a data UTC como "hoje" e falhava entre 21 h e meia-noite em São Paulo.

## Para ligar o Turnstile (nesta ordem)

1. O usuário cria o widget no Cloudflare (Turnstile → Add widget), modo **Managed**, com os domínios `clinicatorricelli.com.br` e `clinica-torriceli-previa.pages.dev`.
2. A chave do site (pública) entra em `VITE_TURNSTILE_SITE_KEY`, no `env` de `.github/workflows/publicar-site.yml`, e o site é publicado.
3. Só depois disso o usuário cola a chave secreta no Supabase (Authentication → Attack Protection → captcha Turnstile). Se o Supabase exigir captcha antes de o site enviar os tokens, ninguém consegue entrar.
4. Com o captcha ligado, `scripts/test-hosted.mjs` e os testes de integração que fazem login direto pela API passam a ser recusados. Desligar o captcha durante esses testes ou usar a chave secreta de teste da Cloudflare.

## Ficou de fora, com motivo

- Proteção contra senhas vazadas (HaveIBeenPwned): só no plano pago do Supabase. A senha mínima continua com 12 caracteres.
- `btree_gist` no schema `public` (aviso do Supabase): mover a extensão pode quebrar a exclusão que impede dois agendamentos no mesmo horário.
- Os 27 avisos de "função security definer executável" são o desenho: cada função confere quem chama.
- Versão mínima de TLS 1.0 e "Always Use HTTPS" desligado na zona Cloudflare: o Pages já redireciona HTTP para HTTPS. Subir o TLS mínimo para 1.2 é recomendado, mas só o usuário pode mudar no painel, porque o token da nuvem só lê.
