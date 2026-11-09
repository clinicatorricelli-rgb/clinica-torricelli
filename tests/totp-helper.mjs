// Fixture-only RFC 6238 generator for exercising Supabase MFA; never imported by app.
import {createHmac} from 'node:crypto';
export function totp(secret,seconds=Math.floor(Date.now()/1000)){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
 for(const c of secret.replace(/=+$/,'').toUpperCase()){
  const n=alphabet.indexOf(c);if(n<0)throw new Error('Invalid fixture secret');bits+=n.toString(2).padStart(5,'0');
 }
 const key=Buffer.from((bits.match(/.{8}/g)||[]).map(b=>parseInt(b,2)));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(seconds/30)));
 const h=createHmac('sha1',key).update(counter).digest(),offset=h[19]&15;
 return ((h.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}
