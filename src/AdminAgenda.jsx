import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import {clock,todayInClinic,addDays,statusLabel} from './booking.mjs';
import {weekStart,weekDays,dayLabel,weekLabel,byDay,activeCount} from './agenda.mjs';

// Agenda da Eduarda: hoje em destaque e a semana de segunda a sábado. Só leitura;
// marcar presença, taxas e cancelamentos continuam em "Reservas e taxas", logo abaixo.
const whatsapp=phone=>phone?`https://wa.me/${phone.replace(/\D/g,'')}`:null;

function Appointment({a}){
 const cancelled=a.status==='cancelled';
 return <li className={`agenda-item${cancelled?' is-cancelled':''}`}>
  <span className="agenda-time">{clock(a.starts_at)}–{clock(a.ends_at)}</span>
  <span className="agenda-what"><strong>{a.service.name}</strong> · {a.service.variant}</span>
  <span className="agenda-who">{a.customer.name||'Cliente sem nome'}{a.customer.phone&&<> · <a href={whatsapp(a.customer.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</span>
  {a.status!=='confirmed'&&<span className="agenda-status">{statusLabel(a)}</span>}
 </li>;
}

export default function AdminAgenda(){
 const today=todayInClinic();
 const [monday,setMonday]=useState(()=>weekStart(today)),[week,setWeek]=useState(null),[todayItems,setTodayItems]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const days=weekDays(monday);
 useEffect(()=>{let alive=true;setWeek(null);
  Promise.all([supabase.rpc('admin_booking_overview',{p_from:monday,p_until:days[5]}),supabase.rpc('admin_booking_overview',{p_from:today,p_until:today})])
   .then(([w,t])=>{if(!alive)return;if(w.error||t.error){setFailed(true);return;}setFailed(false);setWeek(w.data.items);setTodayItems(t.data.items);});
  return()=>{alive=false;};
 },[monday,reload]);
 if(failed)return <section className="agenda"><h2>Agenda</h2><p role="alert">Não foi possível carregar a agenda. Confira a sessão e o segundo fator. <button className="inline-link" onClick={()=>setReload(v=>v+1)}>Tentar de novo</button></p></section>;
 const grouped=week?byDay(week,days):null;
 const todayList=(todayItems||[]).slice().sort((a,b)=>(a.status==='cancelled')-(b.status==='cancelled')||a.starts_at.localeCompare(b.starts_at));
 return <section className="agenda" aria-labelledby="agenda-title">
  <p className="eyebrow">AGENDA</p><h2 id="agenda-title">Hoje · {dayLabel(today)}</h2>
  {!todayItems?<p role="status">Carregando…</p>:todayList.length?<ul className="agenda-list agenda-today">{todayList.map(a=><Appointment key={a.id} a={a}/>)}</ul>:<p>Nenhum atendimento hoje.</p>}
  <div className="agenda-week-head"><h3>Semana de {weekLabel(monday)}</h3>
   <div className="actions"><button onClick={()=>setMonday(addDays(monday,-7))} aria-label="Semana anterior">‹ Anterior</button>
    {monday!==weekStart(today)&&<button onClick={()=>setMonday(weekStart(today))}>Esta semana</button>}
    <button onClick={()=>setMonday(addDays(monday,7))} aria-label="Próxima semana">Próxima ›</button>
    <button onClick={()=>setReload(v=>v+1)}>Atualizar</button></div></div>
  {!grouped?<p role="status">Carregando a semana…</p>:<div className="agenda-week">{days.map(d=><article key={d} className={`agenda-day${d===today?' is-today':''}`}>
   <h4>{dayLabel(d)}<span>{activeCount(grouped[d])?`${activeCount(grouped[d])} agendamento${activeCount(grouped[d])>1?'s':''}`:'livre'}</span></h4>
   {grouped[d].length?<ul className="agenda-list">{grouped[d].map(a=><Appointment key={a.id} a={a}/>)}</ul>:null}
  </article>)}</div>}
 </section>;
}
