import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import {clock,todayInClinic,addDays,statusLabel,when} from './booking.mjs';
import {clinicDay,dayLabel,byDay,activeCount} from './agenda.mjs';
import {monthGrid,monthLabel,monthStart,shiftMonth} from './calendar.mjs';
import {catalog} from './catalog.mjs';
import {maskPhone,toE164,formatPhone} from './phone.mjs';

// Agenda paralela: horários que a Eduarda marca para clientes que não usam o site.
const manualReasons={invalid_end:'O término precisa ser depois do início.',service_text_too_long:'Descrição muito longa.',name_required:'Digite o nome da cliente.',invalid_phone:'Confira o WhatsApp: DDD + número.',slot_unavailable:'Já existe atendimento nesse horário. Escolha outro.',service_not_found:'Escolha o serviço.',invalid_time:'Confira a data e o horário.',not_found:'Esse agendamento não existe mais.',not_editable:'Esse agendamento não pode mais ser alterado.'};
const localParts=iso=>{const d=new Date(iso);const f=o=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',...o}).format(d);return {day:f({year:'numeric',month:'2-digit',day:'2-digit'}),time:f({hour:'2-digit',minute:'2-digit',hourCycle:'h23'})};};

function ManualForm({initial,day,onDone,onCancel}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const start=initial?localParts(initial.starts_at):{day,time:'09:00'};
 const serviceId=initial?.service_id||catalog[0].id;
 const end=initial?localParts(initial.ends_at).time:'';
 const description=initial&&!initial.service.variant?initial.service.name:'';
 async function submit(e){e.preventDefault();if(busy)return;const f=new FormData(e.currentTarget);
  const raw=String(f.get('phone')||'').trim(),phone=raw?toE164(raw):null;
  if(raw&&!phone){setMessage(manualReasons.invalid_phone);return;}
  setBusy(true);setMessage('');
  try{const endTime=String(f.get('end')||'');
   const {data,error}=await supabase.rpc('admin_save_manual_appointment_v2',{p_id:initial?.id||null,p_service_id:Number(f.get('service')),p_start:`${f.get('day')}T${f.get('time')}:00-03:00`,p_end:endTime?`${f.get('day')}T${endTime}:00-03:00`:null,p_service_text:f.get('service_text'),p_name:f.get('name'),p_phone:phone,p_notes:f.get('notes')});
   if(error)throw error;if(data.ok)onDone(initial?'Agendamento atualizado.':'Horário reservado na agenda. Ele já não aparece mais para as clientes no site.');else setMessage(manualReasons[data.reason]||'Não foi possível salvar.');
  }catch{setMessage('Não foi possível salvar. Confira a sessão e o segundo fator.');}finally{setBusy(false);}
 }
 return <form className="confirm-box manual-form" onSubmit={submit}>
  <h3>{initial?'Editar horário da agenda paralela':'Agendar cliente (agenda paralela)'}</h3>
  <p className="account-details-hint">Para clientes que não usam o site. O horário fica ocupado e some da agenda online. A cliente não recebe mensagem automática.</p>
  <label>Nome da cliente<input name="name" required maxLength={100} defaultValue={initial?.customer.name||''}/></label>
  <label>WhatsApp (opcional)<input name="phone" type="tel" inputMode="tel" maxLength={16} placeholder="(19) 99999-9999" defaultValue={formatPhone(initial?.customer.phone)} onInput={e=>{e.currentTarget.value=maskPhone(e.currentTarget.value);}}/></label>
  <label>Serviço<select name="service" defaultValue={serviceId}>{catalog.map(c=><option key={c.id} value={c.id}>{c.name} · {c.variant} ({c.duration_minutes} min)</option>)}</select></label>
  <label>Descrição (opcional; ex.: combos)<input name="service_text" maxLength={200} placeholder="Ex.: Manutenção Volume Brasileiro, Design com henna" defaultValue={description}/></label>
  <div className="form-grid"><label>Data<input name="day" type="date" required defaultValue={start.day}/></label><label>Início<input name="time" type="time" required step={300} defaultValue={start.time}/></label></div>
  <label>Término (opcional)<input name="end" type="time" step={300} defaultValue={end}/><small>Em branco, usa a duração do serviço escolhido.</small></label>
  <label>Observação (opcional; só você vê)<input name="notes" maxLength={500} defaultValue={initial?.manual_notes||''}/></label>
  {message&&<p className="fee-line" role="alert">{message}</p>}
  <div className="actions"><button className="primary" disabled={busy}>{busy?'Salvando…':initial?'Salvar alterações':'Reservar horário'}</button><button type="button" disabled={busy} onClick={onCancel}>Voltar</button></div>
 </form>;
}

// Agenda da Eduarda em calendário: próximos atendimentos em destaque, mês inteiro com a
// quantidade por dia e, ao tocar num dia, a lista completa daquele dia. Só leitura.
const whatsapp=phone=>phone?`https://wa.me/${phone.replace(/\D/g,'')}`:null;
const WEEK=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function Item({a,onEdit,onCancel}){
 const manual=a.source==='manual',future=a.status==='confirmed'&&Date.parse(a.starts_at)>Date.now();
 return <li className={`agenda-item${a.status==='cancelled'?' is-cancelled':''}${manual?' is-manual':''}`}>
  <span className="agenda-time">{clock(a.starts_at)}–{clock(a.ends_at)}</span>
  <span className="agenda-what"><strong>{a.service.name}</strong>{a.service.variant?` · ${a.service.variant}`:''}</span>
  <span className="agenda-who">{a.customer.name||'Cliente sem nome'}{a.customer.phone&&<> · <a href={whatsapp(a.customer.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</span>
  {a.status!=='confirmed'&&<span className="agenda-status">{statusLabel(a)}</span>}
  {manual&&<span className="agenda-tag">Agenda paralela{a.manual_notes?` · ${a.manual_notes}`:''}</span>}
  {manual&&future&&<span className="agenda-actions"><button className="inline-link" onClick={()=>onEdit(a)}>Editar</button><button className="inline-link" onClick={()=>onCancel(a)}>Cancelar</button></span>}
 </li>;
}

export default function AdminCalendar(){
 const today=todayInClinic();
 const [form,setForm]=useState(null),[note,setNote]=useState('');
 const [month,setMonth]=useState(()=>monthStart(today)),[selected,setSelected]=useState(today),[items,setItems]=useState(null),[next,setNext]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const grid=monthGrid(month);
 useEffect(()=>{let alive=true;setItems(null);
  Promise.all([supabase.rpc('admin_booking_overview',{p_from:grid[0],p_until:grid[grid.length-1]}),supabase.rpc('admin_booking_overview',{p_from:today,p_until:addDays(today,30)})])
   .then(([m,n])=>{if(!alive)return;if(m.error||n.error){setFailed(true);return;}setFailed(false);setItems(m.data.items);
    const now=Date.now();setNext(n.data.items.filter(i=>i.status==='confirmed'&&Date.parse(i.ends_at)>now).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).slice(0,5));});
  return()=>{alive=false;};
 },[month,reload]);
 if(failed)return <section className="agenda"><h2>Agenda</h2><p role="alert">Não foi possível carregar a agenda. Confira a sessão e o segundo fator. <button className="inline-link" onClick={()=>setReload(v=>v+1)}>Tentar de novo</button></p></section>;
 const done=msg=>{setForm(null);setNote(msg);setReload(v=>v+1);};
 async function cancelManual(a){if(!window.confirm(`Cancelar o horário de ${a.customer.name} (${when(a.starts_at)})? Ele volta a ficar livre no site.`))return;
  const {data,error}=await supabase.rpc('admin_cancel_appointment',{p_id:a.id,p_note:'Cancelado pela Eduarda na agenda paralela'});
  setNote(!error&&data?.ok?'Horário cancelado. Ele voltou a ficar livre no site.':'Não foi possível cancelar. Confira a sessão e o segundo fator.');setReload(v=>v+1);}
 const map=items?byDay(items,grid):null;
 const dayItems=map&&map[selected]?map[selected]:(items||[]).filter(i=>clinicDay(i.starts_at)===selected);
 return <section className="agenda" aria-labelledby="agenda-title">
  <div className="agenda-week-head"><h2 id="agenda-title">Agenda</h2>{!form&&<button className="primary" onClick={()=>{setNote('');setForm({});}}>+ Agendar cliente</button>}</div>
  {note&&<p className="message" role="status">{note}</p>}
  {form&&<ManualForm initial={form.id?form:null} day={selected<today?today:selected} onDone={done} onCancel={()=>setForm(null)}/>}
  <div className="agenda-next"><h3>Próximos atendimentos</h3>
   {!next?<p role="status">Carregando…</p>:next.length?<ul className="agenda-list">{next.map(a=><li key={a.id} className="agenda-item"><span className="agenda-time">{when(a.starts_at)}</span><span className="agenda-what"><strong>{a.service.name}</strong>{a.service.variant?` · ${a.service.variant}`:''}</span><span className="agenda-who">{a.customer.name||'Cliente sem nome'}{a.customer.phone&&<> · <a href={whatsapp(a.customer.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}</span></li>)}</ul>:<p>Nenhum atendimento marcado nos próximos 30 dias.</p>}
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
   {!items?<p role="status">Carregando…</p>:dayItems.length?<ul className="agenda-list">{dayItems.map(a=><Item key={a.id} a={a} onEdit={x=>{setNote('');setForm(x);window.scrollTo({top:0,behavior:'smooth'});}} onCancel={cancelManual}/>)}</ul>:<p>Nenhum agendamento neste dia.</p>}</div>
 </section>;
}
