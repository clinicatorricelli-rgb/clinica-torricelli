// Textos e regras de exibição das reservas. Puro (sem rede), testado em tests/booking.test.mjs.
// Quem decide o que pode acontecer é sempre o banco; aqui só se explica o resultado.
import {money} from './catalog.mjs';

const tz = 'America/Sao_Paulo';
export const when = iso => new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:tz}).format(new Date(iso));
export const clock = iso => new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:tz}).format(new Date(iso));
export const todayInClinic = (now=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const addDays = (day,n) => {const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};

const reasons = {
 booking_disabled:'O agendamento online está desligado no momento.',
 rule_changed:'A regra de faltas foi atualizada. Leia a versão nova e confirme de novo.',
 service_unavailable:'Esse serviço não está disponível para agendamento.',
 profile_incomplete:'Antes de agendar, informe seu nome e seu WhatsApp em Minha conta.',
 outstanding_fee:'Há uma taxa em aberto na sua conta. Novos agendamentos pelo site ficam bloqueados até a clínica dar baixa.',
 intake_required:'Este serviço precisa da sua ficha preenchida. Preencha em Minha conta e volte para agendar.',
 slot_unavailable:'Esse horário acabou de ser ocupado ou não está mais disponível. Escolha outro.',
 not_found:'Agendamento não encontrado. Atualize a página.',
 not_cancellable:'Esse agendamento não pode mais ser cancelado pelo site.',
 not_reschedulable:'Esse agendamento não pode mais ser remarcado pelo site.',
 already_started:'O horário já começou. Fale com a clínica.',
 too_late:'Faltam menos de 24 horas: não é mais possível remarcar pelo site. Fale com a clínica.'
};
export function reasonMessage(result){
 if(result?.reason==='limit_reached')return `Você já tem ${result.limit} agendamentos futuros, o máximo permitido. Cancele ou aguarde um deles para marcar outro.`;
 return reasons[result?.reason]||'Não foi possível concluir. Atualize a página e tente de novo.';
}

export function statusLabel(item){
 if(item.status==='cancelled')return item.cancel_kind==='clinic'?'Cancelado pela clínica':item.cancel_kind==='client_late'?'Cancelado com menos de 24 h':'Cancelado sem custo';
 return {confirmed:'Confirmado',completed:'Realizado',no_show:'Falta registrada'}[item.status]||item.status;
}

export function feeLabel(fee){
 if(!fee)return '';
 const what=fee.reason==='no_show'?'falta':'cancelamento com menos de 24 h';
 return {proposed:`Taxa por ${what} em análise pela Eduarda: ${money(fee.amount_cents)}`,
  confirmed:`Taxa por ${what} a pagar: ${money(fee.amount_cents)}`,
  paid:`Taxa por ${what} paga: ${money(fee.amount_cents)}`,
  waived:`Taxa por ${what} dispensada`}[fee.status]||'';
}

// What cancelling now means, as shown before the customer confirms.
export function cancelNotice(item){
 if(item.free_change)return 'Cancelamento sem custo.';
 return `Faltam menos de 24 horas. Se cancelar agora, o horário é liberado e fica registrada uma taxa de ${money(item.fee_cents)} (30% do serviço), que a Eduarda vai avaliar.`;
}
export function changeNotice(item){
 if(!item.can_change)return '';
 if(item.free_change)return `Remarque ou cancele sem custo até ${when(item.free_change_until)}.`;
 return `Faltam menos de 24 horas: não dá mais para remarcar pelo site. Cancelar agora pode gerar taxa de ${money(item.fee_cents)}.`;
}
export function cancelResult(result){
 if(!result?.ok)return reasonMessage(result);
 if(result.kind==='client_late')return `Agendamento cancelado. Foi registrada uma taxa de ${money(result.fee_proposed_cents)} para avaliação da Eduarda.`;
 return 'Agendamento cancelado sem custo. O horário foi liberado.';
}
export const ruleSummary = (rule,feeCents) => `Não há pagamento para agendar. Aviso com menos de ${rule.late_notice_hours} horas ou falta sem justificativa: taxa de ${money(feeCents)} (${rule.fee_percent}% do serviço), cobrada só depois da confirmação da Eduarda. Desistência em até ${rule.grace_minutes} minutos depois de marcar não gera taxa.`;
