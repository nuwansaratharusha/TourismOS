import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Wallet, ShieldCheck, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TourismOS — Commission & POS Platform" },
      { name: "description", content: "Multi-tenant SaaS for tourism businesses to manage POS, travel-agent and driver commissions, VAT, and payments in real time." },
      { property: "og:title", content: "TourismOS — Commission & POS Platform" },
      { property: "og:description", content: "Real-time commission tracking, POS, and VAT for tourism businesses." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/app" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="font-display text-xl font-bold tracking-tight">TourismOS</div>
          <div className="flex gap-2">
            <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
            <Button asChild><Link to="/auth" search={{ mode: "signup" }}>Get started</Link></Button>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="max-w-2xl">
          <div className="inline-block px-3 py-1 rounded-full bg-accent/15 text-accent-foreground text-xs font-medium mb-4">
            Built for Sri Lankan tourism
          </div>
          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            Commissions, VAT, and POS — finally on one transparent ledger.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            TourismOS eliminates manual commission disputes. Every sale snapshots VAT, agent, and driver commissions atomically — and every party sees the same number, in real time.
          </p>
          <div className="mt-8 flex gap-3">
            <Button asChild size="lg"><Link to="/auth" search={{ mode: "signup" }}>Start free</Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/auth">Sign in</Link></Button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mt-20">
          {[
            { icon: ShoppingCart, title: "Point of Sale", body: "Cashiers ring up sales — VAT and commissions calculate automatically." },
            { icon: Wallet, title: "Commission Engine", body: "Per-agent rates, frozen snapshots, full audit trail per invoice." },
            { icon: BarChart3, title: "Real-time Dashboards", body: "Agents, drivers, and managers see updates the instant a sale lands." },
            { icon: ShieldCheck, title: "Multi-tenant SaaS", body: "Gunatilake Batiks is tenant one. Onboard any tourism business next." },
          ].map(f => (
            <div key={f.title} className="p-5 rounded-lg border bg-card">
              <f.icon className="size-5 text-primary mb-3" />
              <div className="font-semibold">{f.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{f.body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
