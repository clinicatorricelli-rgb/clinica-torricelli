import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// Security headers served by Cloudflare Pages (public/_headers), checked against the
// Supabase address that the publish workflow builds with.
const headers=readFileSync(new URL('../public/_headers',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/publicar-site.yml',import.meta.url),'utf8');
const supabaseUrl=workflow.match(/VITE_SUPABASE_URL:\s*(\S+)/)[1];
const csp=Object.fromEntries(headers.match(/Content-Security-Policy: (.*)/)[1].split(';').map(s=>s.trim()).filter(Boolean)
 .map(s=>{const [k,...v]=s.split(/\s+/);return [k,v];}));

test('o navegador só conversa com o projeto Supabase da clínica',()=>{
 assert.deepEqual(csp['connect-src'],["'self'",supabaseUrl]);
});

test('Turnstile liberado só no domínio oficial da Cloudflare; nada de scripts de terceiros',()=>{
 assert.deepEqual(csp['script-src'],["'self'",'https://challenges.cloudflare.com']);
 assert.deepEqual(csp['frame-src'],['https://challenges.cloudflare.com']);
 assert.deepEqual(csp['frame-ancestors'],["'none'"],'o site não pode ser embutido em outro');
 assert.deepEqual(csp['object-src'],["'none'"]);
 assert.ok(!Object.values(csp).flat().some(v=>v.includes("'unsafe-")),'sem unsafe-inline/unsafe-eval');
});

test('a publicação leva só a chave pública do Turnstile',()=>{
 const key=workflow.match(/VITE_TURNSTILE_SITE_KEY:\s*(\S+)/)?.[1];
 assert.match(key,/^0x4[A-Za-z0-9_-]{16,}$/,'Site Key no formato do Cloudflare');
 assert.doesNotMatch(workflow,/TURNSTILE_SECRET|0x4[A-Za-z0-9_-]{30,}/,'nenhuma Secret Key no workflow');
});

test('o navegador é instruído a usar sempre HTTPS',()=>{
 const max=Number(headers.match(/Strict-Transport-Security: max-age=(\d+)/)?.[1]);
 assert.ok(max>=15552000,'pelo menos 180 dias');
});
