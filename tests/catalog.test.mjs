import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog,lateFee} from '../src/catalog.mjs';
test('catálogo completo sem opção de retoque inventada',()=>{
 assert.equal(catalog.length,23);
 assert.equal(new Set(catalog.map(s=>`${s.name}/${s.variant}`)).size,23);
 assert.equal(catalog.filter(s=>s.name.startsWith('Capping')&&s.variant==='Aplicação').every(s=>s.duration_minutes===120&&s.price_cents===19500),true);
 assert.equal(catalog.filter(s=>s.variant==='Manutenção').length,7);
 assert.equal(catalog.reduce((sum,s)=>sum+s.price_cents,0),325000);
});
test('taxa de falta é 30% do serviço, arredondada ao centavo',()=>{
 for(const s of catalog){assert.ok(Number.isInteger(lateFee(s.price_cents)));assert.ok(lateFee(s.price_cents)>0&&lateFee(s.price_cents)<s.price_cents);}
 assert.equal(lateFee(19500),5850);assert.equal(lateFee(101),30);assert.equal(lateFee(105),32);
});
test('ficha é exigida só nas extensões de cílios',()=>{
 assert.deepEqual(catalog.filter(s=>s.requires_intake).map(s=>s.id),[2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
});
test('seed corresponde integralmente ao catálogo',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/202611040002_catalog.sql',import.meta.url),'utf8');
 for(const s of catalog)assert.ok(sql.includes(`(${s.id},'${s.name}','${s.variant}',${s.price_cents},${s.duration_minutes},${s.maintenance_min_days??'null'},${s.maintenance_max_days??'null'})`));
});
