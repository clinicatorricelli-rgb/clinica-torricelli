# Correção de enquadramento — 04/11/2026

Publicado no mesmo endereço https://clinica-torriceli-previa.pages.dev/ . Deployment: https://932955fd.clinica-torriceli-previa.pages.dev/ . Backend continua desconectado em build demo; noindex preservado.

## Causa e correção

A montagem v2 preenchia um quadro horizontal por recorte, usava zoompan nas fotos e cortava vídeos verticais em uma faixa estreita. O CSS adicionava outro corte com object-fit cover em um retângulo ainda mais largo. Corrigir só o CSS não recuperaria os pixels já removidos do vídeo.

Nova v3 recomposta diretamente das fontes reais com FFmpeg/Pillow em `scripts/video-v3.py`. Sem IA, retoque dos resultados ou zoom animado. Fotografias preservam olhos/lábios inteiros, removendo apenas bordas com elementos de captura. Execuções mantêm toda a largura de origem e uma faixa vertical ampla do procedimento, sem incluir corpo/ambiente informal. Escala proporcional com redução e margens sólidas da paleta; nenhum preenchimento por crop do quadro final. Dois trechos de execução de 1,7s e três resultados de 3,4s cada (13,6s, maioria dedicada aos resultados). Sem áudio; metadados da origem não transferidos. Fontes e versões anteriores preservadas.

Arquivo `public/media/abertura-v3.mp4`: 960×480, 25fps, 349.650 bytes. Novo nome elimina colisão com cache do asset v2. Poster dedicado `abertura-v3-poster.jpg`. Player usa contain, centro 50%/50%, sem transform, proporção 2:1. No viewport 390×844: vídeo 330×165 CSS px, CTA termina em ~836px, sem overflow horizontal. Desktop: 450×225. Cantos arredondados, controle de pausa e movimento reduzido preservados.

## Verificação efetiva

- Inspeção visual das fontes e de 10 quadros extraídos da v3 (dois por cena) em `artifacts/video-v3/v3-all-scenes.jpg`: assunto central e íntegro nos resultados; procedimento visível nas execuções.
- Decodificação completa FFmpeg sem erro; build demo aprovado.
- Deploy por Wrangler concluído exit 0. Homepage pública HTTP 200 aponta para bundle novo, vídeo HTTP 200. SHA256 dos bytes servidos idêntico ao arquivo local v3; noindex permanece na resposta.
- No navegador do endereço público, viewport mobile e desktop: vídeo v3 carregado, dimensões intrínsecas 960×480, readyState 4, sem erro de mídia, contain centralizado e transform none. Pausar/reproduzir testado. Inspeção visual no player real, além dos quadros.
- Capturas reais: `docs/qa/public-mobile-v3.jpg` e `docs/qa/public-desktop-v3.jpg`. Overrides removidos ao terminar.

Limites: não é teste em aparelho físico do usuário nem melhoria da definição que não existe nas fontes. O enquadramento menor preserva conteúdo, com margens deliberadas em vez de ampliar para preencher. Não foram repetidos testes de banco sem alteração de banco ou regras. Nenhum serviço pago, nova conta, mudança de provedor, alteração de dados reais ou envio de mensagens.
