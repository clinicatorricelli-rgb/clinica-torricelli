# Decisões e continuidade — 04/11/2026

**Atualização 06/11/2026:** entregue ficha de extensão de cílios em homologação para dados fictícios, baseada no PDF do usuário, com parte técnica restrita e revisão por atendimento; ver `FICHA-CLIENTE.md`. Menu Eduarda condicionado ao papel da sessão; vídeo introdutório preparado, aguardando gravação real. WhatsApp comercial deverá permitir atendimento manual mais automação; usuário escolheu lembretes na véspera e duas horas antes (`ATENDIMENTO-WHATSAPP.md`). Conta/portfólio Meta e ativação WhatsApp ainda pendentes. Referências antigas abaixo à ausência completa de ficha, backend/SMTP/notificações são históricas; e-mail real já foi recebido e validado.

## Disponibilidade confirmada

Timezone America/Sao_Paulo. Segunda a sexta 07:00–22:00 como limite semanal; restrição de estágio fecha 07:00–11:00 SOMENTE seg–sex, por prazo aberto. Sábado 07:00–18:00, domingo fechado. O serviço deve terminar até o encerramento; o intervalo de limpeza de 15 min pode ocorrer após o último atendimento. A data 05/12/2026 é revisão, nunca expiração automática. Manhã específica pode ser aberta manualmente com exceção vinculada à restrição. A pós-graduação em Limeira é um sábado por mês em datas variáveis ainda não informadas; não criar recorrência presumida.

Precedência planejada: domingo/limites semanais → fechamento do dia → bloqueios por faixa → restrições temporárias → abertura vinculada somente à restrição que pode substituir. Uma abertura não desfaz bloqueio integral nem bloqueio por faixa. `src/availability.mjs` testa essa composição como helper puro para a futura API. Não gera slots nem é uma autorização de reserva. O banco contém regras e exceções, mas a mutação administrativa está fechada nesta etapa. Sábado não recebe a restrição de estágio.

Mudanças de disponibilidade devem listar agendamentos/retensões conflitantes antes de gravar, exigir resolução explícita e manter os compromissos. `overlappingAppointments` fornece a detecção inicial; o servidor futuro deve repetir a consulta sob lock na transação. Não cancelar silenciosamente. Um bloqueio ocupado deve ser materializado na mesma tabela `appointments` com `status=blocked` para participar da exclusão transacional; regras e exceções não substituem essa garantia. Manter ambas as gravações na mesma transação.

## Catálogo

Capping aplicação informado como 90–120 minutos: reservar 120 por segurança, alterável posteriormente por migração/operação autorizada. Manutenção de cílios 15–25 dias; Capping 25–30. Após máximo, nova aplicação. Elegibilidade transparente; nenhuma cobrança oculta ou perda automática. Nenhum retoque labial não informado foi incluído.

## Reservas e pagamentos — contratos da etapa 2

Não há endpoint de reserva/pagamento nesta entrega. `booking_enabled=false` é travado por constraint: remover somente por nova migração quando o fluxo seguro estiver implementado. `hold_minutes=null` significa pendência, não retenção infinita liberada ao público.

1. API autenticada usa `auth.uid()` validado; não aceita customer_id, preço, duração, sinal ou status vindo do cliente. Ler catálogo ativo do banco e congelar valores no agendamento. Revalidar manutenção, limites, restrições, bloqueios e horário atual no servidor.
2. Criar retenção com prazo explicitamente configurado. Expirar retenções vencidas sob lock; a exclusão GiST mantém retenções vencidas bloqueando até serem marcadas `expired` (falha conservadora). Worker periódico e limpeza transacional no ato de reservar ainda precisam ser implementados.
3. Retenção e criação de pagamento exigem idempotência. Nunca confirmar por clique ou retorno do navegador. Gateway ainda não escolhido, Asaas não contratado.
4. Webhook futuro verifica assinatura e consulta confiável ao provedor: moeda BRL, valor exatamente igual ao sinal congelado, vínculo/id do pagamento, ambiente e status. `private.payment_events` deduplica por provedor/evento, `payments` por provedor/pagamento. Deduplicação, validação, confirmação e auditoria devem ocorrer atomicamente. Pagamento após expiração não ressuscita reserva conflitante; tratar reconciliação/reembolso explicitamente.
5. Reagendamento >=12h: futura função troca horário e transfere sinal na mesma transação, com exclusão evitando conflito. <12h: apenas solicitação pendente à Eduarda. Horário original permanece `confirmed` até decisão; não reservar automaticamente o proposto. Uma pendência por reserva. Nova/recorrente não determina aprovação automaticamente.
6. Decisão da remarcação e decisão financeira são separadas (`financial_decisions`). Não há perda automática do sinal nem termos legais prontos. Arrependimento legal, exceções e tratamento de faltas precisam constar dos termos finais. Estes são requisitos do produto, não parecer jurídico.

## Pendências

Notificações: decisão final é envio automático por e-mail E WhatsApp após publicação efetiva de novas vagas, para destinatários autorizados em cada canal. Base de preferências/consentimento entregue; fila e provedores na próxima etapa, conforme `NOTIFICACOES.md`. Sem envio real.

Credenciais e projeto Supabase Pro com região São Paulo (selecionar explicitamente antes de criar); projeto Cloudflare Pages; domínio, URL pública, SMTP, limites e proteção de abuso; contato, endereço e CPF/CNPJ da clínica; termos/aviso de privacidade, finalidade e prazo de retenção de arquivos; provedor e prazo de retenção de reservas; horários/datas de pós-graduação. Não inventar esses dados. Revisão da disponibilidade em 05/12/2026.

Não iniciamos prontuário, histórico de saúde ou armazenamento de fotos das clientes. As capturas originais e os vídeos de origem permanecem intocados.
