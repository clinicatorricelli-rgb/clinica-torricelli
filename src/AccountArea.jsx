import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import SideNav,{Icon} from './SideNav';
import MyAppointments from './MyAppointments';
import AlertPreferences from './AlertPreferences';
import ClientIntake from './ClientIntake';
import WhatsappConsent from './WhatsappConsent';

// Área da cliente: menu à esquerda (agendamentos, taxas, dados, ficha, avisos, sair) e,
// no primeiro acesso, um passo a passo até a ficha preenchida. Depois disso, não aparece mais.
const skipKey=id=>`torricelli-ficha-depois-${id}`;
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const write=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};

export default function AccountArea({session,profile,profileComplete,profileForm,bookingsVersion,onBookingsChanged,onBook,onSignOut,onChangePassword,focus}){
 const uid=session.user.id;
 const [hasIntake,setHasIntake]=useState(null),[skipped,setSkipped]=useState(()=>read(skipKey(uid))==='1');
 useEffect(()=>{let alive=true;setHasIntake(null);
  supabase.from('client_intake_current').select('customer_id').eq('customer_id',uid).maybeSingle().then(({data,error})=>{if(alive)setHasIntake(error?false:!!data);});
  return()=>{alive=false;};
 },[uid]);
 const steps=[
  {key:'conta',label:'Criar a conta e confirmar o e-mail',done:true},
  {key:'dados',label:'Informar seu nome e WhatsApp',done:profileComplete},
  {key:'ficha',label:'Preencher sua ficha',done:!!hasIntake||skipped},
 ];
 const pendingSteps=steps.filter(s=>!s.done).length;
 const firstAccess=hasIntake!==null&&(pendingSteps>0);
 const [section,setSection]=useState(null);
 const [finished,setFinished]=useState(false);
 // Primeira escolha de tela: passo a passo enquanto faltar algo; depois, os agendamentos.
 useEffect(()=>{if(section||hasIntake===null)return;setSection(focus==='ficha'?'ficha':firstAccess?'inicio':'agendamentos');},[hasIntake,firstAccess,section,focus]);
 useEffect(()=>{if(focus==='ficha')setSection('ficha');},[focus]);
 const intake=<ClientIntake key={uid} userId={uid} profile={profile} email={session.user.email} onSaved={()=>{setHasIntake(true);if(section==='inicio')setFinished(true);}}/>;
 const items=[
  ...(firstAccess||finished?[{key:'inicio',label:'Primeiros passos',icon:'check',badge:pendingSteps?`${3-pendingSteps}/3`:null}]:[]),
  {key:'agendamentos',label:'Meus agendamentos',icon:'calendar'},
  {key:'taxas',label:'Taxas',icon:'receipt'},
  {key:'dados',label:'Meus dados',icon:'user'},
  {key:'ficha',label:'Minha ficha',icon:'clipboard'},
  {key:'avisos',label:'Avisos e lembretes',icon:'bell'},
  {key:'sair',label:'Sair da conta',icon:'logout',onClick:onSignOut},
 ];
 const firstName=(profile?.display_name||'').trim().split(/\s+/)[0];
 if(!section)return <p role="status">Carregando sua conta…</p>;
 const current=steps.find(s=>!s.done);
 return <SideNav title={firstName?`Olá, ${firstName}`:'Minha conta'} items={items} active={section} onSelect={setSection}>
  {section==='inicio'&&<section className="checklist" aria-labelledby="checklist-title">
   <h2 id="checklist-title">{current?'Primeiros passos':'Tudo pronto!'}</h2>
   <p>{current?'Só na primeira vez: complete os passos abaixo e sua conta fica pronta para agendar.':'Sua conta está completa. Agora é só escolher o serviço e o horário.'}</p>
   <div className="checklist-progress" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={3-pendingSteps} aria-label="Passos concluídos"><span style={{width:`${(3-pendingSteps)/3*100}%`}}/></div>
   <ol className="checklist-steps">{steps.map((s,i)=><li key={s.key} className={s.done?'is-done':s===current?'is-current':''}>
    <span className="checklist-mark">{s.done?<Icon name="check" size={16}/>:i+1}</span><span>{s.label}{s.key==='ficha'&&skipped&&!hasIntake?' (deixado para depois)':''}</span></li>)}</ol>
   {current?.key==='dados'&&<div className="checklist-panel">{profileForm}</div>}
   {current?.key==='ficha'&&<div className="checklist-panel">{intake}
    <p className="account-details-hint">A ficha é obrigatória para extensão de cílios. Vai fazer outro serviço? <button className="inline-link" onClick={()=>{write(skipKey(uid),'1');setSkipped(true);setFinished(true);}}>Preencher depois</button></p></div>}
   {!current&&<div className="actions"><button className="primary" onClick={onBook}>Agendar meu horário <span>↗</span></button><button onClick={()=>{setFinished(false);setSection('agendamentos');}}>Ver minha conta</button></div>}
  </section>}
  {section==='agendamentos'&&<MyAppointments userId={uid} version={bookingsVersion} onChanged={onBookingsChanged} onBook={onBook}/>}
  {section==='taxas'&&<MyAppointments userId={uid} version={bookingsVersion} onChanged={onBookingsChanged} onBook={onBook} view="fees"/>}
  {section==='dados'&&<section className="account-section"><h2>Meus dados</h2><p className="account-details-hint">E-mail da conta: <strong>{session.user.email}</strong></p>{profileForm}
   <p className="account-details-hint">Quer trocar a senha? <button className="inline-link" onClick={onChangePassword}>Definir nova senha</button></p></section>}
  {section==='ficha'&&<section className="account-section"><p className="account-details-hint">A ficha é obrigatória para extensão de cílios. Atualize se algo mudar na sua saúde.</p>{intake}</section>}
  {section==='avisos'&&<><WhatsappConsent/><AlertPreferences userId={uid}/></>}
 </SideNav>;
}
