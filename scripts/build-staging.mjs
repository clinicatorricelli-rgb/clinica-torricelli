import {spawnSync} from 'node:child_process';import {readFileSync,readdirSync} from 'node:fs';
const p=JSON.parse(readFileSync('artifacts/project-create-response.json','utf8'));
if(p.name!=='clinica-torriceli-testes'||p.region!=='sa-east-1')throw Error('Unknown staging project');
const r=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','projects','api-keys',`--remote=${p.ref}`,'--reveal','--output-format','json'],{encoding:'utf8'});if(r.status!==0)throw Error('Keys unavailable');const keys=JSON.parse(r.stdout).keys;
const signupTest=process.argv.includes('--signup-test');
const b=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','staging'],{encoding:'utf8',env:{...process.env,VITE_SUPABASE_URL:`https://${p.ref}.supabase.co`,VITE_SUPABASE_PUBLISHABLE_KEY:keys.find(k=>k.type==='publishable').api_key,VITE_ENABLE_PUBLIC_SIGNUP:signupTest?'true':'false'}});if(b.status!==0)throw Error(b.stderr);console.log(b.stdout);
const bundle=readdirSync('dist/assets').filter(x=>x.endsWith('.js')).map(x=>readFileSync('dist/assets/'+x,'utf8')).join('');for(const k of keys.filter(k=>k.type==='secret'||k.name==='service_role'))if(bundle.includes(k.api_key))throw Error('Secret in bundle');
