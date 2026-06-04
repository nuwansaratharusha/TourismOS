import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/domain/commission";
import { Search, Filter, Eye, Trash2, Calendar, FileDown, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/sales")({
  component: SalesLedger,
});

function SalesLedger() {
  const { roles } = useAuth();
  const isCashierOnly = useMemo(() => {
    return roles.includes("cashier") && !roles.some(r => ["super_admin", "branch_manager", "accountant"].includes(r));
  }, [roles]);

  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all"); // all, today, month

  // 1. Fetch sales
  const { data: sales, refetch, isLoading } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, branches(name), agents(company_name), drivers(full_name)")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch dependencies for filters
  const { data: branches } = useQuery({
    queryKey: ["filter-branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name");
      return data ?? [];
    },
  });

  const { data: agents } = useQuery({
    queryKey: ["filter-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("agents").select("id, company_name");
      return data ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["filter-drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id, full_name");
      return data ?? [];
    },
  });

  // Void/Cancel sale mutation
  const voidMutation = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase
        .from("sales")
        .update({ status: "voided" })
        .eq("id", saleId);
      if (error) throw error;

      // Update commission status to cancelled
      await supabase
        .from("commissions")
        .update({ status: "cancelled" })
        .eq("sale_id", saleId);
    },
    onSuccess: () => {
      toast.success("Invoice voided and commission entries cancelled.");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to void invoice");
    }
  });

  // Apply filters in memory
  const filteredSales = useMemo(() => {
    if (!sales) return [];

    return sales.filter(s => {
      // 1. Search text
      const matchesSearch =
        s.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(search.toLowerCase()));

      // 2. Branch Filter
      const matchesBranch = branchFilter === "all" || s.branch_id === branchFilter;

      // 3. Agent Filter
      const matchesAgent = agentFilter === "all" || s.agent_id === agentFilter;

      // 4. Driver Filter
      const matchesDriver = driverFilter === "all" || s.driver_id === driverFilter;

      // 5. Date Filter
      let matchesDate = true;
      if (dateFilter === "today") {
        const todayStr = new Date().toDateString();
        matchesDate = new Date(s.sale_date).toDateString() === todayStr;
      } else if (dateFilter === "month") {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0,0,0,0);
        matchesDate = new Date(s.sale_date) >= monthStart;
      }

      return matchesSearch && matchesBranch && matchesAgent && matchesDriver && matchesDate;
    });
  }, [sales, search, branchFilter, agentFilter, driverFilter, dateFilter]);

  const handleExportCSV = () => {
    if (filteredSales.length === 0) {
      toast.warning("No data to export");
      return;
    }
    const headers = isCashierOnly
      ? ["Invoice Number", "Date", "Customer", "Branch", "Subtotal", "Discount", "VAT Amount", "Gross Amount", "Status"]
      : ["Invoice Number", "Date", "Customer", "Branch", "Subtotal", "Discount", "VAT Amount", "Gross Amount", "Agent Commission", "Driver Commission", "Company Revenue", "Status"];

    const rows = filteredSales.map(s => {
      const baseRow = [
        s.invoice_number,
        new Date(s.sale_date).toLocaleString(),
        s.customer_name || "Walk-in",
        s.branches?.name || "Main",
        s.subtotal,
        s.discount,
        s.vat_amount,
        s.gross_amount,
      ];
      if (isCashierOnly) {
        return [...baseRow, s.status];
      }
      return [
        ...baseRow,
        s.agent_commission_amount,
        s.driver_commission_amount,
        s.company_revenue,
        s.status
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export triggered!");
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Sales &amp; Invoices"
          description="View complete financial transaction histories, audit details, and download print formats."
        />
        <div className="flex gap-2 shrink-0">
          <Button onClick={handleExportCSV} variant="outline" className="gap-2">
            <FileDown className="size-4" /> Export CSV
          </Button>
          <Button asChild className="gap-2">
            <Link to="/app/pos">
              <Plus className="size-4" /> New Checkout
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <Card className={`p-4 grid sm:grid-cols-2 ${isCashierOnly ? "md:grid-cols-3" : "md:grid-cols-5"} gap-3 items-center`}>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches?.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isCashierOnly && (
          <div>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents?.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isCashierOnly && (
          <div>
            <Select value={driverFilter} onValueChange={setDriverFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers?.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Date" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Sales Table */}
      <Card className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading sales ledger...</div>
        ) : filteredSales.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No invoices matching the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Branch</TableHead>
                  {!isCashierOnly && <TableHead>Agent</TableHead>}
                  {!isCashierOnly && <TableHead>Driver</TableHead>}
                  <TableHead className="text-right">Gross Total</TableHead>
                  {!isCashierOnly && <TableHead className="text-right">Revenue</TableHead>}
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map(s => (
                  <TableRow key={s.id} className={s.status === "voided" ? "opacity-60 bg-muted/20" : ""}>
                    <TableCell className="font-mono font-medium">{s.invoice_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{new Date(s.sale_date).toLocaleString()}</TableCell>
                    <TableCell className="truncate max-w-[150px]">{s.customer_name || "Walk-in"}</TableCell>
                    <TableCell>{s.branches?.name || "Main"}</TableCell>
                    {!isCashierOnly && <TableCell className="truncate max-w-[120px]">{s.agents?.company_name || "—"}</TableCell>}
                    {!isCashierOnly && <TableCell className="truncate max-w-[120px]">{s.drivers?.full_name || "—"}</TableCell>}
                    <TableCell className="text-right font-medium">{formatMoney(Number(s.gross_amount))}</TableCell>
                    {!isCashierOnly && (
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(Number(s.company_revenue))}
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      <Badge variant={s.status === "completed" ? "default" : "destructive"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className="size-8 p-0" asChild>
                          <Link to="/app/sales/$id" params={{ id: s.id }}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        {s.status === "completed" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (confirm("Are you sure you want to void this invoice? All linked commissions will be cancelled.")) {
                                voidMutation.mutate(s.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
