import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAvailabilityEmail,createAvailabilityEmailHandler} from '../supabase/functions/_shared/availability-email.mjs';

const base='https://fixture.supabase.co/functions/v1/availability-email';
const secret='synthetic-cron-secret-'.repeat(3);
const fixture=()=>({id:'22222222-2222-4222-8222-222222222222',to:'fixture-recipient@example.test',days:['2030-01-08','2030-01-07','2030-01-07'],unsubscribe_token:'a'.repeat(64),payload:null});
const req=(body='{}',authorization=`Bearer ${secret}`)=>new Request(base,{method:'POST',headers:{authorization,'content-type':'application/json'},body});
function setup(overrides={}) {
 const calls={ready:[],enqueued:0,prepared:0,claimed:0,finished:[],requests:[],unsubscribed:[],frozen:0,prepareCommitted:false};
 const job=fixture();
 const db={
  async markProviderReady(value){calls.ready.push(value);},
  async enqueue(){calls.enqueued++;},
  async preparePayloadTransaction(run){const result=await run({
   async prepare(){calls.prepared++;return job;},
   async freezePayload(id,payload){calls.frozen++;job.payload=structuredClone(payload);return job.payload;},
  });calls.prepareCommitted=true;return result;},
  async withDeliveryTransaction(run){return await run({
   async claim(id){assert.ok(calls.prepareCommitted);assert.equal(id,job.id);calls.claimed++;return {id:job.id,payload:job.payload};},
   async finish(...args){calls.finished.push(args);},
  });},
  async unsubscribe(token){calls.unsubscribed.push(token);return true;},
 };
 const handler=createAvailabilityEmailHandler({db,cronSecret:secret,resendKey:'synthetic-key',supabaseUrl:'https://fixture.supabase.co',fetchImpl:async(url,options)=>{calls.requests.push({url,options});return Response.json({id:'33333333-3333-4333-8333-333333333333'});},...overrides});
 return {handler,calls,job,db};
}

test('worker rejects public/forged callers and arbitrary recipients before accessing the queue',async()=>{
 const {handler,calls}=setup();
 assert.equal((await handler(req('{}','Bearer wrong'))).status,401);
 assert.equal((await handler(req(JSON.stringify({to:'someone@example.test'})))).status,400);
 assert.equal((await handler(req('[]'))).status,400);
 assert.equal((await handler(new Request(base+'?job=arbitrary',{method:'POST',headers:{authorization:`Bearer ${secret}`},body:'{}'}))).status,400);
 assert.equal(calls.claimed,0);assert.equal(calls.ready.length,0);assert.equal(calls.requests.length,0);
});

test('missing API secret records readiness without claiming or sending',async()=>{
 const {handler,calls}=setup({resendKey:undefined});
 const response=await handler(req());assert.equal(response.status,503);assert.deepEqual(await response.json(),{status:'provider_not_configured'});
 assert.deepEqual(calls.ready,[false]);assert.equal(calls.enqueued,0);assert.equal(calls.prepared,0);assert.equal(calls.claimed,0);assert.equal(calls.requests.length,0);
});

test('one individual message with a stable idempotency key and sanitized acceptance response',async()=>{
 const {handler,calls,job}=setup();
 const response=await handler(req());assert.deepEqual(await response.json(),{status:'accepted'});
 assert.equal(calls.requests.length,1);assert.equal(calls.requests[0].url,'https://api.resend.com/emails');
 assert.equal(calls.requests[0].options.headers['Idempotency-Key'],`availability-email/${job.id}`);
 assert.deepEqual(JSON.parse(calls.requests[0].options.body).to,[job.to]);
 assert.deepEqual(calls.finished,[[job.id,'accepted','33333333-3333-4333-8333-333333333333',null]]);
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 assert.match(response.headers.get('cache-control'),/no-store/);
});

test('timeout and retry reuse the exact stored payload, key and recipient',async()=>{
 const requests=[];let attempt=0;
 const {handler,calls,job}=setup({fetchImpl:async(url,options)=>{requests.push(options);if(++attempt===1)throw Error('provider included a private address and credential');return Response.json({id:'33333333-3333-4333-8333-333333333333'});}});
 assert.deepEqual(await (await handler(req())).json(),{status:'retry'});
 job.days.push('2030-01-09');
 assert.deepEqual(await (await handler(req())).json(),{status:'accepted'});
 assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);assert.equal(calls.frozen,1);
 assert.deepEqual(calls.finished[0],[job.id,'retry',null,'provider_network']);
});

test('rate limits and temporary failures retry; authentication failure stops this delivery',async()=>{
 for(const [status,outcome]of [[429,'retry'],[500,'retry'],[409,'retry'],[401,'failed'],[403,'failed'],[422,'failed']]) {
  const {handler,calls}=setup({fetchImpl:async()=>new Response('private provider details',{status})});
  assert.deepEqual(await (await handler(req())).json(),{status:outcome});assert.equal(calls.finished[0][3],`http_${status}`);
 }
});

