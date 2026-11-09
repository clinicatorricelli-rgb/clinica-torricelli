# Atendimento comercial e mensagens de agendamento — 06/11/2026

**Decisão do usuário em 09/11/2026: caminho de coexistência.** Eduarda continuará atendendo pelo app WhatsApp Business no celular, no mesmo número que o sistema usará para mensagens automáticas. Pela documentação oficial da Meta ([Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)), o onboarding em coexistência exige um *Solution Partner* ou *Tech Provider* (Embedded Signup); um app comum de desenvolvedor não faz essa ligação sozinho. Portanto o número será conectado por uma empresa parceira oficial, a escolher e contratar pelo próprio usuário (não contratar por inferência). Requisitos/limites citados pela Meta: app WhatsApp Business 2.24.17+, histórico opcional de até 180 dias, listas de transmissão e mensagens temporárias/visualização única desativadas nas conversas individuais, aparelhos vinculados desconectados no onboarding (WhatsApp para Windows não suportado), 20 msg/s. A janela de 24h vale só para mensagens enviadas pela API; mensagens enviadas pelo app não abrem nem estendem a janela da API. Alternativas descartadas por ora: dois números; caixa de entrada própria no painel com número só na Cloud API; virar Tech Provider. O número de teste da Meta continua útil para desenvolver, se o parceiro escolhido expuser a Cloud API oficial.

