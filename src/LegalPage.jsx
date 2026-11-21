import React from 'react';
import {controller,LEGAL_DATE} from './legal.mjs';

// Renders one of the documents in legal.mjs (aviso de privacidade or termos de uso).
const block=(b,i)=>typeof b==='string'?<p key={i}>{b}</p>:<ul key={i}>{b.list.map((item,j)=><li key={j}>{item}</li>)}</ul>;

export default function LegalPage({doc,onOther,otherLabel}){
 return <article className="legal" aria-labelledby="legal-title">
  <p className="eyebrow">{controller.brand.toUpperCase()}</p>
  <h1 id="legal-title">{doc.title}</h1>
  <p className="legal-meta">Em vigor desde {LEGAL_DATE}. Responsável: {controller.name} · {controller.email}</p>
  <p className="legal-intro">{doc.intro}</p>
  {doc.sections.map(s=><section key={s.title}><h2>{s.title}</h2>{s.blocks.map(block)}</section>)}
  {onOther&&<p><button className="inline-link" onClick={onOther}>{otherLabel}</button></p>}
 </article>;
}
