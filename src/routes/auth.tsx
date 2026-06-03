import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const GUNATILAKE_TENANT_ID = "11111111-1111-1111-1111-111111111111";

const searchSchema = z.object({ mode: z.enum(["signin", "signup"]).optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign in — TourismOS" }, { name: "description", content: "Sign in to TourismOS." }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading } = useAuth();
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/app" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName, tenant_id: GUNATILAKE_TENANT_ID },
          },
        });
        if (error) throw error;
        toast.success("Account created. You can sign in now.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-md">
        <Link to="/" className="block text-center font-display text-2xl font-bold tracking-tight mb-8">TourismOS</Link>
        <div className="bg-card border rounded-xl p-8 shadow-sm">
          <h1 className="text-xl font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "signin" ? "Welcome back to your dashboard." : "New users join the Gunatilake Batiks tenant."}
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={fullName} onChange={e => setFullName(e.target.value)} required minLength={2} maxLength={100} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <button onClick={() => setMode("signup")} className="text-primary hover:underline">Need an account? Sign up</button>
            ) : (
              <button onClick={() => setMode("signin")} className="text-primary hover:underline">Already have an account? Sign in</button>
            )}
          </div>
          <p className="mt-6 text-xs text-muted-foreground text-center">
            New accounts have no role assigned. A Super Admin must assign your role before you can access modules.
          </p>
        </div>
      </div>
    </div>
  );
}
