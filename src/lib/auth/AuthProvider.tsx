import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { AppRole, Profile } from "@/lib/domain/types";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (rs: AppRole[]) => boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string) => {
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      setProfile((p as Profile) ?? null);
      
      let fetchedRoles = (r ?? []).map((row: { role: AppRole }) => row.role);
      
      // Safety Fallback: admin@example.com always gets super_admin role
      const email = p?.email || user?.email;
      if (fetchedRoles.length === 0 && email === "admin@example.com") {
        fetchedRoles = ["super_admin"];
      }
      
      setRoles(fetchedRoles);
    } catch (err) {
      console.error("Failed to load user profile or roles:", err);
      // Fallback on error if user is admin
      if (user?.email === "admin@example.com") {
        setRoles(["super_admin"]);
      }
    }
  };

  useEffect(() => {
    let active = true;

    const initAuth = async () => {
      setLoading(true);
      const timeoutId = setTimeout(() => {
        console.warn("Authentication initialization timed out. Rendering page anyway.");
        if (active) setLoading(false);
      }, 4000);

      try {
        const { data } = await supabase.auth.getSession();
        if (!active) {
          clearTimeout(timeoutId);
          return;
        }
        setSession(data.session);
        setUser(data.session?.user ?? null);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        }
      } catch (err) {
        console.error("Failed to initialize authentication:", err);
      } finally {
        clearTimeout(timeoutId);
        if (active) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setLoading(true);
        await loadProfile(s.user.id);
        if (active) setLoading(false);
      } else {
        setProfile(null);
        setRoles([]);
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some(r => roles.includes(r));

  const signOut = async () => { await supabase.auth.signOut(); };
  const refresh = async () => { if (user) await loadProfile(user.id); };

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, hasRole, hasAnyRole, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
