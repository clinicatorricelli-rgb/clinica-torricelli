import React,{useEffect,useRef,useState} from 'react';
const source=import.meta.env.VITE_WELCOME_VIDEO||'';
const version=import.meta.env.VITE_WELCOME_VIDEO_VERSION||'v1';
const seenKey=`torricelli-welcome-${version}`;
function firstVisit(){if(!source)return false;try{return localStorage.getItem(seenKey)!=='seen';}catch{return true;}}
export default function WelcomePresentation(){
 const [open,setOpen]=useState(firstVisit),[error,setError]=useState(false);const dialog=useRef(null);
 useEffect(()=>{if(open&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[open]);
 function close(){try{localStorage.setItem(seenKey,'seen');}catch{}dialog.current?.close();setOpen(false);}
 if(!source)return null;
 return <><button className="presentation-replay" onClick={()=>{setError(false);setOpen(true);}}>Ver apresentação da Eduarda <span aria-hidden="true">↗</span></button>{open&&<dialog ref={dialog} className="welcome-dialog" onCancel={e=>{e.preventDefault();close();}} aria-labelledby="welcome-title"><div className="welcome-dialog-top"><p className="eyebrow">UM OLÁ DA EDUARDA</p><button onClick={close} aria-label="Fechar apresentação">Fechar</button></div><h2 id="welcome-title">Seja bem-vinda à Clínica Torricelli.</h2><p>Conheça a Eduarda e o espaço que vai receber você.</p><video src={source} controls playsInline preload="metadata" onEnded={close} onError={()=>setError(true)} aria-label="Eduarda apresenta a clínica e o site">{import.meta.env.VITE_WELCOME_CAPTIONS&&<track src={import.meta.env.VITE_WELCOME_CAPTIONS} kind="captions" srcLang="pt-BR" label="Português" default/>}</video>{error&&<p role="status">Não foi possível reproduzir o vídeo. Você pode continuar pelo site e tentar novamente depois.</p>}<button className="primary" onClick={close}>Continuar para o site</button></dialog>}</>;
}
