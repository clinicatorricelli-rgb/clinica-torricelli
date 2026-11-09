import test from 'node:test';import assert from 'node:assert/strict';import {totp} from './totp-helper.mjs';
test('gerador TOTP de fixture usa vetor RFC6238, não código fixo',()=>{
 assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59),'287082');
 assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',1111111109),'081804');
});
