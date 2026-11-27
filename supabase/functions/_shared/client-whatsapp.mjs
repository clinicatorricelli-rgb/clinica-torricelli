// Mensagens de WhatsApp para as clientes (só para quem aceitou): confirmação ao agendar,
// lembretes 27 h, 2 h e 20 min antes e, com changes_enabled, remarcação e cancelamento.
// Quando enviar e para quem vem do banco (private.prepare_client_whatsapp); aqui só se monta
// o modelo aprovado e se envia.
import {sendTemplate} from './owner-whatsapp.mjs';

export const CLIENT_TEMPLATES = {
 confirmation: 'clinica_confirmacao_cliente',
 reminder_27h: 'clinica_lembrete_27h',
 reminder_2h: 'clinica_lembrete_2h',
 reminder_20m: 'clinica_lembrete_20min',
 rescheduled: 'clinica_remarcacao_cliente',
 cancelled_client: 'clinica_cancelamento_cliente',
 cancelled_clinic: 'clinica_cancelamento_clinica',
};
const tz = 'America/Sao_Paulo';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PHONE = /^\+55[1-9][1-9]\d{8,9}$/;
const clean = (v, max = 120) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max) || '-';
const time = iso => new Intl.DateTimeFormat('pt-BR', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));
const dayText = iso => new Intl.DateTimeFormat('pt-BR', {timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit'}).format(new Date(iso));
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'tudo bem';

export function buildClientWhatsapp(job) {
 if (!job || !UUID.test(job.id || '') || !PHONE.test(job.to || '') || !CLIENT_TEMPLATES[job.kind] || !job.facts || Number.isNaN(Date.parse(job.facts.starts_at))) throw new Error('invalid_private_job');
 const f = job.facts, name = clean(firstName(f.customer_name), 60), service = clean(f.service_name);
 const full = [name, service, clean(dayText(f.starts_at)), time(f.starts_at)];
 const params = {
  confirmation: full,
  rescheduled: full,
  cancelled_client: full,
  cancelled_clinic: full,
  reminder_27h: [name, service, clean(dayText(f.starts_at)), time(f.starts_at)],
  reminder_2h: [name, service, time(f.starts_at)],
  reminder_20m: [name, time(f.starts_at)],
 }[job.kind];
 return {template: CLIENT_TEMPLATES[job.kind], params};
}

export async function processClientWhatsapp({db, whatsappKey, fetchImpl = fetch, limit = 5, pacer = null}) {
 if (!whatsappKey) return 'provider_not_configured';
 let last = 'idle';
 for (let i = 0; i < limit; i++) {
  if (pacer && !pacer.fits()) break;
  const job = await db.prepareClientWhatsapp();
  if (!job) break;
  if (job.skip) { last = 'skipped'; continue; }
  let message;
  try { message = buildClientWhatsapp(job); } catch { await db.finishClientWhatsapp(job.id, 'failed', null, 'invalid_private_job'); last = 'failed'; continue; }
  await pacer?.ready();
  const result = await sendTemplate(job.to, message, whatsappKey, fetchImpl);
  pacer?.sent();
  await db.finishClientWhatsapp(job.id, result.outcome, result.providerId, result.code);
  last = result.outcome;
  if (result.outcome === 'retry') break;
 }
 return last;
}
