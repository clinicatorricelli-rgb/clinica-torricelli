import React,{useEffect,useState} from 'react';import {availabilityEmailEndpoint} from './supabase';
export default function UnsubscribePanel(){
 const [token]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('token'));
 const [busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{history.replaceState({},'','/?view=unsubscribe');},[]);
 const valid=/^[a-f0-9]{64}$/.test(token||'');
 async function revoke(){setBusy(true);setError(false);try{const response=await fetch(`${availabilityEmailEndpoint}/unsubscribe?token=${token}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click',credentials:'omit'});if(!response.ok)throw Error();setDone(true);}catch{setError(true);}finally{setBusy(false);}}
 return <main><section className="account"><p className="eyebrow">CLÍNICA TORRICELLI</p><h1>Avisos por e-mail</h1>{!valid||!availabilityEmailEndpoint?<p>Este link está incompleto. Abra novamente o link do e-mail ou altere suas preferências em Minha conta.</p>:done?<p role="status">Solicitação concluída. Se o link era válido, os avisos de novas vagas por e-mail foram desativados.</p>:<><p>Deseja deixar de receber os avisos de novas vagas por e-mail?</p><p>Os e-mails de acesso à conta e sua preferência de WhatsApp continuam separados.</p><button className="primary" onClick={revoke} disabled={busy}>{busy?'Salvando…':'Desativar avisos por e-mail'}</button>{error&&<p role="alert">Não foi possível concluir. Tente novamente ou altere a preferência em Minha conta.</p>}</>}<p><a href="/">Voltar ao site</a></p></section></main>;
}
