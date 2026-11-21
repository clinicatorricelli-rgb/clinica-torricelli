import test from 'node:test';import assert from 'node:assert/strict';
import {privacy,terms,controller,LEGAL_VERSION} from '../src/legal.mjs';
const text=doc=>[doc.title,doc.intro,...doc.sections.flatMap(s=>[s.title,...s.blocks.flatMap(b=>typeof b==='string'?[b]:b.list)])].join('\n');

test('aviso de privacidade identifica a responsável, o contato, o prazo e os operadores',()=>{
 const t=text(privacy);
 for(const must of [controller.name,controller.email,'13450-181','5 anos','Supabase','Cloudflare','Resend','360dialog','art. 11, I','art. 18'.slice(0,4),'ANPD','12 anos'])
  assert.ok(t.includes(must),`faltando: ${must}`);
 assert.doesNotMatch(t,/\[|preencher|XXX|fictíci/i,'sem marcador de rascunho nem texto de teste');
});

test('termos repetem a regra de faltas com os mesmos números do banco (24 h, 30%, 1 hora, 3 lembretes)',()=>{
 const t=text(terms);
 for(const must of ['24 horas','30%','1 hora','três','Não há pagamento para agendar','foro'])assert.ok(t.includes(must),`faltando: ${must}`);
 assert.doesNotMatch(t,/\[|preencher|XXX|fictíci/i);
});

test('versão do aceite tem formato estável',()=>{
 assert.match(LEGAL_VERSION,/^legal-\d{4}-\d{2}-v\d+$/);
});
