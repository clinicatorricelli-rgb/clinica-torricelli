// Trusted operator helper; only synthetic addresses in the isolated test project.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
export function fixtureSignupAccess(email,ref,grant=true){
 if(!process.env.TEST_ALLOW_REMOTE_FIXTURES)return;
 assert.ok(process.env.TEST_ALLOW_REMOTE_FIXTURES==='true'&&/^[a-z]{20}$/.test(ref||'')&&/^fixture-[a-z0-9-]+@example\.test$/.test(email),'Synthetic fixtures in explicitly authorized project only');
 const hash=`encode(sha256(convert_to('${email}','UTF8')),'hex')`;
 const sql=grant?`insert into private.signup_test_access(email_hash,expires_at) values(${hash},now()+interval '15 minutes') on conflict(email_hash) do update set expires_at=excluded.expires_at`:`delete from private.signup_test_access where email_hash=${hash}`;
 const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query',sql,`--remote=${ref}`,'--yes','--output-format','json'],{encoding:'utf8',timeout:60000});
 assert.equal(r.status,0,'Trusted fixture authorization operation must succeed');
}
