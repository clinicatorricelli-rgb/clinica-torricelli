// Retorno de status do WhatsApp (360dialog → este endereço): entregue, lida ou falhou, para cada
// mensagem que o site enviou. A 360dialog manda aqui também as mensagens que as clientes escrevem
// para a clínica; elas são ignoradas e nada delas é lido além do necessário para achar "statuses".
// A autenticação é um cabeçalho secreto combinado na configuração da 360dialog; quem confere é o
// banco (private.record_whatsapp_statuses), que guarda só o SHA-256 do segredo.
const MAX_BODY_BYTES = 512 * 1024;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;
const STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);
const HEADERS = {
 'Content-Type': 'application/json; charset=utf-8',
 'Cache-Control': 'no-store',
 'Referrer-Policy': 'no-referrer',
 'X-Content-Type-Options': 'nosniff',
 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const reply = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: HEADERS});

// Só id, status, hora e número do erro. Telefone, texto e preço ficam de fora.
export function extractWhatsappStatuses(payload) {
 const out = [];
 const changes = Array.isArray(payload?.entry) ? payload.entry.flatMap(e => Array.isArray(e?.changes) ? e.changes : []) : [];
 for (const change of changes) {
  const list = change?.value?.statuses;
  if (!Array.isArray(list)) continue;
  for (const s of list) {
   if (out.length >= 100) return out;
   const id = s?.id, status = s?.status;
   if (typeof id !== 'string' || !id || id.length > 200 || !STATUSES.has(status)) continue;
   const seconds = Number(s.timestamp);
   const at = Number.isInteger(seconds) && seconds > 1_600_000_000 && seconds < 4_000_000_000 ? new Date(seconds * 1000).toISOString() : null;
   const raw = Number(Array.isArray(s.errors) ? s.errors[0]?.code : undefined);
   const code = Number.isInteger(raw) && raw > 0 && raw < 10_000_000 ? raw : null;
   out.push({id, status, at, code});
  }
 }
 return out;
}

async function readLimited(request) {
 const declared = Number(request.headers.get('content-length'));
 if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
 const reader = request.body?.getReader();
 if (!reader) return '';
 const chunks = [];
 let size = 0;
 for (;;) {
  const {done, value} = await reader.read();
  if (done) break;
  size += value.byteLength;
  if (size > MAX_BODY_BYTES) { await reader.cancel().catch(() => {}); return null; }
  chunks.push(value);
 }
 const all = new Uint8Array(size);
 let offset = 0;
 for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
 return new TextDecoder().decode(all);
}

/** record(secret, statuses) → número de mensagens atualizadas, -1 (não configurado) ou -2 (segredo errado). */
export function createWhatsappStatusHandler({record}) {
 return async function handle(request) {
  if (request.method !== 'POST') return reply({error: 'method_not_allowed'}, 405);
  const secret = request.headers.get('x-clinica-webhook');
  if (!secret || !SECRET.test(secret)) return reply({error: 'unauthorized'}, 401);
  const body = await readLimited(request);
  let payload = null;
  if (body) { try { payload = JSON.parse(body); } catch { payload = null; } }
  // Mesmo sem status (ou com corpo grande demais, como o histórico do aplicativo), o segredo é
  // conferido e a resposta é 200, para a 360dialog não ficar reenviando.
  const statuses = payload ? extractWhatsappStatuses(payload) : [];
  const result = await record(secret, statuses);
  if (result === -2) return reply({error: 'unauthorized'}, 401);
  if (result === -1) return reply({error: 'not_configured'}, 503);
  return reply({ok: true});
 };
}
