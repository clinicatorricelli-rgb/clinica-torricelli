# Ficha de atendimento e navegação — 06/11/2026

Solicitação do usuário: ficha inicial antes do futuro agendamento, reaproveitamento do cadastro das clientes, vídeo de apresentação no primeiro acesso, ajuste visual e menu Eduarda visível somente após login administrativo. Recebida e inspecionada visualmente a ficha PDF de uma página enviada nesta conversa. O PDF original permanece intacto e não foi publicado; seus contatos e o logotipo não foram copiados automaticamente para assets públicos.

Publicado: URL estável https://clinica-torriceli-previa.pages.dev/ ; deployment https://4484cbf7.clinica-torriceli-previa.pages.dev/ . Bundle final `index-BPV7Af5X.js` conferido por HTTP200/SHA-256 com o build local e correção de conflitos presente. CSP/noindex mantidos, nenhuma fixture sintética residual, catálogo com 23 serviços e reservas ainda bloqueadas. Não foi acrescentado arquivo de vídeo fictício.

## Entrega de homologação

Em **Minha conta**, após entrar, a cliente encontra **Ficha de atendimento**. Nome, telefone e e-mail são reutilizados do cadastro; nome/telefone atualizam a ficha na interface após salvar o cadastro. Data de nascimento opcional calcula idade, sem duplicar idade no banco; sexo e endereço opcionais. As seis perguntas preservam o conteúdo da referência:

1. Gestação/lactação, com espaço para informar há quanto tempo.
2. Procedimentos nos olhos.
3. Alergia a esmalte ou cosméticos.
4. Glaucoma ou outro problema ocular.
5. Tratamento oncológico.
6. Uso de rímel no dia.

Respostas iniciam sem seleção, com Sim/Não/Prefiro conversar com a profissional. Observações opcionais. Informações persistentes são carregadas da ficha já salva; rímel é reconfirmado porque diz respeito ao dia do atendimento. Nome digitado, declaração, aceite do registro e autorizações são solicitados novamente em cada envio. Toda revisão é preservada, sem usar o preenchimento como aprovação clínica automática.

As confirmações de registro da ficha e revisão das respostas são obrigatórias na simulação. Autorizar procedimento após avaliação e autorizar fotos internas são escolhas opcionais e independentes. Fotos internas não equivalem a autorização para divulgação pública. O nome digitado documenta a declaração nesta simulação; não é apresentado como certificado de assinatura digital. Termos de produção e base/retencão dos dados devem ser definidos antes de coletar dados reais.

**Ambiente de testes: usar somente informações fictícias.** O formulário apresenta esse aviso, e nenhuma ficha real de saúde foi criada pelo agente. O agendamento e o pagamento continuam desativados; esta entrega não afirma que a ficha já seja um bloqueio de um fluxo de reserva que ainda não existe. Na futura criação de reservas será necessário validar a ficha e vincular a revisão apresentada, dentro da transação confiável do agendamento.

## Profissional

Eduarda, após login autorizado e MFA, encontra **Fichas das clientes**: lista de até 25 envios recentes, com respostas abertas apenas após selecionar a cliente. Estilo, curvatura, espessura, modelo dos fios, data do procedimento e observações técnicas ficam em registro separado. Clientes não gravam essa parte.

Cada registro técnico referencia a revisão exata da ficha da cliente. Atualizações concorrentes da ficha ou da parte técnica são recusadas com conflito de revisão, exigindo recarregar; assim uma edição não apaga declarações ou trabalha silenciosamente com respostas já substituídas. A interface mostra quando o registro técnico foi baseado em uma revisão anterior. Atualizar lista também atualiza os detalhes selecionados; alterações técnicas não salvas precisam ser salvas ou descartadas explicitamente.

## Dados e acesso

Migração `202611060001_client_intake.sql`: `client_intake_current`, `client_intake_procedure` e histórico privado de revisões. Cliente autenticada lê sua própria ficha; acesso de outra cliente é negado. A profissional autorizada lê fichas e grava somente a parte técnica, sempre com AAL2. Atribuição administrativa vem da tabela confiável, nunca de e-mail digitado ou metadata enviada pelo navegador.

