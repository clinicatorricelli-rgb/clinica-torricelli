import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
import AvailabilityPanel from './AvailabilityPanel';
import NotificationStatus from './NotificationStatus';
import AdminIntake from './AdminIntake';
export default function AdminDashboard(){
 const [data,setData]=useState(null),[error,setError]=useState(false);
 useEffect(()=>{let alive=true;Promise.all([
  supabase.from('profiles').select('id,display_name,created_at',{count:'exact'}).order('created_at',{ascending:false}).limit(25),
  supabase.from('appointments').select('id,starts_at,status',{count:'exact'}).neq('status','blocked').order('starts_at',{ascending:false}).limit(25)
 ]).then(([people,visits])=>{if(!alive)return;if(people.error||visits.error){setError(true);return;}setData({people,visits});});return()=>{alive=false;};},[]);
 if(error)return <p role="alert">Não foi possível consultar os dados. Confira sua sessão e o segundo fator.</p>;
 if(!data)return <p role="status">Consultando o ambiente de testes…</p>;
 return <><div className="features"><article><h3>Contas cadastradas</h3><p>{data.people.count??0}</p></article><article><h3>Agendamentos registrados</h3><p>{data.visits.count??0}</p></article></div><h2>Cadastros recentes</h2><p>Até 25 contas, sem senhas ou dados de saúde.</p>{data.people.data.map(p=><p key={p.id}>{p.display_name||'Nome ainda não informado'} · {new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(p.created_at))}</p>)}<h2>Agendamentos recentes</h2>{data.visits.data.length?data.visits.data.map(a=><p key={a.id}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(a.starts_at))} · {a.status}</p>):<p>Nenhum agendamento registrado. A criação de reservas continua indisponível.</p>}<p>Reservas e pagamentos ainda indisponíveis. A disponibilidade pode ser gerenciada abaixo.</p><AdminIntake/><NotificationStatus/><AvailabilityPanel/></>;
}
