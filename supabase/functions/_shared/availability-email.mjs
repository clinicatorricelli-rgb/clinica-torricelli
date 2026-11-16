import { timingSafeEqual } from 'node:crypto';

// Links in e-mails point to the clinic's own domain. The previous Pages address
// keeps working, so its pages may still call the unsubscribe endpoint.
const SITE_ORIGIN = 'https://clinicatorricelli.com.br';
const ALLOWED_ORIGINS = new Set([SITE_ORIGIN,'https://www.clinicatorricelli.com.br','https://clinica-torriceli-previa.pages.dev']);
const SITE_URL = `${SITE_ORIGIN}/?view=services`;
const SENDER = 'Clínica Torricelli <acesso@clinicatorricelli.com.br>';
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers: {...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8',...headers}});

function authorized(header, secret) {
  if (typeof secret !== 'string' || secret.length < 32 || !header?.startsWith('Bearer ')) return false;
  const actual = new TextEncoder().encode(header.slice(7));
  const expected = new TextEncoder().encode(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function limitedBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 1024) throw new Error('request_too_large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new Error('request_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

export function buildAvailabilityEmail(job, supabaseUrl) {
  if (!UUID.test(job.id || '') || !TOKEN.test(job.unsubscribe_token || '') || typeof job.to !== 'string' || !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+$/.test(job.to)) throw new Error('invalid_private_job');
  const base = new URL(supabaseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('invalid_server_url');
  const unsubscribe = `${base.origin}/functions/v1/availability-email/unsubscribe?token=${job.unsubscribe_token}`;
  const visibleUnsubscribe = `${SITE_ORIGIN}/?view=unsubscribe#token=${job.unsubscribe_token}`;
  const days = [...new Set(job.days || [])].sort();
  if (!days.length || days.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day))) throw new Error('invalid_private_job');
  const shownDays = days.slice(0, 20).map(day => day.split('-').reverse().join('/'));
  const dates = shownDays.join(', ') + (days.length > 20 ? ` e mais ${days.length - 20} datas` : '');
  const title = 'Novos horários disponíveis';
  const notice = 'A Eduarda publicou novos horários na agenda da Clínica Torricelli.';
  const disclaimer = 'Consulte os horários atuais no site. Este aviso não reserva nem garante um horário.';
  return {
    from: SENDER,
    to: [job.to],
    subject: `${title} — Clínica Torricelli`,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${notice}</p><p>Datas: ${escapeHtml(dates)}.</p><p><a href="${SITE_URL.replaceAll('&','&amp;')}">Consultar horários</a></p><p>${disclaimer}</p><p>Você recebeu este aviso porque autorizou e-mails de novas vagas.</p><p><a href="${escapeHtml(visibleUnsubscribe)}">Desativar avisos de novas vagas por e-mail</a></p><p>Essa escolha não altera os e-mails de acesso à sua conta nem sua preferência de WhatsApp.</p></body></html>`,
    text: `${title}\n\n${notice}\nDatas: ${dates}.\n\nConsultar horários: ${SITE_URL}\n\n${disclaimer}\n\nVocê recebeu este aviso porque autorizou e-mails de novas vagas.\nDesativar avisos por e-mail: ${visibleUnsubscribe}\nEssa escolha não altera os e-mails de acesso à sua conta nem sua preferência de WhatsApp.`,
    headers: {'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'},
  };
}

function validFrozenPayload(payload, job) {
  return payload && payload.from === SENDER && Array.isArray(payload.to) && payload.to.length === 1 && payload.to[0] === job.to && typeof payload.subject === 'string' && typeof payload.html === 'string' && typeof payload.text === 'string' && typeof payload.headers?.['List-Unsubscribe'] === 'string' && payload.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click';
}

async function sendEmail(job, payload, key, fetchImpl) {
  try {
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `availability-email/${job.id}`},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      // Do not copy provider response bodies, which can contain addresses or credentials.
      return {outcome: response.status === 429 || response.status === 409 || response.status >= 500 ? 'retry' : 'failed', providerId: null, code: `http_${response.status}`};
    }
    const result = await response.json().catch(() => null);
    if (!UUID.test(result?.id || '')) return {outcome: 'retry', providerId: null, code: 'invalid_provider_response'};
    return {outcome: 'accepted', providerId: result.id, code: null};
  } catch {
    // The provider may have accepted a timed-out request. SQL bounds retries to
    // its idempotency window, using this exact stored payload and stable key.
    return {outcome: 'retry', providerId: null, code: 'provider_network'};
  }
}

export function createAvailabilityEmailHandler({db, fetchImpl = fetch, cronSecret, resendKey, supabaseUrl, webhookHandler}) {
  return async function handle(request) {
    let corsHeaders = {};
    try {
      const url = new URL(request.url);
      if(url.pathname.endsWith('/webhook')) return webhookHandler ? await webhookHandler(request) : json({error:'webhook_not_configured'},503);
      if (url.pathname.endsWith('/unsubscribe')) {
        const origin=request.headers.get('origin');
        if(origin && !ALLOWED_ORIGINS.has(origin)) return json({error:'origin_not_allowed'},403);
        corsHeaders={'Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}: {})};
        const reply=(value,status=200)=>json(value,status,corsHeaders);
        if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...SECURITY_HEADERS,...corsHeaders,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
        if (!['GET','POST'].includes(request.method)) return reply({error: 'method_not_allowed'}, 405);
        const tokens = url.searchParams.getAll('token');
        const token = tokens.length === 1 && TOKEN.test(tokens[0]) ? tokens[0] : null;
        if (request.method === 'GET') {
          if (!token) return reply({error:'invalid_link'},400);
          // Supabase's shared domain rewrites text/html responses. The Pages
          // route renders confirmation; its fragment keeps the token out of
          // the static host's request URL. GET never changes preferences.
          return new Response(null,{status:303,headers:{...SECURITY_HEADERS,...corsHeaders,'Location':`${SITE_ORIGIN}/?view=unsubscribe#token=${token}`}});
        }
        const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (contentType && contentType !== 'application/x-www-form-urlencoded') return reply({error: 'unsupported_media_type'}, 415);
        const body = await limitedBody(request);
        const form = new URLSearchParams(body);
        if ([...form.keys()].some(name => name !== 'List-Unsubscribe') || (form.has('List-Unsubscribe') && form.get('List-Unsubscribe') !== 'One-Click')) return reply({error: 'invalid_request'}, 400);
        if (token) await db.unsubscribe(token);
        // The same response prevents this endpoint from exposing whether a
        // token/customer exists, and repeated revocation is harmless.
        return reply({status:'preference_updated'});
      }
      if (!url.pathname.endsWith('/availability-email') && !url.pathname.endsWith('/availability-email/')) return json({error: 'not_found'}, 404);
      if (request.method !== 'POST') return json({error: 'method_not_allowed'}, 405);
      if (!authorized(request.headers.get('authorization'), cronSecret)) return json({error: 'unauthorized'}, 401);
      if (url.search) return json({error: 'invalid_request'}, 400);
      const body = await limitedBody(request);
      if (body.trim()) {
        let input;
        try { input = JSON.parse(body); } catch { return json({error: 'invalid_request'}, 400); }
        if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length) return json({error: 'invalid_request'}, 400);
      }
      if (!resendKey) {
        await db.markProviderReady(false);
        return json({status: 'provider_not_configured'}, 503);
      }
      await db.markProviderReady(true);
      // Enqueue commits before preparation: publication materialization can
      // lock delivery rows, while dispatch/revocation lock preferences first.
      await db.enqueue();
      // Freeze in a separate committed transaction before network access. If
      // recording provider acceptance fails, a retry still has the exact same
      // request body/key, irrespective of later publications or template edits.
      const prepared = await db.preparePayloadTransaction(async tx => {
        const job = await tx.prepare();
        if(!job) return null;
        if(!job.payload) await tx.freezePayload(job.id, buildAvailabilityEmail(job, supabaseUrl));
        return {id:job.id,to:job.to};
      });
      if(!prepared) return json({status:'idle'});
      const status = await db.withDeliveryTransaction(async tx => {
        const job = await tx.claim(prepared.id);
        if (!job) return 'idle';
        const payload = job.payload;
        if (!validFrozenPayload(payload, {...job,to:prepared.to})) {
          await tx.finish(job.id, 'failed', null, 'invalid_private_payload');
          return 'failed';
        }
        const result = await sendEmail(job, payload, resendKey, fetchImpl);
        await tx.finish(job.id, result.outcome, result.providerId, result.code);
        return result.outcome;
      });
      return json({status});
    } catch (error) {
      return json({error: error?.message === 'request_too_large' ? 'request_too_large' : 'temporarily_unavailable'}, error?.message === 'request_too_large' ? 413 : 503,corsHeaders);
    }
  };
}