**Pesquisa de parceiros, 09/11/2026 (sites públicos; confirmar com o fornecedor antes de contratar).** O usuário pediu priorizar empresas brasileiras. Candidata principal: **Positus** (grupo Robbu), que documenta coexistência ([introdução](https://docs.robbu.global/en/positus/coex/introduction.md), [onboarding](https://docs.robbu.global/en/positus/coex/onboarding.md)) e publica em [positus.com.br](https://positus.com.br/) o plano Turbine a R$ 199/mês, setup grátis, API REST, cobrança por notificação "Facebook + Imposto + 0,03". A documentação técnica (URL, autenticação, formato de payload/webhook) só é liberada após conta gratuita/contratação; não presumir compatibilidade com o formato da Cloud API até ler. Outras brasileiras encontradas, sem coexistência confirmada: Blip GO (~R$ 389/mês em blog de terceiros), Zenvia (setup ~R$ 649 em blog), Infobip/Sinch (preço negociado). Internacionais com coexistência: 360dialog (~€49/número/mês), Dualhook (~US$ 12/mês, empresa pequena). Twilio não oferece coexistência. Tarifas da Meta no Brasil em BRL desde 07/2026 ([preços oficiais](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)); blogs citam ~R$ 0,035 por mensagem de utilidade e ~R$ 0,32 de marketing, a conferir no rate card oficial. Desde 01/10/2026 há 1.000 mensagens de serviço grátis por número/mês e utilidade dentro da janela passou a ser cobrada.

**Pré-requisito antes de contratar:** a clínica ainda não tem número próprio (resposta do usuário em 09/11). Precisa de chip de operadora (não VoIP) com o app WhatsApp Business ativo; contas recém-criadas não são aceitas de imediato (360dialog), e blogs citam cerca de 30 dias de uso, sem prazo oficial publicado pela Meta. O app deve ser aberto ao menos a cada 13 dias depois da coexistência. Perguntas a confirmar com a Positus: coexistência incluída no Turbine; API e webhook para sistema próprio; formato do payload; prazo mínimo de uso do número; fidelidade; o que significa "0,03" por notificação.

O usuário confirmou que o WhatsApp comercial deve servir tanto ao atendimento manual quanto às automações. Quer separar o número pessoal existente da Eduarda, acolher clientes após agendamento confirmado e lembrar do atendimento. Escolheu explicitamente **lembrete na véspera e duas horas antes**. Essa escolha ainda é planejamento; não existem reservas operacionais nem mensagens WhatsApp ativas nesta entrega.

## Número e aplicativo

Para separar conversas, definir número exclusivo da clínica, de operadora, apto à confirmação por SMS ou ligação. Chip físico ou eSIM dependem do aparelho; não é requisito comprar um segundo telefone. O WhatsApp Business no celular rejeita números VoIP/não compatíveis conforme a documentação oficial. Não contratar número virtual arbitrário presumindo funcionamento no aplicativo. Nenhum chip/número/plano foi comprado pelo agente.

A Meta oferece testes com número de teste; número definitivo pode ser escolhido depois. O app Clínica Torricelli foi criado pelo usuário. A criação do portfólio empresarial foi temporariamente recusada porque o perfil Facebook é novo, com orientação na tela de tentar depois de uma hora. A tentativa posterior e a elegibilidade ainda não foram confirmadas.

Há suporte oficial a manter WhatsApp Business no celular e plataforma/API no mesmo número (**Coexistência**). A elegibilidade e o caminho de onboarding para nosso fluxo direto ainda precisam ser conferidos antes de registrar o número real. Se esse caminho não estiver disponível, atendimento manual exige uma caixa de entrada integrada; não prometer que registrar somente a API mantém automaticamente o aplicativo no celular. A operação escolhida precisa permitir Eduarda responder manualmente e pausar automação durante atendimento humano.

## Fluxos propostos

- **Boas-vindas/confirmacão:** somente após o servidor confirmar efetivamente a reserva. Não dizer confirmado para solicitação/retencão/pagamento pendente. Personalizar nome, serviço e data/hora, com saudação conforme o horário de envio em São Paulo.
- **Véspera e duas horas antes:** basear no agendamento vigente, sem duplicar por recarga/job; cancelamento remove pendências e remarcação reprograma. Suprimir lembrete que já perdeu o momento; definir política de silêncio/horário com a clínica antes de ativar em produção. Para reservas feitas em cima da hora, não enviar mensagens retroativas sobre uma véspera já passada.
- **Atendimento humano:** cliente pode responder, falar com Eduarda e usar o número comercial normalmente conforme a integração de atendimento escolhida. Respeitar opt-out e permitir transferência para a profissional.
- **Novas vagas:** categoria/finalidade separada das mensagens do atendimento. A regra atual de um aviso de novas vagas por dia não deve ser aplicada cegamente à confirmação e aos dois lembretes do próprio agendamento.

Modelo de boas-vindas para revisão:

> Olá, cilhuda! [Bom dia/Boa tarde/Boa noite]. Eu sou a Eduarda e vou cuidar do seu atendimento. Seu horário de [serviço] está confirmado para [data], às [hora]. Se precisar falar comigo, responda por aqui.

Modelo de lembrete para revisão:

> Amore, seu horário está chegando! Espero você [data], às [hora]. Se quiser, pode chegar alguns minutinhos antes para se acomodar. Até já!

Esses textos não foram submetidos nem aprovados pela Meta. Revisar categoria, finalidade, variáveis e tom com Eduarda. Não incluir respostas da anamnese ou dados de saúde nas mensagens.

## Áudio

A Cloud API aceita áudio e mensagem de voz. Contudo, mensagem livre exige a janela de atendimento de 24 horas aberta por mensagem da cliente no WhatsApp. **Cadastro ou agendamento no site, sozinho, não abre essa janela.** Fora dela, a iniciativa da empresa depende de modelo aprovado; não foi verificado suporte oficial a lembrete proativo composto apenas de áudio.

Desenho seguro: confirmação/lembrete em texto por modelo aprovado; após agendar, botão opcional para a cliente enviar a primeira mensagem pelo WhatsApp; depois que ela efetivamente enviar e o webhook confirmar a conversa, enviar áudio gravado pela própria Eduarda quando permitido. Podemos usar versões bom-dia/tarde/noite, sem presumir clonagem de voz ou geração de gravação que não foi fornecida.

## Pendências reais

Conta/portfólio elegível, caminho de atendimento manual+API, número de produção, modelos aprovados, credenciais privadas, verificação de destino/consentimento e custos vigentes antes de ativação. As condições da janela, opt-out, idempotência e assinatura de webhooks serão implementadas/validadas na integração. Não foi contratada assinatura, pago envio ou ativada automação de WhatsApp nesta etapa.

Fontes oficiais verificadas: [números e SIM/eSIM](https://faq.whatsapp.com/1068436057886812/?cms_platform=web), [registro e números incompatíveis](https://faq.whatsapp.com/1344487902959714/?locale=pt_BR), [app e plataforma no mesmo número](https://whatsappbusiness.com/resources/resource-library/organize-whatsapp-inbox-meta-business-suite/), [áudio na API oficial](https://www.postman.com/meta/whatsapp-business-platform/request/goznbg0/send-audio-message-by-id), [política e janela de atendimento](https://whatsappbusiness.com/policy/).
