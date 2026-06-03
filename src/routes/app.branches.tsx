import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, Plus, Edit2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/branches")({
  component: BranchesManagement,
});

function BranchesManagement() {
  const { roles } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<any>(null);

  // Form states
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [vatRate, setVatRate] = useState<number | "">("");
  const [currency, setCurrency] = useState("LKR");
  const [busy, setBusy] = useState(false);

  // Enforce role permission
  if (!roles.includes("super_admin")) {
    return <Navigate to="/app" />;
  }

  // 1. Fetch branches
  const { data: branches, refetch, isLoading } = useQuery({
    queryKey: ["branches-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const saveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        tenant_id: "11111111-1111-1111-1111-111111111111",
        name,
        code,
        address: address || null,
        vat_rate: vatRate === "" ? null : Number(vatRate),
        currency: currency || null
      };

      if (editingBranch) {
        const { error } = await supabase
          .from("branches")
          .update(payload as any)
          .eq("id", editingBranch.id);
        if (error) throw error;
        toast.success("Branch updated successfully!");
      } else {
        const { error } = await supabase
          .from("branches")
          .insert(payload as any);
        if (error) throw error;
        toast.success("New branch created successfully!");
      }

      setIsAddOpen(false);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save branch");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (b: any) => {
    setEditingBranch(b);
    setName(b.name);
    setCode(b.code);
    setAddress(b.address || "");
    setVatRate(b.vat_rate ?? "");
    setCurrency(b.currency || "LKR");
    setIsAddOpen(true);
  };

  const resetForm = () => {
    setEditingBranch(null);
    setName("");
    setCode("");
    setAddress("");
    setVatRate("");
    setCurrency("LKR");
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Branch Management"
          description="Define and configure multiple showroom branch locations and individual tax profiles."
        />
        <div className="shrink-0">
          <Dialog open={isAddOpen} onOpenChange={(v) => { setIsAddOpen(v); if(!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Add Branch Node
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingBranch ? "Modify Branch Node" : "Register Branch Node"}</DialogTitle>
                <DialogDescription>
                  Configure active locations. Branch invoice sequences increment atomically.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={saveBranch} className="space-y-4 py-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Branch Code / Tag</Label>
                    <Input
                      id="code"
                      placeholder="e.g. CMB"
                      required
                      maxLength={10}
                      disabled={!!editingBranch}
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vatRate">VAT Override (%)</Label>
                    <Input
                      id="vatRate"
                      type="number"
                      placeholder="Default (18.00)"
                      value={vatRate}
                      onChange={e => setVatRate(e.target.value === "" ? "" : Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name">Branch Display Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Colombo Showroom"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="currency">Local Currency</Label>
                    <Input
                      id="currency"
                      placeholder="LKR"
                      required
                      value={currency}
                      onChange={e => setCurrency(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address">Full Location Address</Label>
                  <Input
                    id="address"
                    placeholder="e.g. 14 Galle Road, Colombo 3"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    {editingBranch ? "Update Node Details" : "Create Node Location"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Directory Table */}
      <Card className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading branch records...</div>
        ) : branches?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No branches created. Create the first one above.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Location Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">VAT Rate</TableHead>
                  <TableHead className="text-right">Currency</TableHead>
                  <TableHead className="text-right">Invoice Counter</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches?.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono font-semibold">{b.code}</TableCell>
                    <TableCell className="font-medium flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground" />
                      {b.name}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{b.address || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{b.vat_rate !== null ? `${b.vat_rate}%` : "Tenant default (18%)"}</TableCell>
                    <TableCell className="text-right font-mono uppercase">{b.currency || "LKR"}</TableCell>
                    <TableCell className="text-right font-mono font-medium">{b.invoice_counter}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => openEdit(b)}>
                        <Edit2 className="size-4" />
                      </Button>
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
