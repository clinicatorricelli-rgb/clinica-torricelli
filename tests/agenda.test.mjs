import test from 'node:test';import assert from 'node:assert/strict';
import {clinicDay,weekStart,weekDays,dayLabel,weekLabel,byDay,activeCount} from '../src/agenda.mjs';

test('semana vai de segunda a sábado, inclusive quando o dia é domingo',()=>{
 assert.equal(weekStart('2026-11-25'),'2026-11-23','quarta → segunda');
 assert.equal(weekStart('2026-11-23'),'2026-11-23','segunda continua segunda');
 assert.equal(weekStart('2026-11-29'),'2026-11-23','domingo → segunda anterior');
 assert.deepEqual(weekDays('2026-11-23'),['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28']);
 assert.equal(weekLabel('2026-11-30'),'30/11 a 05/12');
 assert.match(dayLabel('2026-11-23'),/segunda-feira, 23\/11/);
});

test('agendamento das 22h em São Paulo fica no dia certo, não no dia seguinte (UTC)',()=>{
 assert.equal(clinicDay('2026-11-24T01:00:00Z'),'2026-11-23');
});

test('agrupa por dia, cancelados por último, e conta só os que valem',()=>{
 const items=[
  {id:'a',starts_at:'2026-11-23T13:00:00Z',status:'cancelled'},
  {id:'b',starts_at:'2026-11-23T15:00:00Z',status:'confirmed'},
  {id:'c',starts_at:'2026-11-23T12:00:00Z',status:'completed'},
  {id:'d',starts_at:'2026-11-29T12:00:00Z',status:'confirmed'}, // domingo: fora da grade
 ];
 const map=byDay(items,weekDays('2026-11-23'));
 assert.deepEqual(map['2026-11-23'].map(i=>i.id),['c','b','a']);
 assert.equal(activeCount(map['2026-11-23']),2);
 assert.deepEqual(map['2026-11-24'],[]);
});
