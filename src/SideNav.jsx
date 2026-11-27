import React,{useEffect,useState} from 'react';

// Ícones simples desenhados no próprio site (sem bibliotecas nem arquivos externos).
const paths={
 home:'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
 calendar:'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h2M14 12h2M8 16h2',
 receipt:'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
 user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
 clipboard:'M9 4h6v3H9zM7 5H5v16h14V5h-2M8 12l2 2 4-4M8 17h8',
 bell:'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0',
 clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
 users:'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3.5 6',
 settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.3 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z',
 logout:'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10',
 menu:'M4 6h16M4 12h16M4 18h16',
 close:'M6 6l12 12M18 6 6 18',
 check:'M5 12.5l4.5 4.5L19 7',
 plus:'M12 5v14M5 12h14',
};
export const Icon=({name,size=20})=><svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;

// Menu lateral: fixo à esquerda no computador; no celular, botão "Menu" que abre a lista por cima.
export default function SideNav({title,items,active,onSelect,children}){
 const [open,setOpen]=useState(false);
 const current=items.find(i=>i.key===active&&!i.divider);
 useEffect(()=>{if(!open)return;const esc=e=>{if(e.key==='Escape')setOpen(false);};document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc);},[open]);
 const pick=item=>{setOpen(false);if(item.onClick)item.onClick();else{onSelect(item.key);window.scrollTo({top:0});}};
 return <div className="side-layout">
  <button className="side-toggle" aria-expanded={open} aria-controls="side-menu" onClick={()=>setOpen(o=>!o)}><Icon name={open?'close':'menu'}/><span>Menu</span>{current&&<b>· {current.label}</b>}</button>
  {open&&<div className="side-backdrop" onClick={()=>setOpen(false)}/>}
  <nav id="side-menu" className={`side-nav${open?' is-open':''}`} aria-label={title}>
   <p className="side-title">{title}</p>
   <ul>{items.map(item=>item.divider?<li key={item.key} className="side-divider" role="presentation">{item.label}</li>:<li key={item.key}><button className={`${item.key===active?'is-active':''}${item.primary?' is-primary':''}`} aria-current={item.key===active?'page':undefined} onClick={()=>pick(item)}>
    <Icon name={item.icon}/><span>{item.label}</span>{item.badge?<em className="side-badge">{item.badge}</em>:null}</button></li>)}</ul>
  </nav>
  <div className="side-content">{children}</div>
 </div>;
}
