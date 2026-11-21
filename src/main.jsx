import React, {useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {catalog,money} from './catalog.mjs';
import {supabase,redirectUrl,publicSignupEnabled} from './supabase';
import {emailCallback} from './auth-callback.mjs';
import {authError} from './auth-errors.mjs';
import {existingTotp} from './mfa.mjs';
import './style.css';
import AlertPreferences from './AlertPreferences';
import {useReducedMotion} from './HeroVideo';
import AdminDashboard from './AdminDashboard';
import {AvailabilityPreview} from './AvailabilityPanel';
import UnsubscribePanel from './UnsubscribePanel';
import ClientIntake from './ClientIntake';
import MyAppointments from './MyAppointments';
import WelcomePresentation from './WelcomePresentation';
import Turnstile,{turnstileSiteKey} from './Turnstile';
import LegalPage from './LegalPage';
import ResultsCarousel from './ResultsCarousel';
import {groupServices,visibleGroups} from './services-view.mjs';
import {legalDocs,LEGAL_VERSION} from './legal.mjs';
import './intake.css';

function App(){
 const [page,setPage]=useState(()=>{const view=new URLSearchParams(location.search).get('view');return ['services','account','unsubscribe','privacidade','termos'].includes(view)?view:'home';}),[session,setSession]=useState(null),[message,setMessage]=useState(''),[mode,setMode]=useState('login'),[busy,setBusy]=useState(false),[rows,setRows]=useState(catalog),[profile,setProfile]=useState(null),[booking,setBooking]=useState(null),[bookingsVersion,setBookingsVersion]=useState(0),[adminUserId,setAdminUserId]=useState(null),[detailsOpen,setDetailsOpen]=useState(false),[aal,setAal]=useState(false),[factor,setFactor]=useState(null),[qr,setQr]=useState(''),[query,setQuery]=useState(''),[ready,setReady]=useState(!supabase);
 const motion=useReducedMotion();
 const [passwordLength,setPasswordLength]=useState(0);
 const [captcha,setCaptcha]=useState(null),[captchaRound,setCaptchaRound]=useState(0);
 const [showAllServices,setShowAllServices]=useState(false);
 const serviceGroups=useMemo(()=>groupServices(rows),[rows]);
 const needsCaptcha=Boolean(turnstileSiteKey)&&mode!=='password';
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
   const info=await supabase.rpc('booking_info');if(alive&&!info.error)setBooking(info.data);
  }catch{if(alive)setMessage('Não foi possível carregar a conexão. Tente novamente.');}finally{if(alive)setReady(true);}})();
  return()=>{alive=false;subscription.unsubscribe();};
 },[]);
 useEffect(()=>{let alive=true;setAdminUserId(null);setAal(false);setProfile(null);setQr('');setFactor(null);
  if(session&&supabase)(async()=>{const [p,r,l]=await Promise.all([supabase.from('profiles').select('*').eq('id',session.user.id).single(),supabase.rpc('has_admin_role'),supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);if(!alive)return;setProfile(p.data);setAdminUserId(r.data===true?session.user.id:null);setAal(l.data?.currentLevel==='aal2');})();
  return()=>{alive=false;};
 },[session]);
 async function action(fn){setBusy(true);setMessage('');try{await fn();}catch(error){setMessage(authError(error));}finally{setBusy(false);}}
 async function auth(e){e.preventDefault();const f=new FormData(e.currentTarget);await action(async()=>{
  let result;
  if(mode==='signup'&&!publicSignupEnabled)throw new Error('Cadastro temporariamente fechado');
  if(needsCaptcha&&!captcha)throw Object.assign(new Error('captcha pending'),{code:'captcha_pending'});
  // Each Turnstile token is single-use: whatever happens, the next attempt gets a fresh one.
  const captchaToken=needsCaptcha?captcha:undefined;if(needsCaptcha){setCaptcha(null);setCaptchaRound(n=>n+1);}
  if(mode==='signup')result=await supabase.auth.signUp({email:f.get('email'),password:f.get('password'),options:{emailRedirectTo:redirectUrl(),captchaToken,data:{legal_version:LEGAL_VERSION}}});
  else if(mode==='recovery')result=await supabase.auth.resetPasswordForEmail(f.get('email'),{redirectTo:redirectUrl(),captchaToken});
  else if(mode==='password'){result=await supabase.auth.updateUser({password:f.get('password')});if(!result.error){sessionStorage.removeItem('torriceli-password-setup');await supabase.auth.signOut();setMode('login');setPasswordLength(0);}}
  else result=await supabase.auth.signInWithPassword({email:f.get('email'),password:f.get('password'),options:{captchaToken}});
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
 // Troca de tela animada: desliza para o lado na ordem do menu (avança para a direita, volta para a esquerda).
 // Usa a View Transitions API quando o navegador tem; senão, uma animação de entrada equivalente.
 const navOrder=['home','services','account','admin','privacidade','termos','unsubscribe'];
 const [navDir,setNavDir]=useState('forward');
 function navigate(p){
  if(p===page){window.scrollTo({top:0,behavior:motion.reduced?'auto':'smooth'});return;}
  const dir=navOrder.indexOf(p)>=navOrder.indexOf(page)?'forward':'back';
  const apply=()=>{setNavDir(dir);setPage(p);setMessage('');window.scrollTo({top:0});};
  if(document.startViewTransition&&!motion.reduced){
   document.documentElement.dataset.nav=dir;
   const t=document.startViewTransition(()=>flushSync(apply));
   t.finished.finally(()=>{delete document.documentElement.dataset.nav;});
  }else apply();
 }
 async function refreshBooking(){const info=await supabase.rpc('booking_info');if(!info.error)setBooking(info.data);}
 const connected=!!supabase;
 const bookingOpen=connected&&!!booking?.enabled;
 const admin=!!session&&adminUserId===session.user.id;
 const profileReady=!!session&&profile?.id===session.user.id;
 if(page==='unsubscribe')return <UnsubscribePanel/>;
 const profileComplete=profileReady&&!!profile?.display_name?.trim()&&!!profile?.phone_e164;
 const firstName=(profile?.display_name||'').trim().split(/\s+/)[0]||'';
 const signOut=()=>action(async()=>{const {error}=await supabase.auth.signOut();if(error)throw error;});
 const profileForm=session&&<form key={session.user.id} onSubmit={e=>{e.preventDefault();if(!profileReady)return;const f=new FormData(e.currentTarget);action(async()=>{const {data,error}=await supabase.from('profiles').update({display_name:f.get('name'),phone_e164:String(f.get('phone')||'').trim()||null}).eq('id',session.user.id).select('*').single();if(error)throw error;setProfile(data);setMessage('Cadastro atualizado.');});}}><><label>Como deseja ser chamada?<input key={profile?.id} name="name" defaultValue={profile?.display_name||''} maxLength={100} required/></label><label>WhatsApp para contato<input name="phone" type="tel" autoComplete="tel" defaultValue={profile?.phone_e164||''} maxLength={16} pattern="\+[1-9][0-9]{7,14}" placeholder="+55 seguido de DDD e número"/><small>Necessário para agendar. Formato internacional, sem espaços.</small></label><button className="primary" disabled={busy}>Salvar cadastro</button></></form>;
 return <><header><a href="#" className="brand" onClick={e=>{e.preventDefault();navigate('home');}}><img className="brand-mark" src="/media/marca/monograma-176.webp" alt="" width="37" height="44"/><span className="brand-words">TORRICELLI<small>CLÍNICA DE ESTÉTICA</small></span></a><nav aria-label="Principal"><button onClick={()=>navigate('home')} aria-current={page==='home'?'page':undefined}>A clínica</button><button onClick={()=>navigate('services')} aria-current={page==='services'?'page':undefined}>Serviços</button><button onClick={()=>navigate('account')} aria-current={page==='account'?'page':undefined}>Minha conta</button>{admin&&<button onClick={()=>navigate('admin')} aria-current={page==='admin'?'page':undefined}>Eduarda</button>}</nav></header>
 <div className="notice">{connected?(bookingOpen?"Agendamento online · sem pagamento para agendar":"Agenda online temporariamente fechada · fale com a clínica pelo WhatsApp"):"Demonstração · sem conexão, cadastros ou reservas reais"}</div>
 {message&&<div className="message" role="status">{message}</div>}
 <main key={page} className={`page enter-${navDir}`}>{legalDocs[page]?<LegalPage doc={legalDocs[page]} otherLabel={page==='termos'?'Ler o Aviso de privacidade':'Ler os Termos de uso'} onOther={()=>navigate(page==='termos'?'privacidade':'termos')}/>:page==='home'?<><section className="hero"><div className="hero-text"><p className="eyebrow">BELEZA COM LEVEZA E INTENÇÃO</p><h1>Um cuidado só seu.<br/><em>Em cada detalhe.</em></h1><p>Um espaço para valorizar a sua beleza, com o olhar atento e o cuidado de Eduarda.</p></div><ResultsCarousel reduced={motion.reduced}/><div className="hero-cta"><button className="primary" onClick={()=>navigate('services')}>Agendar meu horário <span>↗</span></button><small>{bookingOpen?'Escolha o serviço e o horário. Não há pagamento para agendar.':'Conheça os serviços. A agenda online está temporariamente fechada.'}</small><p className="hero-tags">CÍLIOS · SOBRANCELHAS · PELE · LÁBIOS</p></div></section><section className="booking-journey"><div><p className="eyebrow">DO PRIMEIRO OLÁ AO SEU CUIDADO</p><h2>Um caminho simples.<br/>Um atendimento pessoal.</h2><p>Conheça os serviços, prepare sua ficha e conte para a Eduarda um pouco sobre você.</p></div><ol><li><span>01</span><div><h3>Encontre seu cuidado</h3><p>Veja os procedimentos, os valores e os horários livres.</p></div></li><li><span>02</span><div><h3>Prepare sua ficha</h3><p>Para extensão de cílios, preencha a sua ficha em Minha conta antes do primeiro agendamento.</p><button onClick={()=>navigate('account')}>Minha conta e ficha ↗</button></div></li><li><span>03</span><div><h3>Revise com a Eduarda</h3><p>{bookingOpen?'As informações ficam disponíveis para a avaliação individual antes do seu horário.':'As informações ficam disponíveis para a avaliação individual. A agenda online está temporariamente fechada.'}</p></div></li></ol></section><section className="intro"><p className="eyebrow">ESCOLHA SEU MOMENTO</p><h2>Pequenos detalhes.<br/>Uma nova forma de se olhar.</h2><div className="features">{['Cílios & olhar','Sobrancelhas','Pele & lábios'].map((x,i)=><button onClick={()=>navigate('services')} key={x}><span>0{i+1}</span><h3>{x}</h3><p>Veja os cuidados, valores e tempo reservado.</p><b>Explorar ↗</b></button>)}</div></section><section className="split"><div><p className="eyebrow">RESULTADOS</p><h2>Beleza nos detalhes.</h2><p>As fotos do início da página são resultados reais de clientes da clínica, publicadas com autorização. Cada atendimento respeita as características de cada cliente.</p></div><div><p className="eyebrow">CONHEÇA EDUARDA</p><h2>Presença em cada cuidado.</h2><WelcomePresentation/><p>Na Clínica Torricelli, todos os atendimentos são realizados pela Eduarda.</p><p>Segunda a sexta, das 11h às 22h durante a restrição de estágio. Sábado, das 7h às 18h. Domingo fechado.<br/>WhatsApp da clínica: <a href="https://wa.me/5519990347698" target="_blank" rel="noopener noreferrer">(19) 99034-7698</a>.</p></div></section></>:page==='services'?<section><p className="eyebrow">CATÁLOGO</p><h1>Escolha o seu cuidado.</h1><p>{bookingOpen?'Valores e duração por opção. Não há pagamento para agendar; antes de confirmar, você lê e aceita a regra de faltas e cancelamentos.':'Valores e duração por opção. A agenda online está temporariamente fechada.'}</p><label className="search">Buscar serviço<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: volume, fox, sobrancelha, lábios"/></label>{!query&&<p className="catalog-hint">{showAllServices?`Todos os ${serviceGroups.length} serviços`:'Mais procurados'} · <button className="inline-link" onClick={()=>setShowAllServices(v=>!v)}>{showAllServices?'Ver só os destaques':`Ver todos os ${serviceGroups.length} serviços`}</button></p>}<div className="catalog">{visibleGroups(serviceGroups,query,{showAll:showAllServices}).map((g,i)=><article key={g.name} className="service-card" style={{'--i':i}}><h3>{g.name}</h3>{g.options.map(s=><div className="service-option" key={s.id}><div className="service-info"><p className="eyebrow">{s.variant}</p><p>{s.duration_minutes} minutos reservados</p>{s.maintenance_max_days&&<small>Manutenção entre {s.maintenance_min_days} e {s.maintenance_max_days} dias; depois disso, nova aplicação.</small>}</div><div className="price">{money(s.price_cents)}</div><button disabled={!connected} onClick={()=>{setSelectedService(s.id);document.getElementById("availability-preview")?.scrollIntoView({behavior:motion.reduced?"auto":"smooth"});}}>{bookingOpen?'Ver horários e agendar':'Ver horários livres'}</button></div>)}</article>)}{query&&!visibleGroups(serviceGroups,query).length&&<p className="catalog-empty">Nenhum serviço encontrado para “{query}”. Tente outra palavra, como cílios, sobrancelha ou lábios.</p>}</div><div id="availability-preview"><AvailabilityPreview selectedService={selectedService} session={session} booking={booking} onBooked={()=>setBookingsVersion(v=>v+1)} onAccount={reason=>{if(reason==='intake_required')setDetailsOpen(true);navigate('account');}} onRuleChanged={refreshBooking}/></div><p>Capping: reservamos 120 minutos para a aplicação. Intervalo de 15 minutos entre atendimentos.</p></section>:page==='account'?<section className="account"><p className="eyebrow">SEU ESPAÇO</p><h1>Minha conta</h1>{session&&mode!=='password'?(!profileReady?<p role="status">Carregando sua conta…</p>:admin?<div className="account-clinic"><p>Conta da clínica · {session.user.email}</p><p>Agenda do dia e da semana, reservas, taxas, fichas e horários ficam no painel da Eduarda.</p><button className="primary" onClick={()=>navigate('admin')}>Abrir o painel da Eduarda <span>↗</span></button><p><button onClick={signOut}>Sair da conta</button></p></div>:<><p className="account-hello">{firstName?`Olá, ${firstName}!`:'Olá!'}<small>{session.user.email}</small></p>{!profileComplete&&<div className="account-first"><h2>Complete seu cadastro</h2><p>Só nesta primeira vez: seu nome e o WhatsApp são necessários para agendar.</p>{profileForm}</div>}<MyAppointments userId={session.user.id} version={bookingsVersion} onChanged={()=>setBookingsVersion(v=>v+1)} onBook={()=>navigate('services')}/><AlertPreferences userId={session.user.id}/><details className="account-details" open={detailsOpen} onToggle={e=>setDetailsOpen(e.currentTarget.open)}><summary>Meus dados e ficha de extensão de cílios</summary><p className="account-details-hint">A ficha só é necessária para extensão de cílios. Atualize se algo mudar na sua saúde ou no seu contato.</p>{profileComplete&&profileForm}<ClientIntake key={session.user.id} userId={session.user.id} profile={profile} email={session.user.email}/></details><button onClick={signOut}>Sair da conta</button></>):<><div className="tabs">{[['login','Entrar'],['signup','Criar conta'],['recovery','Recuperar senha']].map(([k,l])=><button key={k} aria-pressed={mode===k} onClick={()=>setMode(k)}>{l}</button>)}</div>{mode==='signup'&&<p>{publicSignupEnabled?'Crie sua conta com e-mail e senha. Depois, confirme pelo link que vamos enviar ao seu e-mail.':'Cadastro de novas clientes temporariamente fechado.'}</p>}<form onSubmit={auth}><fieldset disabled={!connected||busy||!ready||(mode==='signup'&&!publicSignupEnabled)}><legend>{mode==='password'?'Definir nova senha':mode==='signup'?'Criar sua conta':mode==='recovery'?'Recuperar acesso':'Bem-vinda de volta'}</legend>{mode!=='password'&&<label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>}{mode!=='recovery'&&<label>{mode==='password'?'Nova senha':'Senha'}<input name="password" type="password" onInput={e=>setPasswordLength(e.currentTarget.value.length)} minLength={mode==='login'?undefined:12} maxLength={128} autoComplete={mode==='login'?'current-password':'new-password'} required/>{mode!=='login'&&<small aria-live="polite">{passwordLength<12?`Pelo menos 12 caracteres · faltam ${12-passwordLength}.`:'Comprimento mínimo atendido.'}</small>}</label>}{mode==='signup'&&<label className="accept"><input type="checkbox" name="legal" required/><span>Li e aceito os <a href="?view=termos" target="_blank" rel="noopener">Termos de uso</a> e o <a href="?view=privacidade" target="_blank" rel="noopener">Aviso de privacidade</a>.</span></label>}{needsCaptcha&&<><Turnstile key={`${mode}-${captchaRound}`} action={mode} onToken={setCaptcha}/>{!captcha&&<small className="captcha-wait" aria-live="polite">Confirmando que você não é um robô…</small>}</>}<button className="primary" disabled={needsCaptcha&&!captcha}>{busy?'Aguarde…':mode==='recovery'?'Enviar instruções':mode==='signup'?'Cadastrar':mode==='password'?'Salvar nova senha':'Entrar'}</button></fieldset></form><p>Seus dados são tratados conforme o <a href="?view=privacidade" onClick={e=>{e.preventDefault();navigate('privacidade');}}>Aviso de privacidade</a>.</p></>}</section>:<section className="account"><p className="eyebrow">ÁREA RESTRITA</p><h1>Olá, Eduarda.</h1>{!session?<><p>Entre com a conta autorizada para continuar.</p><button className="primary" onClick={()=>navigate('account')}>Entrar</button></>:!admin?<p>Esta conta não tem autorização administrativa.</p>:!aal?<><p>Confirme o segundo fator no seu aplicativo autenticador para acessar os dados administrativos.</p><button onClick={prepareMfa} disabled={busy}>Preparar autenticador</button>{factor&&!qr&&<button onClick={restartMfa} disabled={busy}>Gerar novo QR Code</button>}{qr&&<img className="qr" src={qr} alt="QR Code para configurar seu autenticador. Mantenha em sigilo."/>}{factor&&<form onSubmit={verify}><label>Código do autenticador<input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required maxLength={6}/></label><button className="primary" disabled={busy}>Validar segundo fator</button></form>}</>:<><p>Acesso com segundo fator validado.</p><AdminDashboard/></>}</section>}</main><footer><label className="motion-preference"><input type="checkbox" checked={motion.reduced} disabled={motion.system} onChange={e=>motion.setManual(e.target.checked)}/> Reduzir animações</label><img className="footer-logo" src="/media/marca/logo-completo-640.webp" alt="Clínica Torricelli" width="200" height="209" loading="lazy" decoding="async"/><p className="footer-tagline">CUIDADO QUE REALÇA VOCÊ</p><p>Clínica Torricelli · Atendimento com Eduarda</p><small><a href="?view=privacidade" onClick={e=>{e.preventDefault();navigate('privacidade');}}>Aviso de privacidade</a> · <a href="?view=termos" onClick={e=>{e.preventDefault();navigate('termos');}}>Termos de uso</a>. {bookingOpen?'Agendamento online, sem pagamento para agendar.':'Agenda online temporariamente fechada.'}</small></footer></>;
}
createRoot(document.getElementById('root')).render(<App/>);






