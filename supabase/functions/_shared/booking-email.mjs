// E-mails de agendamento: a cliente e a clínica recebem um aviso quando um horário é
// marcado, remarcado ou cancelado. O conteúdo vem só do retrato gravado pelo banco
// (private.booking_emails.facts); nenhuma requisição escolhe destinatário ou texto.

const SITE_ORIGIN = 'https://clinicatorricelli.com.br';
const SENDER = 'Clínica Torricelli <acesso@clinicatorricelli.com.br>';
const WHATSAPP_SHOWN = '(19) 99034-7698';
const WHATSAPP_LINK = 'https://wa.me/5519990347698';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EMAIL = /^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+$/;
const EVENTS = new Set(['booked', 'rescheduled', 'cancelled']);
const AUDIENCES = new Set(['client', 'clinic']);

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const tz = 'America/Sao_Paulo';
export const whenText = iso => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('pt-BR', {timeZone: tz, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'}).format(d);
  const time = new Intl.DateTimeFormat('pt-BR', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(d);
  return `${day}, às ${time}`;
};
export const money = cents => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format((Number(cents) || 0) / 100).replace(/ /g, ' ');
const phoneShown = e164 => {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164 || '');
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 || 'não informado');
};
const cancelKindText = {
  client_early: 'pela cliente, com mais de 24 horas de antecedência (sem taxa)',
  client_grace: 'pela cliente, dentro da tolerância de 1 hora após agendar (sem taxa)',
  client_late: 'pela cliente, com menos de 24 horas de antecedência (taxa a confirmar no painel)',
  clinic: 'pela clínica',
};

function validJob(job) {
  return job && UUID.test(job.id || '') && EVENTS.has(job.event) && AUDIENCES.has(job.audience) &&
    Array.isArray(job.to) && job.to.length >= 1 && job.to.length <= 10 && job.to.every(to => typeof to === 'string' && EMAIL.test(to)) &&
    job.facts && typeof job.facts.service_name === 'string' && !Number.isNaN(Date.parse(job.facts.starts_at));
}

