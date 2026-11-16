import React,{useEffect,useRef} from 'react';

// Cloudflare Turnstile: checks that a person (not a robot) is using the login,
// signup and password-recovery forms. The site key is public; the secret key
// lives only in Supabase Auth, which validates each single-use token.
// Without VITE_TURNSTILE_SITE_KEY nothing is loaded and the forms work as before.
export const turnstileSiteKey=import.meta.env.VITE_TURNSTILE_SITE_KEY||'';
const SRC='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading=null;
function load(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src=SRC;s.async=true;s.defer=true;
  s.onload=()=>resolve(window.turnstile);s.onerror=()=>{loading=null;s.remove();reject(new Error('turnstile_unavailable'));};
  document.head.appendChild(s);
 });
 return loading;
}

// Remount (change `key`) after every attempt: each token can be used only once.
export default function Turnstile({action,onToken}){
 const box=useRef(null),latest=useRef(onToken);latest.current=onToken;
 useEffect(()=>{let alive=true,id=null;
  load().then(ts=>{if(!alive||!box.current)return;
   id=ts.render(box.current,{sitekey:turnstileSiteKey,action,language:'pt-br',appearance:'interaction-only',size:'flexible',
    callback:t=>latest.current(t),'expired-callback':()=>latest.current(null),'error-callback':()=>latest.current(null)});
  }).catch(()=>{if(alive)latest.current(null);});
  return()=>{alive=false;if(id!==null&&window.turnstile)try{window.turnstile.remove(id);}catch{/* already gone */}};
 },[action]);
 return <div ref={box} className="turnstile"/>;
}
