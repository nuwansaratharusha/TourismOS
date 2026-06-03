import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateSale, formatMoney } from "@/lib/domain/commission";
import type { SaleItem } from "@/lib/domain/types";
import { Search, ShoppingCart, User, Car, Tag, Trash, Plus, Minus, CheckCircle, Receipt, ArrowRight, Printer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/pos")({
  component: PosModule,
});

interface CartItem extends SaleItem {
  id: string;
  sku: string;
  name: string;
}

function PosModule() {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("none");
  const [selectedDriver, setSelectedDriver] = useState<string>("none");
  const [discount, setDiscount] = useState<number>(0);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  // Completed sale state for receipt printing
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  // 1. Fetch branches in tenant
  const { data: branches } = useQuery({
    queryKey: ["pos-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Automatically select cashier's branch if set
  useMemo(() => {
    if (branches && branches.length > 0 && !selectedBranch) {
      const defaultBranch = branches.find(b => b.id === profile?.branch_id) || branches[0];
      setSelectedBranch(defaultBranch.id);
    }
  }, [branches, profile, selectedBranch]);

  const activeBranchObj = useMemo(() => {
    return branches?.find(b => b.id === selectedBranch);
  }, [branches, selectedBranch]);

  // 2. Fetch products in tenant
  const { data: products } = useQuery({
    queryKey: ["pos-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
  });

  // 3. Fetch active travel agents
  const { data: agents } = useQuery({
    queryKey: ["pos-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const activeAgentObj = useMemo(() => {
    return agents?.find(a => a.id === selectedAgent);
  }, [agents, selectedAgent]);

  // 4. Fetch active drivers
  const { data: drivers } = useQuery({
    queryKey: ["pos-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("status", "active");
      if (error) throw error;
      return data;
    },
  });

  const activeDriverObj = useMemo(() => {
    return drivers?.find(d => d.id === selectedDriver);
  }, [drivers, selectedDriver]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
    );
  }, [products, search]);

  // Live calculations using domain logic helper
  const vatRate = activeBranchObj?.vat_rate ?? 18.00; // Flat 18% fallback
  const calculations = useMemo(() => {
    return calculateSale({
      items: cart.map(i => ({ product_id: i.product_id, description: i.name, quantity: i.quantity, unit_price: i.unit_price })),
      discount,
      vat_rate: Number(vatRate),
      agent_rate: activeAgentObj?.default_commission_rate ?? 0,
      driver_rate: activeDriverObj?.default_commission_rate ?? 0,
    });
  }, [cart, discount, vatRate, activeAgentObj, activeDriverObj]);

  // Cart operations
  const addToCart = (product: any) => {
    setCart(prev => {
      const exist = prev.find(item => item.id === product.id);
      if (exist) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        id: product.id,
        product_id: product.id,
        sku: product.sku || "",
        name: product.name,
        quantity: 1,
        unit_price: Number(product.unit_price)
      }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.id === id) {
          const quantity = Math.max(1, item.quantity + delta);
          return { ...item, quantity };
        }
        return item;
      })
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Create Sale Mutation
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBranch) throw new Error("Please select a branch first");
      if (cart.length === 0) throw new Error("Cart is empty");

      const salePayload = {
        branch_id: selectedBranch,
        agent_id: selectedAgent === "none" ? null : selectedAgent,
        driver_id: selectedDriver === "none" ? null : selectedDriver,
        customer_name: customerName || null,
        discount: Number(discount),
        notes: notes || null,
        items: cart.map(i => ({
          product_id: i.product_id,
          description: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price
        }))
      };

      const { data, error } = await supabase.rpc("create_sale", { payload: salePayload as any });
      if (error) throw error;
      return data; // returns created sale_id UUID
    },
    onSuccess: (saleId) => {
      setCompletedSaleId(saleId);
      setShowReceiptDialog(true);
      toast.success("Invoice recorded successfully!");
      // Reset POS cart
      setCart([]);
      setDiscount(0);
      setCustomerName("");
      setNotes("");
      setSelectedAgent("none");
      setSelectedDriver("none");
    },
    onError: (err: any) => {
      toast.error(err.message || "Checkout failed");
    }
  });

  // Fetch completed invoice for receipt
  const { data: invoice } = useQuery({
    queryKey: ["completed-invoice", completedSaleId],
    queryFn: async () => {
      if (!completedSaleId) return null;
      const { data, error } = await supabase
        .from("sales")
        .select("*, branches(name, address), agents(company_name, code), drivers(full_name, vehicle_number), sale_items(*)")
        .eq("id", completedSaleId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!completedSaleId,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 print:p-0 print:m-0 print:bg-white print:text-black">
      {/* Printable Area - Hidden except for printing */}
      {invoice && (
        <div className="hidden print:block font-mono text-xs w-[80mm] max-w-full mx-auto p-4 border border-dashed border-gray-400">
          <div className="text-center font-bold text-base mb-1">GUNATILAKE BATIKS</div>
          <div className="text-center text-[10px] mb-3">
            {invoice.branches?.name}<br />
            {invoice.branches?.address || "Sri Lanka"}<br />
            TEL: +94 11 234 5678
          </div>
          <div className="border-b border-dashed pb-2 mb-2">
            <div>INVOICE: {invoice.invoice_number}</div>
            <div>DATE: {new Date(invoice.sale_date).toLocaleString()}</div>
            <div>CASHIER: {profile?.full_name || "Staff"}</div>
            {invoice.customer_name && <div>CUSTOMER: {invoice.customer_name}</div>}
          </div>
          <table className="w-full text-left mb-2 text-[10px]">
            <thead>
              <tr className="border-b border-dashed">
                <th className="pb-1">Item Description</th>
                <th className="text-right pb-1">Qty</th>
                <th className="text-right pb-1">Price</th>
                <th className="text-right pb-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.sale_items?.map((item: any) => (
                <tr key={item.id}>
                  <td className="py-1 truncate max-w-[40mm]">{item.description}</td>
                  <td className="text-right py-1">{Number(item.quantity)}</td>
                  <td className="text-right py-1">{formatMoney(Number(item.unit_price))}</td>
                  <td className="text-right py-1">{formatMoney(Number(item.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-dashed pt-2 space-y-1 mb-3 text-[10px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span>-{formatMoney(Number(invoice.discount))}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>VAT ({invoice.vat_rate}%):</span>
              <span>{formatMoney(Number(invoice.vat_amount))}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-dashed pt-1">
              <span>GROSS AMOUNT:</span>
              <span>{formatMoney(Number(invoice.gross_amount))}</span>
            </div>
          </div>
          <div className="border-t border-dashed pt-2 text-[8px] text-center text-gray-500">
            <div>Commissions verified electronically.</div>
            {invoice.agents && <div>Agent Ref: {invoice.agents.company_name} ({invoice.agents.code})</div>}
            {invoice.drivers && <div>Driver Ref: {invoice.drivers.full_name} ({invoice.drivers.vehicle_number})</div>}
            <div className="mt-2 font-bold text-[9px] text-black">Thank you for visiting!</div>
          </div>
        </div>
      )}

      {/* POS UI Screen - Hidden when printing */}
      <div className="print:hidden space-y-6">
        <PageHeader
          title="Point of Sale"
          description="Ring up client sales. VAT, agent commission rates, and driver earnings calculate atomically."
        />

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Products & Search Section */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4 flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by SKU, name..."
                  className="pl-9"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="w-56">
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold text-sm mb-4">Select Products</h3>
              {filteredProducts.length === 0 ? (
                <div className="text-center text-muted-foreground py-12">
                  No active products found matching your search.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-2">
                  {filteredProducts.map(p => (
                    <div
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="p-4 border rounded-lg hover:border-primary/50 cursor-pointer transition-all bg-card flex flex-col justify-between hover:shadow-sm"
                    >
                      <div>
                        <div className="font-medium text-sm truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{p.sku || "NO SKU"}</div>
                      </div>
                      <div className="flex justify-between items-center mt-3 pt-2 border-t border-border/50">
                        <span className="font-semibold text-primary">{formatMoney(Number(p.unit_price))}</span>
                        <Button size="sm" variant="ghost" className="size-8 p-0 rounded-full">
                          <Plus className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* POS Cart Section */}
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <ShoppingCart className="size-4 text-primary" />
                <h3 className="font-semibold text-sm">Checkout Basket ({cart.length} items)</h3>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-center w-[120px]">Quantity</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Basket is empty. Select products above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      cart.map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>
                          </TableCell>
                          <TableCell className="text-right">{formatMoney(item.unit_price)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-6 p-0 rounded-full"
                                onClick={() => updateQuantity(item.id, -1)}
                              >
                                <Minus className="size-3" />
                              </Button>
                              <span className="text-sm font-semibold w-6">{item.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-6 p-0 rounded-full"
                                onClick={() => updateQuantity(item.id, 1)}
                              >
                                <Plus className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatMoney(item.quantity * item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <Trash className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>

          {/* Pricing Calculations & Meta Actions Sidebar */}
          <div className="space-y-6">
            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-sm border-b pb-2">Commission &amp; Customer Link</h3>

              {/* Customer Name */}
              <div className="space-y-2">
                <Label htmlFor="customerName" className="text-xs">Customer Name (Optional)</Label>
                <Input
                  id="customerName"
                  placeholder="e.g. John Doe"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                />
              </div>

              {/* Travel Agent Select */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <User className="size-3 text-primary" /> Travel Agent
                </Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="No Agent Linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Walk-in (No Agent)</SelectItem>
                    {agents?.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.company_name} ({a.default_commission_rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Driver Select */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Car className="size-3 text-primary" /> Driver
                </Label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="No Driver Linked" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Driver (Self-drive/Taxi)</SelectItem>
                    {drivers?.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name} ({d.vehicle_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Flat Discount Input */}
              <div className="space-y-2">
                <Label htmlFor="discount" className="text-xs flex items-center gap-1.5">
                  <Tag className="size-3 text-primary" /> Discount (LKR)
                </Label>
                <Input
                  id="discount"
                  type="number"
                  placeholder="0.00"
                  value={discount || ""}
                  onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                />
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="font-semibold text-sm border-b pb-2">Calculation Ledger</h3>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMoney(calculations.subtotal)}</span>
                </div>
                {calculations.discount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Discount</span>
                    <span>-{formatMoney(calculations.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Value</span>
                  <span className="font-medium">{formatMoney(calculations.net_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT ({vatRate}%)</span>
                  <span>{formatMoney(calculations.vat_amount)}</span>
                </div>

                <div className="border-t border-dashed my-2 pt-2 space-y-2">
                  <div className="flex justify-between text-primary font-medium">
                    <span>Agent Commission ({calculations.agent_rate}%)</span>
                    <span>{formatMoney(calculations.agent_amount)}</span>
                  </div>
                  <div className="flex justify-between text-accent font-medium">
                    <span>Driver Commission ({calculations.driver_rate}%)</span>
                    <span>{formatMoney(calculations.driver_amount)}</span>
                  </div>
                </div>

                <div className="border-t border-border pt-3 mt-3 space-y-2">
                  <div className="flex justify-between text-sm font-bold text-foreground">
                    <span>Gross (Collectable)</span>
                    <span className="text-base text-primary font-mono">{formatMoney(calculations.gross_amount)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-semibold text-muted-foreground bg-accent/10 px-2 py-1.5 rounded">
                    <span>Final Company Revenue</span>
                    <span>{formatMoney(calculations.company_revenue)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  className="w-full h-11 text-sm font-medium"
                  disabled={cart.length === 0 || checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate()}
                >
                  {checkoutMutation.isPending ? "Recording sale..." : "Complete Sale & Checkout"}
                  <ArrowRight className="size-4 ml-1.5" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Invoice Completion & Print Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-md print:hidden">
          <DialogHeader>
            <div className="mx-auto bg-primary/10 size-12 rounded-full flex items-center justify-center text-primary mb-3">
              <CheckCircle className="size-6" />
            </div>
            <DialogTitle className="text-center text-xl">Sale Completed Successfully</DialogTitle>
            <DialogDescription className="text-center">
              Invoice has been written to the ledger, and commission entries are updated.
            </DialogDescription>
          </DialogHeader>

          {invoice && (
            <div className="border rounded-lg p-4 bg-muted/20 text-sm space-y-3 font-sans">
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Invoice ID</span>
                <span className="font-semibold">{invoice.invoice_number}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Branch</span>
                <span className="font-medium">{invoice.branches?.name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Collectable Cash</span>
                <span className="font-semibold text-primary">{formatMoney(Number(invoice.gross_amount))}</span>
              </div>
              {invoice.agents && (
                <div className="flex justify-between border-b pb-2 text-xs">
                  <span className="text-muted-foreground">Agent Commission</span>
                  <span className="font-medium text-emerald-600">{formatMoney(Number(invoice.agent_commission_amount))} ({invoice.agent_commission_rate}%)</span>
                </div>
              )}
              {invoice.drivers && (
                <div className="flex justify-between border-b pb-2 text-xs">
                  <span className="text-muted-foreground">Driver Commission</span>
                  <span className="font-medium text-amber-600">{formatMoney(Number(invoice.driver_commission_amount))} ({invoice.driver_commission_rate}%)</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="grid grid-cols-2 gap-2 mt-4 sm:space-x-0">
            <Button variant="outline" className="w-full" asChild>
              <Link to="/app/sales">View Sales Ledger</Link>
            </Button>
            <Button onClick={handlePrint} className="w-full gap-2">
              <Printer className="size-4" /> Print Thermal Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
