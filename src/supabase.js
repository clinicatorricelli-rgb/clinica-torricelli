import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const availabilityEmailEndpoint = url ? `${url}/functions/v1/availability-email` : null;
export const supabase = !import.meta.env.VITE_DEMO_MODE && url && key ? createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:false}}) : null;
export const redirectUrl = () => `${window.location.origin}/`;
export const publicSignupEnabled = import.meta.env.VITE_ENABLE_PUBLIC_SIGNUP === 'true';
