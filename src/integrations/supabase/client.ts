import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ─── Supabase project: ehbrhiegxpyowtrvwhkl ───────────────────────────────────
// Note: the correct URL has "trvw" NOT "trwv" — one letter swap caused DNS failure
let rawUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ehbrhiegxpyowtrvwhkl.supabase.co';
if (rawUrl.includes('ehbrhiegxpyowtrwvhkl')) {
  rawUrl = rawUrl.replace('ehbrhiegxpyowtrwvhkl', 'ehbrhiegxpyowtrvwhkl');
}
const SUPABASE_URL = rawUrl;

// Supports both new sb_publishable_ format and legacy JWT anon key
let rawKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYnJoaWVneHB5b3d0cnZ3aGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MDM1ODMsImV4cCI6MjA5NjA3OTU4M30.P7Rga2nYCpFNkAsC5K8w0hNY9RUbdko0ZHUZMot6SRo';

if (rawKey.includes('ehbrhiegxpyowtrwvhkl')) {
  rawKey = rawKey.replaceAll('ehbrhiegxpyowtrwvhkl', 'ehbrhiegxpyowtrvwhkl');
}
const SUPABASE_KEY = rawKey;

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
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
