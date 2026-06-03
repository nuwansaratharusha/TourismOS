import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/domain/commission";
import { Car, Wallet, Receipt, TrendingUp, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/portal/driver")({
  component: DriverPortal,
});

function DriverPortal() {
  const { user } = useAuth();

  // 1. Fetch driver record associated with logged-in user
  const { data: driver, isLoading: loadingDriver } = useQuery({
    queryKey: ["current-driver", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // 2. Fetch driver's commission statistics and trip history
  const { data: stats, isLoading: loadingStats, refetch } = useQuery({
    queryKey: ["driver-stats", driver?.id],
    queryFn: async () => {
      if (!driver) return null;

      const [{ data: sales }, { data: commissions }] = await Promise.all([
        supabase
          .from("sales")
          .select("id, invoice_number, sale_date, gross_amount, net_amount, driver_commission_amount, status")
          .eq("driver_id", driver.id)
          .order("sale_date", { ascending: false }),
        supabase
          .from("commissions")
          .select("id, amount, status, created_at, sale_id")
          .eq("driver_id", driver.id)
          .order("created_at", { ascending: false }),
      ]);

      const salesList = sales ?? [];
      const commList = commissions ?? [];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const todaySales = salesList
        .filter(s => new Date(s.sale_date) >= todayStart)
        .reduce((sum, s) => sum + Number(s.net_amount), 0);

      const monthSales = salesList
        .filter(s => new Date(s.sale_date) >= monthStart)
        .reduce((sum, s) => sum + Number(s.net_amount), 0);

      const totalEarned = commList
        .filter(c => c.status === "paid")
        .reduce((sum, c) => sum + Number(c.amount), 0);

      const pendingPayout = commList
        .filter(c => c.status === "pending" || c.status === "approved")
        .reduce((sum, c) => sum + Number(c.amount), 0);

      // Generate chart data for last 7 days of sales
      const chartData = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" });
        const dateStr = d.toDateString();

        const amount = salesList
          .filter(s => new Date(s.sale_date).toDateString() === dateStr)
          .reduce((sum, s) => sum + Number(s.driver_commission_amount), 0);

        return { name: dayLabel, Commission: amount };
      }).reverse();

      return {
        sales: salesList,
        commissions: commList,
        todaySales,
        monthSales,
        totalEarned,
        pendingPayout,
        chartData,
      };
    },
    enabled: !!driver,
  });

  // Realtime updates subscription
  useEffect(() => {
    if (!driver) return;
    const channel = supabase
      .channel("driver-portal-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales", filter: `driver_id=eq.${driver.id}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions", filter: `driver_id=eq.${driver.id}` }, () => refetch())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driver, refetch]);

  if (loadingDriver || (driver && loadingStats)) {
    return <div className="p-8 text-center text-muted-foreground">Loading driver workspace...</div>;
  }

  if (!driver) {
    return (
      <div className="p-8 max-w-2xl mx-auto mt-12">
        <Card className="p-8 border-destructive/30 bg-destructive/5 text-center">
          <AlertTriangle className="size-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-bold mb-2">Workspace Unlinked</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Your login user account is not linked to any Driver record.
            Please request a Super Admin or Manager to link your user ID in <strong>Users &amp; Roles</strong>.
          </p>
        </Card>
      </div>
    );
  }

  const cards = [
    { label: "Today's Trip Sales", value: formatMoney(stats?.todaySales ?? 0), icon: Car },
    { label: "This Month Trip Sales", value: formatMoney(stats?.monthSales ?? 0), icon: TrendingUp },
    { label: "Pending Payout", value: formatMoney(stats?.pendingPayout ?? 0), icon: Wallet },
    { label: "Total Earned (Paid)", value: formatMoney(stats?.totalEarned ?? 0), icon: Receipt },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title={driver.full_name}
          description={`Driver Portal • Vehicle: ${driver.vehicle_number || "—"} • Commission: ${driver.default_commission_rate}%`}
        />
        <div className="text-xs text-muted-foreground text-right border-l pl-4 border-border hidden md:block">
          <div>NIC: {driver.nic || "—"}</div>
          <div>Mobile: {driver.mobile || "—"}</div>
          <div>Code: {driver.code}</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">{c.label}</span>
              <c.icon className="size-4" />
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight">{c.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card className="p-6 lg:col-span-2">
          <div className="font-semibold text-sm mb-4">Earnings History (Past 7 Days)</div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.chartData ?? []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorComm" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v}`} />
                <Tooltip formatter={(value) => [`Rs. ${value}`, "Commission"]} contentStyle={{ background: "var(--card)", borderColor: "var(--border)" }} />
                <Area type="monotone" dataKey="Commission" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorComm)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-sm mb-4">Driver Profile</h3>
          <div className="space-y-4 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Full Name</span>
              <span className="font-medium">{driver.full_name}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Driver Code</span>
              <span className="font-medium">{driver.code}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">NIC Number</span>
              <span className="font-medium">{driver.nic || "—"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Vehicle Number</span>
              <span className="font-medium">{driver.vehicle_number || "—"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-muted-foreground">Commission Rate</span>
              <span className="font-medium">{driver.default_commission_rate}%</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={driver.status === "active" ? "default" : "destructive"}>
                {driver.status}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="font-semibold text-sm mb-4">Trip Commission Ledger</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Net Sale Amount</TableHead>
                <TableHead className="text-right">Driver Commission</TableHead>
                <TableHead className="text-center">Commission Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats?.sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No trips or sales recorded for your vehicle yet.
                  </TableCell>
                </TableRow>
              ) : (
                stats?.sales.map(s => {
                  const correspondingComm = stats.commissions.find(c => c.sale_id === s.id);
                  const status = correspondingComm?.status ?? "pending";
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono font-medium">{s.invoice_number}</TableCell>
                      <TableCell>{new Date(s.sale_date).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(Number(s.net_amount))}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatMoney(Number(s.driver_commission_amount))}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            status === "paid" ? "default" :
                            status === "approved" ? "secondary" :
                            status === "cancelled" ? "destructive" :
                            "outline"
                          }
                        >
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
