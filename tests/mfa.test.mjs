import test from 'node:test';import assert from 'node:assert/strict';import {existingTotp} from '../src/mfa.mjs';
test('retoma fator pendente após reload mesmo com atalho totp vazio',()=>{
 const pending={id:'fixture-pending',factor_type:'totp',status:'unverified'};
 assert.deepEqual(existingTotp({all:[pending],totp:[]}),pending);
 const verified={id:'fixture-verified',factor_type:'totp',status:'verified'};
 assert.deepEqual(existingTotp({all:[pending,verified],totp:[verified]}),verified);
 assert.equal(existingTotp({all:[],totp:[]}),null);
});
