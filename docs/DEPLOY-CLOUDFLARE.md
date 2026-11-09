# Prévia publicada — 04/11/2026

**Publicação automática — 09/11/2026:** deploys passam a sair do GitHub Actions (`.github/workflows/publicar-site.yml`) a cada push em `main`, no mesmo projeto e endereço. Detalhes em `HANDOFF-CLAUDE-CODE.md` §15. As instruções manuais abaixo são históricas/emergência.

**Ficha e menu — 06/11/2026:** https://4484cbf7.clinica-torriceli-previa.pages.dev/ ; bundle `index-BPV7Af5X.js`, HTTP200 e hash verificados. Cliente encontra ficha de extensão de cílios em Minha conta, admin/MFA encontra a parte técnica, botão Eduarda restrito à sessão autorizada. Homepage reorganizada. Vídeo inicial aguardando gravação; nenhuma mídia de apresentação inventada. `FICHA-CLIENTE.md` registra 48 testes locais e validação real da API, conflitos409 e acesso cruzado negado. Novas migrações aplicadas somente na homologação dedicada.

**Avisos por e-mail — 05/11/2026:** painel com estado/contagens e página de descadastro publicados em https://73a64f35.clinica-torriceli-previa.pages.dev/ . URL estável mantida; bundle `index-BmR0lXO7.js` confirmado por HTTP/hash. Backend da fila/função/agendamento pronto, sem chave Resend do módulo de avisos e sem envio real. Ver `AVISOS-EMAIL.md` para a pendência e verificações.

**Atualização 05/11/2026:** prévia agora conectada ao banco de testes, com disponibilidade/bloqueios, SMTP próprio e cadastro de cliente restrito por hook no servidor. Último deployment https://636d845e.clinica-torriceli-previa.pages.dev/ ; URL estável preservada. Homepage e bundle verificados por HTTP/hash; CSP e noindex presentes. Ver `CADASTRO-TESTES.md`. As instruções de build demo e limitações de backend abaixo são o registro histórico da primeira publicação. Não houve nova QA visual automatizada.

Revisão mais recente: v4 com maior preenchimento, autoplay sem controle sobreposto e fontes mais encorpadas. Deployment https://5d5e49ef.clinica-torriceli-previa.pages.dev/ . Ver `VIDEO-V4.md`.

Atualização de mídia: v3 reenquadrada e republicada; deployment atual https://932955fd.clinica-torriceli-previa.pages.dev/ . Ver `VIDEO-V3.md` para a correção, screenshots e verificação do hash do asset público. Os detalhes de v2 abaixo são históricos da primeira publicação.

URL estável: https://clinica-torriceli-previa.pages.dev/

Deployment desta versão: https://0abac169.clinica-torriceli-previa.pages.dev/

Projeto Cloudflare Pages separado: `clinica-torriceli-previa`, branch main, upload estático por Wrangler oficial 4.157.0. OAuth autorizado pelo próprio usuário. Sem compra de plano/domínio, sem criação de conta adicional e sem configuração de backend. Nenhuma credencial no relatório/projeto. Credenciais do Wrangler permanecem sob gerenciamento da ferramenta oficial no perfil local, fora do repositório.

## Publicação e continuidade

Wrangler atual tentou delegar a criação de Pages para Workers; a tentativa não publicou nem modificou a configuração da aplicação. Foi utilizada a opção oficial `pages project create ... --force` para criar diretamente no Pages conforme autorizado. A opção é necessária somente na criação; não repetir em comandos de deploy. Projeto existente não deve ser recriado. Não é um Worker nem Site de outro provedor.

```powershell
node node_modules/vite/bin/vite.js build --mode demo
node node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name clinica-torriceli-previa --branch main --commit-dirty=true
```

Sem commits locais neste projeto, Wrangler emitiu aviso sobre HEAD ausente, mas concluiu upload e deployment com exit 0. Não foi criado commit artificial nem feito push. Deploys futuros devem preservar build demo até integração de produção ser explicitamente concluída. Usar o endereço estável para revisão; hash de deployment muda a cada versão. Direct Upload não ativa deploy automático por Git.

## Verificado no endereço público

- Homepage HTTPS HTTP 200, rota profunda `/minha-conta` HTTP 200 servindo a SPA (não é ainda uma rota funcional de conta com estado persistente; a navegação atual é interna).
- JS e CSS HTTP 200 com MIME corretos; vídeo v2 HTTP 200, MIME video/mp4, 412.788 bytes.
- `X-Robots-Tag: noindex, nofollow, noarchive`, meta robots, CSP e `X-Content-Type-Options: nosniff` presentes na resposta pública. Noindex orienta buscadores; não é controle de acesso: esta prévia é pública.
- Navegador no domínio público: catálogo com 23 opções, Minha conta com campos desabilitados, área administrativa sem dados expostos, vídeo carregado sem erro (readyState 4), mudo/pausa funcionando.
- Viewport 390×844: apresentação responsiva sem overflow horizontal. Captura real `docs/qa/public-mobile.jpg`; override do navegador removido após QA.
- Bundle corresponde ao build demo testado; marcadores de URL/chave fictícias do teste de variáveis não estão presentes. Supabase desconectado por build, nenhuma reserva, cobrança ou mensagem real. Nenhum dado privado de cliente incluído.

## Limites

Teste feito em navegador de desktop com viewport mobile, não em aparelho físico nem rede móvel do usuário. Supabase Auth/REST/Storage, gateway e notificações continuam fora desta publicação; cadastro/login/recovery reais desativados. Tela de preferências autenticada não é acessível nesta demo. Não houve benchmark de rede celular ou teste de carga. O aviso visual ainda diz "Demonstração local" por ser o texto herdado da base; a URL é pública, backend está desligado. Textos e identidade poderão ser refinados na revisão.
