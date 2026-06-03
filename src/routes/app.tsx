import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "TourismOS Dashboard" }] }),
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;
  return <AppShell><Outlet /></AppShell>;
}