// Monta o e-mail (texto e HTML) a partir do retrato do agendamento.
export function buildBookingEmail(job) {
  if (!validJob(job)) throw new Error('invalid_private_job');
  const f = job.facts;
  const service = f.service_variant ? `${f.service_name} · ${f.service_variant}` : f.service_name;
  const when = whenText(f.starts_at);
  const firstName = String(f.customer_name || '').trim().split(/\s+/)[0] || '';
  let subject, intro, lines = [], closing = [];

  if (job.audience === 'client') {
    const hello = firstName ? `Olá, ${firstName}!` : 'Olá!';
    if (job.event === 'booked') {
      subject = 'Seu horário está confirmado — Clínica Torricelli';
      intro = `${hello} Seu horário na Clínica Torricelli está confirmado.`;
    } else if (job.event === 'rescheduled') {
      subject = 'Seu horário foi remarcado — Clínica Torricelli';
      intro = `${hello} Seu horário na Clínica Torricelli foi remarcado.`;
    } else {
      subject = 'Seu horário foi cancelado — Clínica Torricelli';
      intro = f.cancel_kind === 'clinic'
        ? `${hello} A clínica precisou cancelar o seu horário. Fale com a gente pelo WhatsApp para escolher outro dia.`
        : `${hello} O cancelamento do seu horário foi registrado.`;
    }
    lines.push(['Serviço', service], [job.event === 'cancelled' ? 'Era em' : 'Quando', when]);
    if (job.event === 'rescheduled' && f.old_starts_at) lines.push(['Antes era', whenText(f.old_starts_at)]);
    if (job.event !== 'cancelled') {
      lines.push(['Valor', `${money(f.price_cents)}, pago no atendimento`]);
      closing.push(
        'Precisa mudar? Remarque ou cancele em Minha conta, no site, com mais de 24 horas de antecedência. Aviso com menos de 24 horas ou falta sem justificativa gera taxa de 30% do serviço, cobrada depois.',
      );
    } else if (f.cancel_kind === 'client_late') {
      closing.push('Como o aviso veio com menos de 24 horas de antecedência, a regra de faltas prevê taxa de 30% do serviço. A Eduarda confirma e entra em contato antes de qualquer cobrança.');
    }
    closing.push(`Dúvidas: WhatsApp ${WHATSAPP_SHOWN}.`);
  } else {
    const who = f.customer_name || 'Cliente sem nome';
    if (job.event === 'booked') { subject = `Novo agendamento: ${who} — ${when}`; intro = 'Um novo horário foi agendado pelo site.'; }
    else if (job.event === 'rescheduled') { subject = `Remarcado: ${who} — ${when}`; intro = 'Uma cliente remarcou o horário pelo site.'; }
    else { subject = `Cancelado: ${who} — ${when}`; intro = `Um horário foi cancelado ${cancelKindText[f.cancel_kind] || ''}.`.replace(' .', '.'); }
    lines.push(['Cliente', who], ['WhatsApp da cliente', phoneShown(f.customer_phone)], ['Serviço', service],
      [job.event === 'cancelled' ? 'Era em' : 'Quando', when]);
    if (job.event === 'rescheduled' && f.old_starts_at) lines.push(['Antes era', whenText(f.old_starts_at)]);
    lines.push(['Valor', money(f.price_cents)]);
    closing.push('A agenda completa fica no painel da Eduarda, no site.');
  }

  const account = `${SITE_ORIGIN}/?view=account`;
  const textLines = lines.map(([k, v]) => `${k}: ${v}`).join('\n');
  const text = `${intro}\n\n${textLines}\n\n${closing.join('\n\n')}\n\n${job.audience === 'client' ? 'Minha conta' : 'Painel'}: ${account}\n\nClínica Torricelli`;
  const rows = lines.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b5a52">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join('');
  const contact = job.audience === 'client' ? `<p><a href="${WHATSAPP_LINK}">Falar com a clínica no WhatsApp</a></p>` : (f.customer_phone ? `<p><a href="https://wa.me/${escapeHtml(String(f.customer_phone).replace(/\D/g, ''))}">Abrir WhatsApp da cliente</a></p>` : '');
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;color:#3b2a22;line-height:1.5"><p>${escapeHtml(intro)}</p><table role="presentation" style="border-collapse:collapse">${rows}</table>${closing.map(c => `<p>${escapeHtml(c)}</p>`).join('')}<p><a href="${escapeHtml(account)}">${job.audience === 'client' ? 'Abrir Minha conta' : 'Abrir o painel'}</a></p>${contact}<p style="color:#6b5a52">Clínica Torricelli</p></body></html>`;
  return {from: SENDER, to: job.to, subject, html, text};
}

// Envia pelo Resend com chave de idempotência estável: repetir o envio do mesmo aviso não duplica o e-mail.
export async function sendBookingEmail(job, payload, key, fetchImpl) {
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `booking-email/${job.id}`},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return {outcome: response.status === 429 || response.status === 409 || response.status >= 500 ? 'retry' : 'failed', providerId: null, code: `http_${response.status}`};
    const result = await response.json().catch(() => null);
    if (!UUID.test(result?.id || '')) return {outcome: 'retry', providerId: null, code: 'invalid_provider_response'};
    return {outcome: 'accepted', providerId: result.id, code: null};
  } catch {
    return {outcome: 'retry', providerId: null, code: 'provider_network'};
  }
}

// Processa até `limit` avisos pendentes. Erros aqui não interrompem os avisos de novas vagas.
export async function processBookingEmails({db, resendKey, fetchImpl = fetch, limit = 3}) {
  let sent = 0, last = 'idle';
  for (let i = 0; i < limit; i++) {
    const job = await db.prepareBookingEmail();
    if (!job) break;
    if (job.skip) { last = 'skipped'; continue; }
    let payload;
    try { payload = buildBookingEmail(job); } catch { await db.finishBookingEmail(job.id, 'failed', null, 'invalid_private_job'); last = 'failed'; continue; }
    const result = await sendBookingEmail(job, payload, resendKey, fetchImpl);
    await db.finishBookingEmail(job.id, result.outcome, result.providerId, result.code);
    last = result.outcome;
    if (result.outcome === 'accepted') sent++;
    else break; // provedor com problema: tenta de novo no próximo minuto
  }
  return sent ? 'accepted' : last;
}
