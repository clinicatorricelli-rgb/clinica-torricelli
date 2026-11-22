import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const availabilityEmailEndpoint = url ? `${url}/functions/v1/availability-email` : null;
export const supabase = !import.meta.env.VITE_DEMO_MODE && url && key ? createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:false}}) : null;
export const redirectUrl = () => `${window.location.origin}/`;
export const publicSignupEnabled = import.meta.env.VITE_ENABLE_PUBLIC_SIGNUP === 'true';
// Cadastro usa link de confirmação que funciona em qualquer navegador ou aparelho (o app do
// Gmail abre links num navegador próprio). Este cliente não guarda sessão: só envia o cadastro.
let signup = null;
export const signupClient = () => signup ??= (supabase ? createClient(url, key, {auth: {flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'torricelli-cadastro'}}) : null);
