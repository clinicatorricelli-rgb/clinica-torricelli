import React,{useEffect,useId,useRef,useState} from 'react';
import {supabase} from './supabase';
import {calculateIntakeAge,formatIntakeDate,formatIntakeTimestamp,intakeAnswerLabels,intakeQuestions,intakeSexLabels} from './ClientIntake';
import './intake.css';

const emptyProcedure=()=>({style:'',curvature:'',thickness:'',fiber_model:'',procedure_date:'',notes:''});
function procedureForm(row){const form=emptyProcedure();for(const key of Object.keys(form))form[key]=row?.[key]||'';return form;}
const choice=value=>value?'Sim':'Não';

export default function AdminIntake(){
 const prefix=useId(),activeCustomer=useRef('');
 const [rows,setRows]=useState([]),[names,setNames]=useState({}),[listLoading,setListLoading]=useState(true),[listError,setListError]=useState(false),[listReload,setListReload]=useState(0),[customer,setCustomer]=useState(''),[loadedCustomer,setLoadedCustomer]=useState(''),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(false),[detailReload,setDetailReload]=useState(0),[intake,setIntake]=useState(null),[procedure,setProcedure]=useState(null),[form,setForm]=useState(emptyProcedure),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[conflict,setConflict]=useState(false);
 activeCustomer.current=customer;
 useEffect(()=>{
  let alive=true;setListLoading(true);setListError(false);
  if(!supabase){setListLoading(false);return()=>{alive=false;};}
  (async()=>{try{
   const {data,error}=await supabase.from('client_intake_current').select('customer_id,revision,submitted_at').order('submitted_at',{ascending:false}).limit(25);
   if(error)throw error;
   const ids=(data||[]).map(row=>row.customer_id);let profileRows=[];
   if(ids.length){const profiles=await supabase.from('profiles').select('id,display_name').in('id',ids);if(profiles.error)throw profiles.error;profileRows=profiles.data||[];}
   if(!alive)return;
   setRows(data||[]);setNames(Object.fromEntries(profileRows.map(row=>[row.id,row.display_name||'Nome ainda não informado'])));setCustomer(previous=>ids.includes(previous)?previous:'');
  }catch{if(alive)setListError(true);}finally{if(alive)setListLoading(false);}})();
  return()=>{alive=false;};
 },[listReload]);
 useEffect(()=>{
  let alive=true;setLoadedCustomer('');setDetailError(false);setMessage('');setConflict(false);setIntake(null);setProcedure(null);setForm(emptyProcedure());
  if(!supabase||!customer){setDetailLoading(false);return()=>{alive=false;};}
  setDetailLoading(true);
  (async()=>{try{
   const [current,technical]=await Promise.all([
    supabase.from('client_intake_current').select('*').eq('customer_id',customer).maybeSingle(),
    supabase.from('client_intake_procedure').select('*').eq('customer_id',customer).maybeSingle(),
   ]);
   if(current.error||technical.error||!current.data)throw new Error('Unable to load protected intake');
   if(!alive)return;setIntake(current.data);setProcedure(technical.data);setForm(procedureForm(technical.data));setLoadedCustomer(customer);
  }catch{if(alive)setDetailError(true);}finally{if(alive)setDetailLoading(false);}})();
  return()=>{alive=false;};
 },[customer,detailReload]);
 async function save(event){
  event.preventDefault();if(saving||!intake||loadedCustomer!==customer)return;
  const savingCustomer=customer;setSaving(true);setMessage('');setConflict(false);
  try{
   const p_data=Object.fromEntries(Object.entries(form).map(([key,value])=>[key,value.trim()||null]));
   const {data,error}=await supabase.rpc('save_client_intake_procedure',{p_customer_id:customer,p_data,p_revision:procedure?.revision||0,p_intake_revision:intake.revision}).abortSignal(AbortSignal.timeout(20000));
   if(error)throw error;if(activeCustomer.current!==savingCustomer)return;
   const saved=Array.isArray(data)?data[0]:data;
   if(!saved||!Number.isInteger(saved.revision))throw new Error('Unconfirmed save');
   setProcedure(saved);setForm(procedureForm(saved));setMessage('Ficha técnica de testes salva. As respostas e autorizações da cliente não foram alteradas.');
  }catch(error){
   if(activeCustomer.current!==savingCustomer)return;
   const changed=['40001','PT409'].includes(error?.code);setConflict(changed);setMessage(changed?'A ficha técnica foi atualizada em outra tela. Recarregue os dados antes de salvar novamente.':'Não foi possível salvar a ficha técnica. Confira os campos, sua sessão e o segundo fator.');
  }finally{if(activeCustomer.current===savingCustomer)setSaving(false);}
 }
 function change(key,value){setForm(current=>({...current,[key]:value}));setMessage('');}
 const baseline=procedureForm(procedure),technicalDirty=Object.keys(form).some(key=>form[key]!==baseline[key]);
 function refresh(){if(saving||technicalDirty)return;setListReload(value=>value+1);if(customer)setDetailReload(value=>value+1);}
 function discard(){setForm(procedureForm(procedure));setMessage('Alterações técnicas não salvas foram descartadas.');}
 const age=calculateIntakeAge(intake?.birth_date);
 return <section className="intake-card intake-admin" aria-labelledby={`${prefix}-title`}>
  <div className="intake-heading"><p className="eyebrow">ATENDIMENTO · ÁREA RESTRITA</p><span className="intake-badge">Ficha de testes</span><h2 id={`${prefix}-title`}>Fichas das clientes</h2><p>Consulte a ficha enviada pela cliente e registre as informações técnicas separadamente.</p></div>
  <div className="intake-test-notice" role="note"><strong>Ficha de testes. Use somente dados fictícios.</strong><p>O acesso exige autorização administrativa e segundo fator. Não registre informações reais de saúde nesta etapa.</p></div>
  {!supabase?<p>Consulta disponível no ambiente conectado de testes.</p>:listLoading?<p role="status">Consultando fichas enviadas…</p>:listError?<div className="intake-message" role="alert"><p>Não foi possível consultar as fichas. Confira a sessão e o segundo fator.</p><button type="button" onClick={()=>setListReload(value=>value+1)}>Tentar novamente</button></div>:<>
   <div className="intake-list-controls"><label htmlFor={`${prefix}-customer`}>Ficha da cliente<select id={`${prefix}-customer`} value={customer} disabled={saving||technicalDirty} onChange={event=>setCustomer(event.target.value)}><option value="">Selecione uma ficha</option>{rows.map(row=><option key={row.customer_id} value={row.customer_id}>{names[row.customer_id]||'Nome ainda não informado'} · {formatIntakeTimestamp(row.submitted_at)}</option>)}</select></label><button className="intake-quiet" type="button" disabled={saving||technicalDirty} onClick={refresh}>Atualizar lista</button></div>
   {technicalDirty&&<div className="intake-message" role="status"><p>Há alterações técnicas não salvas. Salve ou descarte antes de atualizar a lista ou trocar de ficha.</p><button type="button" disabled={saving} onClick={discard}>Descartar alterações técnicas não salvas</button></div>}
   <p className="intake-help">Até 25 fichas, ordenadas pelo envio mais recente. As respostas aparecem somente após selecionar uma cliente.</p>
   {!rows.length?<p>Nenhuma cliente enviou a ficha de testes.</p>:!customer?<p>Selecione uma ficha para consultar as informações e preencher a parte técnica.</p>:detailLoading||(!detailError&&loadedCustomer!==customer)?<p role="status">Carregando a ficha selecionada…</p>:detailError?<div className="intake-message" role="alert"><p>Não foi possível abrir a ficha. Confira sua sessão e a confirmação do segundo fator.</p><button type="button" onClick={()=>setDetailReload(value=>value+1)}>Tentar novamente</button></div>:intake&&<>
    <article className="intake-readonly" aria-labelledby={`${prefix}-client-title`}><h3 id={`${prefix}-client-title`}>{names[customer]||'Nome ainda não informado'}</h3><p className="intake-saved">Ficha enviada em {formatIntakeTimestamp(intake.submitted_at)} · revisão {intake.revision}. Respostas informadas pela cliente, sem liberação automática de atendimento.</p>
     <dl className="intake-summary"><div><dt>Data de nascimento</dt><dd>{formatIntakeDate(intake.birth_date)}{age!==null?` · ${age} ${age===1?'ano':'anos'}`:''}</dd></div><div><dt>Sexo</dt><dd>{intakeSexLabels[intake.sex]||'Não informado'}</dd></div><div className="intake-wide"><dt>Endereço</dt><dd>{intake.address||'Não informado'}</dd></div></dl>
     <h4>Avaliação informada pela cliente</h4><dl className="intake-answers">{intakeQuestions.map(({key,label,visitSpecific})=><div key={key}><dt>{label}</dt><dd><strong>{intakeAnswerLabels[intake.answers?.[key]?.value]||'Não informado'}</strong>{intake.answers?.[key]?.details&&<p>{intake.answers[key].details}</p>}{visitSpecific&&<small>Resposta referente ao dia do último envio. Confirmar novamente em cada visita.</small>}</dd></div>)}</dl>
     <h4>Declaração e autorizações registradas</h4><dl className="intake-summary"><div><dt>Registro da ficha de testes</dt><dd>{choice(intake.privacy_accepted)}</dd></div><div><dt>Declaração revisada</dt><dd>{choice(intake.declaration_accepted)}</dd></div><div><dt>Autorização para procedimento</dt><dd>{choice(intake.procedure_authorized)}</dd></div><div><dt>Registro interno de fotos</dt><dd>{choice(intake.photo_record_authorized)}</dd></div><div className="intake-wide"><dt>Nome digitado para confirmar a declaração</dt><dd>{intake.signed_name||'Não informado'}</dd></div></dl>
    </article>
    <form onSubmit={save} className="intake-technical"><fieldset disabled={saving}><legend>Ficha técnica da profissional</legend><p className="intake-help">Preenchimento administrativo. Estes campos não alteram as respostas nem concedem autorizações em nome da cliente.</p><div className="intake-grid">{[['style','Estilo'],['curvature','Curvatura'],['thickness','Espessura'],['fiber_model','Modelo de fibra']].map(([key,label])=><label key={key}>{label}<input maxLength={100} autoComplete="off" value={form[key]} onChange={event=>change(key,event.target.value)}/></label>)}<label>Data do procedimento<input type="date" min="1900-01-01" value={form.procedure_date} onChange={event=>change('procedure_date',event.target.value)}/></label><label className="intake-wide">Observações técnicas fictícias<textarea rows={4} maxLength={2000} value={form.notes} onChange={event=>change('notes',event.target.value)}/><small>Até 2.000 caracteres. Use somente dados fictícios neste ambiente.</small></label></div><button className="primary" disabled={saving||conflict}>{saving?'Salvando parte técnica…':'Salvar ficha técnica de testes'}</button>{procedure&&<small>Última atualização técnica: {formatIntakeTimestamp(procedure.updated_at)} · revisão técnica {procedure.revision} · baseada na ficha da cliente revisão {procedure.intake_revision}.{procedure.intake_revision!==intake.revision&&' A cliente atualizou a ficha depois desse registro técnico; revise as informações antes de salvar.'}</small>}</fieldset></form>
    {message&&<div className="intake-message" role={conflict?'alert':'status'}><p>{message}</p>{conflict&&<><button type="button" disabled={saving} onClick={()=>setDetailReload(value=>value+1)}>{technicalDirty?'Descartar alterações e recarregar ficha salva':'Recarregar ficha salva'}</button><small>Isso substitui os campos desta tela pelos dados já salvos.</small></>}</div>}
   </>}
  </>}
 </section>;
}
