# Reservas sem pagamento antecipado — 13/11/2026

Implementa as decisões de 11/11 e 13/11 registradas no topo de `DECISOES.md`. **Estado: aplicado no Supabase hospedado e publicado em 13/11/2026, com aprovação do usuário. O agendamento continua desligado até a Eduarda ligar no painel.**

## O que a cliente faz

1. Em Serviços, escolhe serviço, dia e horário. Precisa estar logada, com nome e WhatsApp no cadastro. Extensões de cílios (ids 2 a 15 do catálogo) exigem a ficha preenchida.
2. Lê o resumo da regra com a taxa em reais e o texto completo, marca "Li e aceito" e confirma. Não há pagamento.
3. Em Minha conta, vê os agendamentos, remarca para outro horário livre ou cancela. Antes de confirmar, a tela diz se haverá taxa.

## Regra aplicada pelo banco (não pelo navegador)

- Aviso com pelo menos 24 h: remarcar ou cancelar sem custo.
- Desistência em até 60 min depois de marcar: sem custo, até o início do atendimento. Remarcar conta como novo agendamento para essa tolerância.
- Cancelamento depois disso: o horário é liberado e nasce uma **proposta** de taxa (30% do preço congelado no agendamento).
- Falta: só a Eduarda registra, escolhendo cobrar ou dispensar (dispensa exige motivo).
- Toda taxa só vira cobrança quando a Eduarda confirma. Taxa confirmada bloqueia novos agendamentos pelo site até a baixa ou a dispensa.
- Baixa: manual, pela Eduarda, depois de conferir o extrato. Não existe leitura de comprovante.
- Máximo de 2 agendamentos futuros por cliente (`clinic_settings.max_future_bookings`) e antecedência mínima de 2 h (`min_notice_minutes`); a Eduarda ajusta os dois no painel (`admin_set_booking_limits`).
- Cancelamento pela clínica exige motivo e não gera taxa.

O texto aceito é versionado em `booking_rules` (`falta-rascunho-2026-11`). Cada agendamento guarda versão aceita, data do aceite, preço e taxa congelados. Texto novo = versão nova; quem estiver com a página aberta recebe `rule_changed` e precisa aceitar de novo. **O texto atual é rascunho sem revisão jurídica.**

## Banco (`supabase/migrations/202611130001_reservations_without_deposit.sql`)

- Remove `deposit_percent` e `hold_minutes`; renomeia `appointments.deposit_cents` para `fee_cents`; acrescenta estado `no_show`, aceite, `booked_at`, remarcações e tipo de cancelamento.
- Troca a trava fixa `booking_enabled=false` por: só liga com regra definida, e só a Eduarda (papel + segundo fator) liga ou desliga. A migração deixa **desligado**.
- Novas tabelas: `booking_rules`, `appointment_fees` (cliente lê só as próprias) e `private.booking_notes` (observações internas, nunca expostas à cliente).
- Funções da cliente: `booking_info`, `book_appointment` (idempotente por `request_id`), `cancel_appointment`, `reschedule_appointment`, `reschedule_slots`, `my_appointments`.
- Funções da Eduarda: `admin_set_booking_enabled`, `admin_mark_attendance`, `admin_decide_fee`, `admin_settle_fee`, `admin_cancel_appointment`, `admin_booking_overview`. Todas registram em `audit_log`.
- Mesmos travamentos por dia da publicação de horários (`pg_advisory_xact_lock`) e a exclusão GiST impedem dois agendamentos no mesmo horário.
- O gatilho de horário de funcionamento passou a conferir só quando o horário muda (antes conferia também em troca de situação).
- Tabelas antigas `payments`, `private.payment_events`, `reschedule_requests` e `financial_decisions` ficaram sem uso; não foram apagadas.

## Telas

- `src/AvailabilityPanel.jsx` (`AvailabilityPreview`): escolha do horário e aceite.
- `src/MyAppointments.jsx`: lista, remarcação e cancelamento. Se a migração ainda não existir, volta à lista simples anterior.
- `src/AdminBookings.jsx`: liga/desliga, taxas em aberto, presença, próximos agendamentos e histórico, com link para abrir a conversa no WhatsApp da cliente.
- `src/booking.mjs`: textos e explicações, sem rede.

Sem a migração aplicada, o site publicado continua como hoje: `booking_info` falha e tudo fica em modo consulta.

## Verificação feita

- 59 testes locais (`node --test tests/*.test.mjs`), incluindo `tests/reservations.test.mjs` com todas as migrações num Postgres embarcado: permissões, idempotência, conflito de horário, ficha, cadastro, limite, 24 h, tolerância de 1 h, falta, taxa, baixa, trava e regressão da publicação de horários e dos avisos por e-mail.
- Telas percorridas em navegador (desktop e celular) com respostas simuladas do banco; sem rolagem lateral e sem erros.
- Não foi testado contra o Supabase hospedado.

## Para colocar no ar (exige aprovação do usuário)

Desde 13/11 há um token pessoal do Supabase salvo nas configurações da nuvem (o usuário salvou pelo formulário seguro), então a migração pode ser aplicada desta sessão pela Management API (`POST /v1/projects/zpgzndrgsvynfomjqods/database/migrations`, que registra o histórico), sem o computador do escritório. Ensaio feito em 13/11 no banco real dentro de um bloco cancelado no fim: aplicou sem erro, `booking_info` desligado, 41 horários numa sexta; nada ficou gravado.


1. No computador do escritório, conferir projeto `clinica-torriceli-testes` / `sa-east-1` e aplicar a migração com a CLI (`db push --dry-run` antes).
2. Rodar `tests/integration.mjs` e `tests/client-intake.integration.mjs` seletivamente (não a suíte padrão; ver CLAUDE.md).
3. Mesclar o PR em `main` (publica o site).
4. A Eduarda liga o agendamento no painel, só para testes com dados fictícios, até a revisão do texto da regra.

## Ainda não decidido / não feito

- Antecedência mínima: padrão de 2 h escolhido pelo agente em 13/11 (o usuário não respondeu); ajustável no painel.
- Mensagens pelo WhatsApp (confirmação, lembretes, cobrança): dependem da ativação da Positus; `appointment_fees.reminders_sent` já limita a 3.
- Verificação do número de WhatsApp da cliente antes de qualquer cobrança.
- Revisão jurídica do texto da regra e definição do que conta como justificativa.
