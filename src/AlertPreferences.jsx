import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
export default function AlertPreferences({userId}){
 const [values,setValues]=useState({email:false,whatsapp:false}),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[channels,setChannels]=useState({email:false,whatsapp:false}),[message,setMessage]=useState('');
 useEffect(()=>{let alive=true;setReady(false);setValues({email:false,whatsapp:false});
  supabase.rpc('availability_alert_channels').then(({data})=>{if(alive&&data)setChannels(data);});
  supabase.from('notification_preferences').select('email_enabled,whatsapp_enabled').eq('customer_id',userId).maybeSingle().then(({data,error})=>{
   if(!alive)return;if(error){setMessage('Não foi possível consultar suas preferências. Recarregue para tentar novamente.');return;}
   setValues({email:data?.email_enabled??false,whatsapp:data?.whatsapp_enabled??false});setReady(true);
  });return()=>{alive=false;};
 },[userId]);
 async function save(channel){setBusy(true);setMessage('');const enabled=!values[channel];
  try{const {error}=await supabase.rpc('set_availability_alert_preference',{channel,enabled,notice_version:'new-availability-v1'});if(error)throw error;
   setValues(v=>({...v,[channel]:enabled}));setMessage(enabled?'Pronto: você vai receber os avisos de novas vagas.':'Avisos de novas vagas desligados.');
  }catch{setMessage('Não foi possível salvar. Sua preferência não foi alterada nesta tela. Recarregue para conferir.');}finally{setBusy(false);}
 }
 // Só aparecem os canais que a clínica já envia (ou que a cliente ligou antes, para poder desligar).
 const shown=[['email','e-mail'],['whatsapp','WhatsApp']].filter(([c])=>channels[c]||values[c]);
 return <section className="alert-preferences"><h2>Avisos de novas vagas</h2><p>Receba um aviso quando a Eduarda abrir novos horários, inclusive manhãs abertas em datas específicas. No máximo um por dia, das 8h às 20h. O aviso não reserva horário e você pode desligar quando quiser.</p>{shown.length?<div className="tabs">{shown.map(([channel,label])=><label key={channel}><input type="checkbox" disabled={!ready||busy} checked={values[channel]} onChange={()=>save(channel)}/> Receber avisos por {label}</label>)}</div>:<p>{ready?'Os avisos de novas vagas estão pausados no momento.':'Carregando…'}</p>}<small>Os e-mails sobre os seus agendamentos (confirmação, remarcação e cancelamento) chegam sempre, com ou sem esta opção.</small><p role="status">{message}</p></section>;
}

