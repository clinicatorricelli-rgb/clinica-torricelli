import React,{useEffect,useState} from 'react';import {supabase} from './supabase';
export default function NotificationStatus(){
 const [data,setData]=useState(null),[error,setError]=useState(false),[loading,setLoading]=useState(false);
 async function refresh(){setLoading(true);const {data,error}=await supabase.rpc('availability_email_status');setError(!!error);if(!error)setData(data);setLoading(false);}
 useEffect(()=>{refresh();},[]);
 const recent=data?.last_worker_at&&Date.now()-new Date(data.last_worker_at).getTime()<300000;
 const paused=data?.paused_until&&new Date(data.paused_until)>new Date();
 return <section className="alert-preferences"><h2>Avisos de novas vagas</h2>{error?<p role="alert">Não foi possível consultar os avisos. Confira sua sessão e o segundo fator.</p>:!data?<p>Consultando os avisos…</p>:<><p>{paused?'Envios de e-mail pausados após uma falha do serviço.':data.enabled&&data.provider_ready&&recent?'Avisos por e-mail ativos.':'Envio de e-mails em configuração. Nenhum aviso será enviado enquanto a conexão não estiver pronta.'} WhatsApp ainda em preparação.</p><p>No máximo {data.daily_limit} aviso por cliente por dia, das {data.start_hour}h às {data.end_hour}h, no horário de São Paulo. Aberturas próximas são agrupadas por {data.consolidation_minutes} minutos. Limite total: {data.global_daily_limit} e-mails por dia.</p><p>{data.pending} pendentes · {data.accepted} aceitos pelo serviço · {data.delivered} com entrega informada · {data.attention} precisam de conferência.</p><small>Aceito pelo serviço não confirma chegada à caixa de entrada. Avisos respeitam autorização, descadastro e disponibilidade atual; não garantem reserva.</small></>}<button onClick={refresh} disabled={loading}>{loading?'Consultando…':'Atualizar avisos'}</button></section>;
}
