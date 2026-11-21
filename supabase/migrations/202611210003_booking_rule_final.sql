-- Regra de faltas e cancelamentos em vigor (21/11/2026). Mesmo conteúdo aceito pelo usuário em
-- 13/11, sem a linha de rascunho da fase de testes e com a cobrança feita pela clínica por
-- WhatsApp ou e-mail. Valores iguais: 24 h de aviso, taxa de 30%, tolerância de 60 minutos.
-- Agendamentos antigos continuam ligados à versão que a cliente aceitou (rule_version).
insert into public.booking_rules(version,body,late_notice_hours,fee_percent,grace_minutes) values('falta-2026-11-v1',
$rule$1. Não há pagamento para agendar.
2. Para remarcar ou cancelar sem custo, avise com pelo menos 24 horas de antecedência. Com esse aviso, você pode escolher outro horário disponível.
3. Aviso com menos de 24 horas: o horário é cancelado e pode ser cobrada uma taxa de 30% do valor do serviço agendado.
4. Falta sem justificativa: pode ser cobrada a mesma taxa de 30%.
5. Se você desistir em até 1 hora depois de marcar, não há taxa.
6. A taxa só é cobrada depois da confirmação da Eduarda, que avalia a justificativa apresentada.
7. Enquanto houver taxa em aberto, não é possível fazer novo agendamento pelo site.
8. A cobrança é enviada pela clínica ao WhatsApp ou ao e-mail informados no cadastro, em até três lembretes. A baixa é feita pela clínica depois de conferir o pagamento.$rule$,24,30,60);
update public.clinic_settings set booking_rule_version='falta-2026-11-v1' where id;
