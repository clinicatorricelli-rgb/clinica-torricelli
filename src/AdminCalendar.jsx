import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import {clock,todayInClinic,addDays,statusLabel,when} from './booking.mjs';
import {clinicDay,dayLabel,byDay,activeCount} from './agenda.mjs';
import {monthGrid,monthLabel,monthStart,shiftMonth} from './calendar.mjs';

// Agenda da Eduarda em calendário: próximos atendimentos em destaque, mês inteiro com a
// quantidade por dia e, ao tocar num dia, a lista completa daquele dia. Só leitura.
const whatsapp=phone=>phone?`https://wa.me/${phone.replace(/\D/g,'')}`:null;
const WEEK=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function Item({a}){
 return <li className={`agenda-item${a.status==='cancelled'?' is-cancelled':''}`}>
  <span className="agenda-time">{clock(a.starts_at)}–{clock(a.ends_at)}</span>
  <span className="agenda-what"><strong>{a.service.name}</strong> · {a.service.variant}</span>
  <span className="agenda-who">{a.customer.name||'Cliente sem nome'}{a.customer.phone&&<> · <a href={whatsapp(a.customer.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</span>
  {a.status!=='confirmed'&&<span className="agenda-status">{statusLabel(a)}</span>}
 </li>;
}

export default function AdminCalendar(){
 const today=todayInClinic();
 const [month,setMonth]=useState(()=>monthStart(today)),[selected,setSelected]=useState(today),[items,setItems]=useState(null),[next,setNext]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const grid=monthGrid(month);
 useEffect(()=>{let alive=true;setItems(null);
  Promise.all([supabase.rpc('admin_booking_overview',{p_from:grid[0],p_until:grid[grid.length-1]}),supabase.rpc('admin_booking_overview',{p_from:today,p_until:addDays(today,30)})])
   .then(([m,n])=>{if(!alive)return;if(m.error||n.error){setFailed(true);return;}setFailed(false);setItems(m.data.items);
    const now=Date.now();setNext(n.data.items.filter(i=>i.status==='confirmed'&&Date.parse(i.ends_at)>now).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,5));});
  return()=>{alive=false;};
 },[month,reload]);
 if(failed)return <section className="agenda"><h2>Agenda</h2><p role="alert">Não foi possível carregar a agenda. Confira a sessão e o segundo fator. <button className="inline-link" onClick={()=>setReload(v=>v+1)}>Tentar de novo</button></p></section>;
 const map=items?byDay(items,grid):null;
 const dayItems=map&&map[selected]?map[selected]:(items||[]).filter(i=>clinicDay(i.starts_at)===selected);
 return <section className="agenda" aria-labelledby="agenda-title">
  <h2 id="agenda-title">Agenda</h2>
  <div className="agenda-next"><h3>Próximos atendimentos</h3>
   {!next?<p role="status">Carregando…</p>:next.length?<ul className="agenda-list">{next.map(a=><li key={a.id} className="agenda-item"><span className="agenda-time">{when(a.starts_at)}</span><span className="agenda-what"><strong>{a.service.name}</strong> · {a.service.variant}</span><span className="agenda-who">{a.customer.name||'Cliente sem nome'}{a.customer.phone&&<> · <a href={whatsapp(a.customer.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</span></li>)}</ul>:<p>Nenhum atendimento marcado nos próximos 30 dias.</p>}
  </div>
  <div className="cal-head"><button onClick={()=>setMonth(shiftMonth(month,-1))} aria-label="Mês anterior">‹</button><h3>{monthLabel(month)}</h3><button onClick={()=>setMonth(shiftMonth(month,1))} aria-label="Próximo mês">›</button>
   {month!==monthStart(today)&&<button className="inline-link" onClick={()=>{setMonth(monthStart(today));setSelected(today);}}>Hoje</button>}
   <button className="inline-link" onClick={()=>setReload(v=>v+1)}>Atualizar</button></div>
  <div className="cal-grid" role="grid" aria-label={`Calendário de ${monthLabel(month)}`}>
   {WEEK.map(w=><span key={w} className="cal-weekday" role="columnheader">{w}</span>)}
   {grid.map(d=>{const n=map?activeCount(map[d]||[]):0;const out=d.slice(0,7)!==month.slice(0,7);
    return <button key={d} role="gridcell" className={`cal-day${out?' is-out':''}${d===today?' is-today':''}${d===selected?' is-selected':''}${n?' has-items':''}`} aria-pressed={d===selected} aria-label={`${dayLabel(d)}: ${n?`${n} agendamento${n>1?'s':''}`:'livre'}`} onClick={()=>setSelected(d)}>
     <span>{Number(d.slice(8))}</span>{n>0&&<em>{n}</em>}</button>;})}
  </div>
  <div className="cal-dayview"><h3>{dayLabel(selected)}</h3>
   {!items?<p role="status">Carregando…</p>:dayItems.length?<ul className="agenda-list">{dayItems.map(a=><Item key={a.id} a={a}/>)}</ul>:<p>Nenhum agendamento neste dia.</p>}</div>
 </section>;
}
