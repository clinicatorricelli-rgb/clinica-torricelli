import React,{useEffect,useRef,useState} from 'react';

// Fotos de procedimentos finalizados, com autorização das clientes para divulgação.
// pos = ponto da foto que fica sempre visível se a moldura cortar as bordas.
// As fotos já são recortadas no formato da moldura (4:5), com o trabalho no centro.
export const slides=[
 {src:'/media/resultados/cilios-09.webp',label:'Extensão de cílios',pos:'50% 50%'},
 {src:'/media/resultados/labios-05.webp',label:'Micropigmentação labial',pos:'50% 50%'},
 {src:'/media/resultados/cilios-10.webp',label:'Extensão de cílios',pos:'50% 50%'},
 {src:'/media/resultados/cilios-11.webp',label:'Extensão de cílios',pos:'50% 50%'},
 {src:'/media/resultados/labios-06.webp',label:'Micropigmentação labial',pos:'50% 50%'},
 {src:'/media/resultados/cilios-12.webp',label:'Extensão de cílios',pos:'50% 50%'},
 {src:'/media/resultados/cilios-13.webp',label:'Extensão de cílios',pos:'50% 50%'},
 {src:'/media/resultados/labios-07.webp',label:'Micropigmentação labial',pos:'50% 50%'},
 {src:'/media/resultados/lash-lifting-01.webp',label:'Lash Lifting',pos:'50% 50%'},
 {src:'/media/resultados/cilios-14.webp',label:'Extensão de cílios',pos:'50% 50%'},
 {src:'/media/resultados/sobrancelha-01.webp',label:'Sobrancelhas',pos:'50% 50%'},
 {src:'/media/resultados/labios-08.webp',label:'Micropigmentação labial',pos:'50% 50%'},
 {src:'/media/resultados/cilios-15.webp',label:'Extensão de cílios',pos:'50% 50%'},
];
// Cada foto fica 1,5 s (pedido do usuário em 21/11); com "reduzir movimento", 3 s.
const INTERVAL=1500;

// Troca as fotos sozinha, com transição suave. Para quando a pessoa passa o mouse,
// toca nos pontinhos ou pede para pausar; sem zoom para quem prefere menos movimento.
export default function ResultsCarousel({reduced}){
 const [index,setIndex]=useState(0),[paused,setPaused]=useState(false),[hover,setHover]=useState(false);
 const touch=useRef(null),[loaded,setLoaded]=useState(()=>new Set());
 const go=n=>setIndex((n+slides.length)%slides.length);
 // Na troca automática, pula fotos que ainda não carregaram (internet lenta), para a moldura nunca ficar vazia.
 const nextLoaded=()=>{for(let k=1;k<=slides.length;k++){const i=(index+k)%slides.length;if(loaded.has(i))return i;}return index;};
 useEffect(()=>{if(paused||hover)return;const t=setTimeout(()=>setIndex(nextLoaded()),reduced?INTERVAL*2:INTERVAL);return()=>clearTimeout(t);},[index,paused,hover,reduced,loaded]);
 return <figure className={`results${reduced?' still':''}`} aria-roledescription="carrossel" aria-label="Resultados de procedimentos da Clínica Torricelli"
  onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocus={()=>setHover(true)} onBlur={()=>setHover(false)}
  onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-(touch.current??0);if(Math.abs(dx)>40)go(index+(dx<0?1:-1));touch.current=null;}}>
  <div className="results-frame">
   {slides.map((s,i)=><img key={s.src} src={s.src} alt={`${s.label}: resultado finalizado na Clínica Torricelli`} className={i===index?'on':''}
    style={{objectPosition:s.pos}} loading={i<2?'eager':'lazy'} fetchpriority={i===0?'high':'low'} decoding="async" aria-hidden={i!==index}
    ref={el=>{if(el?.complete&&el.naturalWidth&&!loaded.has(i))setLoaded(prev=>new Set(prev).add(i));}}
    onLoad={()=>setLoaded(prev=>prev.has(i)?prev:new Set(prev).add(i))}/>)}
   <figcaption key={index}>{slides[index].label}</figcaption>
  </div>
  <div className="results-controls">
   <div className="results-dots">{slides.map((s,i)=><button key={s.src} type="button" aria-label={`Mostrar foto ${i+1} de ${slides.length}`} aria-current={i===index?'true':undefined} onClick={()=>{go(i);setPaused(true);}}/>)}</div>
   <button type="button" className="results-pause" onClick={()=>setPaused(p=>!p)} aria-label={paused?'Continuar a troca de fotos':'Pausar a troca de fotos'}>{paused?'▶':'❚❚'}</button>
  </div>
 </figure>;
}
