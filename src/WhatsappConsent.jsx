import React,{useEffect,useState} from 'react';import {supabase} from './supabase';

// Minha conta: liga ou desliga a confirmação e os lembretes dos horários pelo WhatsApp.
export default function WhatsappConsent(){
 const [enabled,setEnabled]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [available,setAvailable]=useState(true);
 useEffect(()=>{let alive=true;supabase.rpc('my_whatsapp_consent').then(({data,error})=>{if(!alive)return;if(error){setAvailable(false);return;}setEnabled(!!data?.enabled);});return()=>{alive=false;};},[]);
 async function toggle(){const next=!enabled;setBusy(true);setMessage('');
  try{const {error}=await supabase.rpc('set_whatsapp_consent',{p_enabled:next});if(error)throw error;setEnabled(next);
   setMessage(next?'Pronto: você vai receber a confirmação e os lembretes dos próximos horários pelo WhatsApp.':'Desligado: os lembretes pelo WhatsApp não serão mais enviados. Os e-mails continuam.');
  }catch{setMessage('Não foi possível salvar. Tente de novo.');}finally{setBusy(false);}
 }
 // Enquanto o envio às clientes não estiver ligado no servidor, a opção não aparece.
 if(!available)return null;
 return <section className="alert-preferences" aria-labelledby="wa-consent-title"><h2 id="wa-consent-title">Lembretes no WhatsApp</h2>
  <p>Receba no WhatsApp a confirmação do agendamento e lembretes 27 horas, 2 horas e 20 minutos antes do seu horário, enviados pelo número da clínica.</p>
  {enabled===null?<p role="status">Carregando…</p>:<label className="accept"><input type="checkbox" checked={enabled} disabled={busy} onChange={toggle}/><span>Quero receber a confirmação e os lembretes pelo WhatsApp</span></label>}
  <small>A confirmação, a remarcação e o cancelamento também chegam por e-mail, com ou sem esta opção.</small>
  <p role="status">{message}</p></section>;
}
