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
   setValues(v=>({...v,[channel]:enabled}));setMessage(enabled?'Preferência ativada. Os avisos seguem a disponibilidade do canal.':'Avisos desligados neste canal.');
  }catch{setMessage('Não foi possível salvar. Sua preferência não foi alterada nesta tela. Recarregue para conferir.');}finally{setBusy(false);}
 }
 return <section className="alert-preferences"><h2>Avisos de novas vagas</h2><p>Quero receber avisos opcionais de novas vagas da Clínica Torriceli por este canal, incluindo manhãs abertas em datas específicas. Posso desligar a qualquer momento em Minha conta. O aviso não garante reserva. Não é necessário aceitar para cadastrar ou agendar.</p><small>Finalidade: novas vagas · versão new-availability-v1. {channels.email?'Avisos por e-mail disponíveis, no máximo um por dia, das 8h às 20h.':'Envio de avisos por e-mail em configuração.'} WhatsApp ainda em preparação. Separado das confirmações do seu atendimento.</small><div className="tabs">{[['email','E-mail'],['whatsapp','WhatsApp']].map(([channel,label])=><label key={channel}><input type="checkbox" disabled={!ready||busy} checked={values[channel]} onChange={()=>save(channel)}/> Receber avisos por {label}</label>)}</div><p role="status">{message}</p></section>;
}

