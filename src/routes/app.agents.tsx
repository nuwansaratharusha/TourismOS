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

export const Route = createFileRoute("/app/agents")({
  component: TravelAgents,
});

function TravelAgents() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);

  // Form states (Add/Edit)
  const [code, setCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [commissionRate, setCommissionRate] = useState<number>(10);
  const [busy, setBusy] = useState(false);

  // 1. Fetch agents
  const { data: agents, refetch, isLoading } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("company_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Filter list
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(a =>
      a.company_name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      (a.contact_person && a.contact_person.toLowerCase().includes(search.toLowerCase()))
    );
  }, [agents, search]);

  // Insert/Update Agent mutation
  const saveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        tenant_id: "11111111-1111-1111-1111-111111111111",
        code,
        company_name: companyName,
        contact_person: contactPerson || null,
        mobile: mobile || null,
        email: email || null,
        address: address || null,
        default_commission_rate: Number(commissionRate)
      };

      if (editingAgent) {
        const { error } = await supabase
          .from("agents")
          .update(payload as any)
          .eq("id", editingAgent.id);
        if (error) throw error;
        toast.success("Travel agent updated successfully!");
      } else {
        const { error } = await supabase
          .from("agents")
          .insert(payload as any);
        if (error) throw error;
        toast.success("New travel agent registered successfully!");
      }

      setIsAddOpen(false);
      setEditingAgent(null);
      resetForm();
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to save agent");
    } finally {
      setBusy(false);
    }
  };

  // Suspend/Activate mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase
        .from("agents")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agent status updated");
      refetch();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update status");
    }
  });

  const openEdit = (agent: any) => {
    setEditingAgent(agent);
    setCode(agent.code);
    setCompanyName(agent.company_name);
    setContactPerson(agent.contact_person || "");
    setMobile(agent.mobile || "");
    setEmail(agent.email || "");
    setAddress(agent.address || "");
    setCommissionRate(agent.default_commission_rate);
    setIsAddOpen(true);
  };

  const resetForm = () => {
    setEditingAgent(null);
    setCode("");
    setCompanyName("");
    setContactPerson("");
    setMobile("");
    setEmail("");
    setAddress("");
    setCommissionRate(10);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Travel Agent Directory"
          description="Register and manage Sri Lankan travel agents and their standard commission agreements."
        />
        <div className="shrink-0">
          <Dialog open={isAddOpen} onOpenChange={(v) => { setIsAddOpen(v); if(!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" /> Add Travel Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingAgent ? "Edit Travel Agent" : "Register Travel Agent"}</DialogTitle>
                <DialogDescription>
                  Configure agent parameters, contact details, and base commission levels.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={saveAgent} className="space-y-4 py-2 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="code">Agent Code / ID</Label>
                    <Input
                      id="code"
                      placeholder="e.g. AGT-LANKA"
                      required
                      disabled={!!editingAgent}
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
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    placeholder="e.g. Ceylon Tours Ltd"
                    required
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input
                    id="contactPerson"
                    placeholder="e.g. Dinesh Perera"
                    value={contactPerson}
                    onChange={e => setContactPerson(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mobile">Mobile Number</Label>
                    <Input
                      id="mobile"
                      placeholder="077xxxxxxx"
                      value={mobile}
                      onChange={e => setMobile(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="agent@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="address">Office Address</Label>
                  <Input
                    id="address"
                    placeholder="e.g. Galle Road, Colombo"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </div>

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    {editingAgent ? "Save Changes" : "Register Agent"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters Card */}
      <Card className="p-4 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search agents by name, ID, contact..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Directory Table */}
      <Card className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading travel agents...</div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No travel agents registered.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead className="text-right">Commission Rate</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map(a => (
                  <TableRow key={a.id} className={a.status === "suspended" ? "opacity-60 bg-muted/20" : ""}>
                    <TableCell className="font-mono font-medium">{a.code}</TableCell>
                    <TableCell className="font-semibold">{a.company_name}</TableCell>
                    <TableCell>{a.contact_person || "—"}</TableCell>
                    <TableCell>{a.mobile || "—"}</TableCell>
                    <TableCell className="text-right font-medium">{a.default_commission_rate}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.status === "active" ? "default" : "destructive"}>
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" className="size-8 p-0" asChild>
                          <Link to="/app/agents/$id" params={{ id: a.id }}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button size="sm" variant="ghost" className="size-8 p-0" onClick={() => openEdit(a)}>
                          <Edit2 className="size-4" />
                        </Button>
                        {a.status === "active" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => toggleStatusMutation.mutate({ id: a.id, status: "suspended" })}
                          >
                            <Ban className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0 text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50"
                            onClick={() => toggleStatusMutation.mutate({ id: a.id, status: "active" })}
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
