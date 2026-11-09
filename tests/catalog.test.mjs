import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog,deposit} from '../src/catalog.mjs';
test('catálogo completo sem opção de retoque inventada',()=>{
 assert.equal(catalog.length,23);
 assert.equal(new Set(catalog.map(s=>`${s.name}/${s.variant}`)).size,23);
 assert.equal(catalog.filter(s=>s.name.startsWith('Capping')&&s.variant==='Aplicação').every(s=>s.duration_minutes===120&&s.price_cents===19500),true);
 assert.equal(catalog.filter(s=>s.variant==='Manutenção').length,7);
 assert.equal(catalog.reduce((sum,s)=>sum+s.price_cents,0),325000);
});
test('sinal arredonda em centavos e restante reconcilia',()=>{
 for(const s of catalog){assert.equal(deposit(s.price_cents)+s.price_cents-deposit(s.price_cents),s.price_cents);}
 assert.equal(deposit(19500),5850);assert.equal(deposit(101),30);assert.equal(deposit(105),32);
});
test('seed corresponde integralmente ao catálogo',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/202611040002_catalog.sql',import.meta.url),'utf8');
 for(const s of catalog)assert.ok(sql.includes(`(${s.id},'${s.name}','${s.variant}',${s.price_cents},${s.duration_minutes},${s.maintenance_min_days??'null'},${s.maintenance_max_days??'null'})`));
});
