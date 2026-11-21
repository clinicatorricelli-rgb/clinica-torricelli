import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,readdirSync} from 'node:fs';
// O site está em produção: nenhuma tela pode pedir dados fictícios ou se apresentar como teste.
// (auth-errors.mjs só reconhece a mensagem antiga do servidor; legal.mjs fala de "testes" em outro sentido.)
const dir=new URL('../src/',import.meta.url);
const files=readdirSync(dir).filter(f=>/\.(jsx|mjs)$/.test(f)&&!['legal.mjs','auth-errors.mjs'].includes(f));
test('nenhuma tela fala em teste, dado fictício ou "em preparação"',()=>{
 for(const f of files){
  const s=readFileSync(new URL(f,dir),'utf8');
  for(const bad of [/fictíci/i,/de testes/i,/ambiente de testes/i,/em preparação/i,/próxima etapa/i,/horários de teste/i])
   assert.doesNotMatch(s,bad,`${f}: ${bad}`);
 }
});
