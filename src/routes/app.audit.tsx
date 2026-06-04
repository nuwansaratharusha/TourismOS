import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, ScrollText, Calendar, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/audit")({
  component: AuditLogs,
});

function AuditLogs() {
  const { roles } = useAuth();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  // Enforce roles: super_admin, branch_manager, accountant
  if (!roles.some(r => ["super_admin", "branch_manager", "accountant"].includes(r))) {
    return <Navigate to="/app" />;
  }

  // 1. Fetch audit logs
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs-list"],
    queryFn: async () => {
      const [{ data: logsData, error: logsError }, { data: profilesData, error: profilesError }] = await Promise.all([
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email")
      ]);
      if (logsError) throw logsError;
      if (profilesError) throw profilesError;

      const profileMap = new Map((profilesData ?? []).map((p: any) => [p.id, p]));
      return (logsData ?? []).map((log: any) => ({
        ...log,
        profiles: log.user_id ? profileMap.get(log.user_id) : null
      }));
    },
  });

  // Filter actions
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const matchesSearch =
        (log.profiles?.full_name && log.profiles.full_name.toLowerCase().includes(search.toLowerCase())) ||
        (log.profiles?.email && log.profiles.email.toLowerCase().includes(search.toLowerCase())) ||
        (log.entity_id && log.entity_id.toLowerCase().includes(search.toLowerCase())) ||
        log.action.toLowerCase().includes(search.toLowerCase());

      const matchesAction = actionFilter === "all" || log.action === actionFilter;

      return matchesSearch && matchesAction;
    });
  }, [logs, search, actionFilter]);

  // Unique actions list for filter dropdown
  const uniqueActions = useMemo(() => {
    if (!logs) return [];
    return Array.from(new Set(logs.map(l => l.action)));
  }, [logs]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Security &amp; Audit Logs"
        description="Immutable system ledger recording database modifications, logins, voids, and payments."
      />

      {/* Filters Card */}
      <Card className="p-4 grid sm:grid-cols-2 md:grid-cols-3 gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search logs by user, action..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {uniqueActions.map(action => (
                <SelectItem key={action} value={action}>{action.replace(".", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Audit Table */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 text-primary">
          <ScrollText className="size-4" />
          <h3 className="font-semibold text-sm">System Operations Log</h3>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading audit trail...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No audit entries matching filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User / Profile</TableHead>
                  <TableHead>Action Event</TableHead>
                  <TableHead>Target Entity</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Metadata Parameters</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="font-semibold text-xs text-foreground">{log.profiles?.full_name || "System Automated"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{log.profiles?.email || "internal@service.role"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0.5 border-primary/20 bg-primary/5 text-primary">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-semibold uppercase text-muted-foreground">{log.entity_type}</span>:{" "}
                      <span className="font-mono bg-muted px-1 rounded text-[10px]">{log.entity_id || "None"}</span>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {log.ip_address || "Internal CLI/Server"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <pre className="text-[10px] font-mono bg-muted/40 p-1.5 rounded overflow-x-auto text-muted-foreground max-h-16 overflow-y-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
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
