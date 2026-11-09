# Disponibilidade e cadastro essencial — entrega de homologação

Publicado em https://clinica-torriceli-previa.pages.dev/ . Deployment: https://8e89fcd9.clinica-torriceli-previa.pages.dev/ . Migração `202611040004_availability_workflow.sql` aplicada apenas no projeto isolado de testes em São Paulo, após testes locais e dry-run.

## O que funciona

- Minha conta: nome e telefone opcional de contato em formato internacional. Validação também no Postgres; grants permitem só os campos autorizados da própria conta, preservando RLS. Telefone não ativa avisos, não equivale a número WhatsApp verificado e não é compartilhado com outras clientes. Nenhum CPF, nascimento, prontuário ou dado de saúde adicionado.
- Serviços: botão **Consultar horários de teste**, seleção de serviço/data e horários calculados pelo banco, em America/Sao_Paulo. Valores/duração e sinal previsto vêm do catálogo do banco. Exibe disponibilidade, não cria reserva. Consulta de até 90 dias, parâmetro interno configurável; endpoints tipados não aceitam preço ou duração do navegador.
- Eduarda (admin + AAL2): criar rascunho para abrir manhã, bloquear faixa ou fechar dia; publicar separadamente e retirar publicação quando não há impedimentos. Rascunhos não afetam disponibilidade nem geram avisos.
- Regras semanais e restrição mantidas: seg–sex padrão 11–22, manhã excepcional 07–11 por data, sem abertura automática em 06/12; sábado 07–18; domingo fechado; serviço termina até encerramento; intervalo 15 min; Capping aplicação120min. Bloqueio por faixa/dia tem prioridade sobre abertura.
- Publicar bloqueio verifica retenções, atendimentos confirmados e bloqueios existentes. Retorna horários conflitantes e não aplica alteração se houver conflito. Não cancela/remarca atendimento. Bloqueios livres ocupam a mesma exclusão GiST das reservas, com faixa precisa e buffer zero no registro sintético do bloqueio; intervalos dos atendimentos continuam incluídos em busy_until.
- Retirar abertura com atendimento conflitante também é recusado. Retirar bloqueio próprio remove só a ocupação sintética; exceção/publicação/auditoria preservam o histórico. Não apaga atendimento de cliente.

## Avisos automáticos: evento pronto, envio ainda não

Ao publicar uma manhã, o banco verifica se surgiram horários efetivamente novos para pelo menos o menor serviço ativo. Se há nova capacidade, grava evento outbox na MESMA transação da publicação. ID de publicação é único; repetir o comando/refresh da mesma publicação não duplica evento. Rascunho e bloqueio não geram aviso de novas vagas. Uma abertura redundante sem novas vagas não gera novo evento. Retirar a publicação cancela seu evento pendente.

Outbox privada em `awaiting_provider`: não há worker de envio conectado, contatos exportados ou mensagens disparadas. A futura fila individual por cliente/canal deverá aplicar consentimento atual, verificação do destino, revogação, deduplicação e frequência conforme `NOTIFICACOES.md`. Os dois canais serão e-mail e WhatsApp oficial. Publicar hoje NÃO envia mensagens, e a interface informa isso.

## Transações e autorização

Funções SECURITY DEFINER com search_path vazio, validação tipada e autorização `private.is_admin()` exigindo associação confiável + AAL2. Clientes/admin não gravam diretamente nas tabelas de rascunhos/publicações/exceções/agenda. RLS de leitura interna exige admin + AAL2. Consulta pública de disponibilidade retorna somente horários, valores e sinal, sem nome/contato/motivo interno ou identificadores de agendamentos.

Publicação serializa a data com advisory lock, trava o rascunho e confere revisão. Exclusão GiST também impede ocupação sobreposta com futuros atendimentos. Futuro endpoint de reserva deverá usar o MESMO lock de data (hashtextextended(data::text,41)) e repetir regras na transação; consulta pública sozinha não autoriza uma reserva e está sujeita a mudanças concorrentes.

## Verificações executadas

- Suíte local: 11 testes passaram; inclui quatro migrações aplicadas em PGlite, papéis/RLS, regra semanal/restrições, rascunho sem efeito, publicação, evento único, retirada, dia fechado com prioridade e conflito com atendimento preservado. Inclui regressão MFA após reload e fluxo de callback.
- NOVO teste integrado `tests/availability.integration.mjs` passou no Supabase REAL hospedado. Fixture própria com AAL1 recusada/AAL2 autorizada; telefone válido aceito/inválido recusado; consulta pública; manhã fechada inicialmente; rascunho sem efeito; publicação gera vagas/evento; repetição não duplica; retirada retorna ao padrão; fechar dia elimina slots; abertura não desfaz fechamento; bloqueio conflitante retorna conflito e mantém atendimento confirmado. Fixtures de disponibilidade/usuário/ocupação removidas, sem tocar na conta administrativa real.
- Build staging passou; escaneamento contra chaves service-role/secret no bundle sem ocorrência. Publicação Wrangler concluída. Homepage pública HTTP200, bundle novo confirmado, noindex mantido; RPC público de disponibilidade HTTP200 retornando lista de slots.
- Automação de navegador está desabilitada nas configurações de Work. Não foi contornada; não houve nova inspeção visual/teclado do painel nesta entrega. Layout responsivo foi implementado, mas a interação final no navegador precisa ser conferida por vocês. Não apresentar capturas antigas como se fossem deste painel.

## Como experimentar

1. Atualizar o site, entrar em Eduarda e validar o segundo fator se solicitado.
2. Em Manhãs e bloqueios, escolher uma SEGUNDA A SEXTA futura dentro de 90 dias, Abrir manhã específica, 07:00–11:00 e motivo de teste. Salvar rascunho.
3. Em Serviços, consultar Lash Lifting na mesma data: ainda deve começar às 11h.
4. Publicar o rascunho. Consultar novamente: manhã passa a aparecer. Nenhuma mensagem é enviada.
5. Retirar essa publicação para devolver o dia ao padrão. Experimentar bloqueio de dia inteiro, por exemplo num sábado futuro; os horários devem desaparecer. Retirar depois do teste. Não cadastrar dados de clientes reais.

## Ainda pendente

Cadastro público por e-mail está fechado até configurar SMTP adequado e testar confirmação/recuperação para destinatários de clientes. A conta administrativa atual pode editar a própria ficha. Não foram convidados clientes nem criadas contas reais adicionais.

Agenda de reservas/retensões, prazo de retenção a definir, atendimento confirmado por sinal, remarcação, cancelamento financeiro e gateway NÃO estão operacionais nesta entrega. Botões de consulta não prometem reservar. Agenda visual de compromissos completos, edição direta da semana padrão e provedores de notificação serão módulos seguintes. Não houve contratação de recursos pagos.
