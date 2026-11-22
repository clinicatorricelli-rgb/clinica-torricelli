import React,{useEffect,useRef,useState} from 'react';

// Janela no meio da tela para avisos que a pessoa não pode deixar passar
// (boas-vindas, "confira seu e-mail", link vencido). Usa o <dialog> do navegador:
// foco preso na janela, Esc fecha, leitor de tela anuncia o título.
export default function PopupDialog({dialog,onClose}){
 const ref=useRef(null),[checked,setChecked]=useState(false);
 useEffect(()=>{const d=ref.current;if(!d)return;setChecked(false);
  if(dialog&&!d.open){if(d.showModal)d.showModal();else d.setAttribute('open','');}
  if(!dialog&&d.open)d.close();
 },[dialog]);
 const finish=action=>{action?.onClick?.(checked);if(dialog?.checkbox&&checked)dialog.checkbox.onChecked?.();onClose();};
 const actions=dialog?.actions||[{label:'Entendi',primary:true}];
 return <dialog ref={ref} className="popup" aria-labelledby="popup-title" onClose={()=>{if(dialog)finish(null);}}>
  {dialog&&<div className="popup-body">
   <h2 id="popup-title">{dialog.title}</h2>
   {dialog.text.split('\n').map((line,i)=><p key={i}>{line}</p>)}
   {dialog.checkbox&&<label className="accept popup-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>{dialog.checkbox.label}</span></label>}
   <div className="actions">{actions.map(a=><button key={a.label} className={a.primary?'primary':''} onClick={()=>finish(a)} autoFocus={a.primary}>{a.label}</button>)}</div>
  </div>}
 </dialog>;
}
