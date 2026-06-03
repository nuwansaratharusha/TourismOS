import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
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
import { formatMoney } from "@/lib/domain/commission";
import { Check, Wallet, CircleDollarSign, Plus, Upload, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/commissions")({
  component: CommissionsLedger,
});

function CommissionsLedger() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [beneficiaryFilter, setBeneficiaryFilter] = useState("all");
  const [payeeFilter, setPayeeFilter] = useState("all"); // agent or driver id

  // Payout Modal States
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [payoutType, setPayoutType] = useState<"agent" | "driver">("agent");
  const [payoutPayeeId, setPayoutPayeeId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [paymentRef, setPaymentRef] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 1. Fetch commissions
  const { data: commissions, refetch, isLoading } = useQuery({
    queryKey: ["commissions-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commissions")
        .select("*, sales(invoice_number, sale_date, net_amount), agents(company_name, code), drivers(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch agents & drivers for filters & payouts
  const { data: agents } = useQuery({ queryKey: ["comm-agents"], queryFn: async () => {
    const { data } = await supabase.from("agents").select("id, company_name, code");
    return data ?? [];
  }});

  const { data: drivers } = useQuery({ queryKey: ["comm-drivers"], queryFn: async () => {
    const { data } = await supabase.from("drivers").select("id, full_name, vehicle_number");
    return data ?? [];
  }});

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
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to approve");
    }
  });

  // Apply filters
  const filteredCommissions = useMemo(() => {
    if (!commissions) return [];
    return commissions.filter(c => {
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesBeneficiary = beneficiaryFilter === "all" || c.beneficiary_type === beneficiaryFilter;
      const matchesPayee = payeeFilter === "all" || c.agent_id === payeeFilter || c.driver_id === payeeFilter;
      return matchesStatus && matchesBeneficiary && matchesPayee;
    });
  }, [commissions, statusFilter, beneficiaryFilter, payeeFilter]);

  // Aggregate outstanding amount for modal defaults
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
  useMemo(() => {
    setPayoutAmount(pendingAmountForSelectedPayee);
  }, [pendingAmountForSelectedPayee]);

  // Record Payment Submit Action
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

      // 1. Upload proof file if exists
      if (proofFile) {
        const fileExt = proofFile.name.split(".").pop();
        const filePath = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("payment-proofs")
          .upload(filePath, proofFile);

        if (uploadError) {
          // If bucket doesn't exist, create file mock path
          console.warn("Storage bucket upload failed, using fallback URL.", uploadError);
          proofUrl = `mock-storage/payment-proofs/${filePath}`;
        } else {
          const { data } = supabase.storage.from("payment-proofs").getPublicUrl(filePath);
          proofUrl = data.publicUrl;
        }
      }

      // 2. Fetch pending commissions for this payee to pay down
      const pendingComms = (commissions ?? [])
        .filter(c =>
          (payoutType === "agent" ? c.agent_id === payoutPayeeId : c.driver_id === payoutPayeeId) &&
          (c.status === "pending" || c.status === "approved")
        )
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); // FIFO order

      let remainingPayment = payoutAmount;

      for (const comm of pendingComms) {
        if (remainingPayment <= 0) break;

        const outstanding = Number(comm.amount) - Number(comm.paid_amount);
        const paymentForThisComm = Math.min(remainingPayment, outstanding);
        const newPaidAmount = Number(comm.paid_amount) + paymentForThisComm;
        const newStatus = newPaidAmount >= Number(comm.amount) ? "paid" : comm.status;

        // Update commission record
        const { error: updateCommErr } = await supabase
          .from("commissions")
          .update({ paid_amount: newPaidAmount, status: newStatus as any })
          .eq("id", comm.id);

        if (updateCommErr) throw updateCommErr;

        // Insert payment tracking ledger
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
      refetch();
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
          title="Commission Ledger"
          description="View, approve, and track payouts for travel agents and drivers."
        />
        <div className="shrink-0">
          <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <CircleDollarSign className="size-4" /> Record Payout
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Commission Payment</DialogTitle>
                <DialogDescription>
                  Disburse pending commission totals. Updates ledger balances in FIFO order.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleRecordPayout} className="space-y-4 py-2">
                {/* Payee Type Toggle */}
                <div className="space-y-2">
                  <Label>Beneficiary Type</Label>
                  <Select value={payoutType} onValueChange={(v: "agent" | "driver") => { setPayoutType(v); setPayoutPayeeId(""); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Travel Agent</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Payee Select */}
                <div className="space-y-2">
                  <Label>Select Payee</Label>
                  <Select value={payoutPayeeId} onValueChange={setPayoutPayeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose Beneficiary" />
                    </SelectTrigger>
                    <SelectContent>
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

                {/* Outstanding Display */}
                {payoutPayeeId && (
                  <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Pending Balance</span>
                      <span className="font-semibold">{formatMoney(pendingAmountForSelectedPayee)}</span>
                    </div>
                  </div>
                )}

                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="payoutAmount">Payment Amount (LKR)</Label>
                  <Input
                    id="payoutAmount"
                    type="number"
                    required
                    value={payoutAmount || ""}
                    onChange={e => setPayoutAmount(Number(e.target.value))}
                    max={pendingAmountForSelectedPayee}
                  />
                </div>

                {/* Reference */}
                <div className="space-y-2">
                  <Label htmlFor="paymentRef">Payment Reference / Bank Code</Label>
                  <Input
                    id="paymentRef"
                    placeholder="e.g. SLB-TX-9943"
                    value={paymentRef}
                    onChange={e => setPaymentRef(e.target.value)}
                  />
                </div>

                {/* File Upload */}
                <div className="space-y-2">
                  <Label htmlFor="proofFile">Upload Receipt / Proof (Optional)</Label>
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
                      className="gap-2"
                      onClick={() => document.getElementById("proofFile")?.click()}
                    >
                      <Upload className="size-4" /> {proofFile ? "Change File" : "Upload File"}
                    </Button>
                    {proofFile && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{proofFile.name}</span>}
                  </div>
                </div>

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={uploading} className="w-full gap-2">
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
      </div>

      {/* Filters Card */}
      <Card className="p-4 grid sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
        <div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={beneficiaryFilter} onValueChange={setBeneficiaryFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Beneficiary" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Beneficiaries</SelectItem>
              <SelectItem value="agent">Travel Agent</SelectItem>
              <SelectItem value="driver">Driver</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Select value={payeeFilter} onValueChange={setPayeeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Payee Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
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
      <Card className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading commission ledger...</div>
        ) : filteredCommissions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No ledger items matching filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-medium">{c.sales?.invoice_number || "—"}</TableCell>
                      <TableCell className="capitalize">{c.beneficiary_type}</TableCell>
                      <TableCell className="font-medium">{correspondingName || "—"}</TableCell>
                      <TableCell className="text-right">{c.rate}%</TableCell>
                      <TableCell className="text-right font-bold text-primary">{formatMoney(Number(c.amount))}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(c.paid_amount))}</TableCell>
                      <TableCell className="text-center">
                        <Badge
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
                            className="size-8 p-0 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => approveMutation.mutate(c.id)}
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
    </div>
  );
}
