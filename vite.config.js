import {defineConfig} from 'vite';

export default defineConfig(({mode})=>({
 // A public preview must remain disconnected even if the host has Supabase variables.
 define:mode==='demo'?{
  'import.meta.env.VITE_DEMO_MODE':'true',
  'import.meta.env.VITE_SUPABASE_URL':'""',
  'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY':'""',
  'import.meta.env.VITE_HERO_VIDEO':'"/media/abertura-v4.mp4"'
 }:{'import.meta.env.VITE_DEMO_MODE':'false'}
}));


