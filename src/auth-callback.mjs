// Only supported email-link flows. Never derive authorization from URL/metadata.
export function emailCallback(search,hash=''){
 const fragment=new URLSearchParams(hash.replace(/^#/,''));
 if(fragment.has('access_token')||fragment.has('refresh_token')){
  const type=fragment.get('type');
  if(!['invite','recovery','signup'].includes(type)||!fragment.get('access_token')||!fragment.get('refresh_token'))throw new Error('Unsupported email action');
  return {kind:'session',access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),requiresPassword:type==='invite'||type==='recovery'};
 }
 const p=new URLSearchParams(search);
 const token_hash=p.get('token_hash'),type=p.get('type'),code=p.get('code');
 if(token_hash){
  if(!['invite','recovery','signup'].includes(type))throw new Error('Unsupported email action');
  return {kind:'otp',token_hash,type,requiresPassword:type==='invite'||type==='recovery'};
 }
 if(code)return {kind:'pkce',code};
 return null;
}
