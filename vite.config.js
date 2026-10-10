import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_SUPABASE_', 'NEXT_PUBLIC_SUPABASE_']);
  // Map only the two public Supabase settings used by the browser.
  const url = env.VITE_SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
    },
  };
});
