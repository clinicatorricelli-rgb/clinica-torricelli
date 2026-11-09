// Trusted operator only. Secrets stay in child-process memory, Vault and Edge secrets.
import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {randomBytes} from 'node:crypto';
const p=JSON.parse(readFileSync('artifacts/project-create-response.json','utf8'));
if(p.name!=='clinica-torriceli-testes'||p.region!=='sa-east-1'||!/^[a-z]{20}$/.test(p.ref))throw Error('Unrecognized test project');
function cli(args){const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args,`--remote=${p.ref}`,'--yes','--output-format','json'],{encoding:'utf8',timeout:120000});if(r.status!==0)throw Error('Email infrastructure operation failed; no private response printed');return JSON.parse(r.stdout||'null');}
function query(sql){const d=cli(['db','query',sql]);return Array.isArray(d)?d:d?.rows??d?.result??[];}
query('create extension if not exists pg_cron;create extension if not exists pg_net with schema extensions;create extension if not exists supabase_vault;');
let secret=query("select decrypted_secret as value from vault.decrypted_secrets where name='availability_email_cron_token' limit 1")[0]?.value;
if(!secret){secret=randomBytes(32).toString('hex');query(`select vault.create_secret('${secret}','availability_email_cron_token','Dedicated email worker invocation token')`);}
if(!/^[0-9a-f]{64}$/.test(secret))throw Error('Invalid invocation secret');
cli(['secrets','set',`AVAILABILITY_CRON_SECRET=${secret}`]);
const url=`https://${p.ref}.supabase.co`;
query(`do $$begin if not exists(select 1 from vault.secrets where name='availability_email_project_url') then perform vault.create_secret('${url}','availability_email_project_url','Email worker origin');end if;end;$$;`);
query(`
create or replace function private.invoke_availability_email_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text;token text;request_id bigint;
begin
 if not exists(select 1 from private.availability_email_settings where id and enabled) then return null;end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='availability_email_project_url' limit 1;
 select decrypted_secret into token from vault.decrypted_secrets where name='availability_email_cron_token' limit 1;
 if endpoint is null or token is null then return null;end if;
 select net.http_post(url:=endpoint||'/functions/v1/availability-email',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end;$$;
revoke all on function private.invoke_availability_email_worker() from public,anon,authenticated,service_role;
revoke all on net.http_request_queue from public,anon,authenticated;
revoke all on vault.secrets,vault.decrypted_secrets from public,anon,authenticated;
select cron.schedule('availability-email-minute','* * * * *','select private.invoke_availability_email_worker()');
update private.availability_email_settings set enabled=true,activated_at=coalesce(activated_at,now()),daily_limit=1,start_hour=8,end_hour=20,global_daily_limit=50,consolidation_minutes=5 where id;
update private.availability_outbox set status='ignored_before_activation' where status='awaiting_provider' and created_at<(select activated_at from private.availability_email_settings where id);
`);
console.log('Private invocation secret and minute schedule configured; old backlog excluded. Provider key is not copied from Auth SMTP.');
