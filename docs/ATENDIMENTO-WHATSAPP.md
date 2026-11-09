# Atendimento comercial e mensagens de agendamento — 06/11/2026

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
