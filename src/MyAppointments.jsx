import React,{useEffect,useState} from 'react';import {supabase} from './supabase';import {money} from './catalog.mjs';
import {when,clock,todayInClinic,reasonMessage,statusLabel,feeLabel,cancelNotice,changeNotice,cancelResult} from './booking.mjs';

// Customer's own appointments. Every rule (24 h, grace, fee) is decided by the database;
// this screen only explains the consequence before the customer confirms.
export default function MyAppointments({userId,version=0,onChanged=()=>{},onBook=()=>{}}){
 const [data,setData]=useState(null),[legacy,setLegacy]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const [action,setAction]=useState(null),[day,setDay]=useState(todayInClinic),[options,setOptions]=useState([]),[pick,setPick]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let alive=true;setFailed(false);
  supabase.rpc('my_appointments').then(async({data,error})=>{
   if(!alive)return;
   if(!error){setData(data);setLegacy(null);return;}
   // Before the database update is applied, keep the previous read-only list.
   const old=await supabase.from('appointments').select('id,starts_at,status').eq('customer_id',userId).order('starts_at');
   if(!alive)return;if(old.error){setFailed(true);return;}setData(null);setLegacy(old.data||[]);
  });
  return()=>{alive=false;};
 },[userId,version,reload]);
 useEffect(()=>{setPick(null);if(action?.kind!=='move'){setOptions([]);return;}let alive=true;
  supabase.rpc('reschedule_slots',{p_id:action.id,p_day:day}).then(({data,error})=>{if(alive)setOptions(error?[]:data||[]);});
  return()=>{alive=false;};
 },[action,day]);
 async function run(fn){setBusy(true);setMessage('');try{await fn();}catch{setMessage('Não foi possível concluir. Confira a conexão e tente de novo.');}finally{setBusy(false);}}
 const done=()=>{setAction(null);setReload(v=>v+1);onChanged();};
 const cancel=item=>run(async()=>{const {data,error}=await supabase.rpc('cancel_appointment',{p_id:item.id});if(error)throw error;setMessage(cancelResult(data));done();});
 const move=(item,slot)=>run(async()=>{const {data,error}=await supabase.rpc('reschedule_appointment',{p_id:item.id,p_start:slot.starts_at});if(error)throw error;
  setMessage(data.ok?`Agendamento remarcado para ${when(data.appointment.starts_at)}.`:reasonMessage(data));if(data.ok)done();else setReload(v=>v+1);});
 const open=(item,kind)=>{setAction({id:item.id,kind});setDay(todayInClinic());setMessage('');};
 return <section className="my-appointments" aria-labelledby="my-appointments-title"><h2 id="my-appointments-title">Meus agendamentos</h2>
 {message&&<p className="message" role="status">{message}</p>}
 {failed?<p role="alert">Não foi possível carregar seus agendamentos. Atualize a página.</p>
 :legacy?(legacy.length?legacy.map(a=><p key={a.id}>{when(a.starts_at)} · {a.status}</p>):<p>Nenhum agendamento disponível. A agenda está em preparação.</p>)
 :!data?<p role="status">Carregando seus agendamentos…</p>
 :<>
  {data.open_fee_cents>0&&<div className="fee-alert" role="alert"><strong>Taxa em aberto: {money(data.open_fee_cents)}.</strong> Novos agendamentos pelo site ficam bloqueados até a clínica dar baixa. A clínica vai combinar o pagamento com você pelo WhatsApp.</div>}
  {data.items.length?data.items.map(item=><article className="appointment-card" key={item.id}>
   <p className="eyebrow">{statusLabel(item)}</p><h3>{item.service.name} · {item.service.variant}</h3>
   <p>{when(item.starts_at)} até {clock(item.ends_at)} · {money(item.price_cents)}</p>
   {item.fee&&<p className="fee-line">{feeLabel(item.fee)}</p>}
   {item.can_change&&<small>{changeNotice(item)}</small>}
   {item.can_change&&action?.id!==item.id&&<div className="actions">{item.free_change&&<button onClick={()=>open(item,'move')}>Remarcar</button>}<button onClick={()=>open(item,'cancel')}>Cancelar</button></div>}
   {action?.id===item.id&&action.kind==='cancel'&&<div className="confirm-box" role="group" aria-label="Confirmar cancelamento"><p>{cancelNotice(item)}</p><div className="actions"><button className="primary" disabled={busy} onClick={()=>cancel(item)}>{busy?'Aguarde…':'Confirmar cancelamento'}</button><button disabled={busy} onClick={()=>setAction(null)}>Voltar</button></div></div>}
   {action?.id===item.id&&action.kind==='move'&&<div className="confirm-box" role="group" aria-label="Remarcar">
    <label>Novo dia<input type="date" min={todayInClinic()} value={day} onChange={e=>setDay(e.target.value)}/></label>
    {options.length?<ul className="slots">{options.map(s=><li key={s.starts_at}><button type="button" aria-pressed={pick?.starts_at===s.starts_at} onClick={()=>setPick(s)}>{clock(s.starts_at)}–{clock(s.ends_at)}</button></li>)}</ul>:<p>Nenhum horário livre nesse dia.</p>}
    {pick&&<p>Novo horário: <strong>{when(pick.starts_at)}</strong>. A regra aceita no agendamento continua valendo.</p>}
    <div className="actions">{pick&&<button className="primary" disabled={busy} onClick={()=>move(item,pick)}>{busy?'Aguarde…':'Confirmar remarcação'}</button>}<button disabled={busy} onClick={()=>setAction(null)}>Voltar</button></div>
   </div>}
  </article>):<p>Nenhum agendamento ainda.{data.booking_enabled&&<> <button className="inline-link" onClick={onBook}>Ver horários disponíveis</button></>}</p>}
 </>}
 </section>;
}
