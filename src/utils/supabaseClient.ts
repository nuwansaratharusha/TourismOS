import { createClient } from "@supabase/supabase-js";

// Load environment variables (Vite automatically injects variables prefixed with VITE_)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase environment variables are missing. Check .env and Vite config.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Optional: helper to get the current JWT from localStorage for server‑side calls
export const getAccessToken = (): string | null => {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
};
