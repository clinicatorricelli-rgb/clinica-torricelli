// Confere o site montado em dist/ antes de publicar (usado pelo GitHub Actions).
// Falha se a montagem saiu desconectada (modo demonstração) ou se contém algo
// com cara de segredo. Nunca imprime valores: só arquivo e categoria.
import {existsSync, readFileSync, readdirSync} from 'node:fs';

const fail = msg => {console.error(`check-bundle: ${msg}`); process.exit(1);};
const expectedUrl = process.env.VITE_SUPABASE_URL;
if (!expectedUrl || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(expectedUrl)) fail('VITE_SUPABASE_URL ausente ou inválida');
if (!/^sb_publishable_/.test(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '')) fail('VITE_SUPABASE_PUBLISHABLE_KEY ausente ou não é chave publicável');

for (const f of ['dist/index.html', 'dist/_headers', 'dist/_redirects', 'dist/media/abertura-v4.mp4']) if (!existsSync(f)) fail(`faltando ${f}`);

const files = readdirSync('dist/assets').filter(f => /\.(js|css|html)$/.test(f)).map(f => `dist/assets/${f}`).concat('dist/index.html');
const text = Object.fromEntries(files.map(f => [f, readFileSync(f, 'utf8')]));
const js = files.filter(f => f.endsWith('.js')).map(f => text[f]).join('\n');
if (!js.includes(expectedUrl)) fail('o bundle não contém o endereço do Supabase: montagem desconectada');

const jwtRole = token => {try {return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role;} catch {return null;}};
const forbidden = [
 ['chave secreta Supabase', /sb_secret_[A-Za-z0-9_-]{8,}/],
 ['token pessoal Supabase', /sbp_[A-Za-z0-9]{20,}/],
 ['chave Resend', /re_[A-Za-z0-9]{6,}_[A-Za-z0-9]{16,}/],
 ['segredo de webhook', /whsec_[A-Za-z0-9+/=]{10,}/],
 ['chave privada', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/],
 ['URL de banco com senha', /postgres(?:ql)?:\/\/[^\s:@/"'`]+:[^\s@/"'`]+@/],
];
const problems = [];
for (const [f, body] of Object.entries(text)) {
 for (const [name, re] of forbidden) if (re.test(body)) problems.push(`${f}: ${name}`);
 for (const m of body.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) if (jwtRole(m[0]) === 'service_role') problems.push(`${f}: JWT service_role`);
}
if (problems.length) fail(`possível segredo no site:\n${problems.join('\n')}`);
console.log(`check-bundle: ok (${files.length} arquivos conferidos, montagem conectada, nenhum segredo encontrado)`);
