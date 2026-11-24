import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import {maskPhone,toE164,formatPhone} from './phone.mjs';

// Alertas de gestão no WhatsApp particular da Eduarda (enviados pelo número da clínica).
const reasons={same_as_clinic:'Esse é o número da clínica. Ele não consegue mandar mensagem para ele mesmo: use o seu WhatsApp particular.',invalid_phone:'Confira o número: DDD + número.',phone_required:'Digite o seu WhatsApp particular para ligar os alertas.',disabled:'Ligue os alertas antes de enviar um teste.',too_soon:'Aguarde 2 minutos entre um teste e outro.'};
const kinds={daily_agenda:'Agenda do dia',booked:'Novo agendamento',rescheduled:'Remarcação',cancelled:'Cancelamento',test:'Teste'};
const statuses={pending:'na fila',sending:'enviando',sent:'enviado',failed:'não enviado',skipped:'descartado'};
const when=v=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v));

export default function AdminWhatsApp(){
 const [data,setData]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let alive=true;supabase.rpc('admin_owner_whatsapp').then(({data,error})=>{if(!alive)return;if(error){setFailed(true);return;}setFailed(false);setData(data);});return()=>{alive=false;};},[reload]);
 async function save(e){e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);const raw=String(f.get('phone')||'').trim();const phone=raw?toE164(raw):null;
  if(raw&&!phone){setMessage(reasons.invalid_phone);return;}
  setBusy(true);setMessage('');
  try{const {data:r,error}=await supabase.rpc('admin_set_owner_whatsapp',{p_enabled:f.get('enabled')==='on',p_phone:phone});if(error)throw error;
   setMessage(r.ok?(f.get('enabled')==='on'?'Alertas ligados. Use "Enviar teste" para conferir no seu celular.':'Alertas desligados.'):reasons[r.reason]||'Não foi possível salvar.');setReload(v=>v+1);
  }catch{setMessage('Não foi possível salvar. Confira a sessão e o segundo fator.');}finally{setBusy(false);}
 }
 async function sendTest(){setBusy(true);setMessage('');
  try{const {data:r,error}=await supabase.rpc('admin_test_owner_whatsapp');if(error)throw error;
   setMessage(r.ok?'Teste na fila: a agenda de hoje chega no seu WhatsApp em até 2 minutos.':reasons[r.reason]||'Não foi possível enviar.');setReload(v=>v+1);
  }catch{setMessage('Não foi possível enviar. Confira a sessão e o segundo fator.');}finally{setBusy(false);}
 }
 if(failed)return <section className="admin-whatsapp"><h2>Alertas no seu WhatsApp</h2><p role="alert">Não foi possível carregar. Confira a sessão e o segundo fator.</p></section>;
 if(!data)return <section className="admin-whatsapp"><p role="status">Carregando…</p></section>;
 return <section className="admin-whatsapp" aria-labelledby="admin-whatsapp-title">
  <h2 id="admin-whatsapp-title">Alertas no seu WhatsApp</h2>
  <p>O WhatsApp da clínica manda para o seu WhatsApp <strong>particular</strong>: a agenda do dia às 6h30 (segunda a sábado) e um aviso a cada agendamento novo, remarcação ou cancelamento feito pela cliente. Toda mensagem tem o botão "Abrir meu painel".</p>
  {!data.provider_ready&&<p className="fee-line">O envio pelo WhatsApp ainda não está conectado à 360dialog. Os alertas ficam guardados e não saem até a conexão ser feita.</p>}
  <form onSubmit={save} className="whatsapp-form">
   <label>Seu WhatsApp particular<input name="phone" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={16} placeholder="(19) 99999-9999" defaultValue={formatPhone(data.phone)}
    onInput={e=>{const el=e.currentTarget;el.value=maskPhone(el.value);el.setCustomValidity(!el.value||toE164(el.value)?'':reasons.invalid_phone);}}/>
    <small>Só o DDD e o número. Não use o número da clínica.</small></label>
   <label className="accept"><input type="checkbox" name="enabled" defaultChecked={data.enabled}/><span>Receber os alertas no meu WhatsApp</span></label>
   <div className="actions"><button className="primary" disabled={busy}>{busy?'Aguarde…':'Salvar'}</button>{data.enabled&&<button type="button" disabled={busy} onClick={sendTest}>Enviar teste</button>}</div>
  </form>
  {message&&<p className="message" role="status">{message}</p>}
  {data.recent.length>0&&<><h3>Últimos alertas</h3><ul className="agenda-list">{data.recent.map((r,i)=><li key={i} className="agenda-item"><span className="agenda-time">{when(r.at)}</span><span className="agenda-what">{kinds[r.kind]||r.kind} · {statuses[r.status]||r.status}{r.code?` (${r.code})`:''}</span></li>)}</ul></>}
 </section>;
}
