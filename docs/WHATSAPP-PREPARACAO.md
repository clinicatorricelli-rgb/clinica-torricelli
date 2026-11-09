# WhatsApp oficial — preparação de testes, 05/11/2026

Após confirmar recebimento do primeiro aviso real por e-mail, o usuário autorizou continuar e informou que **a clínica ainda não possui número**. Não foi comprado chip/número, criado aplicativo, contratado provedor ou ativado envio WhatsApp.

## Próxima ação concreta

O Developer Hub oficial oferece números e ambiente de teste. Portanto, começar pelo onboarding de testes da Meta, sem exigir agora a compra ou migração de um número definitivo. O usuário precisa entrar na própria conta Meta/Facebook que administrará a clínica; o agente não dispõe de sessão/API dessa conta.

- Developer Hub oficial: https://whatsappbusiness.com/developers/developer-hub/
- Fluxo direto oficial indicado pelo Hub: https://developers.facebook.com/products/whatsapp/onboard/direct
- Usar o número de teste fornecido no painel, quando disponível, e destinatário controlado habilitado para teste. Não registrar o telefone pessoal automaticamente.
- A documentação técnica inicial exigiu login nesta consulta; não foram inventados nomes exatos de botões das telas autenticadas. Orientar os próximos passos conforme a tela efetivamente apresentada ao usuário.

O número definitivo, titularidade, conta empresarial, condições e custos reais serão definidos antes de ativação para clientes. O ambiente de teste não equivale a produção nem garante gratuidade de futuros envios.

## Mensagem de novas vagas — rascunho para revisão

Nome de trabalho: `novas_vagas_torricelli_v1`, português brasileiro.

> A Clínica Torricelli publicou novos horários para [datas]. Consulte os horários disponíveis no site: [link da agenda]. Este aviso não reserva nem garante um horário. Para deixar de receber avisos de novas vagas por WhatsApp, responda SAIR.

Tratar como aviso proativo de novas vagas, sem apresentar como confirmação de reserva ou pagamento. A categoria, os componentes e o texto final precisam ser validados/submetidos na Meta. **Nenhum modelo foi submetido ou aprovado.** Usar somente modelo aprovado para mensagens iniciadas pela clínica. Não usar texto livre fora das condições permitidas da janela de atendimento.

## Contrato técnico a preservar

- Opt-in WhatsApp independente do e-mail; não migrar autorizações entre canais. A preferência existente está registrada, mas o telefone preenchido ainda não foi verificado para envio.
- Vincular autorização ao destino confirmado; mudança do número exige nova verificação e autorização, sem reaproveitar confirmação de destino antigo.
- Fila individual e limites explícitos, publicação real como origem, supressão ao retirar disponibilidade, antes de cada envio conferir consentimento/destino e tratar retornos ambíguos sem repetir cegamente.
- Webhook autenticado pela assinatura oficial da Meta; não confiar em identificação enviada pelo navegador. Persistir apenas dados mínimos necessários, sem conteúdo de conversas ou informações de saúde.
- Respeitar SAIR/STOP e pedidos de descadastro dentro e fora do WhatsApp. Revogar somente o canal solicitado, sem afetar autenticação ou e-mail.
- Tokens e segredo do aplicativo em armazenamento privado de servidor; nunca no frontend/chat. Não automatizar WhatsApp Web.

Fontes oficiais verificadas: Developer Hub acima (números de teste/sandbox) e https://whatsappbusiness.com/policy/ (consentimento, descadastro e modelos aprovados para início de conversa). Não alegar integração operacional sem conta/configuração/teste real.
