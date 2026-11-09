# Revisão visual v4 — 04/11/2026

Publicada em https://clinica-torriceli-previa.pages.dev/ . Deployment final com tipografia: https://5d5e49ef.clinica-torriceli-previa.pages.dev/ . Backend continua desligado em modo demo, noindex mantido.

## Preenchimento sem distorção

Montagem `scripts/video-v4.py`, preservando fontes e v1/v2/v3. Mesmo conteúdo/cortes seguros da v3, sem aumentar recortes nem criar zoom animado. Quadro muda de 960×480 para 800×480, com margem vertical reduzida de 32 para 8 pixels totais; escala continua estritamente proporcional. Banner muda de 2:1 para 5:3. No mesmo espaço horizontal, o primeiro resultado ocupa aproximadamente 222px de largura no mobile contra 176px na v3 (+26,7%). Olho, cílios e lábios permanecem íntegros e centralizados. As margens restantes preservam diferenças naturais de proporção. Nenhum alongamento artificial ou IA.

Conferidos dois quadros de cada uma das cinco cenas; sequência em `artifacts/video-v4/v4-all-scenes.jpg`, fontes preservadas. Duração ~13,64s, 25fps, vídeo sem áudio, 371.460 bytes. Poster próprio e nome novo `abertura-v4.mp4` para evitar cache antigo.

## Reprodução e leitura

Componente `HeroVideo` agora sem botão ou controles sobre o banner. Autoplay, muted, loop e playsinline. Preferência `prefers-reduced-motion` é acompanhada dinamicamente: renderiza imagem estática em vez de vídeo quando ativa. Opção discreta "Reduzir animações" no rodapé, fora do banner, também troca para imagem estática; não permite contrariar uma preferência reduzida do sistema. Não persiste autorização de notificações ou qualquer dado de cliente.

Títulos trocados de Italiana extremamente fina para Georgia com peso 700; corpo DM Sans 500, navegação/botões 600, CTA/preços 700. Maior contraste dos textos de destaque, tamanho dos textos pequenos revisado. Ajustes no título mobile compensam a altura maior do banner e mantêm o CTA visível. Paleta preservada.

## Verificação real

- Build demo aprovado; deploy final concluído por Wrangler. Site e vídeo públicos HTTP 200; hash SHA256 do vídeo servido igual ao local; noindex preservado. JS/CSS com nomes novos.
- Browser no endereço público: mobile 390×844 e desktop 1280×1000 sem overflow horizontal; título peso real 700, corpo 500 e preços 700. Catálogo/descrições/botões inspecionados no mobile; homepage desktop também inspecionada.
- Banner mobile 330×198; CTA termina aproximadamente em 826px. Conteúdo visivelmente maior que captura v3, preservando olho/lábios/procedimento. Desktop proporcional e sem corte.
- Vídeo iniciou sozinho, muted/loop/playsinline presentes, sem controls e nenhum botão no banner; continuou tocando após mais de um período completo. Opção de rodapé testada: vídeo removido e imagem exibida, e volta a tocar ao desmarcar.
- Componente renderizado em teste local com matchMedia simulado: preferência reduce retorna imagem sem elemento video; modo normal retorna autoplay/muted/loop/playsInline sem botão. Não foi alterada configuração do sistema operacional; isso não comprova conformidade integral de acessibilidade.
- Capturas reais: `docs/qa/public-mobile-v4.jpg` e `docs/qa/public-desktop-v4.jpg`. Overrides do navegador removidos após QA.

Limites: teste em navegador com viewport móvel, não aparelho físico; autoplay pode ser limitado por políticas de energia/dados do navegador. Não se promete nitidez além da fonte. Não houve alteração de banco/regras nem integração real nesta revisão.
