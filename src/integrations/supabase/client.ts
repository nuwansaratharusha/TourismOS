import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ─── Supabase project: ehbrhiegxpyowtrwvhkl ───────────────────────────────────
// These are public/anon values — safe to embed in client code.
// The service-role key is NEVER used here; it lives only in server files.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ehbrhiegxpyowtrwvhkl.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYnJoaWVneHB5b3d0cnZ3aGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDM1ODMsImV4cCI6MjA5NjA3OTU4M30.P7Rga2nYCpFNkAsC5K8w0hNY9RUbdko0ZHUZMot6SRo';

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
