import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, Edit2, Ban, CheckCircle, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/drivers")({
  component: DriversDir,
});

function DriversDir() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);

  // Form states (Add/Edit)
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [nic, setNic] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [commissionRate, setCommissionRate] = useState<number>(5);
  const [busy, setBusy] = useState(false);

  // 1. Fetch drivers
  const { data: drivers, refetch, isLoading } = useQuery({
    queryKey: ["drivers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Filter list
  const filteredDrivers = useMemo(() => {
    if (!drivers) return [];
    return drivers.filter(d =>
      d.full_name.toLowerCase().includes(search.toLowerCase()) ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      (d.vehicle_number && d.vehicle_number.toLowerCase().includes(search.toLowerCase())) ||
      (d.nic && d.nic.toLowerCase().includes(search.toLowerCase()))
    );
  }, [drivers, search]);

  // Insert/Update Driver
  const saveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        tenant_id: "11111111-1111-1111-1111-111111111111",
        code,
        full_name: fullName,
        nic: nic || null,
        vehicle_number: vehicleNumber || null,
        mobile: mobile || null,
        default_commission_rate: Number(commissionRate)
      };

      if (editingDriver) {
        const { error } = await supabase
          .from("drivers")
          .update(payload as any)
          .eq("id", editingDriver.id);
        if (error) throw error;
        toast.success("Driver updated successfully!");
      } else {
        const { error } = await supabase
          .from("drivers")
          .insert(payload as any);
        if (error) throw error;
        toast.success("New driver registered successfully!");
      }

      setIsAddOpen(false);
      setEditingDriver(null);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save driver");
    } finally {
      setBusy(false);
    }
  };

  // Toggle status
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase
        .from("drivers")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver status updated");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update driver status");
    }
  });

  const openEdit = (drv: any) => {
    setEditingDriver(drv);
    setCode(drv.code);
    setFullName(drv.full_name);
    setNic(drv.nic || "");
    setVehicleNumber(drv.vehicle_number || "");
    setMobile(drv.mobile || "");
    setCommissionRate(drv.default_commission_rate);
    setIsAddOpen(true);
  };

  const resetForm = () => {
    setEditingDriver(null);
    setCode("");
    setFullName("");
    setNic("");
    setVehicleNumber("");
    setMobile("");
    setCommissionRate(5);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Driver Directory"
          description="Register and manage drivers, track vehicle plate configurations, and set commission payouts."
        />
        <div className="shrink-0">
          <Dialog open={isAddOpen} onOpenChange={(v) => { setIsAddOpen(v); if(!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingDriver ? "Edit Driver Details" : "Register Driver"}</DialogTitle>
                <DialogDescription>
                  Enter driver name, vehicle information, and standard trip commission rates.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={saveDriver} className="space-y-4 py-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Driver Code / ID</Label>
                    <Input
                      id="code"
                      placeholder="e.g. DRV-001"
                      required
                      disabled={!!editingDriver}
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="commRate">Commission Rate (%)</Label>
                    <Input
                      id="commRate"
                      type="number"
                      required
                      value={commissionRate || ""}
                      onChange={e => setCommissionRate(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="e.g. Rohan Fernando"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nic">NIC Number</Label>
                    <Input
                      id="nic"
                      placeholder="e.g. 1988xxxxxxx"
                      value={nic}
                      onChange={e => setNic(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="vehicleNumber">Vehicle Plate Number</Label>
                    <Input
                      id="vehicleNumber"
                      placeholder="e.g. WP-CAB-1234"
                      value={vehicleNumber}
                      onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mobile">Mobile Number</Label>
                  <Input
                    id="mobile"
                    placeholder="e.g. 077xxxxxxx"
                    value={mobile}
                    onChange={e => setMobile(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    {editingDriver ? "Save Changes" : "Register Driver"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter search */}
      <Card className="p-4 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search drivers by name, vehicle, NIC..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Directory Table */}
      <Card className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading driver listings...</div>
        ) : filteredDrivers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No drivers registered.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Driver ID</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Vehicle Number</TableHead>
                  <TableHead>NIC Number</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead className="text-right">Commission Rate</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDrivers.map(d => (
                  <TableRow key={d.id} className={d.status === "suspended" ? "opacity-60 bg-muted/20" : ""}>
                    <TableCell className="font-mono font-medium">{d.code}</TableCell>
                    <TableCell className="font-semibold">{d.full_name}</TableCell>
                    <TableCell className="font-mono">{d.vehicle_number || "—"}</TableCell>
                    <TableCell className="font-mono">{d.nic || "—"}</TableCell>
                    <TableCell>{d.mobile || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{d.default_commission_rate}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={d.status === "active" ? "default" : "destructive"}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className="size-8 p-0" asChild>
                          <Link to="/app/drivers/$id" params={{ id: d.id }}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => openEdit(d)}>
                          <Edit2 className="size-4" />
                        </Button>
                        {d.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => toggleStatusMutation.mutate({ id: d.id, status: "suspended" })}
                          >
                            <Ban className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50"
                            onClick={() => toggleStatusMutation.mutate({ id: d.id, status: "active" })}
                          >
                            <CheckCircle className="size-4" />
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
