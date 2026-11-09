# Pacote de prévia pública — aguardando plataforma

**Atualização:** plataforma mantida em Cloudflare Pages; publicação posteriormente autorizada e concluída em https://clinica-torriceli-previa.pages.dev/ . Este arquivo preserva o preparo anterior. Estado e verificações atuais em `DEPLOY-CLOUDFLARE.md`.

O usuário autorizou publicar a demonstração para acesso no celular em outra rede. A escolha final entre manter Cloudflare Pages ou usar Render ainda está sendo confirmada na conversa principal. Nenhum serviço, conta, plano ou domínio criado; nenhuma publicação feita nesta preparação.

## Pacote independente do provedor

`pnpm build:demo` (equivalente: `node node_modules/vite/bin/vite.js build --mode demo`) gera `dist/`, site estático sem backend operacional. `vite.config.js` força Supabase desconectado e elimina URL/chave do build de demonstração, mesmo que o ambiente tenha variáveis configuradas. Mídia v2 local fixa. A interface mantém o aviso de demonstração e cadastros, login, recovery, reservas e cobranças reais indisponíveis. O build comum continua preparado para a futura integração local/autorizada; para a prévia pública, usar SEMPRE build:demo.

Pacote ZIP local gerado em `artifacts/clinica-torriceli-demo.zip`, contendo apenas o conteúdo de `dist/`. Não contém fontes, `.env`, credenciais, node_modules, testes ou dados de clientes. Pasta artifacts é ignorada pelo Git. Regerar o pacote após mudanças no código.

## Rotas e headers

A navegação atual é interna à SPA; nenhum endpoint de backend deve ser criado no host estático. `public/_redirects` é copiado ao build e define fallback de rotas para index.html nos hosts compatíveis. Os arquivos estáticos existentes devem ter precedência sobre o fallback; preservar MIME de JS/CSS/vídeo, não reescrever assets ausentes silenciosamente se o provedor permitir regra mais restrita.

`public/_headers` contém CSP, proteção contra framing, nosniff, política de referrer e restrição de câmera/microfone/localização. São arquivos de configuração, não uma garantia de aplicação automática em todo provedor. Cloudflare Pages os reconhece; em outro host, transcrever as mesmas regras para a configuração nativa e verificar respostas HTTPS depois da publicação. Não remover CSP para contornar erros sem entender a causa. Fontes vêm de Google Fonts; vídeo e código são locais.

## Necessário após confirmar o provedor

- Acesso à conta do próprio usuário e um projeto/site estático; não criar identidade inventada, comprar plano nem aceitar termos em nome dele sem autorização apropriada.
- Upload do pacote ou conexão ao repositório autorizado. Com build no provedor: instalar dependências pelo lockfile, executar `pnpm build:demo`, publicar a pasta `dist`. Não configurar service-role nem segredos; a prévia não necessita Supabase.
- Se Render for escolhido, usar Static Site para o frontend; configurar rewrite SPA e headers no mecanismo nativo do serviço, conforme a documentação vigente. Não transformar este frontend estático em Web Service. A decisão não muda o backend futuro Supabase.
- Se Cloudflare for mantido, usar Pages com saída dist e build de demonstração. Não usar Sites como substituição silenciosa.
- Depois do deploy autorizado: testar URL HTTPS pelo celular/fora da rede local; rotas, assets e vídeo; aviso de demonstração; formulários desativados; cabeçalhos HTTP realmente aplicados; ausência de chamadas Auth/REST/Storage; teclado e modo de movimento reduzido. O build local não comprova esses comportamentos no host.

## Estado e limites

Verificação desta preparação: build `--mode demo` passou inclusive com URL/chave Supabase FICTÍCIAS no ambiente; os marcadores fictícios não aparecem no bundle e o aviso de demonstração permanece. ZIP inspecionado: somente index, assets, mídia e configurações estáticas. A validação do host remoto e de seus headers ainda não foi executada.

Servidor LAN iniciado para a tentativa anterior foi encerrado; nenhuma regra de firewall, túnel ou roteador foi criada. URL de rede local antiga não é o endereço da futura publicação. Credenciais, fila de notificações, pagamentos e dados reais continuam ausentes. O teste remoto aguardará a escolha do provedor e a publicação efetiva.
