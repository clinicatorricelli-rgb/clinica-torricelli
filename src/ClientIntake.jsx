import React,{useEffect,useId,useRef,useState} from 'react';
import {supabase} from './supabase';
import './intake.css';

export const intakeQuestions=[
 {key:'pregnant_or_breastfeeding',label:'Está grávida ou amamentando?',detailsLabel:'Se sim, há quanto tempo?'},
 {key:'previous_eye_procedure',label:'Já realizou algum procedimento nos olhos?'},
 {key:'cosmetic_allergy',label:'Tem alergia a esmalte ou cosméticos?'},
 {key:'eye_condition',label:'Possui glaucoma ou outro problema ocular?'},
 {key:'cancer_treatment',label:'Está em tratamento oncológico?'},
 {key:'wearing_mascara',label:'Está usando máscara de cílios (rímel) hoje?',visitSpecific:true},
];
export const intakeSexLabels={female:'Feminino',male:'Masculino',other:'Outro',prefer_not_to_say:'Prefiro não informar'};
export const intakeAnswerLabels={yes:'Sim',no:'Não',discuss:'Prefiro conversar com a profissional'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function calculateIntakeAge(date,reference=today()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||date>reference)return null;
 const [year,month,day]=date.split('-').map(Number),[currentYear,currentMonth,currentDay]=reference.split('-').map(Number);
 const parsed=new Date(Date.UTC(year,month-1,day));
 if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return null;
 return currentYear-year-Number(currentMonth<month||(currentMonth===month&&currentDay<day));
}
export const formatIntakeDate=date=>/^\d{4}-\d{2}-\d{2}$/.test(date||'')?date.split('-').reverse().join('/'):'Não informado';
export const formatIntakeTimestamp=value=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'Ainda não enviada';
const emptyAnswers=()=>Object.fromEntries(intakeQuestions.map(({key})=>[key,{value:'',details:''}]));
function formFrom(row){
 const answers=emptyAnswers();
 for(const {key,visitSpecific}of intakeQuestions){
  const saved=row?.answers?.[key];
  if(!visitSpecific&&saved&&Object.hasOwn(intakeAnswerLabels,saved.value))answers[key]={value:saved.value,details:typeof saved.details==='string'?saved.details:''};
 }
 return {birth_date:row?.birth_date||'',sex:row?.sex||'',address:row?.address||'',answers,signed_name:'',privacy_accepted:false,declaration_accepted:false,procedure_authorized:false,photo_record_authorized:false};
}

