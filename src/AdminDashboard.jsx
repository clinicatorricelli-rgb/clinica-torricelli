import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import SideNav from './SideNav';
import AvailabilityPanel from './AvailabilityPanel';
import NotificationStatus from './NotificationStatus';
import AdminIntake from './AdminIntake';
import AdminBookings from './AdminBookings';
import AdminCalendar from './AdminCalendar';
import AdminAccounts from './AdminAccounts';
import {todayInClinic} from './booking.mjs';

// Painel da Eduarda com menu à esquerda: cada assunto numa tela própria.
// Cada função do banco confere de novo o papel e o segundo fator.
export default function AdminDashboard({onSignOut}){
 const [section,setSection]=useState('agenda'),[openFees,setOpenFees]=useState(0);
 useEffect(()=>{let alive=true;const today=todayInClinic();
  supabase.rpc('admin_booking_overview',{p_from:today,p_until:today}).then(({data})=>{if(alive&&data)setOpenFees((data.open_fees||[]).length);});
  return()=>{alive=false;};
 },[section]);
 const items=[
  {key:'agenda',label:'Agenda',icon:'calendar'},
  {key:'proximos',label:'Próximos e cancelar',icon:'clock'},
  {key:'taxas',label:'Taxas e faltas',icon:'receipt',badge:openFees||null},
  {key:'horarios',label:'Horários de atendimento',icon:'settings'},
  {key:'clientes',label:'Clientes',icon:'users'},
  {key:'fichas',label:'Fichas',icon:'clipboard'},
  {key:'config',label:'Agendamento e avisos',icon:'bell'},
  ...(onSignOut?[{key:'sair',label:'Sair da conta',icon:'logout',onClick:onSignOut}]:[]),
 ];
 return <SideNav title="Painel da Eduarda" items={items} active={section} onSelect={setSection}>
  {section==='agenda'&&<AdminCalendar/>}
  {section==='proximos'&&<AdminBookings view="upcoming"/>}
  {section==='taxas'&&<AdminBookings view="fees"/>}
  {section==='horarios'&&<AvailabilityPanel/>}
  {section==='clientes'&&<AdminAccounts/>}
  {section==='fichas'&&<AdminIntake/>}
  {section==='config'&&<><AdminBookings view="settings"/><NotificationStatus/></>}
 </SideNav>;
}
