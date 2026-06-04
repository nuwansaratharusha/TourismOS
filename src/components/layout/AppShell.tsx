import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ShoppingCart, Users, Car, Receipt,
  Wallet, ScrollText, LogOut, Building2, Briefcase, Terminal
} from "lucide-react";
import type { AppRole } from "@/lib/domain/types";
import type { ReactNode } from "react";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
}

const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin","branch_manager","cashier","accountant"] },
  { to: "/app/pos", label: "Point of Sale", icon: ShoppingCart, roles: ["super_admin","branch_manager","cashier"] },
  { to: "/app/terminal", label: "Touch Terminal", icon: Terminal, roles: ["super_admin","branch_manager","cashier"] },
  { to: "/app/sales", label: "Sales & Invoices", icon: Receipt, roles: ["super_admin","branch_manager","cashier","accountant"] },
  { to: "/app/commissions", label: "Commissions", icon: Wallet, roles: ["super_admin","branch_manager","accountant","cashier"] },
  { to: "/app/agents", label: "Travel Agents", icon: Briefcase, roles: ["super_admin","branch_manager"] },
  { to: "/app/drivers", label: "Drivers", icon: Car, roles: ["super_admin","branch_manager"] },
  { to: "/app/branches", label: "Branches", icon: Building2, roles: ["super_admin"] },
  { to: "/app/users", label: "Users & Roles", icon: Users, roles: ["super_admin"] },
  { to: "/app/audit", label: "Audit Log", icon: ScrollText, roles: ["super_admin","branch_manager","accountant"] },
  { to: "/portal/agent", label: "My Earnings", icon: Wallet, roles: ["travel_agent"] },
  { to: "/portal/driver", label: "My Earnings", icon: Wallet, roles: ["driver"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, roles, signOut, hasAnyRole } = useAuth();
  const { location } = useRouterState();

  const visible = NAV.filter(n => hasAnyRole(n.roles));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border">
        <div className="px-6 py-5 border-b border-sidebar-border">
          <div className="font-display text-xl font-bold tracking-tight">TourismOS</div>
          <div className="text-xs text-sidebar-foreground/60 mt-0.5">Commission Platform</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {visible.length === 0 ? (
            <div className="p-4 text-xs text-sidebar-foreground/60 border border-sidebar-border/40 rounded-lg bg-sidebar-accent/20">
              <p className="font-semibold text-sidebar-foreground/80 mb-1">No Roles Assigned</p>
              <p className="leading-relaxed">This account has no access permissions. Ask your administrator to assign a role in the Users panel.</p>
            </div>
          ) : (
            visible.map(item => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })
          )}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-sm font-medium">{profile?.full_name ?? "—"}</div>
          <div className="text-xs text-sidebar-foreground/60 truncate">{profile?.email}</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 mt-1">
            {roles.join(" · ") || "no role"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="w-full justify-start mt-3 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          >
            <LogOut className="size-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