export default function ClientIntake({userId,profile,email}){
 const prefix=useId(),activeUser=useRef(userId);activeUser.current=userId;
 const [form,setForm]=useState(()=>formFrom(null)),[record,setRecord]=useState(null),[loadedUser,setLoadedUser]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[loadError,setLoadError]=useState(false),[message,setMessage]=useState(''),[conflict,setConflict]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{
  let alive=true;
  setLoading(true);setSaving(false);setLoadError(false);setMessage('');setConflict(false);setRecord(null);setForm(formFrom(null));setLoadedUser(null);
  if(!supabase||!userId){setLoading(false);return()=>{alive=false;};}
  (async()=>{
   try{
    const {data,error}=await supabase.from('client_intake_current').select('*').eq('customer_id',userId).maybeSingle();
    if(error)throw error;if(!alive)return;
    setRecord(data);setForm(formFrom(data));setLoadedUser(userId);
   }catch{if(alive)setLoadError(true);}finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[userId,reload]);
 const age=calculateIntakeAge(form.birth_date);
 function change(field,value){setForm(current=>({...current,[field]:value}));setMessage('');}
 function changeAnswer(key,value){setForm(current=>({...current,answers:{...current.answers,[key]:{...current.answers[key],value,details:value==='yes'||value==='discuss'?current.answers[key].details:''}}}));setMessage('');}
 function changeDetails(key,details){setForm(current=>({...current,answers:{...current.answers,[key]:{...current.answers[key],details}}}));setMessage('');}
 async function save(event){
  event.preventDefault();if(saving||loading||loadedUser!==userId||!supabase)return;
  const savingUser=userId;
  setSaving(true);setMessage('');setConflict(false);
  try{
   const p_data={...form,birth_date:form.birth_date||null,sex:form.sex||null,address:form.address.trim()||null,signed_name:form.signed_name.trim()};
   const {data,error}=await supabase.rpc('save_client_intake',{p_data,p_revision:record?.revision||0}).abortSignal(AbortSignal.timeout(20000));
   if(error)throw error;if(activeUser.current!==savingUser)return;
   const saved=Array.isArray(data)?data[0]:data;
   if(!saved||!Number.isInteger(saved.revision))throw new Error('Unconfirmed save');
   setRecord(saved);setForm(formFrom(saved));setMessage('Ficha de testes salva. Para um novo envio, revise as respostas e refaça a confirmação sobre rímel, as declarações e o nome de confirmação.');
  }catch(error){
   if(activeUser.current!==savingUser)return;
   const changed=['40001','PT409'].includes(error?.code);setConflict(changed);
   setMessage(changed?'Esta ficha foi atualizada em outra tela. Recarregue a ficha salva antes de enviar novamente.':'Não foi possível salvar a ficha. Confira as respostas e sua sessão antes de tentar novamente.');
  }finally{if(activeUser.current===savingUser)setSaving(false);}
 }
 return <section className="intake-card intake-client" aria-labelledby={`${prefix}-title`}>
  <div className="intake-heading"><p className="eyebrow">SEU ATENDIMENTO</p><span className="intake-badge">Ficha de testes</span><h2 id={`${prefix}-title`}>Ficha de atendimento</h2><p><strong>Extensão de cílios</strong></p><p>Preencha uma vez e revise nas próximas visitas. As informações salvas serão reaproveitadas; o que pode mudar no dia precisa ser confirmado novamente.</p></div>
  <div className="intake-test-notice" role="note" id={`${prefix}-notice`}><strong>Ficha de testes. Use somente dados fictícios.</strong><p>Não informe dados reais de saúde neste ambiente. O salvamento não cria uma reserva nem libera um procedimento.</p></div>
  {!supabase||!userId?<p>Entre com sua conta no ambiente conectado para preencher a ficha de testes.</p>:loading||(!loadError&&loadedUser!==userId)?<p role="status">Carregando sua ficha…</p>:loadError?<div className="intake-message" role="alert"><p>Não foi possível consultar sua ficha. Confira sua sessão e tente novamente.</p><button type="button" onClick={()=>setReload(value=>value+1)}>Tentar novamente</button></div>:<>
   {record&&<p className="intake-saved">Último envio: {formatIntakeTimestamp(record.submitted_at)} · revisão {record.revision}. Confira se as respostas continuam atuais. A resposta sobre rímel e as confirmações abaixo precisam ser refeitas.</p>}
   <form onSubmit={save} aria-describedby={`${prefix}-notice`}>
    <fieldset disabled={saving} className="intake-fieldset"><legend>1. Dados pessoais</legend><p className="intake-help">Nome, telefone e e-mail vêm do seu cadastro. Para alterá-los, use os campos do cadastro acima ou as opções da sua conta.</p>
     <div className="intake-grid"><label>Nome cadastrado<input readOnly value={profile?.display_name||''} placeholder="Ainda não informado"/></label><label>Telefone cadastrado<input readOnly value={profile?.phone_e164||''} placeholder="Ainda não informado"/></label><label className="intake-wide">E-mail da conta<input readOnly value={email||''} placeholder="Ainda não informado"/></label>
      <label>Data de nascimento (opcional)<input type="date" min="1900-01-01" max={today()} autoComplete="off" value={form.birth_date} onChange={event=>change('birth_date',event.target.value)}/><small aria-live="polite">{age!==null?`Idade calculada: ${age} ${age===1?'ano':'anos'}.`:'A idade é calculada a partir da data informada.'}</small></label>
      <label>Sexo (opcional)<select value={form.sex} onChange={event=>change('sex',event.target.value)}><option value="">Não informado</option>{Object.entries(intakeSexLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <label className="intake-wide">Endereço (opcional)<textarea rows={2} maxLength={500} autoComplete="off" value={form.address} onChange={event=>change('address',event.target.value)}/></label>
     </div>
    </fieldset>
    <fieldset disabled={saving} className="intake-fieldset"><legend>2. Avaliação informada pela cliente</legend><p className="intake-help">Responda às seis perguntas com informações fictícias. Se preferir esclarecer algum ponto durante a avaliação, selecione conversar com a profissional.</p>
     {intakeQuestions.map(({key,label,visitSpecific,detailsLabel},index)=><div className="intake-question" key={key}>
      <label htmlFor={`${prefix}-${key}`}><span className="intake-question-number">{String(index+1).padStart(2,'0')}</span>{label}{visitSpecific&&<small>Resposta referente ao dia do atendimento. Confirme a cada visita.</small>}</label>
      <select id={`${prefix}-${key}`} required value={form.answers[key].value} onChange={event=>changeAnswer(key,event.target.value)}><option value="" disabled>Selecione uma resposta</option>{Object.entries(intakeAnswerLabels).map(([value,text])=><option value={value} key={value}>{text}</option>)}</select>
      {['yes','discuss'].includes(form.answers[key].value)&&<label className="intake-detail">{detailsLabel&&form.answers[key].value==='yes'?`${detailsLabel} (informação fictícia, opcional)`:'Observação fictícia (opcional)'}<textarea rows={2} maxLength={500} value={form.answers[key].details} onChange={event=>changeDetails(key,event.target.value)}/><small>Até 500 caracteres. Não informe dados reais de saúde.</small></label>}
     </div>)}
    </fieldset>
    <fieldset disabled={saving} className="intake-fieldset"><legend>3. Declaração e autorizações</legend><p className="intake-help">Cada escolha é independente. As duas primeiras confirmações e o nome da declaração são necessários para enviar a ficha. Procedimento e registro de fotos são opcionais.</p>
     <label className="intake-choice"><input type="checkbox" required checked={form.privacy_accepted} onChange={event=>change('privacy_accepted',event.target.checked)}/><span>Entendi que esta ficha está em ambiente de testes e autorizo o registro das informações fictícias que forneci para validar o sistema.</span></label>
     <label className="intake-choice"><input type="checkbox" required checked={form.declaration_accepted} onChange={event=>change('declaration_accepted',event.target.checked)}/><span>Revisei as respostas acima e estou ciente de que mudanças devem ser informadas à profissional antes de cada atendimento.</span></label>
     <label className="intake-choice"><input type="checkbox" checked={form.procedure_authorized} onChange={event=>change('procedure_authorized',event.target.checked)}/><span>Autorizo a realização do procedimento após a avaliação e os esclarecimentos da profissional. <small>Opcional. Esta escolha não representa aprovação para realizar o procedimento.</small></span></label>
     <label className="intake-choice"><input type="checkbox" checked={form.photo_record_authorized} onChange={event=>change('photo_record_authorized',event.target.checked)}/><span>Autorizo o registro de fotos do procedimento para acompanhamento interno. <small>Opcional. Não autoriza publicação ou divulgação em redes sociais.</small></span></label>
     <label>Nome para confirmar a declaração<input required minLength={1} maxLength={100} autoComplete="off" value={form.signed_name} onChange={event=>change('signed_name',event.target.value)}/><small>Digite novamente seu nome para confirmar as declarações deste envio. Data e horário são registrados pelo sistema.</small></label>
    </fieldset>
    <p className="intake-help">A ficha será consultada pela profissional autorizada. A avaliação e a decisão sobre o atendimento permanecem com ela.</p>
    <button className="primary" type="submit" disabled={saving||conflict}>{saving?'Salvando ficha…':record?'Salvar e reconfirmar ficha':'Salvar ficha de testes'}</button>
   </form>
   {message&&<div className="intake-message" role={conflict?'alert':'status'}><p>{message}</p>{conflict&&<><button type="button" disabled={saving} onClick={()=>setReload(value=>value+1)}>Recarregar ficha salva</button><small>Isso substitui o que está nesta tela pelos dados já salvos.</small></>}</div>}
  </>}
 </section>;
}
