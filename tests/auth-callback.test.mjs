import test from 'node:test';import assert from 'node:assert/strict';
import {emailCallback} from '../src/auth-callback.mjs';
test('convite e recovery verificados exigem definição de senha, sem conceder papel',()=>{
 for(const type of ['invite','recovery'])assert.deepEqual(emailCallback(`?token_hash=ficticio&type=${type}&role=admin`),{kind:'otp',token_hash:'ficticio',type,requiresPassword:true});
 assert.equal(emailCallback('?token_hash=ficticio&type=signup').requiresPassword,false);
 assert.throws(()=>emailCallback('?token_hash=ficticio&type=admin'),/Unsupported/);
 assert.deepEqual(emailCallback('?code=ficticio'),{kind:'pkce',code:'ficticio'});
 assert.equal(emailCallback('?role=admin'),null);
 assert.deepEqual(emailCallback('','#access_token=ficticio&refresh_token=ficticio-refresh&type=invite'),{kind:'session',access_token:'ficticio',refresh_token:'ficticio-refresh',requiresPassword:true});
 assert.throws(()=>emailCallback('','#access_token=ficticio&type=invite'),/Unsupported/);
});

test('link vencido ou já usado vira aviso, sem tentar entrar',()=>{
 assert.deepEqual(emailCallback('','#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'),{kind:'error',code:'otp_expired'});
 assert.deepEqual(emailCallback('?error=access_denied&error_description=x'),{kind:'error',code:'access_denied'});
 assert.deepEqual(emailCallback('','#error_code=<script>'),{kind:'error',code:'unknown'});
 assert.equal(emailCallback('','#access_token=a&refresh_token=b&type=signup').requiresPassword,false);
});
