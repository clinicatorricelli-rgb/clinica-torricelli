import test from 'node:test';import assert from 'node:assert/strict';
import {canFit,overlappingAppointments} from '../src/availability.mjs';
const weekly=[1,2,3,4,5,6].map(weekday=>({weekday,opens_at:'07:00',closes_at:weekday===6?'18:00':'22:00'}));
const restrictions=[{id:'estagio',from_date:'2026-11-04',until_date:null,weekdays:[1,2,3,4,5],from_time:'07:00',until_time:'11:00'}];
const base={day:'2026-11-06',start:'09:00',duration:60,weekly,restrictions};
test('manhã fechada seg–sex sem liberar automaticamente após revisão',()=>{
 assert.equal(canFit(base),false);assert.equal(canFit({...base,day:'2026-12-07'}),false);
 assert.equal(canFit({...base,start:'11:00'}),true);
 assert.equal(canFit({...base,day:'2026-11-07'}),true);
 assert.equal(canFit({...base,day:'2026-11-08',start:'14:00'}),false);
});
test('limites de término e duração de Capping',()=>{
 assert.equal(canFit({...base,start:'20:00',duration:120}),true);
 assert.equal(canFit({...base,start:'20:15',duration:120}),false);
 assert.equal(canFit({...base,day:'2026-11-07',start:'16:00',duration:120}),true);
 assert.equal(canFit({...base,day:'2026-11-07',start:'16:01',duration:120}),false);
});
test('abertura pontual não desfaz bloqueio e não abre outras datas',()=>{
 const open={day:base.day,kind:'open',from_time:'07:00',until_time:'11:00',overrides_restriction_id:'estagio'};
 assert.equal(canFit({...base,exceptions:[open]}),true);
 assert.equal(canFit({...base,day:'2026-11-09',exceptions:[open]}),false);
 assert.equal(canFit({...base,exceptions:[open,{day:base.day,kind:'closed_day'}]}),false);
 assert.equal(canFit({...base,exceptions:[open,{day:base.day,kind:'block',from_time:'09:55',until_time:'12:00'}]}),false);
 assert.equal(canFit({...base,day:'2026-11-07',exceptions:[{day:'2026-11-07',kind:'closed_day'}, {...open,day:'2026-11-07'}]}),false);
});
test('conflitos incluem intervalo e preservam compromisso original',()=>{
 const appointments=[{id:'a',status:'confirmed',starts_at:'2026-11-06T14:00:00-03:00',busy_until:'2026-11-06T15:15:00-03:00'}];
 assert.equal(overlappingAppointments({start:'2026-11-06T15:00:00-03:00',end:'2026-11-06T16:00:00-03:00',appointments}).length,1);
 assert.equal(overlappingAppointments({start:'2026-11-06T15:15:00-03:00',end:'2026-11-06T16:00:00-03:00',appointments}).length,0);
 assert.equal(appointments[0].status,'confirmed');
});
