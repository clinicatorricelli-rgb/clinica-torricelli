import test from 'node:test';import assert from 'node:assert/strict';
import {createPacer,sendTemplate,processOwnerWhatsapp} from '../supabase/functions/_shared/owner-whatsapp.mjs';
import {processClientWhatsapp} from '../supabase/functions/_shared/client-whatsapp.mjs';
// Ritmo dos envios de WhatsApp (26/11: um 429 quando duas mensagens saíram no mesmo segundo)
// e registro só do número do erro do provedor. Relógio falso; nada sai para a rede.

function fakeTime(){let now=0;const sleeps=[];return {clock:()=>now,sleep:async ms=>{sleeps.push(ms);now+=ms;},advance:ms=>{now+=ms;},sleeps};}

test('ritmo: 2 s entre envios e o resto fica para a próxima rodada',async()=>{
 const t=fakeTime(),p=createPacer({clock:t.clock,sleep:t.sleep});
 assert.equal(await p.ready(),true);assert.deepEqual(t.sleeps,[],'o primeiro envio não espera');
 p.sent();t.advance(300);
 assert.equal(await p.ready(),true);assert.deepEqual(t.sleeps,[1700],'espera só o que falta para 2 s');
 p.sent();t.advance(5000);
 assert.equal(await p.ready(),true);assert.deepEqual(t.sleeps,[1700],'se já passaram 2 s, não espera');
 p.sent();
 assert.equal(await p.ready(),false,'passaria de 8 s: fica para a rodada seguinte');
});

test('aviso da Eduarda e confirmação da cliente na mesma rodada saem com 2 s de intervalo',async()=>{
 const t=fakeTime(),pacer=createPacer({clock:t.clock,sleep:t.sleep}),sentAt=[];
 const id1='11111111-1111-4111-8111-111111111111',id2='22222222-2222-4222-8222-222222222222';
 const facts={customer_name:'Ana Fictícia',service_name:'Lash Lifting',starts_at:'2026-12-04T17:30:00Z'};
 let owner=0,client=0;
 const db={markOwnerWhatsappProvider:async()=>{},enqueueOwnerDailyWhatsapp:async()=>{},
  prepareOwnerWhatsapp:async()=>owner++?null:{id:id1,to:'+5511900000001',kind:'booked',facts:{...facts,service_variant:'Aplicação'}},finishOwnerWhatsapp:async()=>{},
  prepareClientWhatsapp:async()=>client++?null:{id:id2,to:'+5511900000002',kind:'confirmation',facts},finishClientWhatsapp:async()=>{}};
 const fetchImpl=async()=>{sentAt.push(t.clock());return new Response(JSON.stringify({messages:[{id:'wamid.F'}]}),{status:200});};
 assert.equal(await processOwnerWhatsapp({db,whatsappKey:'k',fetchImpl,pacer}),'accepted');
 assert.equal(await processClientWhatsapp({db,whatsappKey:'k',fetchImpl,pacer}),'accepted');
 assert.deepEqual(sentAt,[0,2000]);
});

test('sem tempo na rodada, a mensagem nem é preparada (não perde tentativa)',async()=>{
 let prepared=0;const pacer={ready:async()=>false,sent(){}};
 const db={prepareClientWhatsapp:async()=>{prepared++;return null;},finishClientWhatsapp:async()=>{}};
 assert.equal(await processClientWhatsapp({db,whatsappKey:'k',fetchImpl:async()=>{throw new Error('não deveria enviar');},pacer}),'idle');
 assert.equal(prepared,0);
});

test('recusa do provedor: guarda só o número do erro, nunca o texto',async()=>{
 const msg={template:'clinica_confirmacao_cliente',params:['Ana']};
 const r429=await sendTemplate('+5511900000001',msg,'k',async()=>new Response(JSON.stringify({error:{code:130429,message:'Rate limit hit for 5511900000001'}}),{status:429}));
 assert.deepEqual(r429,{outcome:'retry',providerId:null,code:'http_429_130429'});
 const r400=await sendTemplate('+5511900000001',msg,'k',async()=>new Response(JSON.stringify({errors:[{code:131026,title:'Message undeliverable'}]}),{status:400}));
 assert.deepEqual(r400,{outcome:'failed',providerId:null,code:'http_400_131026'});
 const texto=await sendTemplate('+5511900000001',msg,'k',async()=>new Response('{"error":{"code":"5511900000001"}}',{status:400}));
 assert.equal(texto.code,'http_400','código que não é número curto não é copiado');
 const html=await sendTemplate('+5511900000001',msg,'k',async()=>new Response('<html>erro</html>',{status:502}));
 assert.deepEqual(html,{outcome:'retry',providerId:null,code:'http_502'});
});