test('unsubscribe GET redirects to Pages confirmation; POST performs bounded email-only revocation',async()=>{
 const {handler,calls}=setup();const link=base+'/unsubscribe?token='+'b'.repeat(64);
 const response=await handler(new Request(link));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://clinica-torriceli-previa.pages.dev/?view=unsubscribe#token='+'b'.repeat(64));assert.equal(await response.text(),'');assert.equal(calls.unsubscribed.length,0);
 for(let i=0;i<2;i++)assert.deepEqual(await (await handler(new Request(link,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}))).json(),{status:'preference_updated'});
 assert.deepEqual(calls.unsubscribed,['b'.repeat(64),'b'.repeat(64)]);
 assert.equal((await handler(new Request(base+'/unsubscribe?token=forged',{method:'POST',body:''}))).status,415);
 assert.equal((await handler(new Request(link,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'enabled=true'}))).status,400);
 assert.equal(calls.claimed,0);assert.equal(calls.requests.length,0);
});

test('oversized requests and internal failures never reveal database errors or contacts',async()=>{
 const {handler}=setup({db:{async markProviderReady(){throw Error('private contact and database password');}}});
 const response=await handler(req());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'temporarily_unavailable'});
 assert.equal((await handler(req(' '.repeat(1025)))).status,413);
});

test('message contains current-date links, explicit opt-out and no guarantee of a reservation',()=>{
 const payload=buildAvailabilityEmail(fixture(),'https://fixture.supabase.co');
 assert.deepEqual(payload.to,['fixture-recipient@example.test']);assert.match(payload.text,/07\/01\/2030, 08\/01\/2030/);
 assert.match(payload.text,/não reserva nem garante/);assert.match(payload.html,/view=services/);
 assert.match(payload.text,/https:\/\/clinica-torriceli-previa\.pages\.dev\/\?view=unsubscribe#token=[a-f0-9]{64}/);
 assert.match(payload.html,/href="https:\/\/clinica-torriceli-previa\.pages\.dev\/\?view=unsubscribe#token=[a-f0-9]{64}"/);
 assert.match(payload.headers['List-Unsubscribe'],/^<https:\/\/fixture\.supabase\.co\/functions\/v1\/availability-email\/unsubscribe\?token=[a-f0-9]{64}>$/);
 assert.equal(payload.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.throws(()=>buildAvailabilityEmail({...fixture(),to:'first@example.test,second@example.test'},'https://fixture.supabase.co'),/invalid_private_job/);
});

test('revocation between durable preparation and claim prevents the provider request',async()=>{
 const {handler,db,calls}=setup();
 db.withDeliveryTransaction=async run=>run({async claim(){return null;}});
 assert.deepEqual(await (await handler(req())).json(),{status:'idle'});
 assert.equal(calls.frozen,1);assert.equal(calls.requests.length,0);assert.equal(calls.finished.length,0);
});

test('provider acceptance followed by a database failure still retries the durably frozen request',async()=>{
 const requests=[];const {handler,db,job}=setup({fetchImpl:async(url,options)=>{requests.push(options);return Response.json({id:'33333333-3333-4333-8333-333333333333'});}});
 let completion=0;
 db.withDeliveryTransaction=async run=>run({
  async claim(){return {id:job.id,payload:job.payload};},
  async finish(){if(++completion===1)throw Error('private SQL connection details');},
 });
 const first=await handler(req());assert.equal(first.status,503);assert.deepEqual(await first.json(),{error:'temporarily_unavailable'});
 job.days.push('2030-01-10');
 assert.deepEqual(await (await handler(req())).json(),{status:'accepted'});
 assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);
 assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
});

test('webhook endpoint delegates before cron authentication without accessing delivery flow',async()=>{
 let received=0;
 const {handler,calls}=setup({webhookHandler:async()=>{received++;return Response.json({received:true});}});
 assert.deepEqual(await (await handler(new Request(base+'/webhook',{method:'POST',body:'signed provider fixture'}))).json(),{received:true});
 assert.equal(received,1);assert.equal(calls.enqueued,0);assert.equal(calls.claimed,0);
});

test('unsubscribe CORS allows only the exact Pages origin and never exposes dispatch',async()=>{
 const {handler,calls}=setup();const link=base+'/unsubscribe?token='+'b'.repeat(64);const origin='https://clinica-torriceli-previa.pages.dev';
 const preflight=await handler(new Request(link,{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type'}}));
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.equal(preflight.headers.get('vary'),'Origin');assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
 const posted=await handler(new Request(link,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}));
 assert.equal(posted.status,200);assert.equal(posted.headers.get('access-control-allow-origin'),origin);
 const unknown=await handler(new Request(link,{method:'POST',headers:{origin:'https://another.example.test','content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click'}));
 assert.equal(unknown.status,403);assert.equal(unknown.headers.get('access-control-allow-origin'),null);assert.equal(calls.unsubscribed.length,1);
 const dispatch=await handler(new Request(base,{method:'OPTIONS',headers:{origin}}));
 assert.equal(dispatch.status,405);assert.equal(dispatch.headers.get('access-control-allow-origin'),null);
});
