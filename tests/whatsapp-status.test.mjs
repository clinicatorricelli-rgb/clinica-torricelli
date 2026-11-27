import test from 'node:test';import assert from 'node:assert/strict';
import {extractWhatsappStatuses,createWhatsappStatusHandler} from '../supabase/functions/_shared/whatsapp-status.mjs';
// Endereço que recebe da 360dialog o retorno de cada mensagem. Dados fictícios; nada sai para a rede.
const SECRET='segredo-ficticio-de-teste-0123456789abcdef';
const status=(over={})=>({object:'whatsapp_business_account',entry:[{id:'1',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{display_phone_number:'5511900000000'},
 statuses:[{id:'wamid.A',status:'delivered',timestamp:'1795000000',recipient_id:'5511900000001',pricing:{billable:true},...over}]}}]}]});
const req=(body,headers={},method='POST')=>new Request('https://exemplo.test/functions/v1/availability-email/whatsapp-status',{method,headers:{'content-type':'application/json',...headers},body:method==='POST'?body:undefined});

test('extrai só id, status, hora e número do erro',()=>{
 assert.deepEqual(extractWhatsappStatuses(status()),[{id:'wamid.A',status:'delivered',at:new Date(1795000000*1000).toISOString(),code:null}]);
 const f=extractWhatsappStatuses(status({status:'failed',errors:[{code:131026,title:'Message undeliverable',message:'5511900000001'}]}));
 assert.deepEqual(f,[{id:'wamid.A',status:'failed',at:new Date(1795000000*1000).toISOString(),code:131026}]);
 assert.ok(!JSON.stringify(f).includes('5511900000001'),'telefone não passa adiante');
 // Mensagem de cliente para a clínica: ignorada.
 assert.deepEqual(extractWhatsappStatuses({entry:[{changes:[{value:{messages:[{from:'5511900000001',text:{body:'Oi'}}]}}]}]}),[]);
 assert.deepEqual(extractWhatsappStatuses(status({status:'deleted'})),[]);
 assert.deepEqual(extractWhatsappStatuses(null),[]);
});

test('endereço: exige o segredo, deixa o banco conferir e responde 200 a tudo que for válido',async()=>{
 const calls=[];
 const handle=createWhatsappStatusHandler({record:async(secret,list)=>{calls.push([secret,list]);return secret===SECRET?list.length:-2;}});
 assert.equal((await handle(req(JSON.stringify(status())))).status,401,'sem cabeçalho');
 assert.equal(calls.length,0,'sem cabeçalho, nem chega ao banco');
 assert.equal((await handle(req(JSON.stringify(status()),{'x-clinica-webhook':'curto'}))).status,401);
 assert.equal((await handle(req(JSON.stringify(status()),{'x-clinica-webhook':'outro-segredo-qualquer-0123456789abcdef'}))).status,401,'segredo errado');
 const ok=await handle(req(JSON.stringify(status()),{'x-clinica-webhook':SECRET}));
 assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{ok:true});
 assert.equal(calls.at(-1)[1][0].id,'wamid.A');
 assert.equal((await handle(req('não é json',{'x-clinica-webhook':SECRET}))).status,200,'corpo inválido não gera reenvio');
 assert.deepEqual(calls.at(-1)[1],[]);
 assert.equal((await handle(req('',{},'GET'))).status,405);
 const off=createWhatsappStatusHandler({record:async()=>-1});
 assert.equal((await off(req(JSON.stringify(status()),{'x-clinica-webhook':SECRET}))).status,503);
});
