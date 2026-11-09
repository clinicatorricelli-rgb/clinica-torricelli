import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyResendWebhook, createResendWebhookHandler} from '../supabase/functions/_shared/resend-webhook.mjs';

const now = 1_800_000_000_000;
const secretBytes = Buffer.from('synthetic-webhook-key-32-characters');
const secret = `whsec_${secretBytes.toString('base64')}`;
const id = 'msg_syntheticEvent';
const emailId = 'c2df09f9-328a-49d2-83a8-b76045dd03bd';
function signedHeaders(body, {timestamp = String(now / 1000), eventId = id} = {}) {
  const signature = createHmac('sha256', secretBytes).update(`${eventId}.${timestamp}.`).update(body).digest('base64');
  return new Headers({'svix-id': eventId, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}`, 'Content-Type': 'application/json'});
}
const payload = type => JSON.stringify({type, data: {email_id: emailId, to: ['synthetic@example.test'], ignored_private_metadata: 'must not escape'}});
const request = (body, headers = signedHeaders(body)) => new Request('https://example.test/webhook', {method: 'POST', headers, body});

test('webhook Svix verifica vetor publicado e eventos Resend por HMAC independente', async () => {
  // Published Svix manual-verification vector, not calculated by this module.
  assert.equal(await verifyResendWebhook('{"event_type":"ping","data":{"success":true}}', {
    'svix-id': 'msg_loFOjxBNrRLzqYUf', 'svix-timestamp': '1731705121',
    'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=',
  }, 'whsec_plJ3nmyCDGBKInavdOK15jsl', {now: 1_731_705_121_000}), null);
  for (const type of ['email.delivered', 'email.bounced', 'email.complained', 'email.failed']) {
    const raw = payload(type);
    assert.deepEqual(await verifyResendWebhook(raw, signedHeaders(raw), secret, {now}), {eventId: id, emailId, type});
  }
  const unknown = payload('email.opened');
  assert.equal(await verifyResendWebhook(unknown, signedHeaders(unknown), secret, {now}), null);
});

test('assinatura cobre bytes originais, evento, tempo e permite rotação v1', async () => {
  const body = payload('email.delivered'), headers = signedHeaders(body);
  await assert.rejects(verifyResendWebhook(`${body} `, headers, secret, {now}), /Invalid webhook/);
  await assert.rejects(verifyResendWebhook(body, headers, `whsec_${Buffer.alloc(32, 1).toString('base64')}`, {now}), /Invalid webhook/);
  const forgedId = new Headers(headers); forgedId.set('svix-id', 'msg_forged');
  await assert.rejects(verifyResendWebhook(body, forgedId, secret, {now}), /Invalid webhook/);
  for (const offset of [-301, 301]) {
    const stale = signedHeaders(body, {timestamp: String(now / 1000 + offset)});
    await assert.rejects(verifyResendWebhook(body, stale, secret, {now}), /Invalid webhook/);
  }
  const rotated = new Headers(headers);
  rotated.set('svix-signature', `v2,ignored v1,${Buffer.alloc(32).toString('base64')} ${headers.get('svix-signature')}`);
  assert.equal((await verifyResendWebhook(body, rotated, secret, {now})).type, 'email.delivered');
  const unsupported = new Headers(headers); unsupported.set('svix-signature', headers.get('svix-signature').replace('v1,', 'v2,'));
  await assert.rejects(verifyResendWebhook(body, unsupported, secret, {now}), /Invalid webhook/);
  const badTimestamp = new Headers(headers); badTimestamp.set('svix-timestamp', 'NaN');
  await assert.rejects(verifyResendWebhook(body, badTimestamp, secret, {now}), /Invalid webhook/);
});

test('handler autentica antes de persistir, reduz metadados e propaga falha transitória sem dados', async () => {
  const recorded = [];
  const handler = createResendWebhookHandler({secret, now: () => now, recordEvent: async event => recorded.push(event)});
  const body = payload('email.bounced');
  const response = await handler(request(body));
  assert.equal(response.status, 200);
  assert.deepEqual(recorded, [{eventId: id, emailId, type: 'email.bounced'}]);
  assert.deepEqual(await response.json(), {received: true});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await handler(request(`${body} `, signedHeaders(body)))).status, 400);
  assert.equal(recorded.length, 1);
  const unknown = payload('email.opened');
  assert.equal((await handler(request(unknown))).status, 200);
  assert.equal(recorded.length, 1);
  const failing = createResendWebhookHandler({secret, now, recordEvent: async () => {throw Error('private recipient or secret');}});
  const failure = await failing(request(body));
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes('private recipient'), false);
});

test('handler recusa método, configuração ausente e payload grande sem processar', async () => {
  let calls = 0;
  const recordEvent = async () => { calls++; };
  const handler = createResendWebhookHandler({secret, now, recordEvent});
  const get = await handler(new Request('https://example.test/webhook'));
  assert.equal(get.status, 405); assert.equal(get.headers.get('allow'), 'POST');
  const unconfigured = createResendWebhookHandler({recordEvent});
  assert.equal((await unconfigured(request(payload('email.failed')))).status, 503);
  const oversized = 'a'.repeat(64 * 1024 + 1);
  assert.equal((await handler(request(oversized))).status, 413);
  const multibyte = 'é'.repeat(32 * 1024 + 1);
  await assert.rejects(verifyResendWebhook(multibyte, signedHeaders(multibyte), secret, {now}), /Invalid webhook/);
  assert.equal(calls, 0);
});
