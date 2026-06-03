import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/domain/commission";
import { ChevronLeft, Briefcase, TrendingUp, Wallet, Receipt } from "lucide-react";

export const Route = createFileRoute("/app/agents/$id")({
  component: AgentDetails,
});

function AgentDetails() {
  const { id } = Route.useParams();

  // 1. Fetch agent data
  const { data: agent, isLoading: loadingAgent } = useQuery({
    queryKey: ["agent-details", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch agent sales & commissions histories
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["agent-sales-stats", id],
    queryFn: async () => {
      const [{ data: sales }, { data: commissions }] = await Promise.all([
        supabase
          .from("sales")
          .select("id, invoice_number, sale_date, net_amount, gross_amount, agent_commission_amount, status")
          .eq("agent_id", id)
          .order("sale_date", { ascending: false }),
        supabase
          .from("commissions")
          .select("id, amount, status, sale_id")
          .eq("agent_id", id),
      ]);

      const salesList = sales ?? [];
      const commList = commissions ?? [];

      const totalSalesAmt = salesList.reduce((sum, s) => sum + Number(s.net_amount), 0);
      const totalCommAmt = commList.reduce((sum, c) => sum + Number(c.amount), 0);
      const paidCommAmt = commList
        .filter(c => c.status === "paid")
        .reduce((sum, c) => sum + Number(c.amount), 0);
      const pendingCommAmt = commList
        .filter(c => c.status === "pending" || c.status === "approved")
        .reduce((sum, c) => sum + Number(c.amount), 0);

      return {
        sales: salesList,
        commissions: commList,
        totalSalesAmt,
        totalCommAmt,
        paidCommAmt,
        pendingCommAmt,
      };
    },
  });

  if (loadingAgent || loadingStats) {
    return <div className="p-8 text-center text-muted-foreground">Loading agent profile...</div>;
  }

  if (!agent) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Agent not found. <Link to="/app/agents" className="text-primary hover:underline">Back to list</Link>
      </div>
    );
  }

  const cards = [
    { label: "Aggregate Net Sales", value: formatMoney(stats?.totalSalesAmt ?? 0), icon: TrendingUp },
    { label: "Total Commissions Obligation", value: formatMoney(stats?.totalCommAmt ?? 0), icon: Wallet },
    { label: "Pending Payout", value: formatMoney(stats?.pendingCommAmt ?? 0), icon: Wallet },
    { label: "Commissions Paid", value: formatMoney(stats?.paidCommAmt ?? 0), icon: Receipt },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/agents">
            <ChevronLeft className="size-4 mr-1.5" /> Back to directory
          </Link>
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title={agent.company_name}
          description={`Travel Agent details • Code: ${agent.code}`}
        />
        <Badge variant={agent.status === "active" ? "default" : "destructive"}>
          {agent.status}
        </Badge>
      </div>

      {/* Analytics Summary */}
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
        {/* Sales Table */}
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h3 className="font-semibold text-sm mb-4">Linked Sales &amp; commission entries</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Net Amount</TableHead>
                    <TableHead className="text-right">Commission Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!stats?.sales || stats.sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No sales bookings linked to this agent yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stats.sales.map(s => {
                      const comm = stats.commissions.find(c => c.sale_id === s.id);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono font-medium">
                            <Link to="/app/sales/$id" params={{ id: s.id }} className="text-primary hover:underline">
                              {s.invoice_number}
                            </Link>
                          </TableCell>
                          <TableCell>{new Date(s.sale_date).toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{formatMoney(Number(s.net_amount))}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">{formatMoney(Number(s.agent_commission_amount))}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                comm?.status === "paid" ? "default" :
                                comm?.status === "approved" ? "secondary" :
                                comm?.status === "cancelled" ? "destructive" :
                                "outline"
                              }
                            >
                              {comm?.status ?? "pending"}
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

        {/* Info card */}
        <div>
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4 border-b pb-2">
              <Briefcase className="size-4 text-primary" />
              <h3 className="font-semibold text-sm">Agent Attributes</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <div className="text-muted-foreground mb-1">Company Registered Name</div>
                <div className="font-medium text-sm">{agent.company_name}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Agent Code</div>
                <div className="font-mono font-medium text-sm">{agent.code}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Default Commission Rate</div>
                <div className="font-semibold text-sm text-primary">{agent.default_commission_rate}%</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Contact Person</div>
                <div className="font-medium text-sm">{agent.contact_person || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Mobile Number</div>
                <div className="font-medium text-sm">{agent.mobile || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Email Address</div>
                <div className="font-medium text-sm">{agent.email || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Office Address</div>
                <div className="font-medium text-sm">{agent.address || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">Onboarded Date</div>
                <div className="font-medium text-sm">{new Date(agent.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
