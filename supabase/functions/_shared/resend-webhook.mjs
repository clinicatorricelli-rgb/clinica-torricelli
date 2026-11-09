// Resend uses Svix's signed raw-body protocol. Native WebCrypto verifies the
// HMAC without a JavaScript string comparison or an additional runtime package.
// https://resend.com/docs/webhooks/verify-webhooks-requests
// https://docs.svix.com/receiving/verifying-payloads/how-manual
const MAX_BODY_BYTES = 64 * 1024;
const encoder = new TextEncoder();
const supportedEvents = new Set(['email.delivered', 'email.bounced', 'email.complained', 'email.failed']);
const responseHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};

function invalid() { throw new Error('Invalid webhook'); }
function base64Bytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length > 256) invalid();
  try { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
  catch { invalid(); }
}
function rawBytes(rawBody) {
  const bytes = typeof rawBody === 'string' ? encoder.encode(rawBody) : rawBody;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_BODY_BYTES) invalid();
  return bytes;
}

/** `now` is a millisecond timestamp, Date, or a function returning either. */
export async function verifyResendWebhook(rawBody, headers, secret, {now = Date.now} = {}) {
  const body = rawBytes(rawBody);
  const h = headers instanceof Headers ? headers : new Headers(headers);
  const eventId = h.get('svix-id');
  const timestamp = h.get('svix-timestamp');
  const signatures = h.get('svix-signature');
  if (!eventId || !/^[A-Za-z0-9_-]{1,128}$/.test(eventId)
      || !timestamp || !/^\d{1,13}$/.test(timestamp)
      || !signatures || signatures.length > 4096
      || typeof secret !== 'string' || !secret.startsWith('whsec_')) invalid();
  const current = Number(typeof now === 'function' ? now() : now);
  const seconds = Number(timestamp);
  if (!Number.isFinite(current) || !Number.isSafeInteger(seconds)
      || Math.abs(Math.floor(current / 1000) - seconds) > 300) invalid();

  const secretBytes = base64Bytes(secret.slice(6));
  if (secretBytes.length < 16 || secretBytes.length > 128) invalid();
  const key = await crypto.subtle.importKey('raw', secretBytes, {name: 'HMAC', hash: 'SHA-256'}, false, ['verify']);
  const prefix = encoder.encode(`${eventId}.${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix); signed.set(body, prefix.length);
  const candidates = signatures.trim().split(/\s+/);
  if (candidates.length > 16) invalid();
  let verified = false;
  for (const candidate of candidates) {
    const [version, encoded, ...extra] = candidate.split(',');
    if (version !== 'v1' || !encoded || extra.length) continue;
    let signature;
    try { signature = base64Bytes(encoded); } catch { continue; }
    if (signature.length !== 32) continue;
    // WebCrypto performs the MAC comparison; do not compare secret signatures
    // with === or stop checking the header at its first valid signature.
    const matches = await crypto.subtle.verify('HMAC', key, signature, signed);
    verified = matches || verified;
  }
  if (!verified) invalid();

  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body)); }
  catch { invalid(); }
  if (!supportedEvents.has(payload?.type)) return null;
  const emailId = payload?.data?.email_id;
  if (typeof emailId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(emailId)) invalid();
  // Deliberately discard recipient addresses, bounce bodies and other provider
  // metadata. Persistent deduplication by eventId belongs to the database.
  return {eventId, emailId, type: payload.type};
}

async function boundedBody(request) {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_BODY_BYTES)) {
    throw new RangeError('Body too large');
  }
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch { /* No sensitive error reporting. */ }
        throw new RangeError('Body too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Endpoint handler: no caller-controlled identifiers reach the DB unsigned. */
export function createResendWebhookHandler({secret, recordEvent, now = Date.now}) {
  const respond = (body, status = 200, extra = {}) => Response.json(body, {status, headers: {...responseHeaders, ...extra}});
  return async request => {
    if (request.method !== 'POST') return respond({error: 'Method not allowed'}, 405, {Allow: 'POST'});
    if (!secret) return respond({error: 'Webhook not configured'}, 503);
    let event;
    try {
      const body = await boundedBody(request);
      event = await verifyResendWebhook(body, request.headers, secret, {now});
    } catch (error) {
      return respond({error: 'Invalid webhook'}, error instanceof RangeError ? 413 : 400);
    }
    if (event) {
      try { await recordEvent(event); }
      catch { return respond({error: 'Temporarily unavailable'}, 503); }
    }
    return respond({received: true});
  };
}