Escrita somente por RPC validada. Seis chaves exatas de respostas, valores tipados, limites de texto, nascimento não futuro, flags booleanas, identidade de cliente derivada do JWT e revisão otimista. Nomes/telefone/e-mail não são copiados para a tabela de respostas. Histórico não tem leitura/escrita pelo navegador, inclusive pelo admin; informações sensíveis não são copiadas para logs ou avisos de WhatsApp/e-mail. Acesso de operador privilegiado de infraestrutura continua sujeito ao controle da infraestrutura, como nos módulos anteriores.

O teste real de API revelou demora ao usar SQLSTATE40001 para conflito funcional de revisão. A correção aditiva `202611060002_client_intake_conflicts.sql` passou esse caso a `PT409`/HTTP409; frontend reconhece o código e solicita recarregar, com limite de espera para o salvamento. A mesma migração preserva UUIDs de autores históricos como no audit_log, sem FK que impedia apagar a identidade Auth; relações do titular continuam eliminando seus próprios registros quando sua conta é removida. O teste posterior confirmou retorno409 imediato, exclusão de fixtures e ausência de acesso cruzado. Os erros iniciais e duas fixtures sintéticas remanescentes foram resolvidos, sem alterar contas reais.

## Menu e apresentação visual

O botão **Eduarda** é renderizado somente quando o servidor confirmou papel administrativo para o mesmo UUID da sessão atual. Logout ou troca de conta não reaproveitam o papel anterior. A proteção real continua no banco/MFA. O formulário de cadastro e a ficha são vinculados à identidade da sessão para não conservar campos de outra conta.

Homepage ganhou uma seção com o percurso serviços → cadastro/ficha → avaliação com Eduarda. A ficha usa branco, marfim e dourado, conforme o documento recebido. Nome público da marca corrigido para Torricelli, com dois L; IDs técnicos de projetos/URLs antigos não foram renomeados.

## Vídeo: estrutura pronta, arquivo ainda necessário

`WelcomePresentation.jsx` suporta apresentação no primeiro acesso ao navegador, botão para continuar/pular e opção de rever em Conheça Eduarda. Usa diálogo nativo, controles de reprodução, som por ação da visitante e legendas opcionais. Não obriga a assistir até o final. O indicador de visita é local ao navegador, sem dados de saúde.

**A apresentação não foi ativada:** o usuário ainda não enviou a gravação. O vídeo de resultados existente não foi apresentado como se fosse uma fala de apresentação. Após receber vídeo aprovado, otimizar o arquivo e configurar `VITE_WELCOME_VIDEO`; `VITE_WELCOME_CAPTIONS` e `VITE_WELCOME_VIDEO_VERSION` controlam legenda/versão. Sem um arquivo configurado não aparece janela vazia nem vídeo fictício. Para rever uma apresentação nova automaticamente pode-se alterar a versão.

## Verificação

- Suíte completa local: 48 testes passaram. Sete testes novos cobrem respostas/validação, isolamento, MFA, histórico privado, conflitos, exclusão e integridade da revisão de origem da parte técnica.
- Duas migrações aplicadas no projeto dedicado de testes após dry-run; `supabase/tests/client_intake.sql` passou no banco hospedado e reverteu todas as fixtures/alterações por ROLLBACK.
- NOVO `tests/client-intake.integration.mjs` passou com JWTs Auth reais de duas clientes sintéticas e PostgREST: salvar/própria leitura HTTP200, outra cliente vê lista vazia, escrita direta403, visitante401, UUID forjado400, revisão antiga409, parte técnica sem admin403 e histórico privado406. Todas as fixtures e autorizações temporárias foram removidas; nenhum e-mail ou dado real de saúde usado.
- Build staging conectado passou; varredura do bundle contra chaves privilegiadas não apontou ocorrência.
- Não houve nova automação visual de navegador, que permanece indisponível; revisão visual do PDF foi realizada por renderização local, não foi confundida com inspeção visual do novo site.

Fontes da ficha: PDF enviado pelo usuário nesta conversa, inspecionado por extração e renderização de sua única página. A referência serve ao desenho de campos; não foi tratada como instrução para publicar seus contatos ou como liberação clínica automática.
