import {catalog} from '../src/catalog.mjs';
import {writeFileSync} from 'node:fs';
const q=x=>x==null?'null':typeof x==='number'?x:`'${x.replaceAll("'","''")}'`;
writeFileSync(new URL('../supabase/migrations/202611040002_catalog.sql',import.meta.url),`-- Generated from src/catalog.mjs by node scripts/seed.mjs\ninsert into public.services(id,name,variant,price_cents,duration_minutes,maintenance_min_days,maintenance_max_days) values\n${catalog.map(s=>`(${[s.id,s.name,s.variant,s.price_cents,s.duration_minutes,s.maintenance_min_days,s.maintenance_max_days].map(q).join(',')})`).join(',\n')};\n`);
