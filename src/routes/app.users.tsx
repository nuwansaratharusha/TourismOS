import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ShieldCheck, Plus, Link, Trash, UserCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/users")({
  component: UserRolesConsole,
});

function UserRolesConsole() {
  const { roles } = useAuth();

  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [isLinkOpen, setIsLinkOpen] = useState(false);

  // Assignment states
  const [selectedUserId, setSelectedUserId] = useState("");
  const [assignRole, setAssignRole] = useState<string>("cashier");
  const [assignBranchId, setAssignBranchId] = useState<string>("none");
  const [busy, setBusy] = useState(false);

  // Link Partner states
  const [linkUserId, setLinkUserId] = useState("");
  const [partnerType, setPartnerType] = useState<"agent" | "driver">("agent");
  const [partnerId, setPartnerId] = useState("");

  if (!roles.includes("super_admin")) {
    return <Navigate to="/app" />;
  }

  // 1. Fetch profiles
  const { data: profiles, refetch: refetchProfiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Fetch user roles list
  const { data: userRoles, refetch: refetchRoles } = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*, branches(name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Fetch branches
  const { data: branches } = useQuery({
    queryKey: ["users-branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name");
      return data ?? [];
    },
  });

  // 4. Fetch unlinked agents & drivers for portals binding
  const { data: agents, refetch: refetchAgents } = useQuery({
    queryKey: ["users-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("agents").select("id, company_name, code, user_id");
      return data ?? [];
    },
  });

  const { data: drivers, refetch: refetchDrivers } = useQuery({
    queryKey: ["users-drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("id, full_name, code, user_id");
      return data ?? [];
    },
  });

  // Add role handler
  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        user_id: selectedUserId,
        tenant_id: "11111111-1111-1111-1111-111111111111",
        role: assignRole,
        branch_id: assignBranchId === "none" ? null : assignBranchId
      };

      const { error } = await supabase.from("user_roles").insert(payload as any);
      if (error) throw error;

      // Log to audit log
      await supabase.from("audit_logs").insert({
        tenant_id: "11111111-1111-1111-1111-111111111111",
        action: "user.role_assigned",
        entity_type: "user",
        entity_id: selectedUserId,
        metadata: { role: assignRole, branch_id: payload.branch_id }
      } as any);

      toast.success("Role assigned successfully!");
      setIsRoleOpen(false);
      setSelectedUserId("");
      setAssignBranchId("none");
      refetchRoles();
    } catch (err: any) {
      toast.error(err.message || "Failed to assign role");
    } finally {
      setBusy(false);
    }
  };

  // Remove role handler
  const handleDeleteRole = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this user role?")) return;
    try {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
      toast.success("Role revoked successfully");
      refetchRoles();
    } catch (err: any) {
      toast.error(err.message || "Revoke failed");
    }
  };

  // Link partner profile to auth account
  const handleLinkPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUserId || !partnerId) {
      toast.error("Please fill all fields");
      return;
    }
    setBusy(true);
    try {
      if (partnerType === "agent") {
        const { error } = await supabase
          .from("agents")
          .update({ user_id: linkUserId } as any)
          .eq("id", partnerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("drivers")
          .update({ user_id: linkUserId } as any)
          .eq("id", partnerId);
        if (error) throw error;
      }

      // Log to audit log
      await supabase.from("audit_logs").insert({
        tenant_id: "11111111-1111-1111-1111-111111111111",
        action: "user.partner_linked",
        entity_type: partnerType,
        entity_id: partnerId,
        metadata: { linked_user: linkUserId }
      } as any);

      toast.success("Partner record linked successfully!");
      setIsLinkOpen(false);
      setLinkUserId("");
      setPartnerId("");
      refetchAgents();
      refetchDrivers();
    } catch (err: any) {
      toast.error(err.message || "Linking failed");
    } finally {
      setBusy(false);
    }
  };

  // Map users to show full card (Profile details + Roles)
  const usersTableData = useMemo(() => {
    if (!profiles) return [];
    return profiles.map(p => {
      const rolesRow = userRoles?.filter(ur => ur.user_id === p.id) || [];
      const linkedAgent = agents?.find(a => a.user_id === p.id);
      const linkedDriver = drivers?.find(d => d.user_id === p.id);

      return {
        ...p,
        roles: rolesRow,
        linkedPartnerName: linkedAgent
          ? `${linkedAgent.company_name} (Agent)`
          : linkedDriver
          ? `${linkedDriver.full_name} (Driver)`
          : null
      };
    });
  }, [profiles, userRoles, agents, drivers]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="User Permissions"
          description="Control access permissions, assign employee roles, and bind partner accounts to portals."
        />
        <div className="flex gap-2 shrink-0">
          {/* Link partner card dialog */}
          <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Link className="size-4" /> Link Partner Account
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Bind Partner User Account</DialogTitle>
                <DialogDescription>
                  Link a travel agent or driver user login ID to their profile registry record to enable portal access.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleLinkPartner} className="space-y-4 py-2 text-sm">
                <div className="space-y-1.5">
                  <Label>Select User Login</Label>
                  <Select value={linkUserId} onValueChange={setLinkUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose registered user" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Partner Type</Label>
                  <Select value={partnerType} onValueChange={(v: "agent" | "driver") => { setPartnerType(v); setPartnerId(""); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Travel Agent</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Select Partner Registry Card</Label>
                  <Select value={partnerId} onValueChange={setPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose registry card" />
                    </SelectTrigger>
                    <SelectContent>
                      {partnerType === "agent"
                        ? agents?.filter(a => !a.user_id).map(a => (
                            <SelectItem key={a.id} value={a.id}>{a.company_name} ({a.code})</SelectItem>
                          ))
                        : drivers?.filter(d => !d.user_id).map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.full_name} ({d.code})</SelectItem>
                          ))
                      }
                    </SelectContent>
                  </Select>
                </div>

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    Confirm Account Association
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Assign Role Dialog */}
          <Dialog open={isRoleOpen} onOpenChange={setIsRoleOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserCheck className="size-4" /> Assign User Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Assign Employee Role</DialogTitle>
                <DialogDescription>
                  Grant organizational permissions. Users can hold multiple roles.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAssignRole} className="space-y-4 py-2 text-sm">
                <div className="space-y-1.5">
                  <Label>Select User</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose registered user" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles?.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.email})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Assign Permission Role</Label>
                    <Select value={assignRole} onValueChange={setAssignRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="branch_manager">Branch Manager</SelectItem>
                        <SelectItem value="cashier">Cashier</SelectItem>
                        <SelectItem value="accountant">Accountant</SelectItem>
                        <SelectItem value="travel_agent">Travel Agent</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Branch Binding (Optional)</Label>
                    <Select value={assignBranchId} onValueChange={setAssignBranchId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Central/No Branch</SelectItem>
                        {branches?.map(b => (
                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter className="pt-4">
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="size-4 animate-spin mr-2" />}
                    Confirm Role Assignment
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Directory Table */}
      <Card className="p-6">
        {loadingProfiles ? (
          <div className="text-center py-12 text-muted-foreground">Loading users...</div>
        ) : usersTableData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No users registered in tenant.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User Full Name</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Active Roles &amp; Branches</TableHead>
                  <TableHead>Linked Partner Profile</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersTableData.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold">{u.full_name}</TableCell>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>{u.phone || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <Badge variant="outline" className="text-muted-foreground">No Role Assigned</Badge>
                        ) : (
                          u.roles.map(ur => (
                            <Badge key={ur.id} variant="secondary" className="gap-1 bg-primary/10 text-primary border-primary/20">
                              <ShieldCheck className="size-3" />
                              {ur.role.replace("_", " ")}
                              {ur.branches && ` (${ur.branches.name})`}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {u.linkedPartnerName || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.roles.map(ur => (
                        <Button
                          key={ur.id}
                          size="sm"
                          variant="ghost"
                          className="size-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 inline-flex items-center justify-center mr-1"
                          title={`Revoke role: ${ur.role}`}
                          onClick={() => handleDeleteRole(ur.id)}
                        >
                          <Trash className="size-3.5" />
                        </Button>
                      ))}
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
