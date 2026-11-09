# Homologação conectada e acesso administrativo validado

**Atualização 05/11/2026:** domínio verificado no Resend, SMTP próprio salvo e recebimento confirmado pelo usuário. Templates em português aplicados. Cadastro de cliente preparado somente para endereço previamente autorizado por hook no servidor; o usuário ainda realizará cadastro/confirmará e-mail. Ver `SMTP-RESEND.md`, `CADASTRO-TESTES.md` e `AGENDA-DISPONIBILIDADE.md`; referências abaixo a cadastro desabilitado, ausência de SMTP ou de disponibilidade descrevem entregas anteriores.

Atualizado em 04/11/2026. Site: https://clinica-torriceli-previa.pages.dev/ . Último deploy de correção MFA: https://46c9b68d.clinica-torriceli-previa.pages.dev/ . Ambiente de TESTES; não produção clínica.

## Resultado efetivo

- Supabase CLI oficial autenticada pelo próprio usuário. Organização separada e projeto `clinica-torriceli-testes` criados em São Paulo (sa-east-1), sem upgrade/contratação de plano pago. Projeto inicial em outra região preservado.
- As três migrações aplicadas após dry-run: base/RLS/Storage, catálogo com 23 opções e preferências/consentimentos. Segredos fora do frontend/repositório; senha de banco gerada protegida por DPAPI no perfil local. Não incluir arquivos de artifacts nem credenciais em Git.
- Configuração Auth: URLs HTTPS exatas da prévia, mínimo 12 caracteres, confirmação de e-mail mantida, TOTP. Cadastro público desabilitado no servidor e na interface. Build staging com apenas publishable key e URL; bundle checado contra chaves privilegiadas.
- Testes REAIS no Supabase hospedado passaram: isolamento REST entre duas clientes fictícias; alteração de UUID/papel/preço/status negada; política de consentimentos; sobreposição de reservas rejeitada; Storage privado com próprio download permitido e download/signed URL alheios negados; login/refresh/logout e TOTP. Teste administrativo com fixture separada: AAL1 negado, AAL2 permitido, revogação do papel remove acesso imediatamente. Links reais de signup/confirmação/recovery/convite testados por generateLink sem e-mail às fixtures; convite padrão verificado pelo endpoint real de redirect, fragmento de sessão processado e senha definida. Todas as fixtures apagadas pelo teste.
- Primeiro teste TOTP detectou relógio deste computador aproximadamente 45s adiantado em relação ao serviço; fixture passou usando timestamp do serviço. Nenhuma mudança de relógio do sistema. Orientar data/hora automática no dispositivo autenticador se códigos não conferirem.
- Convite administrativo ao destinatário confirmado foi aceito pelo provedor e o usuário confirmou RECEBIMENTO no Gmail. Link aceito e endereço verificado antes da atribuição confiável de papel pelo UUID convidado. Recuperação solicitada uma vez após consumo do convite; usuário seguiu o fluxo. Nenhuma senha, QR ou código foi solicitado pelo chat.
- Usuário confirmou na interface pública: **"Acesso com segundo fator validado"**, **1 conta cadastrada**, **0 agendamentos**, lista de cadastro e avisos de agenda/pagamento indisponíveis. Isto confirma uso REAL do painel pela conta convidada, não só build/teste simulado.

## Correções no primeiro uso

Texto fixo de 12 caracteres confundia orientação com erro: agora mostra contador de caracteres, requisitos atendidos e erros Auth por código sem revelar senha. Estado de definição de senha pode ser retomado após reload na mesma sessão. Convite já usado exige novo link de recuperação, não reutilização.

MFA pendente após reload não aparecia no atalho `listFactors().data.totp`, que contém apenas fatores confirmados. Corrigido para procurar em `all`, retomar o fator pendente sem substituir o QR já escaneado e oferecer reinício explícito apenas para fator ainda não confirmado. Autenticador verificado nunca é apagado por essa ação. Teste de regressão adicionado; suíte local atual com 11 testes passou. Erros de código TOTP agora têm mensagem específica.

## E-mail: limite concreto, sem cobrança desnecessária

Customização de templates foi recusada pelo Supabase gratuito com SMTP padrão (HTTP 400). Nenhum upgrade foi feito; templates locais preparados não foram aplicados. Configurações seguras restantes aplicadas separadamente e templates padrão suportados pela aplicação.

O destinatário administrativo autorizado corresponde ao proprietário/membro da conta Supabase e recebeu e-mail padrão em homologação. Isso NÃO torna o envio utilizável para todas as clientes. Serviço padrão restringe destinatários à equipe e possui quota baixa; SMTP próprio ainda necessário antes de abrir cadastro/recuperação para o público. Assinar Pro, isoladamente, não deve ser tratado como solução automática de entrega. Fornecedor, domínio verificado/remetente e custo ainda a definir, sem senha Gmail, domínio inventado ou contratação feita pelo agente. Fonte: https://supabase.com/docs/guides/auth/auth-smtp .

## Acesso e próximos módulos

Conforme escolha explícita do usuário, por enquanto ele testa na conta indicada para a Eduarda. Não foi criada segunda conta de desenvolvedor no site. Depois dos testes, criar acesso separado e planejar transferência do autenticador à Eduarda, sem remover proteção antes de validar a substituição.

Panel administrativo atual é consulta: até 25 cadastros/agendamentos recentes e contagens do banco. Agenda operacional, blocos/exceções por data, alteração de disponibilidade, retenções, reservas, remarcação e gateway ainda não foram liberados. Notificações têm preferências/consentimentos; não há fila nem envio. Nenhuma cobrança real. Mercado Pago Checkout Pro é recomendação preliminar para testes futuros, não conta/contrato criado.

## Verificação/limites de interface

Revisão visual v4 preservada (vídeo com maior preenchimento, autoplay mudo/loop, sem controle sobreposto, redução de animação no rodapé e fontes encorpadas). Depois da conexão, automação do navegador ficou desabilitada nas configurações de Work; não foi contornada. Validação final do painel/MFA foi feita pelo usuário e relatada nesta conversa; não alegar nova QA visual automatizada da sessão real. A validação de e-mails arbitrários/clientes e SMTP continua pendente.
