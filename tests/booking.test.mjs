import test from 'node:test';import assert from 'node:assert/strict';
import {reasonMessage,statusLabel,feeLabel,cancelNotice,changeNotice,cancelResult,ruleSummary,todayInClinic,addDays} from '../src/booking.mjs';
const nb=s=>s.replace(/ /g,' ');

test('cada recusa do banco tem explicação própria em português',()=>{
 for(const reason of ['booking_disabled','rule_changed','service_unavailable','profile_incomplete','outstanding_fee','intake_required','slot_unavailable','not_found','not_cancellable','not_reschedulable','already_started','too_late'])
  assert.doesNotMatch(reasonMessage({ok:false,reason}),/Não foi possível concluir/,reason);
 assert.match(reasonMessage({ok:false,reason:'limit_reached',limit:2}),/2 agendamentos futuros/);
 assert.match(reasonMessage({ok:false,reason:'desconhecido'}),/Não foi possível concluir/);
});

test('situação e taxa aparecem sem jargão',()=>{
 assert.equal(statusLabel({status:'cancelled',cancel_kind:'client_late'}),'Cancelado com menos de 24 h');
 assert.equal(statusLabel({status:'cancelled',cancel_kind:'clinic'}),'Cancelado pela clínica');
 assert.equal(statusLabel({status:'no_show'}),'Falta registrada');
 assert.equal(nb(feeLabel({status:'confirmed',reason:'no_show',amount_cents:4500})),'Taxa por falta a pagar: R$ 45,00');
 assert.match(nb(feeLabel({status:'proposed',reason:'late_cancellation',amount_cents:5850})),/em análise pela Eduarda: R\$ 58,50/);
 assert.equal(feeLabel(null),'');
});

test('antes de cancelar a cliente vê se haverá taxa; depois, o que aconteceu',()=>{
 assert.equal(cancelNotice({free_change:true}),'Cancelamento sem custo.');
 assert.match(nb(cancelNotice({free_change:false,fee_cents:4500})),/taxa de R\$ 45,00 \(30% do serviço\)/);
 assert.equal(changeNotice({can_change:false}),'');
 assert.match(changeNotice({can_change:true,free_change:true,free_change_until:'2030-01-06T17:00:00Z'}),/sem custo até/);
 assert.match(changeNotice({can_change:true,free_change:false,fee_cents:4500}),/não dá mais para remarcar/);
 assert.match(cancelResult({ok:true,kind:'client_grace'}),/sem custo/);
 assert.match(nb(cancelResult({ok:true,kind:'client_late',fee_proposed_cents:4500})),/R\$ 45,00 para avaliação/);
 assert.match(cancelResult({ok:false,reason:'already_started'}),/já começou/);
});

test('resumo da regra usa os números da versão aceita e as datas usam o fuso da clínica',()=>{
 const text=nb(ruleSummary({late_notice_hours:24,fee_percent:30,grace_minutes:60},4500));
 assert.match(text,/Não há pagamento para agendar/);assert.match(text,/menos de 24 horas/);assert.match(text,/R\$ 45,00 \(30% do serviço\)/);assert.match(text,/60 minutos/);
 assert.equal(todayInClinic(new Date('2030-01-07T02:30:00Z')),'2030-01-06','23h30 de domingo em São Paulo ainda é domingo');
 assert.equal(addDays('2030-01-30',3),'2030-02-02');
});
