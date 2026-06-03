import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/portal")({
  component: PortalLayout,
});

function PortalLayout() {
  const { user, loading, hasAnyRole } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;

  // Ensure they have agent or driver role to access partner portals
  if (!hasAnyRole(["travel_agent", "driver"])) {
    return <Navigate to="/app" />;
  }

  return <AppShell><Outlet /></AppShell>;
}
