import React,{useEffect,useState} from 'react';import {supabase} from './supabase';import {money} from './catalog.mjs';
import {when,clock,todayInClinic,addDays,statusLabel,feeLabel} from './booking.mjs';

// Eduarda's panel (role + second factor, enforced again by every database function).
// Every fee starts as a proposal and only becomes a charge after a decision here.
const refused={not_started:'o horário ainda não começou',note_required:'escreva o motivo',fee_already_paid:'a taxa já foi paga',not_markable:'esse agendamento não pode ser marcado',
 not_decidable:'a taxa mudou de situação; atualize a página',not_open:'a taxa não está em aberto',already_started:'o horário já começou',not_cancellable:'esse agendamento não pode ser cancelado',not_found:'registro não encontrado'};
const whatsapp=phone=>phone?`https://wa.me/${phone.replace(/\D/g,'')}`:null;

export default function AdminBookings(){
 const [data,setData]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [pending,setPending]=useState(null),[note,setNote]=useState('');
 useEffect(()=>{let alive=true;const today=todayInClinic();
  supabase.rpc('admin_booking_overview',{p_from:addDays(today,-14),p_until:addDays(today,45)}).then(({data,error})=>{if(!alive)return;if(error){setFailed(true);return;}setFailed(false);setData(data);});
  return()=>{alive=false;};
 },[reload]);
 const ask=p=>{setPending(p);setNote('');setMessage('');};
 async function confirm(e){e.preventDefault();if(!pending||busy)return;if(pending.needsNote&&!note.trim())return;setBusy(true);setMessage('');
  try{const {data,error}=await supabase.rpc(pending.fn,pending.args(note.trim()||null));if(error)throw error;
   setMessage(data.ok?pending.done:`Não foi feito: ${refused[data.reason]||'atualize a página e tente de novo'}.`);setPending(null);setReload(v=>v+1);
  }catch{setMessage('Não foi possível concluir. Confira a sessão e o segundo fator.');}finally{setBusy(false);}
 }
 const box=key=>pending?.key===key&&<form className="confirm-box" onSubmit={confirm}>
  {pending.warning&&<p>{pending.warning}</p>}
  {pending.note!==false&&<label>{pending.needsNote?'Motivo (obrigatório; fica só para a clínica)':'Observação interna (opcional; a cliente não vê)'}<input value={note} onChange={e=>setNote(e.target.value)} maxLength={500} required={pending.needsNote}/></label>}
  <div className="actions"><button className="primary" disabled={busy}>{busy?'Aguarde…':pending.label}</button><button type="button" disabled={busy} onClick={()=>setPending(null)}>Voltar</button></div>
 </form>;
 const customer=c=><>{c.name||'Nome não informado'}{c.phone&&<> · <a href={whatsapp(c.phone)} target="_blank" rel="noopener noreferrer">{c.phone}</a></>}</>;
 if(failed)return <section className="admin-bookings"><p className="eyebrow">AGENDAMENTOS</p><h2>Reservas e taxas</h2><p role="status">Reservas ainda indisponíveis neste ambiente: a atualização do banco de dados está pendente.</p></section>;
 if(!data)return <section className="admin-bookings"><p role="status">Consultando agendamentos…</p></section>;
 const now=Date.now();
 const toMark=data.items.filter(i=>i.status==='confirmed'&&Date.parse(i.starts_at)<=now);
 const upcoming=data.items.filter(i=>i.status==='confirmed'&&Date.parse(i.starts_at)>now);
 const history=data.items.filter(i=>i.status!=='confirmed').slice(-20).reverse();
 const mark=(i,outcome,label,done,needsNote=false)=>ask({key:`${i.id}:${outcome}`,fn:'admin_mark_attendance',args:n=>({p_id:i.id,p_outcome:outcome,p_note:n}),label,done,needsNote});
 return <section className="admin-bookings" aria-labelledby="admin-bookings-title"><p className="eyebrow">AGENDAMENTOS</p><h2 id="admin-bookings-title">Reservas e taxas</h2>
 <div className="booking-switch"><p>Agendamento online: <strong>{data.enabled?'ligado':'desligado'}</strong>. Regra em vigor: {data.rule_version||'nenhuma'}.</p>
  <button disabled={busy} onClick={()=>ask({key:'switch',fn:'admin_set_booking_enabled',args:()=>({p_enabled:!data.enabled}),note:false,
   label:data.enabled?'Desligar agendamento online':'Ligar agendamento online',
   warning:data.enabled?'Novos agendamentos param na hora. Os já marcados continuam valendo.':'A regra de faltas ainda é um rascunho sem revisão jurídica e nenhuma mensagem automática está ativa. Ligue só para testes com dados fictícios.',
   done:data.enabled?'Agendamento online desligado.':'Agendamento online ligado.'})}>{data.enabled?'Desligar':'Ligar'} agendamento online</button>{box('switch')}</div>
 {message&&<p className="message" role="status">{message}</p>}
 <h3>Taxas em aberto</h3>
 {data.open_fees.length?data.open_fees.map(f=><article className="availability-change" key={f.id}>
  <strong>{money(f.amount_cents)} · {f.reason==='no_show'?'Falta':'Cancelou com menos de 24 h'} · {f.status==='proposed'?'aguardando sua decisão':'cobrança confirmada'}</strong>
  <p>{customer(f.customer)} · {f.appointment.service.name} · {f.appointment.service.variant} · {when(f.appointment.starts_at)}</p>
  {f.status==='proposed'?<div className="actions"><button disabled={busy} onClick={()=>ask({key:`${f.id}:confirm`,fn:'admin_decide_fee',args:n=>({p_fee_id:f.id,p_decision:'confirm',p_note:n}),label:'Confirmar taxa',done:'Taxa confirmada. A cliente fica sem poder agendar até a baixa.'})}>Confirmar taxa</button>
   <button disabled={busy} onClick={()=>ask({key:`${f.id}:waive`,fn:'admin_decide_fee',args:n=>({p_fee_id:f.id,p_decision:'waive',p_note:n}),label:'Dispensar taxa',done:'Taxa dispensada.'})}>Dispensar</button></div>
  :<div className="actions"><button disabled={busy} onClick={()=>ask({key:`${f.id}:settle`,fn:'admin_settle_fee',args:n=>({p_fee_id:f.id,p_note:n}),label:'Dar baixa',warning:'Dê baixa só depois de ver o valor no extrato do banco. Comprovante enviado pela cliente não basta.',done:'Baixa registrada. A cliente pode agendar de novo.'})}>Dar baixa (conferi o extrato)</button>
   <button disabled={busy} onClick={()=>ask({key:`${f.id}:waive`,fn:'admin_decide_fee',args:n=>({p_fee_id:f.id,p_decision:'waive',p_note:n}),label:'Dispensar taxa',done:'Taxa dispensada. A cliente pode agendar de novo.'})}>Dispensar</button></div>}
  {[`${f.id}:confirm`,`${f.id}:waive`,`${f.id}:settle`].map(k=><React.Fragment key={k}>{box(k)}</React.Fragment>)}
 </article>):<p>Nenhuma taxa em aberto.</p>}
 <h3>Marcar presença</h3>
 {toMark.length?toMark.map(i=><article className="availability-change" key={i.id}>
  <strong>{when(i.starts_at)} · {i.service.name} · {i.service.variant}</strong><p>{customer(i.customer)} · taxa possível: {money(i.fee_cents)}</p>
  <div className="actions"><button disabled={busy} onClick={()=>mark(i,'completed','Confirmar presença','Presença registrada.')}>Compareceu</button>
   <button disabled={busy} onClick={()=>mark(i,'no_show_fee','Registrar falta e cobrar','Falta registrada e taxa confirmada.')}>Faltou: cobrar taxa</button>
   <button disabled={busy} onClick={()=>mark(i,'no_show_waived','Registrar falta sem taxa','Falta registrada sem taxa.',true)}>Faltou: dispensar taxa</button></div>
  {['completed','no_show_fee','no_show_waived'].map(o=><React.Fragment key={o}>{box(`${i.id}:${o}`)}</React.Fragment>)}
 </article>):<p>Nenhum atendimento passado esperando marcação.</p>}
 <h3>Próximos agendamentos</h3>
 {upcoming.length?upcoming.map(i=><article className="availability-change" key={i.id}>
  <strong>{when(i.starts_at)}–{clock(i.ends_at)} · {i.service.name} · {i.service.variant}</strong>
  <p>{customer(i.customer)}{i.reschedule_count>0?` · remarcado ${i.reschedule_count}×`:''}</p>
  <button disabled={busy} onClick={()=>ask({key:`${i.id}:cancel`,fn:'admin_cancel_appointment',args:n=>({p_id:i.id,p_note:n}),label:'Cancelar pela clínica',needsNote:true,
   warning:'Cancelamento pela clínica não gera taxa. O sistema ainda não envia mensagens: avise a cliente pelo WhatsApp.',done:'Agendamento cancelado pela clínica. Avise a cliente.'})}>Cancelar pela clínica</button>{box(`${i.id}:cancel`)}
 </article>):<p>Nenhum agendamento futuro nos próximos 45 dias.</p>}
 {history.length>0&&<><h3>Histórico recente</h3>{history.map(i=><p key={i.id}>{when(i.starts_at)} · {i.service.name} · {i.customer.name||'Cliente'} · {statusLabel(i)}{i.fee?` · ${feeLabel(i.fee)}`:''}</p>)}</>}
 </section>;
}
