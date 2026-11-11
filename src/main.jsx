import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {catalog,money} from './catalog.mjs';
import {supabase,redirectUrl,publicSignupEnabled} from './supabase';
import {emailCallback} from './auth-callback.mjs';
import {authError} from './auth-errors.mjs';
import {existingTotp} from './mfa.mjs';
import './style.css';
import AlertPreferences from './AlertPreferences';
import HeroVideo,{useReducedMotion} from './HeroVideo';
import AdminDashboard from './AdminDashboard';
import {AvailabilityPreview} from './AvailabilityPanel';
import UnsubscribePanel from './UnsubscribePanel';
import ClientIntake from './ClientIntake';
import WelcomePresentation from './WelcomePresentation';
import './intake.css';

function App(){
 const [page,setPage]=useState(()=>{const view=new URLSearchParams(location.search).get('view');return ['services','unsubscribe'].includes(view)?view:'home';}),[session,setSession]=useState(null),[message,setMessage]=useState(''),[mode,setMode]=useState('login'),[busy,setBusy]=useState(false),[rows,setRows]=useState(catalog),[profile,setProfile]=useState(null),[appointments,setAppointments]=useState([]),[adminUserId,setAdminUserId]=useState(null),[aal,setAal]=useState(false),[factor,setFactor]=useState(null),[qr,setQr]=useState(''),[query,setQuery]=useState(''),[ready,setReady]=useState(!supabase);
 const motion=useReducedMotion();
 const [passwordLength,setPasswordLength]=useState(0);
 const [selectedService,setSelectedService]=useState(1);
 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{if(!alive)return;setSession(s);if(event==='PASSWORD_RECOVERY'){setMode('password');setPage('account');}});
  (async()=>{try{
   const callback=emailCallback(location.search,location.hash);
   if(callback){
    history.replaceState({},'', '/');
    const result=callback.kind==='session'?await supabase.auth.setSession({access_token:callback.access_token,refresh_token:callback.refresh_token}):callback.kind==='otp'?await supabase.auth.verifyOtp({token_hash:callback.token_hash,type:callback.type}):await supabase.auth.exchangeCodeForSession(callback.code);
    if(result.error)throw result.error;
    setPage('account');
    if(!callback.requiresPassword)setMessage('Acesso confirmado.');
    if(callback.requiresPassword){sessionStorage.setItem('torriceli-password-setup','pending');setMode('password');setPage('account');}
   }
   const {data,error}=await supabase.auth.getSession();if(error)throw error;if(alive){setSession(data.session);if(data.session&&sessionStorage.getItem('torriceli-password-setup')==='pending'){setMode('password');setPage('account');}}
   const result=await supabase.from('services').select('*').eq('active',true).order('id');if(result.error)throw result.error;if(alive)setRows(result.data);
  }catch{if(alive)setMessage('Não foi possível carregar a conexão. Tente novamente.');}finally{if(alive)setReady(true);}})();
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{let alive=true;setAdminUserId(null);setAal(false);setProfile(null);setAppointments([]);setQr('');setFactor(null);
  if(session&&supabase)(async()=>{const [p,a,r,l]=await Promise.all([supabase.from('profiles').select('*').eq('id',session.user.id).single(),supabase.from('appointments').select('id,starts_at,status').eq('customer_id',session.user.id).order('starts_at'),supabase.rpc('has_admin_role'),supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);if(!alive)return;setProfile(p.data);setAppointments(a.data||[]);setAdminUserId(r.data===true?session.user.id:null);setAal(l.data?.currentLevel==='aal2');})();
  return()=>{alive=false;};
 },[session]);
 async function action(fn){setBusy(true);setMessage('');try{await fn();}catch(error){setMessage(authError(error));}finally{setBusy(false);}}
 async function auth(e){e.preventDefault();const f=new FormData(e.currentTarget);await action(async()=>{
  let result;
  if(mode==='signup'&&!publicSignupEnabled)throw new Error('Cadastro público ainda indisponível');
  if(mode==='signup')result=await supabase.auth.signUp({email:f.get('email'),password:f.get('password'),options:{emailRedirectTo:redirectUrl()}});
  else if(mode==='recovery')result=await supabase.auth.resetPasswordForEmail(f.get('email'),{redirectTo:redirectUrl()});
  else if(mode==='password'){result=await supabase.auth.updateUser({password:f.get('password')});if(!result.error){sessionStorage.removeItem('torriceli-password-setup');await supabase.auth.signOut();setMode('login');setPasswordLength(0);}}
  else result=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  if(result.error)throw result.error;
  setMessage(mode==='recovery'?'Se o e-mail estiver cadastrado, você receberá as instruções.':mode==='signup'?'Confira seu e-mail e abra o link de confirmação neste mesmo navegador, mantendo esta janela aberta.':mode==='password'?'Senha atualizada. Entre novamente.':'Acesso realizado.');
 });}
 async function prepareMfa(){await action(async()=>{
  const list=await supabase.auth.mfa.listFactors();if(list.error)throw list.error;
  const existing=existingTotp(list.data);
  if(existing){setFactor(existing.id);if(!qr)setMessage(existing.status==='verified'?'Digite o código atual do seu autenticador.':'Configuração retomada. Se já escaneou o QR Code, digite o código atual do aplicativo. Se ainda não escaneou, use Gerar novo QR Code.');return;}
  const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Clínica Torriceli'});if(error)throw error;setFactor(data.id);setQr(data.totp.qr_code);
 });}
 async function restartMfa(){await action(async()=>{
  const list=await supabase.auth.mfa.listFactors();if(list.error)throw list.error;
  const existing=existingTotp(list.data);if(existing?.status==='verified'){setFactor(existing.id);setMessage('Seu autenticador já está confirmado. Digite o código dele para acessar.');return;}
  for(const f of list.data.all??[]){if(f.factor_type==='totp'&&f.status==='unverified'){const result=await supabase.auth.mfa.unenroll({factorId:f.id});if(result.error)throw result.error;}}
  setQr('');setFactor(null);
  const {data,error}=await supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Clínica Torriceli'});if(error)throw error;setFactor(data.id);setQr(data.totp.qr_code);setMessage('Novo QR gerado. Escaneie este QR no aplicativo; a configuração pendente anterior não será mais válida.');
 });}
 async function verify(e){e.preventDefault();const code=new FormData(e.currentTarget).get('code');await action(async()=>{const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor,code});if(error)throw error;const {data}=await supabase.auth.getSession();setSession(data.session);setMessage('Segundo fator validado.');});}
 function navigate(p){setPage(p);setMessage('');window.scrollTo({top:0});}
 const connected=!!supabase;
 const admin=!!session&&adminUserId===session.user.id;
 const profileReady=!!session&&profile?.id===session.user.id;
 if(page==='unsubscribe')return <UnsubscribePanel/>;
 return <><header><a href="#" className="brand" onClick={e=>{e.preventDefault();navigate('home');}}>TORRICELLI<span>CLÍNICA DE ESTÉTICA</span></a><nav aria-label="Principal"><button onClick={()=>navigate('home')} aria-current={page==='home'?'page':undefined}>A clínica</button><button onClick={()=>navigate('services')} aria-current={page==='services'?'page':undefined}>Serviços</button><button onClick={()=>navigate('account')} aria-current={page==='account'?'page':undefined}>Minha conta</button>{admin&&<button onClick={()=>navigate('admin')} aria-current={page==='admin'?'page':undefined}>Eduarda</button>}</nav></header>
 <div className="notice">{connected?"Ambiente de testes · cadastros autorizados · reservas indisponíveis":"Demonstração · sem conexão, cadastros ou reservas reais"}</div>
 {message&&<div className="message" role="status">{message}</div>}
 <main>{page==='home'?<><section className="hero"><div><p className="eyebrow">BELEZA COM LEVEZA E INTENÇÃO</p><h1>Um cuidado só seu.<br/><em>Em cada detalhe.</em></h1><p>Um espaço para valorizar a sua beleza, com o olhar atento e o cuidado de Eduarda.</p><HeroVideo reduced={motion.reduced}/><button className="primary" onClick={()=>navigate('services')}>Agendar meu horário <span>↗</span></button><small>Conheça os serviços. A agenda online estará disponível em uma próxima etapa.</small></div><aside className="hero-note"><span className="line-flower" aria-hidden="true">✧</span><p>Seu tempo de<br/><em>se sentir bem.</em></p><span>CÍLIOS · SOBRANCELHAS · PELE · LÁBIOS</span></aside></section><section className="booking-journey"><div><p className="eyebrow">DO PRIMEIRO OLÁ AO SEU CUIDADO</p><h2>Um caminho simples.<br/>Um atendimento pessoal.</h2><p>Conheça os serviços, prepare sua ficha e conte para a Eduarda um pouco sobre você.</p></div><ol><li><span>01</span><div><h3>Encontre seu cuidado</h3><p>Veja os procedimentos e consulte os horários de teste.</p></div></li><li><span>02</span><div><h3>Prepare sua ficha</h3><p>Entre em Minha conta e preencha sua avaliação inicial com dados fictícios nesta fase de testes.</p><button onClick={()=>navigate('account')}>Minha conta e ficha ↗</button></div></li><li><span>03</span><div><h3>Revise com a Eduarda</h3><p>As informações ficam disponíveis para a avaliação individual. Reservas online serão liberadas em outra etapa.</p></div></li></ol></section><section className="intro"><p className="eyebrow">ESCOLHA SEU MOMENTO</p><h2>Pequenos detalhes.<br/>Uma nova forma de se olhar.</h2><div className="features">{['Cílios & olhar','Sobrancelhas','Pele & lábios'].map((x,i)=><button onClick={()=>navigate('services')} key={x}><span>0{i+1}</span><h3>{x}</h3><p>Veja os cuidados, valores e tempo reservado.</p><b>Explorar ↗</b></button>)}</div></section><section className="split"><div><p className="eyebrow">RESULTADOS</p><h2>Beleza nos detalhes.</h2><p>Conheça no vídeo uma seleção de resultados reais e detalhes dos procedimentos. Cada atendimento respeita as características de cada cliente.</p></div><div><p className="eyebrow">CONHEÇA EDUARDA</p><h2>Presença em cada cuidado.</h2><WelcomePresentation/><p>Na Clínica Torricelli, todos os atendimentos são realizados pela Eduarda.</p><p>Segunda a sexta, das 11h às 22h durante a restrição de estágio. Sábado, das 7h às 18h. Domingo fechado.<br/>Endereço e contato serão informados em breve.</p></div></section></>:page==='services'?<section><p className="eyebrow">CATÁLOGO</p><h1>Escolha o seu cuidado.</h1><p>Valores e duração por opção. Reservas ainda indisponíveis.</p><label className="search">Buscar serviço<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: cílios, design, pele"/></label><div className="catalog">{rows.filter(s=>(s.name+' '+s.variant).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map(s=><article key={s.id}><p className="eyebrow">{s.variant}</p><h3>{s.name}</h3><p>{s.duration_minutes} minutos reservados</p>{s.maintenance_max_days&&<small>Manutenção entre {s.maintenance_min_days} e {s.maintenance_max_days} dias; após esse prazo, nova aplicação.</small>}<div className="price">{money(s.price_cents)}</div><button disabled={!connected} onClick={()=>{setSelectedService(s.id);document.getElementById("availability-preview")?.scrollIntoView({behavior:motion.reduced?"auto":"smooth"});}}>Consultar horários de teste</button></article>)}</div><div id="availability-preview"><AvailabilityPreview selectedService={selectedService}/></div><p>Capping: reservamos 120 minutos para a aplicação. Intervalo de 15 minutos entre atendimentos.</p></section>:page==='account'?<section className="account"><p className="eyebrow">SEU ESPAÇO</p><h1>Minha conta</h1>{session&&mode!=='password'?<><p>{session.user.email}</p><form key={session.user.id} onSubmit={e=>{e.preventDefault();if(!profileReady)return;const f=new FormData(e.currentTarget);action(async()=>{const {data,error}=await supabase.from('profiles').update({display_name:f.get('name'),phone_e164:String(f.get('phone')||'').trim()||null}).eq('id',session.user.id).select('*').single();if(error)throw error;setProfile(data);setMessage('Cadastro atualizado.');});}}>{!profileReady?<p role="status">Carregando seu cadastro…</p>:<><label>Como deseja ser chamada?<input key={profile?.id} name="name" defaultValue={profile?.display_name||''} maxLength={100} required/></label><label>Telefone de contato (opcional)<input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone_e164||''} maxLength={16} pattern="\+[1-9][0-9]{7,14}" placeholder="+55 seguido de DDD e número"/><small>Informe no formato internacional, sem espaços. Isso não ativa avisos por WhatsApp.</small></label><button className="primary" disabled={busy}>Salvar cadastro</button></>}</form><ClientIntake key={session.user.id} userId={session.user.id} profile={profileReady?profile:null} email={session.user.email}/><AlertPreferences userId={session.user.id}/><h2>Meus agendamentos</h2>{appointments.length?appointments.map(a=><p key={a.id}>{new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(a.starts_at))} · {a.status}</p>):<p>Nenhum agendamento disponível. A agenda está em preparação.</p>}<button onClick={()=>action(async()=>{const {error}=await supabase.auth.signOut();if(error)throw error;})}>Sair da conta</button></>:<><div className="tabs">{[['login','Entrar'],['signup','Criar conta'],['recovery','Recuperar senha']].map(([k,l])=><button key={k} aria-pressed={mode===k} onClick={()=>setMode(k)}>{l}</button>)}</div>{mode==='signup'&&<p>{publicSignupEnabled?'Cadastro de testes disponível somente para endereços previamente autorizados. Confirme seu e-mail para entrar; isso não concede acesso administrativo.':'Cadastro de novas clientes em preparação.'}</p>}<form onSubmit={auth}><fieldset disabled={!connected||busy||!ready||(mode==='signup'&&!publicSignupEnabled)}><legend>{mode==='password'?'Definir nova senha':mode==='signup'?'Criar sua conta':mode==='recovery'?'Recuperar acesso':'Bem-vinda de volta'}</legend>{mode!=='password'&&<label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}{mode!=='recovery'&&<label>{mode==='password'?'Nova senha':'Senha'}<input name="password" type="password" onInput={e=>setPasswordLength(e.currentTarget.value.length)} minLength={mode==='login'?undefined:12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} required/>{mode!=='login'&&<small aria-live="polite">{passwordLength<12?`Pelo menos 12 caracteres · faltam ${12-passwordLength}.`:'Comprimento mínimo atendido.'}</small>}</label>}<button className="primary">{busy?'Aguarde…':mode==='recovery'?'Enviar instruções':mode==='signup'?'Cadastrar':mode==='password'?'Salvar nova senha':'Entrar'}</button></fieldset></form><p>Cadastro e ficha disponíveis para testes com dados fictícios. Aviso de privacidade e termos finais em preparação.</p></>}</section>:<section className="account"><p className="eyebrow">ÁREA RESTRITA</p><h1>Olá, Eduarda.</h1>{!session?<><p>Entre com a conta autorizada para continuar.</p><button className="primary" onClick={()=>navigate('account')}>Entrar</button></>:!admin?<p>Esta conta não tem autorização administrativa.</p>:!aal?<><p>Confirme o segundo fator no seu aplicativo autenticador para acessar os dados administrativos.</p><button onClick={prepareMfa} disabled={busy}>Preparar autenticador</button>{factor&&!qr&&<button onClick={restartMfa} disabled={busy}>Gerar novo QR Code</button>}{qr&&<img className="qr" src={qr} alt="QR Code para configurar seu autenticador. Mantenha em sigilo."/>}{factor&&<form onSubmit={verify}><label>Código do autenticador<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required maxLength={6}/></label><button className="primary" disabled={busy}>Validar segundo fator</button></form>}</>:<><p>Acesso com segundo fator validado.</p><AdminDashboard/></>}</section>}</main><footer><label className="motion-preference"><input type="checkbox" checked={motion.reduced} disabled={motion.system} onChange={e=>motion.setManual(e.target.checked)}/> Reduzir animações</label><div className="brand">TORRICELLI<span>CUIDADO QUE REALÇA VOCÊ</span></div><p>Clínica Torricelli · Atendimento com Eduarda</p><small>Termos e aviso de privacidade em elaboração. Reservas ainda indisponíveis.</small></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);






