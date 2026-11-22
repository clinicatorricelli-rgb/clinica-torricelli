import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import AvailabilityPanel from './AvailabilityPanel';
import NotificationStatus from './NotificationStatus';
import AdminIntake from './AdminIntake';
import AdminBookings from './AdminBookings';
import AdminAgenda from './AdminAgenda';
import AdminAccounts from './AdminAccounts';
export default function AdminDashboard(){
 const [data,setData]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{let alive=true;Promise.all([
  supabase.from('profiles').select('id',{count:'exact',head:true}),
  supabase.from('appointments').select('id,starts_at,status',{count:'exact'}).neq('status','blocked').order('starts_at',{ascending:false}).limit(25)
 ]).then(([people,visits])=>{if(!alive)return;if(people.error||visits.error){setError(true);return;}setData({people,visits});});return()=>{alive=false;};},[]);
 if(error)return <p role="alert">Não foi possível consultar os dados. Confira sua sessão e o segundo fator.</p>;
 if(!data)return <p role="status">Carregando…</p>;
 return <><AdminAgenda/><div className="features"><article><h3>Contas cadastradas</h3><p>{data.people.count??0}</p></article><article><h3>Agendamentos registrados</h3><p>{data.visits.count??0}</p></article></div><h2>Agendamentos recentes</h2>{data.visits.data.length?data.visits.data.map(a=><p key={a.id}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(a.starts_at))} · {a.status}</p>):<p>Nenhum agendamento registrado.</p>}<AdminBookings/><AdminAccounts/><AdminIntake/><NotificationStatus/><AvailabilityPanel/></>;
}
