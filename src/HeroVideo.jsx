import React,{useEffect,useState} from 'react';
export function useReducedMotion(){
 const [system,setSystem]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [manual,setManual]=useState(false);
 useEffect(()=>{const q=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setSystem(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
 return {reduced:system||manual,system,setManual};
}
export default function HeroVideo({reduced}){
 return <div className="hero-media">{reduced?<img src="/media/abertura-v4-poster.jpg" alt="Resultado de extensão de cílios da Clínica Torricelli"/>:<video poster="/media/abertura-v4-poster.jpg" src={import.meta.env.VITE_HERO_VIDEO||'/media/abertura-v4.mp4'} autoPlay muted loop playsInline preload="metadata" aria-label="Preparação e resultados dos procedimentos"/>}</div>;
}
