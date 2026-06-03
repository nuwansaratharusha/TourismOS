import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/domain/commission";
import { Printer, Mail, Send, ChevronLeft, Calendar, FileText, CheckCircle2, History, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/app/sales/$id")({
  component: InvoiceDetails,
});

function InvoiceDetails() {
  const { id } = Route.useParams();

  // 1. Fetch sale data
  const { data: sale, isLoading: loadingSale } = useQuery({
    queryKey: ["sale-details", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, branches(*), agents(*), drivers(*), sale_items(*)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // 2. Fetch audit logs for this sale
  const { data: auditLogs } = useQuery({
    queryKey: ["sale-audits", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*, profiles:user_id(full_name)")
        .eq("entity_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (loadingSale) {
    return <div className="p-8 text-center text-muted-foreground">Loading invoice details...</div>;
  }

  if (!sale) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Invoice not found. <Link to="/app/sales" className="text-primary hover:underline">Back to sales</Link>
      </div>
    );
  }

  // QR Code URL (using public qrserver API matching the qr_token field)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(sale.qr_token)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 print:p-0 print:m-0 print:bg-white print:text-black">
      {/* Printable Sheet View - Only visible on print */}
      <div className="hidden print:block font-serif text-sm p-8 bg-white text-black max-w-[800px] mx-auto border">
        <div className="flex justify-between items-start border-b pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-bold font-sans tracking-tight">GUNATILAKE BATIKS</h1>
            <div className="text-xs text-gray-500 mt-1 font-sans">
              {sale.branches?.name || "Main Showroom"}<br />
              {sale.branches?.address || "Sri Lanka"}<br />
              Tel: +94 11 234 5678 • Email: accounts@gunatilakebatiks.lk
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold font-sans tracking-wide text-gray-800">INVOICE</h2>
            <div className="text-xs text-gray-500 mt-1 font-mono">
              #{sale.invoice_number}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 font-sans text-xs">
          <div>
            <div className="font-semibold text-gray-600">Billed To:</div>
            <div className="font-medium text-sm mt-1">{sale.customer_name || "Walk-in Retail Customer"}</div>
            {sale.notes && <div className="text-gray-500 mt-1">Notes: {sale.notes}</div>}
          </div>
          <div className="text-right space-y-1">
            <div><strong>Invoice Date:</strong> {new Date(sale.sale_date).toLocaleDateString()}</div>
            <div><strong>Currency:</strong> {sale.currency}</div>
            <div><strong>Status:</strong> <span className="capitalize">{sale.status}</span></div>
          </div>
        </div>

        <table className="w-full text-left border-collapse mb-6 font-sans text-xs">
          <thead>
            <tr className="border-b-2 border-gray-300 bg-gray-50">
              <th className="py-2 px-3 font-semibold text-gray-700">Product SKU</th>
              <th className="py-2 px-3 font-semibold text-gray-700">Description</th>
              <th className="py-2 px-3 text-right font-semibold text-gray-700">Unit Price</th>
              <th className="py-2 px-3 text-center font-semibold text-gray-700">Qty</th>
              <th className="py-2 px-3 text-right font-semibold text-gray-700">Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.sale_items?.map((item: any) => (
              <tr key={item.id} className="border-b">
                <td className="py-2 px-3 font-mono text-[10px] text-gray-600">{item.product_id ? "BAT-PROD" : "RETAIL"}</td>
                <td className="py-2 px-3">{item.description}</td>
                <td className="py-2 px-3 text-right">{formatMoney(Number(item.unit_price))}</td>
                <td className="py-2 px-3 text-center">{Number(item.quantity)}</td>
                <td className="py-2 px-3 text-right">{formatMoney(Number(item.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between items-start font-sans text-xs mt-8">
          <div>
            <img src={qrUrl} alt="Invoice QR verification" className="size-24 border p-1" />
            <div className="text-[9px] text-gray-400 mt-1 font-mono max-w-[200px]">Scan to verify ledger transaction authenticity.</div>
          </div>
          <div className="w-[300px] space-y-2 border-t pt-2">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span>{formatMoney(Number(sale.subtotal))}</span>
            </div>
            {Number(sale.discount) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount:</span>
                <span>-{formatMoney(Number(sale.discount))}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>VAT ({sale.vat_rate}%):</span>
              <span>{formatMoney(Number(sale.vat_amount))}</span>
            </div>
            <div className="flex justify-between font-bold text-sm text-gray-900 border-t pt-1">
              <span>Total Invoice Amount:</span>
              <span>{formatMoney(Number(sale.gross_amount))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Screen layout - Hidden when printing */}
      <div className="print:hidden space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/sales">
              <ChevronLeft className="size-4 mr-1.5" /> Back to ledger
            </Link>
          </Button>
          <Badge variant={sale.status === "completed" ? "default" : "destructive"}>
            {sale.status}
          </Badge>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <PageHeader
            title={`Invoice ${sale.invoice_number}`}
            description={`Recorded at ${new Date(sale.sale_date).toLocaleString()}`}
          />
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="size-4" /> Print Document
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`mailto:?subject=Invoice ${sale.invoice_number}&body=Hi, please find your invoice link: ${window.location.href}`)}
              className="gap-2"
            >
              <Mail className="size-4" /> Email Invoice
            </Button>
            {sale.customer_name && (
              <Button
                variant="outline"
                onClick={() => window.open(`https://wa.me/?text=Hi, please check your invoice details for Gunatilake Batiks: ${sale.invoice_number}`)}
                className="gap-2"
              >
                <Send className="size-4" /> WhatsApp Link
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main invoice items table */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="size-4 text-primary" />
                <h3 className="font-semibold text-sm">Invoice Line Items</h3>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.sale_items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.description}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(item.unit_price))}</TableCell>
                      <TableCell className="text-center">{Number(item.quantity)}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(Number(item.line_total))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            {/* Audit log for this sale */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <History className="size-4 text-primary" />
                <h3 className="font-semibold text-sm">Invoice Audit Activity</h3>
              </div>
              {(!auditLogs || auditLogs.length === 0) ? (
                <div className="text-xs text-muted-foreground">No audit trails recorded for this invoice yet.</div>
              ) : (
                <div className="space-y-4">
                  {auditLogs.map(log => (
                    <div key={log.id} className="flex gap-3 text-xs border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                      <div className="mt-0.5 shrink-0">
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="font-medium text-foreground capitalize">
                          {log.action.replace(".", " ")}
                        </div>
                        <div className="text-muted-foreground">
                          Logged by: {log.profiles?.full_name || "System"} • IP: {log.ip_address || "Internal"}
                        </div>
                        <pre className="text-[10px] font-mono bg-muted/30 p-2 rounded max-w-full overflow-x-auto text-muted-foreground mt-1">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                      <div className="text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Financial Breakdown & Commission Snapshot Panel */}
          <div className="space-y-6">
            <Card className="p-6 text-center space-y-4 flex flex-col items-center">
              <h3 className="font-semibold text-sm border-b pb-2 w-full">Validation</h3>
              <img src={qrUrl} alt="Transaction QR" className="size-36 border p-1 rounded-lg bg-white" />
              <div className="text-xs text-muted-foreground">
                Digital Certificate Token:<br />
                <span className="font-mono bg-muted/50 px-1 py-0.5 rounded select-all break-all">{sale.qr_token}</span>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-sm border-b pb-2">Financial Accounting</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(Number(sale.subtotal))}</span>
                </div>
                {Number(sale.discount) > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span>
                    <span>-{formatMoney(Number(sale.discount))}</span>
                  </div>
                )}
                <div className="flex justify-between border-b pb-2">
                  <span className="text-muted-foreground">VAT ({sale.vat_rate}%)</span>
                  <span>{formatMoney(Number(sale.vat_amount))}</span>
                </div>

                <div className="flex justify-between text-sm font-bold text-foreground border-b pb-2">
                  <span>Gross collected</span>
                  <span>{formatMoney(Number(sale.gross_amount))}</span>
                </div>

                <div className="space-y-2 border-b pb-2">
                  <div className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">Commission Deductions</div>
                  {sale.agents ? (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Agent: {sale.agents.company_name} ({sale.agent_commission_rate}%)</span>
                      <span>{formatMoney(Number(sale.agent_commission_amount))}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-muted-foreground italic">
                      <span>No Agent linked</span>
                      <span>Rs. 0.00</span>
                    </div>
                  )}

                  {sale.drivers ? (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>Driver: {sale.drivers.full_name} ({sale.driver_commission_rate}%)</span>
                      <span>{formatMoney(Number(sale.driver_commission_amount))}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-muted-foreground italic">
                      <span>No Driver linked</span>
                      <span>Rs. 0.00</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between font-semibold text-sm bg-primary/5 p-2 rounded border text-primary">
                  <span>Final Net Revenue</span>
                  <span>{formatMoney(Number(sale.company_revenue))}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-sm border-b pb-2">Operational Context</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Operating Branch</span>
                  <span className="font-medium">{sale.branches?.name || "Main Showroom"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Currency System</span>
                  <span className="font-medium uppercase">{sale.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cashier UID</span>
                  <span className="font-mono bg-muted px-1 rounded truncate max-w-[120px]">{sale.cashier_id || "System"}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
