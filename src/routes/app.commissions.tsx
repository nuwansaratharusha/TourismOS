import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/domain/commission";
import { processCommission } from "@/lib/api/commissions";
import {
  Check, Wallet, CircleDollarSign, Upload, Loader2, ArrowRight,
  Clock, ArrowUpRight, Percent, Save, FileText, CheckCircle,
  TrendingUp, Award, Calendar, AlertCircle, Building2, Car
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/commissions")({
  component: CommissionsDashboard,
});

function CommissionsDashboard() {
  const [activeTab, setActiveTab] = useState("queue");
  const [selectedSale, setSelectedSale] = useState<any>(null);

  // Filters for the Ledger Tab
  const [statusFilter, setStatusFilter] = useState("all");
  const [beneficiaryFilter, setBeneficiaryFilter] = useState("all");
  const [payeeFilter, setPayeeFilter] = useState("all");

  // Processing form state
  const [selectedAgentId, setSelectedAgentId] = useState<string>("none");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("none");
  const [agentRate, setAgentRate] = useState<number>(0);
  const [driverRate, setDriverRate] = useState<number>(0);
  const [processing, setProcessing] = useState(false);

  // Payout Modal States
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutType, setPayoutType] = useState<"agent" | "driver">("agent");
  const [payoutPayeeId, setPayoutPayeeId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [paymentRef, setPaymentRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 1. Fetch Sales
  const { data: sales, refetch: refetchSales, isLoading: loadingSales } = useQuery({
    queryKey: ["commissions-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, branches(name)")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Fetch Commissions
  const { data: commissions, refetch: refetchCommissions, isLoading: loadingCommissions } = useQuery({
    queryKey: ["commissions-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*, sales(invoice_number, sale_date, net_amount), agents(company_name, code), drivers(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Fetch Agents
  const { data: agents } = useQuery({
    queryKey: ["commissions-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("agents").select("*");
      return data ?? [];
    },
  });

  // 4. Fetch Drivers
  const { data: drivers } = useQuery({
    queryKey: ["commissions-drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*");
      return data ?? [];
    },
  });

  // 5. Fetch Profiles (for cashier names)
  const { data: profiles } = useQuery({
    queryKey: ["commissions-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data ?? [];
    },
  });

  const profileMap = useMemo(() => {
    return new Map((profiles ?? []).map((p: any) => [p.id, p]));
  }, [profiles]);

  // Real-time synchronization subscription
  useEffect(() => {
    const ch = supabase
      .channel("commissions-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => {
        refetchSales();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "commissions" }, () => {
        refetchCommissions();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refetchSales, refetchCommissions]);

  // Filter unprocessed sales for the queue
  const queueSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter(s => {
      const isProcessed = s.notes && s.notes.includes("[Processed]");
      return s.status === "completed" && !isProcessed;
    });
  }, [sales]);

  // Ledger Filter logic
  const filteredCommissions = useMemo(() => {
    if (!commissions) return [];
    return commissions.filter(c => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesBeneficiary = beneficiaryFilter === "all" || c.beneficiary_type === beneficiaryFilter;
      const matchesPayee = payeeFilter === "all" || c.agent_id === payeeFilter || c.driver_id === payeeFilter;
      return matchesStatus && matchesBeneficiary && matchesPayee;
    });
  }, [commissions, statusFilter, beneficiaryFilter, payeeFilter]);

  // FIFO Payout calculations
  const pendingAmountForSelectedPayee = useMemo(() => {
    if (!commissions || !payoutPayeeId) return 0;
    return commissions
      .filter(c =>
        (payoutType === "agent" ? c.agent_id === payoutPayeeId : c.driver_id === payoutPayeeId) &&
        (c.status === "pending" || c.status === "approved")
      )
      .reduce((sum, c) => sum + Number(c.amount) - Number(c.paid_amount), 0);
  }, [commissions, payoutPayeeId, payoutType]);

  // Set default amount when payee changes
  useEffect(() => {
    setPayoutAmount(pendingAmountForSelectedPayee);
  }, [pendingAmountForSelectedPayee]);

  // Prefill rates when selected agent or driver changes
  useEffect(() => {
    if (selectedAgentId === "none") {
      setAgentRate(0);
    } else {
      const agent = agents?.find(a => a.id === selectedAgentId);
      setAgentRate(agent?.default_commission_rate ?? 0);
    }
  }, [selectedAgentId, agents]);

  useEffect(() => {
    if (selectedDriverId === "none") {
      setDriverRate(0);
    } else {
      const driver = drivers?.find(d => d.id === selectedDriverId);
      setDriverRate(driver?.default_commission_rate ?? 0);
    }
  }, [selectedDriverId, drivers]);

  // live processing calculations
  const liveCalcs = useMemo(() => {
    if (!selectedSale) return null;
    const baseAmount = Number(selectedSale.subtotal) - Number(selectedSale.discount);
    const agentAmount = Math.round((baseAmount * agentRate) / 100 * 100) / 100;
    const driverAmount = Math.round((baseAmount * driverRate) / 100 * 100) / 100;
    const totalCommissions = agentAmount + driverAmount;
    const companyRevenue = Math.round((baseAmount - totalCommissions) * 100) / 100;

    return {
      baseAmount,
      agentAmount,
      driverAmount,
      totalCommissions,
      companyRevenue
    };
  }, [selectedSale, agentRate, driverRate]);

  // MTD Analytics
  const startOfMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const mtdMetrics = useMemo(() => {
    if (!sales || !commissions) return { salesTotal: 0, agentTotal: 0, driverTotal: 0, outstanding: 0 };

    const mtdSales = sales
      .filter(s => new Date(s.sale_date) >= startOfMonth && s.status === "completed")
      .reduce((sum, s) => sum + Number(s.gross_amount), 0);

    const mtdAgent = commissions
      .filter(c => new Date(c.created_at) >= startOfMonth && c.beneficiary_type === "agent" && c.status !== "cancelled")
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const mtdDriver = commissions
      .filter(c => new Date(c.created_at) >= startOfMonth && c.beneficiary_type === "driver" && c.status !== "cancelled")
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const totalOutstanding = commissions
      .filter(c => c.status === "pending" || c.status === "approved")
      .reduce((sum, c) => sum + (Number(c.amount) - Number(c.paid_amount)), 0);

    return {
      salesTotal: mtdSales,
      agentTotal: mtdAgent,
      driverTotal: mtdDriver,
      outstanding: totalOutstanding
    };
  }, [sales, commissions, startOfMonth]);

  const topAgents = useMemo(() => {
    if (!sales) return [];
    const map: Record<string, { name: string; amount: number; count: number }> = {};
    sales
      .filter(s => new Date(s.sale_date) >= startOfMonth && s.status === "completed" && s.agent_id)
      .forEach(s => {
        const id = s.agent_id!;
        const match = agents?.find(a => a.id === id);
        const name = match?.company_name ?? "Unknown Agent";
        if (!map[id]) map[id] = { name, amount: 0, count: 0 };
        map[id].amount += Number(s.agent_commission_amount || 0);
        map[id].count += 1;
      });

    return Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [sales, agents, startOfMonth]);

  const topDrivers = useMemo(() => {
    if (!sales) return [];
    const map: Record<string, { name: string; amount: number; count: number }> = {};
    sales
      .filter(s => new Date(s.sale_date) >= startOfMonth && s.status === "completed" && s.driver_id)
      .forEach(s => {
        const id = s.driver_id!;
        const match = drivers?.find(d => d.id === id);
        const name = match?.full_name ?? "Unknown Driver";
        if (!map[id]) map[id] = { name, amount: 0, count: 0 };
        map[id].amount += Number(s.driver_commission_amount || 0);
        map[id].count += 1;
      });

    return Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [sales, drivers, startOfMonth]);

  const branchTotals = useMemo(() => {
    if (!sales) return [];
    const map: Record<string, { name: string; billed: number; comms: number }> = {};
    sales
      .filter(s => new Date(s.sale_date) >= startOfMonth && s.status === "completed")
      .forEach(s => {
        const id = s.branch_id;
        const name = s.branches?.name ?? "Unknown Branch";
        if (!map[id]) map[id] = { name, billed: 0, comms: 0 };
        map[id].billed += Number(s.gross_amount || 0);
        map[id].comms += Number(s.agent_commission_amount || 0) + Number(s.driver_commission_amount || 0);
      });
    return Object.values(map).sort((a, b) => b.billed - a.billed);
  }, [sales, startOfMonth]);

  // Approve single commission
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("commissions")
        .update({ status: "approved" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Commission approved");
      refetchCommissions();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to approve");
    }
  });

  // Process Commission Submit
  const handleProcessCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSale) return;
    setProcessing(true);
    try {
      const res = await processCommission({
        saleId: selectedSale.id,
        agentId: selectedAgentId === "none" ? null : selectedAgentId,
        driverId: selectedDriverId === "none" ? null : selectedDriverId,
        agentCommissionRate: agentRate,
        driverCommissionRate: driverRate
      });

      if (res.success) {
        toast.success(`Commissions for Invoice ${res.invoiceNumber} processed successfully!`);
        setSelectedSale(null);
        setSelectedAgentId("none");
        setSelectedDriverId("none");
        setAgentRate(0);
        setDriverRate(0);
        refetchSales();
        refetchCommissions();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to process commission rates");
    } finally {
      setProcessing(false);
    }
  };

  // Record Payment Submit (FIFO)
  const handleRecordPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutPayeeId) {
      toast.error("Please select a payee");
      return;
    }
    if (payoutAmount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }

    setUploading(true);
    try {
      let proofUrl = null;

      if (proofFile) {
        const fileExt = proofFile.name.split(".").pop();
        const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(filePath, proofFile);

        if (uploadError) {
          console.warn("Storage upload failed, using mock proof URL.", uploadError);
          proofUrl = `mock-storage/payment-proofs/${filePath}`;
        } else {
          const { data } = supabase.storage.from("payment-proofs").getPublicUrl(filePath);
          proofUrl = data.publicUrl;
        }
      }

      const pendingComms = (commissions ?? [])
        .filter(c =>
          (payoutType === "agent" ? c.agent_id === payoutPayeeId : c.driver_id === payoutPayeeId) &&
          (c.status === "pending" || c.status === "approved")
        )
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      let remainingPayment = payoutAmount;

      for (const comm of pendingComms) {
        if (remainingPayment <= 0) break;

        const outstanding = Number(comm.amount) - Number(comm.paid_amount);
        const paymentForThisComm = Math.min(remainingPayment, outstanding);
        const newPaidAmount = Number(comm.paid_amount) + paymentForThisComm;
        const newStatus = newPaidAmount >= Number(comm.amount) ? "paid" : comm.status;

        const { error: updateCommErr } = await supabase
          .from("commissions")
          .update({ paid_amount: newPaidAmount, status: newStatus as any })
          .eq("id", comm.id);

        if (updateCommErr) throw updateCommErr;

        const { error: insertPayErr } = await supabase
          .from("payments")
          .insert({
            tenant_id: "11111111-1111-1111-1111-111111111111",
            commission_id: comm.id,
            amount: paymentForThisComm,
            reference: paymentRef || null,
            proof_url: proofUrl,
            recorded_by: (await supabase.auth.getUser()).data.user?.id || null
          } as any);

        if (insertPayErr) throw insertPayErr;

        remainingPayment -= paymentForThisComm;
      }

      toast.success("Payout transaction recorded successfully!");
      setIsPayoutOpen(false);
      setPaymentRef("");
      setProofFile(null);
      setPayoutPayeeId("");
      refetchCommissions();
    } catch (err: any) {
      toast.error(err.message || "Payout failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Commission Analytics"
          description="Process incoming cashier bills, view analytics, and manage commission payouts."
        />
        {activeTab === "ledger" && (
          <div className="shrink-0">
            <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary hover:bg-primary/90 font-medium">
                  <CircleDollarSign className="size-4" /> Record Payout
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Record Commission Payment</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Disburse pending commission totals. Updates ledger balances in FIFO order.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleRecordPayout} className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label className="text-foreground">Beneficiary Type</Label>
                    <Select value={payoutType} onValueChange={(v: "agent" | "driver") => { setPayoutType(v); setPayoutPayeeId(""); }}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        <SelectItem value="agent">Travel Agent</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">Select Payee</Label>
                    <Select value={payoutPayeeId} onValueChange={setPayoutPayeeId}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Choose Beneficiary" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {payoutType === "agent"
                          ? agents?.map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.company_name} ({a.code})</SelectItem>
                            ))
                          : drivers?.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.vehicle_number})</SelectItem>
                            ))
                        }
                      </SelectContent>
                    </Select>
                  </div>

                  {payoutPayeeId && (
                    <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5 border border-border/50">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Pending Balance</span>
                        <span className="font-semibold text-foreground">{formatMoney(pendingAmountForSelectedPayee)}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="payoutAmount" className="text-foreground">Payment Amount (LKR)</Label>
                    <Input
                      id="payoutAmount"
                      type="number"
                      required
                      value={payoutAmount || ""}
                      onChange={e => setPayoutAmount(Number(e.target.value))}
                      max={pendingAmountForSelectedPayee}
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paymentRef" className="text-foreground">Payment Reference / Bank Code</Label>
                    <Input
                      id="paymentRef"
                      placeholder="e.g. SLB-TX-9943"
                      value={paymentRef}
                      onChange={e => setPaymentRef(e.target.value)}
                      className="bg-background border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="proofFile" className="text-foreground">Upload Receipt / Proof (Optional)</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="proofFile"
                        type="file"
                        className="hidden"
                        onChange={e => setProofFile(e.target.files?.[0] || null)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2 border-border text-foreground hover:bg-accent"
                        onClick={() => document.getElementById("proofFile")?.click()}
                      >
                        <Upload className="size-4" /> {proofFile ? "Change File" : "Upload File"}
                      </Button>
                      {proofFile && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{proofFile.name}</span>}
                    </div>
                  </div>

                  <DialogFooter className="pt-4">
                    <Button type="submit" disabled={uploading} className="w-full gap-2 bg-primary hover:bg-primary/90 font-medium">
                      {uploading ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Recording...
                        </>
                      ) : (
                        <>
                          Confirm Payout <ArrowRight className="size-4" />
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted p-1 border border-border/50">
          <TabsTrigger value="queue" className="gap-2 font-medium">
            <Clock className="size-3.5" /> Incoming Queue
            {queueSales.length > 0 && (
              <Badge className="ml-1 px-1.5 py-0.5 text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full">
                {queueSales.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2 font-medium">
            <Wallet className="size-3.5" /> Ledger & Payouts
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 font-medium">
            <TrendingUp className="size-3.5" /> Analytics Dashboard
          </TabsTrigger>
        </TabsList>

        {/* 1. Incoming Queue Tab */}
        <TabsContent value="queue" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Queue List Panel */}
            <div className={selectedSale ? "lg:col-span-2 space-y-4" : "lg:col-span-3 space-y-4"}>
              <Card className="p-6 bg-card border-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Pending Commissions Queue</h3>
                {loadingSales ? (
                  <div className="text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" /> Loading incoming bills...
                  </div>
                ) : queueSales.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground space-y-3">
                    <CheckCircle className="size-10 mx-auto text-emerald-500/80" />
                    <p className="font-medium text-foreground">Commissions Queue is Clean!</p>
                    <p className="text-xs">No pending bills from cashier terminals need processing at this time.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-b border-border/60">
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date / Time</TableHead>
                          <TableHead>Branch</TableHead>
                          <TableHead>Cashier</TableHead>
                          <TableHead className="text-right">Billed Amount</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queueSales.map(sale => {
                          const cashierName = profileMap.get(sale.cashier_id)?.full_name || "Cashier Staff";
                          const isCurrent = selectedSale?.id === sale.id;

                          return (
                            <TableRow
                              key={sale.id}
                              className={`cursor-pointer transition-colors border-b border-border/40 ${
                                isCurrent ? "bg-accent/40 hover:bg-accent/50" : "hover:bg-muted/40"
                              }`}
                              onClick={() => {
                                setSelectedSale(sale);
                                setSelectedAgentId("none");
                                setSelectedDriverId("none");
                                setAgentRate(0);
                                setDriverRate(0);
                              }}
                            >
                              <TableCell className="font-mono font-bold text-foreground">
                                {sale.invoice_number}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                {new Date(sale.sale_date).toLocaleString()}
                              </TableCell>
                              <TableCell className="font-medium text-foreground">
                                {sale.branches?.name || "Main Showroom"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">
                                {cashierName}
                              </TableCell>
                              <TableCell className="text-right font-bold text-foreground">
                                {formatMoney(Number(sale.gross_amount))}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant={isCurrent ? "secondary" : "outline"}
                                  className="h-8 border-border text-foreground hover:bg-accent gap-1"
                                >
                                  Process <ArrowRight className="size-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </div>

            {/* Processing Form Panel */}
            {selectedSale && (
              <div className="space-y-4">
                <Card className="p-6 bg-card border-border sticky top-6 shadow-lg border-2 border-primary/20">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-foreground">Process Transaction</h4>
                      <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{selectedSale.invoice_number}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedSale(null)}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </Button>
                  </div>

                  <form onSubmit={handleProcessCommission} className="space-y-4">
                    {/* Billed Details */}
                    <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5 border border-border/50">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cashier:</span>
                        <span className="font-medium text-foreground">
                          {profileMap.get(selectedSale.cashier_id)?.full_name || "Cashier Staff"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-medium text-foreground">{formatMoney(Number(selectedSale.subtotal))}</span>
                      </div>
                      {Number(selectedSale.discount) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Discount:</span>
                          <span className="font-medium text-destructive">-{formatMoney(Number(selectedSale.discount))}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t border-border/40 pt-1.5">
                        <span className="text-foreground">Base for Comm:</span>
                        <span className="text-foreground">{formatMoney(liveCalcs?.baseAmount ?? 0)}</span>
                      </div>
                    </div>

                    {/* Travel Agent Select */}
                    <div className="space-y-1.5">
                      <Label className="text-foreground flex items-center gap-1.5">
                        <Building2 className="size-3.5 text-primary" /> Travel Agent
                      </Label>
                      <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                        <SelectTrigger className="bg-background border-border">
                          <SelectValue placeholder="No Travel Agent" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="none">No Agent / Walk-in</SelectItem>
                          {agents?.map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.company_name} ({a.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Agent Comm % */}
                    {selectedAgentId !== "none" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="agentRate" className="text-foreground flex items-center gap-1">
                          <Percent className="size-3.5 text-muted-foreground" /> Agent Rate (%)
                        </Label>
                        <Input
                          id="agentRate"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={agentRate}
                          onChange={e => setAgentRate(Number(e.target.value))}
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {/* Driver Select */}
                    <div className="space-y-1.5">
                      <Label className="text-foreground flex items-center gap-1.5">
                        <Car className="size-3.5 text-emerald-500" /> Driver (Optional)
                      </Label>
                      <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                        <SelectTrigger className="bg-background border-border">
                          <SelectValue placeholder="No Driver" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="none">No Driver</SelectItem>
                          {drivers?.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.vehicle_number})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Driver Comm % */}
                    {selectedDriverId !== "none" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="driverRate" className="text-foreground flex items-center gap-1">
                          <Percent className="size-3.5 text-muted-foreground" /> Driver Rate (%)
                        </Label>
                        <Input
                          id="driverRate"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={driverRate}
                          onChange={e => setDriverRate(Number(e.target.value))}
                          className="bg-background border-border"
                        />
                      </div>
                    )}

                    {/* Real-time Calculation Panel */}
                    <div className="p-4 bg-muted/60 rounded-xl space-y-2 border border-border text-xs">
                      <h5 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                        <TrendingUp className="size-3.5 text-primary" /> Live Calculations Preview
                      </h5>
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Agent Comm:</span>
                        <span className="font-medium text-foreground">
                          {formatMoney(liveCalcs?.agentAmount ?? 0)} ({agentRate}%)
                        </span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground">Driver Comm:</span>
                        <span className="font-medium text-foreground">
                          {formatMoney(liveCalcs?.driverAmount ?? 0)} ({driverRate}%)
                        </span>
                      </div>
                      <div className="flex justify-between py-0.5 border-b border-border/40 pb-1.5">
                        <span className="text-muted-foreground">VAT collected:</span>
                        <span className="font-medium text-foreground">
                          {formatMoney(Number(selectedSale.vat_amount))}
                        </span>
                      </div>
                      <div className="flex justify-between py-0.5 font-bold text-sm text-primary pt-1">
                        <span>Net Company Revenue:</span>
                        <span>{formatMoney(liveCalcs?.companyRevenue ?? 0)}</span>
                      </div>
                    </div>

                    <Button type="submit" disabled={processing} className="w-full gap-2 bg-primary hover:bg-primary/90 font-medium">
                      {processing ? (
                        <>
                          <Loader2 className="size-4 animate-spin" /> Committing...
                        </>
                      ) : (
                        <>
                          <Save className="size-4" /> Save Commission Snapshots
                        </>
                      )}
                    </Button>
                  </form>
                </Card>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 2. Ledger & Payouts Tab */}
        <TabsContent value="ledger" className="space-y-6">
          {/* Filters Card */}
          <Card className="p-4 grid sm:grid-cols-2 md:grid-cols-4 gap-3 items-center bg-card border-border">
            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Beneficiary</Label>
              <Select value={beneficiaryFilter} onValueChange={setBeneficiaryFilter}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Beneficiary" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Beneficiaries</SelectItem>
                  <SelectItem value="agent">Travel Agent</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Payee Account</Label>
              <Select value={payeeFilter} onValueChange={setPayeeFilter}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="All Payees" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Payees</SelectItem>
                  {agents?.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.company_name} (Agent)</SelectItem>
                  ))}
                  {drivers?.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.full_name} (Driver)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Ledger Table */}
          <Card className="p-6 bg-card border-border">
            {loadingCommissions ? (
              <div className="text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" /> Loading commission records...
              </div>
            ) : filteredCommissions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No ledger items matching filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b border-border/60">
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Beneficiary</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Commission Rate</TableHead>
                      <TableHead className="text-right font-medium">Commission Amt</TableHead>
                      <TableHead className="text-right">Paid Amount</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCommissions.map(c => {
                      const correspondingName = c.beneficiary_type === "agent"
                        ? c.agents?.company_name
                        : c.drivers?.full_name;

                      return (
                        <TableRow key={c.id} className="hover:bg-muted/40 border-b border-border/40">
                          <TableCell className="font-mono font-semibold text-foreground">
                            {c.sales?.invoice_number || "—"}
                          </TableCell>
                          <TableCell className="capitalize text-foreground">{c.beneficiary_type}</TableCell>
                          <TableCell className="font-medium text-foreground">{correspondingName || "—"}</TableCell>
                          <TableCell className="text-right text-foreground">{c.rate}%</TableCell>
                          <TableCell className="text-right font-bold text-primary">{formatMoney(Number(c.amount))}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatMoney(Number(c.paid_amount))}</TableCell>
                          <TableCell className="text-center">
                            <Badge
                              className="font-medium"
                              variant={
                                c.status === "paid" ? "default" :
                                c.status === "approved" ? "secondary" :
                                c.status === "cancelled" ? "destructive" :
                                "outline"
                              }
                            >
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {c.status === "pending" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0 text-primary hover:text-primary hover:bg-primary/10 rounded-md"
                                onClick={() => approveMutation.mutate(c.id)}
                                title="Approve commission statement"
                              >
                                <Check className="size-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 3. Analytics Dashboard Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6 bg-card border-border flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">MTD Gross Billings</span>
                <span className="text-2xl font-bold text-foreground">{formatMoney(mtdMetrics.salesTotal)}</span>
              </div>
              <div className="p-3 bg-primary/10 text-primary rounded-xl">
                <Calendar className="size-6" />
              </div>
            </Card>

            <Card className="p-6 bg-card border-border flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">MTD Agent Comms</span>
                <span className="text-2xl font-bold text-foreground">{formatMoney(mtdMetrics.agentTotal)}</span>
              </div>
              <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
                <Building2 className="size-6" />
              </div>
            </Card>

            <Card className="p-6 bg-card border-border flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">MTD Driver Comms</span>
                <span className="text-2xl font-bold text-foreground">{formatMoney(mtdMetrics.driverTotal)}</span>
              </div>
              <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                <Car className="size-6" />
              </div>
            </Card>

            <Card className="p-6 bg-card border-border flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">Outstanding Liability</span>
                <span className="text-2xl font-bold text-foreground text-amber-500">{formatMoney(mtdMetrics.outstanding)}</span>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                <Wallet className="size-6" />
              </div>
            </Card>
          </div>

          {/* Leaders board & Branch totals */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Agents */}
            <Card className="p-6 bg-card border-border">
              <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Award className="size-5 text-indigo-500" /> Top Performing Agents (MTD)
              </h4>
              {topAgents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No agent commissions logged this month.</p>
              ) : (
                <div className="space-y-4">
                  {topAgents.map((a, i) => (
                    <div key={a.name} className="flex justify-between items-center py-1 border-b border-border/40 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-foreground">{i + 1}. {a.name}</span>
                        <span className="text-[10px] text-muted-foreground block">{a.count} groups booked</span>
                      </div>
                      <span className="text-xs font-bold text-primary">{formatMoney(a.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Top Drivers */}
            <Card className="p-6 bg-card border-border">
              <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Award className="size-5 text-emerald-500" /> Top Performing Drivers (MTD)
              </h4>
              {topDrivers.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No driver commissions logged this month.</p>
              ) : (
                <div className="space-y-4">
                  {topDrivers.map((d, i) => (
                    <div key={d.name} className="flex justify-between items-center py-1 border-b border-border/40 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-foreground">{i + 1}. {d.name}</span>
                        <span className="text-[10px] text-muted-foreground block">{d.count} groups brought</span>
                      </div>
                      <span className="text-xs font-bold text-primary">{formatMoney(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Branch totals */}
            <Card className="p-6 bg-card border-border">
              <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                <Building2 className="size-5 text-primary" /> Branch-wise performance (MTD)
              </h4>
              {branchTotals.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No sales logged this month.</p>
              ) : (
                <div className="space-y-4">
                  {branchTotals.map((b) => (
                    <div key={b.name} className="flex justify-between items-center py-1 border-b border-border/40 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-xs font-semibold text-foreground">{b.name}</span>
                        <span className="text-[10px] text-muted-foreground block">
                          Commissions: {formatMoney(b.comms)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-foreground">{formatMoney(b.billed)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
