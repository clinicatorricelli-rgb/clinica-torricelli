import test from 'node:test';import assert from 'node:assert/strict';
import {monthGrid,monthLabel,monthStart,shiftMonth} from '../src/calendar.mjs';

test('calendário mensal vai de segunda a domingo e cobre o mês inteiro',()=>{
 // Novembro/2026: dia 1 é domingo e dia 30 é segunda.
 const nov=monthGrid('2026-11-01');
 assert.equal(nov[0],'2026-10-26','começa na segunda da semana do dia 1');
 assert.equal(nov[nov.length-1],'2026-12-06','termina no domingo da semana do dia 30');
 assert.equal(nov.length%7,0);
 assert.ok(nov.includes('2026-11-01')&&nov.includes('2026-11-30'));
 // Fevereiro/2027: dia 1 é segunda e dia 28 é domingo: exatamente 4 semanas.
 assert.deepEqual([monthGrid('2027-02-01')[0],monthGrid('2027-02-01').length],['2027-02-01',28]);
});

test('troca de mês e nome do mês',()=>{
 assert.equal(monthStart('2026-11-24'),'2026-11-01');
 assert.equal(shiftMonth('2026-12-01',1),'2027-01-01');
 assert.equal(shiftMonth('2026-01-01',-1),'2025-12-01');
 assert.equal(monthLabel('2026-11-01'),'Novembro de 2026');
});
