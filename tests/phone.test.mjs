import test from 'node:test';import assert from 'node:assert/strict';
import {maskPhone,toE164,formatPhone} from '../src/phone.mjs';

test('cliente digita só DDD + número e o site completa o +55',()=>{
 for(const typed of ['19983851726','(19) 98385-1726','19 98385 1726','+55 19 98385-1726','5519983851726','019983851726'])
  assert.equal(toE164(typed),'+5519983851726',typed);
 assert.equal(toE164('1932221234'),'+551932221234','fixo com 8 dígitos também vale');
});

test('número incompleto ou impossível é recusado',()=>{
 for(const bad of ['','983851726','1998385172','19883851726','00983851726','abc']) assert.equal(toE164(bad),null,bad);
});

test('máscara enquanto digita e exibição do número salvo',()=>{
 assert.equal(maskPhone('1'),'(1');
 assert.equal(maskPhone('199'),'(19) 9');
 assert.equal(maskPhone('19983851726'),'(19) 98385-1726');
 assert.equal(maskPhone('1932221234'),'(19) 3222-1234');
 assert.equal(maskPhone('199838517269999'),'(19) 98385-1726','não passa de 11 dígitos');
 assert.equal(formatPhone('+5519983851726'),'(19) 98385-1726');
 assert.equal(formatPhone(null),'');
});
