import test from 'node:test';import assert from 'node:assert/strict';
import {catalog} from '../src/catalog.mjs';
import {FEATURED,groupServices,visibleGroups,normalize} from '../src/services-view.mjs';
const groups=groupServices(catalog);

test('aplicação e manutenção do mesmo serviço viram um cartão só',()=>{
 assert.equal(groups.length,new Set(catalog.map(s=>s.name)).size);
 const volume=groups.find(g=>g.name==='Volume Europeu');
 assert.deepEqual(volume.options.map(o=>o.variant),['Aplicação','Manutenção']);
 assert.equal(volume.fromCents,Math.min(...volume.options.map(o=>o.price_cents)));
});

test('sem busca, aparecem só os destaques, na ordem escolhida',()=>{
 for(const name of FEATURED)assert.ok(groups.some(g=>g.name===name),`destaque fora do catálogo: ${name}`);
 assert.deepEqual(visibleGroups(groups).map(g=>g.name),FEATURED);
 assert.ok(FEATURED.length>=4&&FEATURED.length<=5);
 assert.equal(visibleGroups(groups,'',{showAll:true}).length,groups.length);
});

test('a busca acha qualquer serviço, sem depender de acento ou maiúscula',()=>{
 assert.deepEqual(visibleGroups(groups,'cleopatra').map(g=>g.name),['Capping Cleópatra']);
 assert.deepEqual(visibleGroups(groups,'REMOCAO').map(g=>g.name),['Remoção de cílios']);
 assert.deepEqual(visibleGroups(groups,'fox').map(g=>g.name),['Fox Eyes']);
 assert.ok(visibleGroups(groups,'volume').length>=3);
 assert.deepEqual(visibleGroups(groups,'capping manutencao').map(g=>g.name),['Capping Cleópatra','Capping Brasileiro']);
 assert.deepEqual(visibleGroups(groups,'xyz'),[]);
 assert.equal(normalize(' Micropigmentação '),'micropigmentacao');
});
