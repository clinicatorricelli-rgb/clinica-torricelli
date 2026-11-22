import React,{useEffect,useState} from 'react';import {supabase} from './supabase';

// Contas das clientes no painel: busca por nome ou e-mail e exclusão de cadastro.
// Quem decide o que pode ser excluído é o banco (admin_delete_account); a tela só confirma.
const date=v=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v));
const reasons={admin_account:'Conta de administração não pode ser excluída por aqui.',not_allowed:'Você não pode excluir a própria conta.',not_found:'Essa conta já não existe.',confirmation_required:'Confirme a exclusão para continuar.'};

export default function AdminAccounts(){
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[data,setData]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 const [confirming,setConfirming]=useState(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const t=setTimeout(()=>setSearch(query.trim()),350);return()=>clearTimeout(t);},[query]);
 useEffect(()=>{let alive=true;
  supabase.rpc('admin_list_accounts',{p_search:search||null}).then(({data,error})=>{if(!alive)return;if(error){setFailed(true);return;}setFailed(false);setData(data);});
  return()=>{alive=false;};
 },[search,reload]);
 async function remove(item){setBusy(true);setMessage('');
  try{const {data:r,error}=await supabase.rpc('admin_delete_account',{p_id:item.id,p_confirm:'EXCLUIR'});if(error)throw error;
   setMessage(r.ok?`Cadastro de ${item.name||item.email} excluído.`:reasons[r.reason]||'Não foi possível excluir.');setConfirming(null);setReload(v=>v+1);
  }catch{setMessage('Não foi possível excluir. Confira a sessão e o segundo fator e tente de novo.');}finally{setBusy(false);}
 }
 return <section className="admin-accounts" aria-labelledby="admin-accounts-title">
  <h2 id="admin-accounts-title">Contas das clientes</h2>
  <p>{data?`${data.total} conta${data.total===1?'':'s'} no total. `:''}Busque pelo nome ou pelo e-mail. Sem busca, aparecem as 50 mais recentes.</p>
  <label className="search">Buscar conta<input type="search" value={query} onChange={e=>setQuery(e.target.value)} maxLength={100} placeholder="Nome ou e-mail"/></label>
  {message&&<p className="message" role="status">{message}</p>}
  {failed?<p role="alert">Não foi possível carregar as contas. Confira a sessão e o segundo fator.</p>
  :!data?<p role="status">Carregando…</p>
  :!data.items.length?<p>Nenhuma conta encontrada.</p>
  :<ul className="account-list">{data.items.map(item=><li key={item.id} className="account-row">
   <div><strong>{item.name||'Nome não informado'}</strong><span>{item.email}</span>
    <small>Desde {date(item.created_at)}{!item.email_confirmed&&' · e-mail ainda não confirmado'}{item.has_history&&' · tem agendamentos'}{item.is_admin&&' · conta da clínica'}</small></div>
   {!item.is_admin&&confirming!==item.id&&<button onClick={()=>{setConfirming(item.id);setMessage('');}}>Excluir</button>}
   {confirming===item.id&&<div className="confirm-box" role="group" aria-label="Confirmar exclusão">
    <p><strong>Excluir o cadastro de {item.name||item.email}?</strong> A pessoa perde o acesso e a conta some do site. Não dá para desfazer.</p>
    {item.has_history&&<p className="fee-line">Esta cliente tem agendamentos. Vão junto: agendamentos, taxas e a ficha dela.</p>}
    <div className="actions"><button className="primary danger" disabled={busy} onClick={()=>remove(item)}>{busy?'Excluindo…':'Excluir definitivamente'}</button><button disabled={busy} onClick={()=>setConfirming(null)}>Cancelar</button></div>
   </div>}
  </li>)}</ul>}
 </section>;
}
