// Alertas de gestão no WhatsApp particular da Eduarda, enviados pelo número da clínica
// (360dialog / API oficial do WhatsApp) com modelos aprovados pela Meta.
// O número de destino e os dados vêm só do banco (private.prepare_owner_whatsapp).

export const TEMPLATES = {
 daily: 'clinica_agenda_do_dia',
 alert: 'clinica_aviso_agenda',
};
export const PANEL_URL = 'https://clinicatorricelli.com.br/?view=admin';
const API = 'https://waba-v2.360dialog.io/messages';
const tz = 'America/Sao_Paulo';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PHONE = /^\+55[1-9][1-9]\d{8,9}$/;

// O WhatsApp não aceita quebra de linha, tabulação nem 4+ espaços seguidos dentro das variáveis.
const clean = (v, max = 300) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, max) || '-';
const time = iso => new Intl.DateTimeFormat('pt-BR', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));
const dayMonth = iso => new Intl.DateTimeFormat('pt-BR', {timeZone: tz, day: '2-digit', month: '2-digit'}).format(new Date(iso));
const weekday = day => new Intl.DateTimeFormat('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC'}).format(new Date(`${day}T12:00:00Z`));
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'Cliente';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cancelText = {
 client_early: 'cancelamento pela cliente com mais de 24 h (sem taxa)',
 client_grace: 'cancelamento pela cliente dentro da tolerância de 1 h (sem taxa)',
 client_late: 'cancelamento pela cliente com menos de 24 h (taxa a confirmar no painel)',
};

// Lista do dia numa linha só, cabendo no limite do modelo.
export function agendaLine(items, max = 700) {
 if (!items.length) return 'nenhum atendimento marcado';
 const parts = items.map(i => `${time(i.starts_at)} ${firstName(i.customer_name)} (${i.service_name})`);
 let out = `${plural(items.length, 'atendimento', 'atendimentos')}: `;
 for (let k = 0; k < parts.length; k++) {
  const sep = k ? '; ' : '';
  const rest = parts.length - k;
  if ((out + sep + parts[k]).length > max - 20) return `${out}; e mais ${rest}`;
  out += sep + parts[k];
 }
 return out;
}

// Devolve o modelo e as variáveis (na ordem {{1}}, {{2}}...).
export function buildOwnerWhatsapp(job) {
 if (!job || !UUID.test(job.id || '') || !PHONE.test(job.to || '') || !job.facts) throw new Error('invalid_private_job');
 const f = job.facts;
 if (job.kind === 'daily_agenda' || job.kind === 'test') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.day || '') || !Array.isArray(f.items)) throw new Error('invalid_private_job');
  const tomorrow = Number(f.tomorrow_count) || 0;
  return {template: TEMPLATES.daily, params: [clean(weekday(f.day)), clean(agendaLine(f.items), 720), clean(tomorrow ? plural(tomorrow, 'atendimento marcado', 'atendimentos marcados') : 'nenhum atendimento marcado até agora')]};
 }
 if (!['booked', 'rescheduled', 'cancelled'].includes(job.kind) || Number.isNaN(Date.parse(f.starts_at))) throw new Error('invalid_private_job');
 const what = job.kind === 'booked' ? 'novo agendamento'
  : job.kind === 'rescheduled' ? `horário remarcado (antes: ${f.old_starts_at ? `${dayMonth(f.old_starts_at)} às ${time(f.old_starts_at)}` : 'outro horário'})`
  : cancelText[f.cancel_kind] || 'cancelamento pela cliente';
 const service = f.service_variant ? `${f.service_name} · ${f.service_variant}` : f.service_name;
 return {template: TEMPLATES.alert, params: [clean(what), clean(f.customer_name || 'Cliente sem nome', 100), clean(service, 150), clean(`${dayMonth(f.starts_at)} às ${time(f.starts_at)}`)]};
}

export async function sendOwnerWhatsapp(job, message, key, fetchImpl) {
 const body = {
  messaging_product: 'whatsapp', recipient_type: 'individual', to: job.to.replace(/\D/g, ''), type: 'template',
  template: {name: message.template, language: {code: 'pt_BR'}, components: [{type: 'body', parameters: message.params.map(text => ({type: 'text', text}))}]},
 };
 try {
  const response = await fetchImpl(API, {method: 'POST', headers: {'D360-API-KEY': key, 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(8000)});
  // Não copiar o corpo da resposta: pode conter números de telefone.
  if (!response.ok) return {outcome: response.status === 429 || response.status >= 500 ? 'retry' : 'failed', providerId: null, code: `http_${response.status}`};
  const result = await response.json().catch(() => null);
  const id = result?.messages?.[0]?.id;
  if (typeof id !== 'string' || id.length > 200) return {outcome: 'retry', providerId: null, code: 'invalid_provider_response'};
  return {outcome: 'accepted', providerId: id, code: null};
 } catch {
  return {outcome: 'retry', providerId: null, code: 'provider_network'};
 }
}

// Até `limit` alertas por chamada. Sem a chave da 360dialog, nada é consumido da fila.
export async function processOwnerWhatsapp({db, whatsappKey, fetchImpl = fetch, limit = 3}) {
 await db.markOwnerWhatsappProvider(Boolean(whatsappKey));
 if (!whatsappKey) return 'provider_not_configured';
 await db.enqueueOwnerDailyWhatsapp();
 let last = 'idle';
 for (let i = 0; i < limit; i++) {
  const job = await db.prepareOwnerWhatsapp();
  if (!job) break;
  if (job.skip) { last = 'skipped'; continue; }
  let message;
  try { message = buildOwnerWhatsapp(job); } catch { await db.finishOwnerWhatsapp(job.id, 'failed', null, 'invalid_private_job'); last = 'failed'; continue; }
  const result = await sendOwnerWhatsapp(job, message, whatsappKey, fetchImpl);
  await db.finishOwnerWhatsapp(job.id, result.outcome, result.providerId, result.code);
  last = result.outcome;
  if (result.outcome !== 'accepted') break;
 }
 return last;
}
