import test from 'node:test';import assert from 'node:assert/strict';
import {createPacer,sendTemplate,processOwnerWhatsapp} from '../supabase/functions/_shared/owner-whatsapp.mjs';
import {processClientWhatsapp} from '../supabase/functions/_shared/client-whatsapp.mjs';
// Ritmo dos envios de WhatsApp (26/11: um 429 quando duas mensagens saíram no mesmo segundo)
// e registro só do número do erro do provedor. Relógio falso; nada sai para a rede.

function fakeTime(){let now=0;const sleeps=[];return {clock:()=>now,sleep:async ms=>{sleeps.push(ms);now+=ms;},advance:ms=>{now+=ms;},sleeps};}

test('ritmo: 4 s entre envios (padrão) e o resto fica para a próxima rodada',async()=>{
 const t=fakeTime(),p=createPacer({clock:t.clock,sleep:t.sleep});
 assert.equal(p.fits(),true);await p.ready();assert.deepEqual(t.sleeps,[],'o primeiro envio não espera');
 p.sent();t.advance(300);
 assert.equal(p.fits(),true);await p.ready();assert.deepEqual(t.sleeps,[3700],'espera só o que falta para 4 s');
 p.sent();t.advance(4000);
 assert.equal(p.fits(),true);await p.ready();assert.deepEqual(t.sleeps,[3700],'se já passaram 4 s, não espera');
 p.sent();
 assert.equal(p.fits(),false,'passaria de 8 s: fica para a rodada seguinte');
});

test('aviso da Eduarda e confirmação da cliente na mesma rodada saem com 4 s de intervalo',async()=>{
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
 assert.deepEqual(sentAt,[0,4000]);
});

test('sem tempo na rodada, a mensagem nem é preparada (não perde tentativa)',async()=>{
 let prepared=0;const pacer={fits:()=>false,ready:async()=>{},sent(){}};
 const db={prepareClientWhatsapp:async()=>{prepared++;return null;},finishClientWhatsapp:async()=>{}};
 assert.equal(await processClientWhatsapp({db,whatsappKey:'k',fetchImpl:async()=>{throw new Error('não deveria enviar');},pacer}),'idle');
 assert.equal(prepared,0);
});

test('recusa do provedor: guarda o número do erro ou um texto curto sem algarismos',async()=>{
 const msg={template:'clinica_confirmacao_cliente',params:['Ana']};
 const r429=await sendTemplate('+5511900000001',msg,'k',async()=>new Response(JSON.stringify({error:{code:130429,message:'Rate limit hit for 5511900000001'}}),{status:429}));
 assert.deepEqual(r429,{outcome:'retry',providerId:null,code:'http_429_130429'});
 const r400=await sendTemplate('+5511900000001',msg,'k',async()=>new Response(JSON.stringify({errors:[{code:131026,title:'Message undeliverable'}]}),{status:400}));
 assert.deepEqual(r400,{outcome:'failed',providerId:null,code:'http_400_131026'});
 const texto=await sendTemplate('+5511900000001',msg,'k',async()=>new Response('{"error":{"code":"5511900000001"}}',{status:400}));
 assert.equal(texto.code,'http_400','código que não é número curto não é copiado');
 const gateway=await sendTemplate('+5511900000001',msg,'k',async()=>new Response(JSON.stringify({message:'API rate limit exceeded for 5511900000001'}),{status:429}));
 assert.deepEqual(gateway,{outcome:'retry',providerId:null,code:'http_429:api_rate_limit_exceeded_for'});
 const meta=await sendTemplate('+5511900000001',msg,'k',async()=>new Response(JSON.stringify({meta:{success:false,http_code:429,developer_message:'Too many requests. Retry in 60s.'}}),{status:429}));
 assert.equal(meta.code,'http_429:too_many_requests_retry_in_s');
 const texto2=await sendTemplate('+5511900000001',msg,'k',async()=>new Response('Too Many Requests',{status:429}));
 assert.equal(texto2.code,'http_429:too_many_requests');
 const html=await sendTemplate('+5511900000001',msg,'k',async()=>new Response('<html>erro</html>',{status:502}));
 assert.deepEqual(html,{outcome:'retry',providerId:null,code:'http_502'});
});

test('na rodada do cron, a mensagem da cliente sai antes do aviso da Eduarda',async()=>{
 const {createAvailabilityEmailHandler}=await import('../supabase/functions/_shared/availability-email.mjs');
 const secret='s'.repeat(40),order=[];
 const facts={customer_name:'Ana Fictícia',service_name:'Lash Lifting',service_variant:'Aplicação',starts_at:'2026-12-04T17:30:00Z'};
 let o=0,c=0;
 const db={markProviderReady:async()=>{},enqueue:async()=>{},preparePayloadTransaction:async run=>run({prepare:async()=>null}),
  markOwnerWhatsappProvider:async()=>{},enqueueOwnerDailyWhatsapp:async()=>{},
  prepareOwnerWhatsapp:async()=>o++?null:{id:'11111111-1111-4111-8111-111111111111',to:'+5511900000001',kind:'booked',facts},finishOwnerWhatsapp:async()=>{},
  prepareClientWhatsapp:async()=>c++?null:{id:'22222222-2222-4222-8222-222222222222',to:'+5511900000002',kind:'confirmation',facts},finishClientWhatsapp:async()=>{}};
 const t=fakeTime();
 const handler=createAvailabilityEmailHandler({db,cronSecret:secret,resendKey:'re_fixture',whatsappKey:'k',whatsappPacing:{clock:t.clock,sleep:t.sleep},supabaseUrl:'https://fixture.supabase.co',
  fetchImpl:async(url,o2)=>{const b=JSON.parse(o2.body);order.push(b.template.name);return Response.json({messages:[{id:'wamid.X'}]});}});
 const res=await handler(new Request('https://fixture.supabase.co/functions/v1/availability-email',{method:'POST',headers:{authorization:`Bearer ${secret}`},body:'{}'}));
 assert.equal(res.status,200);
 assert.deepEqual(order,['clinica_confirmacao_cliente','clinica_aviso_agenda_v2']);
 assert.deepEqual(t.sleeps,[4000]);
});
