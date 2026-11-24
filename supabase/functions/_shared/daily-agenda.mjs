// Agenda do dia por e-mail para a clínica (segunda a sábado, a partir das 6h30).
// O banco decide se é hora de enviar e para quem (private.prepare_daily_agenda).
import {sendBookingEmail} from './booking-email.mjs';

const SITE = 'https://clinicatorricelli.com.br/?view=account';
const SENDER = 'Clínica Torricelli <acesso@clinicatorricelli.com.br>';
const EMAIL = /^[^\s@<>\r\n,;]+@[^\s@<>\r\n,;]+$/;
const tz = 'America/Sao_Paulo';
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const time = iso => new Intl.DateTimeFormat('pt-BR', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));
const dayText = day => new Intl.DateTimeFormat('pt-BR', {weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC'}).format(new Date(`${day}T12:00:00Z`));
const phone = e164 => { const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164 || ''); return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (e164 || 'sem WhatsApp'); };

export function buildDailyAgenda(job) {
 if (!job || !/^\d{4}-\d{2}-\d{2}$/.test(job.day || '') || !Array.isArray(job.to) || !job.to.length || !job.to.every(t => EMAIL.test(t)) || !Array.isArray(job.items)) throw new Error('invalid_private_job');
 const n = job.items.length, when = dayText(job.day);
 const subject = n ? `Agenda de hoje: ${n} atendimento${n > 1 ? 's' : ''} — ${when}` : `Agenda de hoje: nenhum atendimento — ${when}`;
 const lines = job.items.map(i => `${time(i.starts_at)}–${time(i.ends_at)} · ${i.service_name}${i.service_variant ? ` · ${i.service_variant}` : ''} · ${i.customer_name || 'Cliente sem nome'} · WhatsApp ${phone(i.customer_phone)}`);
 const tomorrow = Number(job.tomorrow_count) || 0;
 const after = tomorrow ? `Amanhã: ${tomorrow} atendimento${tomorrow > 1 ? 's' : ''} marcado${tomorrow > 1 ? 's' : ''}.` : 'Amanhã: nenhum atendimento marcado até agora.';
 const intro = n ? `Bom dia! Estes são os atendimentos de hoje, ${when}:` : `Bom dia! Não há atendimentos marcados para hoje, ${when}.`;
 const text = `${intro}\n\n${lines.join('\n')}${n ? '\n\n' : ''}${after}\n\nAgenda completa no painel: ${SITE}\n\nClínica Torricelli`;
 const rows = job.items.map(i => {
  const wa = (i.customer_phone || '').replace(/\D/g, '');
  return `<tr><td style="padding:8px 12px 8px 0;font-weight:bold;white-space:nowrap;vertical-align:top">${escapeHtml(time(i.starts_at))}–${escapeHtml(time(i.ends_at))}</td><td style="padding:8px 0;vertical-align:top"><strong>${escapeHtml(i.service_name)}</strong>${i.service_variant ? ` · ${escapeHtml(i.service_variant)}` : ''}<br>${escapeHtml(i.customer_name || 'Cliente sem nome')}${wa ? ` · <a href="https://wa.me/${escapeHtml(wa)}">WhatsApp ${escapeHtml(phone(i.customer_phone))}</a>` : ''}</td></tr>`;
 }).join('');
 const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;color:#4a240e;line-height:1.5;background:#fbf2e7"><div style="max-width:600px;margin:0 auto;padding:24px"><p style="letter-spacing:3px;font-weight:bold;color:#8a5a26">CLÍNICA TORRICELLI</p><p>${escapeHtml(intro)}</p>${n ? `<table role="presentation" style="border-collapse:collapse">${rows}</table>` : ''}<p>${escapeHtml(after)}</p><p><a href="${escapeHtml(SITE)}">Abrir a agenda completa no painel</a></p></div></body></html>`;
 return {from: SENDER, to: job.to, subject, html, text};
}

export async function processDailyAgenda({db, resendKey, fetchImpl = fetch}) {
 const job = await db.prepareDailyAgenda();
 if (!job) return 'idle';
 let payload;
 try { payload = buildDailyAgenda(job); } catch { await db.finishDailyAgenda(job.day, 'failed', null, 'invalid_private_job'); return 'failed'; }
 const result = await sendBookingEmail({id: `daily-${job.day}`}, payload, resendKey, fetchImpl);
 await db.finishDailyAgenda(job.day, result.outcome, result.providerId, result.code);
 return result.outcome;
}
