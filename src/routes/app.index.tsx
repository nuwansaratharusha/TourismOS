import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatMoney } from "@/lib/domain/commission";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Wallet, Receipt, Percent, Database, Sparkles, Car, Landmark, Terminal, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/app/")({ component: Dashboard });

interface SalesAgg {
  today_sales: number;
  month_sales: number;
  total_commissions: number;
  pending_commissions: number;
  vat_collected: number;
  company_revenue: number;
  chartData: Array<{ name: string; Sales: number; Revenue: number }>;
  topAgents: Array<{ name: string; amount: number; salesCount: number }>;
  topDrivers: Array<{ name: string; amount: number; tripsCount: number }>;
}

function Dashboard() {
  const { profile, roles } = useAuth();
  const isCashierOnly = useMemo(() => {
    return roles.includes("cashier") && !roles.some(r => ["super_admin", "branch_manager", "accountant"].includes(r));
  }, [roles]);
  const [seeding, setSeeding] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["dashboard-agg"],
    queryFn: async (): Promise<SalesAgg> => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const [
        { data: today },
        { data: month },
        { data: comm },
        { data: agents },
        { data: drivers }
      ] = await Promise.all([
        supabase.from("sales").select("gross_amount").gte("sale_date", todayStart.toISOString()),
        supabase.from("sales").select("gross_amount,vat_amount,company_revenue,sale_date,net_amount,agent_id,driver_id,agent_commission_amount,driver_commission_amount").gte("sale_date", monthStart.toISOString()),
        supabase.from("commissions").select("amount,status,beneficiary_type,agent_id,driver_id"),
        supabase.from("agents").select("id, company_name"),
        supabase.from("drivers").select("id, full_name")
      ]);

      const sum = (rows: Array<Record<string, any>> | null, k: string) =>
        (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0);

      const monthSales = sum(month, "gross_amount");
      const totalCommissions = sum(comm, "amount");
      const pendingCommissions = (comm ?? [])
        .filter(c => c.status === "pending" || c.status === "approved")
        .reduce((a, c) => a + Number(c.amount), 0);

      // Group month sales by date for the area chart
      const salesByDay: Record<string, { Sales: number; Revenue: number }> = {};
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toDateString();
      }).reverse();

      last7Days.forEach(day => {
        salesByDay[day] = { Sales: 0, Revenue: 0 };
      });

      (month ?? []).forEach(s => {
        const day = new Date(s.sale_date).toDateString();
        if (day in salesByDay) {
          salesByDay[day].Sales += Number(s.gross_amount);
          salesByDay[day].Revenue += Number(s.company_revenue);
        }
      });

      const chartData = Object.entries(salesByDay).map(([day, val]) => {
        const label = new Date(day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        return { name: label, Sales: val.Sales, Revenue: val.Revenue };
      });

      // Top Agents list
      const agentMap: Record<string, { amount: number; count: number; name: string }> = {};
      (month ?? []).forEach(s => {
        if (s.agent_id) {
          const match = (agents ?? []).find(a => a.id === s.agent_id);
          const name = match?.company_name ?? "Unknown Agent";
          if (!agentMap[s.agent_id]) agentMap[s.agent_id] = { amount: 0, count: 0, name };
          agentMap[s.agent_id].amount += Number(s.agent_commission_amount || 0);
          agentMap[s.agent_id].count += 1;
        }
      });
      const topAgents = Object.values(agentMap)
        .map(v => ({ name: v.name, amount: v.amount, salesCount: v.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      // Top Drivers list
      const driverMap: Record<string, { amount: number; count: number; name: string }> = {};
      (month ?? []).forEach(s => {
        if (s.driver_id) {
          const match = (drivers ?? []).find(d => d.id === s.driver_id);
          const name = match?.full_name ?? "Unknown Driver";
          if (!driverMap[s.driver_id]) driverMap[s.driver_id] = { amount: 0, count: 0, name };
          driverMap[s.driver_id].amount += Number(s.driver_commission_amount || 0);
          driverMap[s.driver_id].count += 1;
        }
      });
      const topDrivers = Object.values(driverMap)
        .map(v => ({ name: v.name, amount: v.amount, tripsCount: v.count }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return {
        today_sales: sum(today, "gross_amount"),
        month_sales: monthSales,
        vat_collected: sum(month, "vat_amount"),
        company_revenue: sum(month, "company_revenue"),
        total_commissions: totalCommissions,
        pending_commissions: pendingCommissions,
        chartData,
        topAgents,
        topDrivers
      };
    },
  });

  // Realtime subscription: update totals when sales/commissions table changes
  useEffect(() => {
    const ch = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  // Seed Mock Data Function
  const handleSeedMockData = async () => {
    setSeeding(true);
    try {
      const tenantId = "11111111-1111-1111-1111-111111111111";

      // 1. Fetch branch ID
      const { data: branch } = await supabase.from("branches").select("id").eq("tenant_id", tenantId).limit(1).single();
      if (!branch) throw new Error("No branch seeded. Please make sure database is initialized.");

      // 2. Fetch products to sell
      const { data: products } = await supabase.from("products").select("*").eq("tenant_id", tenantId);
      if (!products || products.length === 0) throw new Error("No products loaded.");

      // 3. Create mock agents if not exist
      const { data: existAgents } = await supabase.from("agents").select("id").eq("tenant_id", tenantId);
      let agentIds = existAgents?.map(a => a.id) || [];
      if (agentIds.length === 0) {
        const mockAgents = [
          { tenant_id: tenantId, code: "AGT-LANKA", company_name: "Lanka Journeys", contact_person: "Dinesh Perera", default_commission_rate: 15.00, status: "active" },
          { tenant_id: tenantId, code: "AGT-CEY", company_name: "Ceylon Travels & Tours", contact_person: "Anura Silva", default_commission_rate: 12.00, status: "active" },
          { tenant_id: tenantId, code: "AGT-VIP", company_name: "VIP Lanka Holidays", contact_person: "Roshan Gunawardena", default_commission_rate: 18.00, status: "active" }
        ] as any;
        const { data: newAgents, error: errAg } = await supabase.from("agents").insert(mockAgents).select();
        if (errAg) throw errAg;
        agentIds = newAgents.map(a => a.id);
      }

      // 4. Create mock drivers if not exist
      const { data: existDrivers } = await supabase.from("drivers").select("id").eq("tenant_id", tenantId);
      let driverIds = existDrivers?.map(d => d.id) || [];
      if (driverIds.length === 0) {
        const mockDrivers = [
          { tenant_id: tenantId, code: "DRV-001", full_name: "Wasantha Fernando", vehicle_number: "WP-CAB-1294", mobile: "0771234567", default_commission_rate: 5.00, status: "active" },
          { tenant_id: tenantId, code: "DRV-002", full_name: "Nimal Siriwardene", vehicle_number: "WP-NB-8843", mobile: "0719876543", default_commission_rate: 5.00, status: "active" },
          { tenant_id: tenantId, code: "DRV-003", full_name: "Rohan Jayasinghe", vehicle_number: "WP-PA-4451", mobile: "0763322114", default_commission_rate: 6.00, status: "active" }
        ] as any;
        const { data: newDrivers, error: errDr } = await supabase.from("drivers").insert(mockDrivers).select();
        if (errDr) throw errDr;
        driverIds = newDrivers.map(d => d.id);
      }

      // 5. Generate mock invoices using create_sale database transaction RPC
      const recordsToCreate = [
        {
          branch_id: branch.id,
          agent_id: agentIds[0],
          driver_id: driverIds[0],
          customer_name: "Mr. Arthur Pendelton (UK Tour)",
          discount: 1000,
          items: [
            { product_id: products[0].id, description: products[0].name, quantity: 1, unit_price: products[0].unit_price },
            { product_id: products[1].id, description: products[1].name, quantity: 2, unit_price: products[1].unit_price }
          ]
        },
        {
          branch_id: branch.id,
          agent_id: agentIds[1],
          driver_id: driverIds[1],
          customer_name: "Madame Gauthier (France Group)",
          discount: 0,
          items: [
            { product_id: products[2].id, description: products[2].name, quantity: 1, unit_price: products[2].unit_price },
            { product_id: products[3].id, description: products[3].name, quantity: 3, unit_price: products[3].unit_price }
          ]
        },
        {
          branch_id: branch.id,
          agent_id: agentIds[2],
          driver_id: driverIds[2],
          customer_name: "VIP Family (German Cruise)",
          discount: 3000,
          items: [
            { product_id: products[0].id, description: products[0].name, quantity: 2, unit_price: products[0].unit_price },
            { product_id: products[2].id, description: products[2].name, quantity: 1, unit_price: products[2].unit_price }
          ]
        },
        {
          branch_id: branch.id,
          agent_id: null,
          driver_id: null,
          customer_name: "Walk-in Retail Customer",
          discount: 500,
          items: [
            { product_id: products[1].id, description: products[1].name, quantity: 1, unit_price: products[1].unit_price }
          ]
        }
      ];

      for (const record of recordsToCreate) {
        const { error: rpcErr } = await supabase.rpc("create_sale", { payload: record as any });
        if (rpcErr) throw rpcErr;
      }

      toast.success("Successfully seeded mock sales and commissions!");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to seed demo data");
    } finally {
      setSeeding(false);
    }
  };

  const cards = isCashierOnly
    ? [
        { label: "Today's gross sales", value: formatMoney(data?.today_sales ?? 0), icon: Receipt, desc: "Total transactions checked out today" },
        { label: "This month sales (MTD)", value: formatMoney(data?.month_sales ?? 0), icon: TrendingUp, desc: "Accumulated gross sales" },
        { label: "VAT collected (MTD)", value: formatMoney(data?.vat_collected ?? 0), icon: Percent, desc: "18% flat state rate" },
      ]
    : [
        { label: "Today's gross sales", value: formatMoney(data?.today_sales ?? 0), icon: Receipt, desc: "Total transactions checked out today" },
        { label: "This month sales (MTD)", value: formatMoney(data?.month_sales ?? 0), icon: TrendingUp, desc: "Accumulated gross sales" },
        { label: "Company net revenue (MTD)", value: formatMoney(data?.company_revenue ?? 0), icon: Landmark, desc: "Revenue after VAT and commissions" },
        { label: "VAT collected (MTD)", value: formatMoney(data?.vat_collected ?? 0), icon: Percent, desc: "18% flat state rate" },
        { label: "Total commissions ledger", value: formatMoney(data?.total_commissions ?? 0), icon: Wallet, desc: "Accumulated commission obligations" },
        { label: "Pending payout", value: formatMoney(data?.pending_commissions ?? 0), icon: Wallet, desc: "Outstanding payments due" },
      ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title={`Welcome, ${profile?.full_name?.split(" ")[0] ?? "Partner"}`}
          description="Real-time transparency portal for sales, driver payouts, agent commissions, and VAT."
        />
        {roles.includes("super_admin") && (
          <Button onClick={handleSeedMockData} disabled={seeding} variant="outline" className="shrink-0 gap-2 border-primary/30 text-primary hover:bg-primary/5">
            <Sparkles className="size-4" />
            {seeding ? "Seeding..." : "Seed Demo Transactions"}
          </Button>
        )}
      </div>

      {roles.length === 0 && (
        <Card className="p-6 border-warning/40 bg-warning/5 text-amber-900 dark:text-amber-100 flex items-center gap-4">
          <Database className="size-8 text-warning shrink-0" />
          <div>
            <div className="font-semibold">User Role Verification Needed</div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your profile is registered under the <strong>Gunatilake Batiks</strong> tenant, but you do not have permission to access operational modules. Contact your administrator to request cashier, manager, accountant, travel_agent, or driver roles.
            </p>
          </div>
        </Card>
      )}

      {/* Analytics Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
                <c.icon className="size-4 text-muted-foreground/60" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight">{c.value}</div>
            </div>
            <div className="text-[10px] text-muted-foreground/80 mt-3 pt-2 border-t border-border/50">
              {c.desc}
            </div>
          </Card>
        ))}
      </div>

      {isCashierOnly ? (
        <div className="space-y-6">
          <div className="font-semibold text-sm text-muted-foreground uppercase tracking-widest border-b pb-2">
            Operational Quick Actions
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 flex flex-col justify-between h-48 border border-indigo-100 dark:border-indigo-500/10 hover:shadow-lg hover:shadow-indigo-500/5 transition-all">
              <div>
                <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-4">
                  <Terminal className="size-5" />
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Touch Terminal</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Open the standalone touchscreen-optimized cashier terminal.
                </p>
              </div>
              <Button asChild className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                <Link to="/app/terminal">Launch Terminal</Link>
              </Button>
            </Card>

            <Card className="p-6 flex flex-col justify-between h-48 border border-sky-100 dark:border-sky-500/10 hover:shadow-lg hover:shadow-sky-500/5 transition-all">
              <div>
                <div className="size-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-4">
                  <ShoppingCart className="size-5" />
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Point of Sale</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Access the standard retail checkout and catalog cart module.
                </p>
              </div>
              <Button asChild className="w-full mt-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl">
                <Link to="/app/pos">Open POS</Link>
              </Button>
            </Card>

            <Card className="p-6 flex flex-col justify-between h-48 border border-emerald-100 dark:border-emerald-500/10 hover:shadow-lg hover:shadow-emerald-500/5 transition-all">
              <div>
                <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4">
                  <Receipt className="size-5" />
                </div>
                <h3 className="font-bold text-base text-foreground mb-1">Sales &amp; Invoices</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Review retail invoice histories and print thermal copies.
                </p>
              </div>
              <Button asChild className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl">
                <Link to="/app/sales">View Sales History</Link>
              </Button>
            </Card>
          </div>
        </div>
      ) : (
        <>
          {/* Chart and Tables Grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Charts */}
            <Card className="p-6 lg:col-span-2">
              <div className="font-semibold text-sm mb-4">Financial Trends (LKR)</div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data?.chartData ?? []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `Rs.${v}`} />
                    <Tooltip formatter={(value) => [`Rs. ${value}`]} contentStyle={{ background: "var(--card)", borderColor: "var(--border)" }} />
                    <Area type="monotone" dataKey="Sales" name="Gross Sales" stroke="var(--color-primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
                    <Area type="monotone" dataKey="Revenue" name="Company Net" stroke="var(--color-accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Info panel */}
            <Card className="p-6">
              <h3 className="font-semibold text-sm mb-4">Top Travel Agents (Month)</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data?.topAgents || data.topAgents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-8">
                          No agent commissions tracked this month.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.topAgents.map(a => (
                        <TableRow key={a.name}>
                          <TableCell className="py-2 text-xs">
                            <div className="font-medium">{a.name}</div>
                            <div className="text-[10px] text-muted-foreground">{a.salesCount} bookings</div>
                          </TableCell>
                          <TableCell className="text-right py-2 text-xs font-semibold text-primary">
                            {formatMoney(a.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Top Drivers */}
            <Card className="p-6">
              <h3 className="font-semibold text-sm mb-4">Top Drivers (Month)</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead className="text-right">Commissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data?.topDrivers || data.topDrivers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-xs text-muted-foreground py-8">
                          No driver commissions tracked this month.
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.topDrivers.map(d => (
                        <TableRow key={d.name}>
                          <TableCell className="py-2 text-xs">
                            <div className="font-medium">{d.name}</div>
                            <div className="text-[10px] text-muted-foreground">{d.tripsCount} trips</div>
                          </TableCell>
                          <TableCell className="text-right py-2 text-xs font-semibold text-accent">
                            {formatMoney(d.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Operating status info */}
            <Card className="p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-sm mb-4">Enterprise Status</h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Default VAT Rate</span>
                    <span className="font-medium">18.00%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Operating Currency</span>
                    <span className="font-medium">Sri Lankan Rupee (LKR)</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Tenant Domain</span>
                    <span className="font-medium">gunatilake-batiks</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Active Roles</span>
                    <span className="font-medium capitalize">{roles.join(" · ") || "None"}</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground/60 border-t border-border/50 pt-4 mt-6">
                All database connections are encrypted, and security boundaries are enforced using Row-Level Security policies.
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
