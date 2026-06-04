import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { calculateSale, formatMoney } from "@/lib/domain/commission";
import type { SaleItem } from "@/lib/domain/types";
import {
  Search, ShoppingCart, User, Car, Tag, Trash, Plus, Minus,
  CheckCircle, Receipt, ArrowRight, Printer, RefreshCw, X,
  Coins, CreditCard, Landmark, Percent, UserCheck, Edit2, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/pos")({
  component: PosModule,
});

interface CartItem extends SaleItem {
  id: string;
  sku: string;
  name: string;
}

interface Guide {
  id: string;
  name: string;
  code: string;
  default_commission_rate: number;
}

const MOCK_GUIDES: Guide[] = [
  { id: "g1", name: "Saman Kumara", code: "GUI-001", default_commission_rate: 5.00 },
  { id: "g2", name: "Nimal Perera", code: "GUI-002", default_commission_rate: 5.00 },
  { id: "g3", name: "Lasith de Silva", code: "GUI-003", default_commission_rate: 7.50 },
  { id: "g4", name: "Sunimal Fernando", code: "GUI-004", default_commission_rate: 4.00 },
  { id: "g5", name: "Priyantha Bandara", code: "GUI-005", default_commission_rate: 6.00 }
];

function PosModule() {
  const { profile } = useAuth();
  
  // Basic states
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("none");
  const [selectedDriver, setSelectedDriver] = useState<string>("none");
  const [selectedGuide, setSelectedGuide] = useState<string>("none");
  const [discount, setDiscount] = useState<number>(0);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");

  // Keypad & Payment states
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "bank" | "mixed">("cash");
  const [amountReceived, setAmountReceived] = useState<string>("0");
  const [showMixedDialog, setShowMixedDialog] = useState(false);
  const [mixedCashAmount, setMixedCashAmount] = useState<string>("");
  const [mixedCardAmount, setMixedCardAmount] = useState<string>("");

  // Edit item state
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");

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
  useEffect(() => {
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

  // Selected guide object
  const selectedGuideObj = useMemo(() => {
    return MOCK_GUIDES.find(g => g.id === selectedGuide);
  }, [selectedGuide]);

  // Categorize products dynamically based on names/SKUs
  const categorizedProducts = useMemo(() => {
    if (!products) return [];
    return products.map(p => {
      let category = "Others";
      if (p.name.toLowerCase().includes("saree") || p.sku?.toUpperCase().startsWith("SAR")) {
        category = "Sarees";
      } else if (p.name.toLowerCase().includes("shirt") || p.name.toLowerCase().includes("sarong")) {
        category = "Batik Wear";
      } else if (p.name.toLowerCase().includes("batik") || p.sku?.toUpperCase().startsWith("BAT")) {
        category = "Batiks";
      } else if (p.name.toLowerCase().includes("silk") || p.name.toLowerCase().includes("fabric")) {
        category = "Fabrics";
      }
      return { ...p, category };
    });
  }, [products]);

  // Unique categories list
  const categories = useMemo(() => {
    const list = new Set(categorizedProducts.map(p => p.category));
    return ["All", ...Array.from(list)];
  }, [categorizedProducts]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return categorizedProducts.filter(p => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()));
      const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [categorizedProducts, search, selectedCategory]);

  // Get quick-add popular items (first 8 items)
  const quickAddProducts = useMemo(() => {
    return categorizedProducts.slice(0, 8);
  }, [categorizedProducts]);

  // Barcode Scanner listener
  useEffect(() => {
    let buffer = "";
    let lastKeyTime = Date.now();
    const handleKeyDown = (e: KeyboardEvent) => {
      // Focus element ignore: don't capture if cashier is typing in customer name or search inputs
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT") {
        return;
      }

      const now = Date.now();
      if (now - lastKeyTime > 50) {
        buffer = ""; // reset if typing slowly
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (buffer.length > 2) {
          const matched = products?.find(p => p.sku?.toLowerCase() === buffer.trim().toLowerCase());
          if (matched) {
            addToCart(matched);
            toast.success(`Scanned: ${matched.name}`);
          } else {
            toast.error(`Unknown SKU scanned: ${buffer}`);
          }
          buffer = "";
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [products]);

  // Live calculations using domain logic helper
  const vatRate = activeBranchObj?.vat_rate ?? 18.00;
  const calculations = useMemo(() => {
    const baseCalc = calculateSale({
      items: cart.map(i => ({ product_id: i.product_id, description: i.name, quantity: i.quantity, unit_price: i.unit_price })),
      discount,
      vat_rate: Number(vatRate),
      agent_rate: activeAgentObj?.default_commission_rate ?? 0,
      driver_rate: activeDriverObj?.default_commission_rate ?? 0,
    });

    // Guide calculations
    const guideRate = selectedGuideObj?.default_commission_rate ?? 0;
    const guideAmount = Math.round(baseCalc.net_amount * guideRate / 100);

    // Recompute company net revenue subtracting guide commission
    const companyRevenue = baseCalc.company_revenue - guideAmount;

    return {
      ...baseCalc,
      guide_rate: guideRate,
      guide_amount: guideAmount,
      company_revenue: companyRevenue
    };
  }, [cart, discount, vatRate, activeAgentObj, activeDriverObj, selectedGuideObj]);

  // Auto-fill Amount Received for non-cash methods
  useEffect(() => {
    if (paymentMethod === "card" || paymentMethod === "bank") {
      setAmountReceived(calculations.gross_amount.toString());
    } else if (paymentMethod === "cash") {
      setAmountReceived("0");
    }
  }, [paymentMethod, calculations.gross_amount]);

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
        description: product.name,
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

  const handleEditItem = (item: CartItem) => {
    setEditingItem(item);
    setEditPrice(item.unit_price.toString());
  };

  const saveEditedItem = () => {
    if (!editingItem) return;
    const newPrice = Number(editPrice);
    if (isNaN(newPrice) || newPrice < 0) {
      toast.error("Invalid price entered");
      return;
    }
    setCart(prev =>
      prev.map(item =>
        item.id === editingItem.id ? { ...item, unit_price: newPrice } : item
      )
    );
    setEditingItem(null);
    toast.success("Line item price updated");
  };

  // Touch numeric keypad inputs
  const handleKeypadPress = (val: string) => {
    // If card/bank, cashier shouldn't change the amount received
    if (paymentMethod === "card" || paymentMethod === "bank") {
      return;
    }

    if (val === "C") {
      setAmountReceived("0");
    } else if (val === "⌫") {
      setAmountReceived(prev => {
        if (prev.length <= 1) return "0";
        return prev.slice(0, -1);
      });
    } else {
      setAmountReceived(prev => {
        if (prev === "0") return val;
        return prev + val;
      });
    }
  };

  const handleQuickCash = (amt: number | "full") => {
    if (paymentMethod === "card" || paymentMethod === "bank") return;
    if (amt === "full") {
      setAmountReceived(calculations.gross_amount.toString());
    } else {
      setAmountReceived(prev => {
        const current = Number(prev) || 0;
        return (current + amt).toString();
      });
    }
  };

  // Open Mixed payment dialog
  const handleOpenMixed = () => {
    setMixedCashAmount("");
    setMixedCardAmount("");
    setShowMixedDialog(true);
  };

  const confirmMixedPayment = () => {
    const cash = Number(mixedCashAmount) || 0;
    const card = Number(mixedCardAmount) || 0;
    const total = cash + card;

    if (Math.abs(total - calculations.gross_amount) > 1) {
      toast.error(`Amounts must sum to exactly LKR ${calculations.gross_amount.toLocaleString()}`);
      return;
    }

    setAmountReceived(total.toString());
    setShowMixedDialog(false);
    toast.success("Mixed payment split confirmed");
  };

  // Save Sale Mutation
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBranch) throw new Error("Please select a branch first");
      if (cart.length === 0) throw new Error("Cart is empty");

      const parsedAmtReceived = Number(amountReceived) || 0;
      if (paymentMethod === "cash" && parsedAmtReceived < calculations.gross_amount) {
        throw new Error("Insufficient cash received");
      }

      // Serialize guide + split payments details in notes
      const notesObj = {
        cashierNotes: notes || "",
        guide: selectedGuideObj ? {
          name: selectedGuideObj.name,
          rate: calculations.guide_rate,
          amount: calculations.guide_amount
        } : null,
        paymentMethod,
        paymentSplit: paymentMethod === "mixed" ? {
          cash: Number(mixedCashAmount) || 0,
          card: Number(mixedCardAmount) || 0
        } : null
      };

      const salePayload = {
        branch_id: selectedBranch,
        agent_id: selectedAgent === "none" ? null : selectedAgent,
        driver_id: selectedDriver === "none" ? null : selectedDriver,
        customer_name: customerName || null,
        discount: Number(discount),
        notes: JSON.stringify(notesObj),
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
      toast.success("Sale completed successfully!");

      // Reset states
      setCart([]);
      setDiscount(0);
      setCustomerName("");
      setNotes("");
      setSelectedAgent("none");
      setSelectedDriver("none");
      setSelectedGuide("none");
      setAmountReceived("0");
      setPaymentMethod("cash");
      setMixedCashAmount("");
      setMixedCardAmount("");
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

  // Extract guide details from invoice notes if present
  const invoiceGuideObj = useMemo(() => {
    if (!invoice?.notes) return null;
    try {
      const parsed = JSON.parse(invoice.notes);
      return parsed.guide;
    } catch {
      return null;
    }
  }, [invoice]);

  const invoicePaymentDetails = useMemo(() => {
    if (!invoice?.notes) return { method: "cash", split: null };
    try {
      const parsed = JSON.parse(invoice.notes);
      return {
        method: parsed.paymentMethod || "cash",
        split: parsed.paymentSplit || null
      };
    } catch {
      return { method: "cash", split: null };
    }
  }, [invoice]);

  const handlePrint = () => {
    window.print();
  };

  // Keypad display values
  const balance = Math.max(0, calculations.gross_amount - (Number(amountReceived) || 0));
  const changeDue = Math.max(0, (Number(amountReceived) || 0) - calculations.gross_amount);

  // Generate verification QR code URL (public API)
  const qrUrl = invoice
    ? `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/app/sales/${invoice.id}`)}`
    : "";

  return (
    <div className="p-4 max-w-[1600px] mx-auto space-y-4 print:p-0 print:m-0 print:bg-white print:text-black">
      {/* Printable Receipt Sheet - Hidden on POS UI screen */}
      {invoice && (
        <div className="hidden print:block font-mono text-[10px] w-[76mm] max-w-full mx-auto p-2 border border-dashed border-gray-400">
          <div className="text-center font-bold text-sm mb-1 uppercase">Gunatilake Batiks</div>
          <div className="text-center text-[8px] mb-3">
            {invoice.branches?.name}<br />
            {invoice.branches?.address || "Sri Lanka"}<br />
            TEL: +94 11 234 5678
          </div>
          <div className="border-b border-dashed pb-1.5 mb-2 space-y-0.5">
            <div>INVOICE: {invoice.invoice_number}</div>
            <div>DATE: {new Date(invoice.sale_date).toLocaleString()}</div>
            <div>CASHIER: {profile?.full_name || "Staff"}</div>
            {invoice.customer_name && <div>CUSTOMER: {invoice.customer_name}</div>}
          </div>
          <table className="w-full text-left mb-2 text-[9px]">
            <thead>
              <tr className="border-b border-dashed">
                <th className="pb-1">Description</th>
                <th className="text-center pb-1">Qty</th>
                <th className="text-right pb-1">Price</th>
                <th className="text-right pb-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.sale_items?.map((item: any) => (
                <tr key={item.id}>
                  <td className="py-1 truncate max-w-[32mm]">{item.description}</td>
                  <td className="text-center py-1">{Number(item.quantity)}</td>
                  <td className="text-right py-1">{formatMoney(Number(item.unit_price))}</td>
                  <td className="text-right py-1">{formatMoney(Number(item.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-dashed pt-1.5 space-y-0.5 mb-3 text-[9px]">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(Number(invoice.subtotal))}</span>
            </div>
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount:</span>
                <span>-{formatMoney(Number(invoice.discount))}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>VAT ({invoice.vat_rate}%):</span>
              <span>{formatMoney(Number(invoice.vat_amount))}</span>
            </div>
            <div className="flex justify-between font-bold text-sm border-t border-dashed pt-1">
              <span>GROSS TOTAL:</span>
              <span>{formatMoney(Number(invoice.gross_amount))}</span>
            </div>
          </div>
          <div className="border-t border-dashed pt-1.5 text-[8px] space-y-1 mb-4">
            <div className="flex justify-between">
              <span>Payment Type:</span>
              <span className="uppercase font-semibold">{invoicePaymentDetails.method}</span>
            </div>
            {invoicePaymentDetails.split && (
              <div className="pl-2 space-y-0.5 text-[7px] text-gray-600">
                <div className="flex justify-between">
                  <span>- Cash Split:</span>
                  <span>{formatMoney(invoicePaymentDetails.split.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span>- Card Split:</span>
                  <span>{formatMoney(invoicePaymentDetails.split.card)}</span>
                </div>
              </div>
            )}
            <div className="border-t border-dashed pt-1 mt-1 text-center font-bold">DIGITAL LEDGER STAMP</div>
            {invoice.agents && <div>Agent Ref: {invoice.agents.company_name}</div>}
            {invoice.drivers && <div>Driver Ref: {invoice.drivers.full_name}</div>}
            {invoiceGuideObj && <div>Guide Ref: {invoiceGuideObj.name}</div>}
            <div className="flex justify-center py-2">
              <img src={qrUrl} alt="Verify Invoice" className="size-20" />
            </div>
            <div className="text-[7px] text-center text-gray-500">Scan QR Code to verify this digital receipt ledger.</div>
            <div className="text-center font-bold text-[9px] pt-1">THANK YOU FOR YOUR VISIT!</div>
          </div>
        </div>
      )}

      {/* Touch Screen POS UI */}
      <div className="print:hidden space-y-4">
        <PageHeader
          title="Point of Sale Invoicing"
          description="High-speed touchscreen billing desk. Automatic real-time ledger accounting for agents and drivers."
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          
          {/* ======================================================== */}
          {/* LEFT PANEL: Client & Partner Registry (xl:col-span-3)   */}
          {/* ======================================================== */}
          <div className="xl:col-span-3 space-y-4">
            <Card className="p-4 space-y-4 border-border/80 shadow-md">
              <div className="border-b pb-2">
                <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                  <Receipt className="size-4 text-primary" /> Billing Context
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Define branch, customer details &amp; cashier log.</p>
              </div>

              <div className="space-y-3 text-xs">
                {/* Branch Selection */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Select Operating Branch</Label>
                  <select
                    value={selectedBranch}
                    onChange={e => setSelectedBranch(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    {branches?.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                {/* Customer name */}
                <div className="space-y-1.5">
                  <Label htmlFor="custName" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Name (Optional)</Label>
                  <Input
                    id="custName"
                    type="text"
                    placeholder="Walk-in Retail Customer"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                {/* Meta details */}
                <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2.5 rounded-lg border border-border/50 text-[10px]">
                  <div>
                    <span className="text-muted-foreground block">Invoice Preview:</span>
                    <span className="font-mono font-semibold text-primary">{activeBranchObj ? `${activeBranchObj.code}-DRAFT` : "AUTO-GEN"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Cashier Account:</span>
                    <span className="font-semibold">{profile?.full_name || "Guest Cashier"}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-4 border-border/80 shadow-md">
              <div className="border-b pb-2">
                <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                  <UserCheck className="size-4 text-accent" /> Tourism Partners
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Bind travel agents, guides, or drivers for commissions.</p>
              </div>

              <div className="space-y-3 text-xs">
                {/* Agent Dropdown */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <User className="size-3 text-primary" /> Travel Agent
                  </Label>
                  <select
                    value={selectedAgent}
                    onChange={e => setSelectedAgent(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="none">No Agent Linked (Walk-in)</option>
                    {agents?.map(a => (
                      <option key={a.id} value={a.id}>{a.company_name} ({a.default_commission_rate}%)</option>
                    ))}
                  </select>
                </div>

                {/* Driver Dropdown */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Car className="size-3 text-primary" /> Driver Profile
                  </Label>
                  <select
                    value={selectedDriver}
                    onChange={e => setSelectedDriver(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="none">No Driver Linked</option>
                    {drivers?.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name} ({d.vehicle_number} · {d.default_commission_rate}%)</option>
                    ))}
                  </select>
                </div>

                {/* Guide Dropdown (Frontend mock mapped to notes) */}
                <div className="space-y-1">
                  <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <User className="size-3 text-accent" /> Tour Guide
                  </Label>
                  <select
                    value={selectedGuide}
                    onChange={e => setSelectedGuide(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="none">No Guide Linked</option>
                    {MOCK_GUIDES.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.default_commission_rate}%)</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selected partner summary cards */}
              {(selectedAgent !== "none" || selectedDriver !== "none" || selectedGuide !== "none") && (
                <div className="space-y-2 pt-2 border-t border-dashed border-border/80">
                  {activeAgentObj && (
                    <div className="flex justify-between items-center bg-primary/5 p-2 rounded-lg border border-primary/10 text-xs">
                      <div>
                        <span className="font-semibold text-primary block truncate max-w-[150px]">{activeAgentObj.company_name}</span>
                        <span className="text-[9px] text-muted-foreground">Travel Agent Partner</span>
                      </div>
                      <span className="font-bold text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded text-[10px]">
                        {activeAgentObj.default_commission_rate}%
                      </span>
                    </div>
                  )}

                  {activeDriverObj && (
                    <div className="flex justify-between items-center bg-accent/5 p-2 rounded-lg border border-accent/10 text-xs">
                      <div>
                        <span className="font-semibold text-accent block truncate max-w-[150px]">{activeDriverObj.full_name}</span>
                        <span className="text-[9px] text-muted-foreground">{activeDriverObj.vehicle_number}</span>
                      </div>
                      <span className="font-bold text-accent font-mono bg-accent/10 px-1.5 py-0.5 rounded text-[10px]">
                        {activeDriverObj.default_commission_rate}%
                      </span>
                    </div>
                  )}

                  {selectedGuideObj && (
                    <div className="flex justify-between items-center bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 text-xs">
                      <div>
                        <span className="font-semibold text-amber-600 block truncate max-w-[150px]">{selectedGuideObj.name}</span>
                        <span className="text-[9px] text-muted-foreground">Licensed Tour Guide</span>
                      </div>
                      <span className="font-bold text-amber-600 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">
                        {selectedGuideObj.default_commission_rate}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* ======================================================== */}
          {/* CENTER PANEL: Products & Cart (xl:col-span-5)           */}
          {/* ======================================================== */}
          <div className="xl:col-span-5 space-y-4 flex flex-col">
            
            {/* Search and Category filters */}
            <Card className="p-4 space-y-3 border-border/80 shadow-md">
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Tap here or scan barcode SKU (e.g. BAT-PROD-001)..."
                  className="pl-10 h-12 text-sm bg-muted/30 focus-visible:ring-primary shadow-inner"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              {/* Categories Pills */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
                {categories.map(cat => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={selectedCategory === cat ? "default" : "outline"}
                    className="rounded-full px-4 shrink-0 font-medium text-xs h-8 touch-manipulation transition-all"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Quick Add Grid */}
            <Card className="p-4 border-border/80 shadow-md flex-1 min-h-[220px]">
              <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2.5">Quick Add Catalogue</h3>
              {filteredProducts.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 text-xs">
                  No active products found matching filters.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="p-3 border rounded-xl hover:border-primary/50 hover:shadow-sm cursor-pointer transition-all bg-card/60 flex flex-col justify-between items-start text-left h-24 touch-manipulation active:scale-95 border-border/60"
                    >
                      <div className="w-full">
                        <div className="font-semibold text-xs line-clamp-2 leading-tight text-foreground">{p.name}</div>
                        <div className="text-[9px] text-muted-foreground font-mono mt-0.5">{p.sku}</div>
                      </div>
                      <div className="w-full flex justify-between items-center border-t border-border/40 pt-1 mt-1">
                        <span className="font-bold text-xs text-primary font-mono">{formatMoney(Number(p.unit_price))}</span>
                        <span className="size-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">+</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            {/* Cart Table list */}
            <Card className="p-4 border-border/80 shadow-md flex-1">
              <div className="flex justify-between items-center border-b pb-2 mb-2.5">
                <h3 className="font-semibold text-sm tracking-tight flex items-center gap-2">
                  <ShoppingCart className="size-4 text-primary" /> Shopping Basket
                </h3>
                <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                  {cart.reduce((acc, i) => acc + i.quantity, 0)} Items
                </span>
              </div>

              <div className="max-h-[300px] overflow-y-auto pr-1">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] uppercase font-bold py-1">Item</TableHead>
                      <TableHead className="text-right text-[10px] uppercase font-bold py-1">Price</TableHead>
                      <TableHead className="text-center text-[10px] uppercase font-bold py-1 w-[130px]">Qty</TableHead>
                      <TableHead className="text-right text-[10px] uppercase font-bold py-1">Total</TableHead>
                      <TableHead className="py-1 w-8"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cart.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-xs text-muted-foreground">
                          Basket is empty. Scan barcodes or tap quick-add items.
                        </TableCell>
                      </TableRow>
                    ) : (
                      cart.map(item => (
                        <TableRow key={item.id} className="hover:bg-muted/30">
                          <TableCell className="py-2.5">
                            <div className="font-medium text-xs text-foreground line-clamp-1">{item.name}</div>
                            <div className="text-[9px] text-muted-foreground font-mono">{item.sku}</div>
                          </TableCell>
                          <TableCell className="text-right py-2.5">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="text-xs font-mono text-muted-foreground hover:text-primary hover:underline flex items-center justify-end gap-1 ml-auto touch-manipulation"
                            >
                              {formatMoney(item.unit_price)}
                              <Edit2 className="size-2.5" />
                            </button>
                          </TableCell>
                          <TableCell className="text-center py-2.5">
                            <div className="flex items-center justify-center gap-1 touch-manipulation">
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-7 p-0 rounded-full border-border"
                                onClick={() => updateQuantity(item.id, -1)}
                              >
                                <Minus className="size-3" />
                              </Button>
                              <span className="text-xs font-bold w-6 font-mono text-foreground">{item.quantity}</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="size-7 p-0 rounded-full border-border"
                                onClick={() => updateQuantity(item.id, 1)}
                              >
                                <Plus className="size-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs font-mono py-2.5 text-foreground">
                            {formatMoney(item.quantity * item.unit_price)}
                          </TableCell>
                          <TableCell className="text-center py-2.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-full"
                              onClick={() => removeFromCart(item.id)}
                            >
                              <Trash className="size-3.5" />
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

          {/* ======================================================== */}
          {/* RIGHT PANEL: Live Calc & Keypad Grid (xl:col-span-4)     */}
          {/* ======================================================== */}
          <div className="xl:col-span-4 space-y-4">
            
            {/* Live calculations widget */}
            <Card className="p-4 space-y-3.5 border-border/80 shadow-md bg-gradient-to-br from-card to-muted/20">
              <div className="border-b pb-2 mb-1">
                <h3 className="font-semibold text-sm tracking-tight">Calculation Ledger</h3>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-background border border-border/60 p-2 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground">Subtotal</span>
                  <span className="font-bold font-mono text-sm text-foreground mt-0.5">{formatMoney(calculations.subtotal)}</span>
                </div>

                <div className="bg-background border border-border/60 p-2 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center justify-between">Discount <Percent className="size-2.5 text-destructive" /></span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground">LKR</span>
                    <input
                      type="number"
                      value={discount || ""}
                      placeholder="0"
                      onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                      className="w-full bg-transparent font-bold font-mono text-sm text-destructive focus:outline-none border-b border-border/30 focus:border-destructive"
                    />
                  </div>
                </div>

                <div className="bg-background border border-border/60 p-2 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground">VAT ({vatRate}%)</span>
                  <span className="font-bold font-mono text-sm mt-0.5">{formatMoney(calculations.vat_amount)}</span>
                </div>

                <div className="bg-background border border-border/60 p-2 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground">Agent Commission</span>
                  <span className="font-bold font-mono text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">{formatMoney(calculations.agent_amount)}</span>
                </div>

                <div className="bg-background border border-border/60 p-2 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground">Driver Commission</span>
                  <span className="font-bold font-mono text-sm text-amber-600 dark:text-amber-400 mt-0.5">{formatMoney(calculations.driver_amount)}</span>
                </div>

                <div className="bg-background border border-border/60 p-2 rounded-lg flex flex-col justify-between">
                  <span className="text-[10px] text-muted-foreground">Guide Commission</span>
                  <span className="font-bold font-mono text-sm text-yellow-600 dark:text-yellow-500 mt-0.5">{formatMoney(calculations.guide_amount)}</span>
                </div>
              </div>

              {/* Total Gross and Net values */}
              <div className="pt-2.5 border-t border-dashed border-border/80 flex flex-col gap-2">
                <div className="flex justify-between items-center bg-primary/10 px-3 py-2 rounded-xl border border-primary/20">
                  <span className="font-bold text-xs text-primary">GROSS COLLECTABLE</span>
                  <span className="font-extrabold text-lg text-primary font-mono">{formatMoney(calculations.gross_amount)}</span>
                </div>

                <div className="flex justify-between items-center bg-accent/10 px-3 py-1.5 rounded-xl border border-accent/20">
                  <span className="font-semibold text-[10px] text-accent-foreground uppercase tracking-wide">Net Store Revenue</span>
                  <span className="font-bold text-xs text-accent-foreground font-mono">{formatMoney(calculations.company_revenue)}</span>
                </div>
              </div>
            </Card>

            {/* Payment interface */}
            <Card className="p-4 space-y-4 border-border/80 shadow-md">
              <div className="border-b pb-2">
                <h3 className="font-semibold text-sm tracking-tight">Payment Operations</h3>
              </div>

              {/* Method Selector */}
              <div className="grid grid-cols-4 gap-1">
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`py-2 px-1 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 touch-manipulation ${
                    paymentMethod === "cash"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted border-border"
                  }`}
                >
                  <Coins className="size-4" />
                  Cash
                </button>
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`py-2 px-1 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 touch-manipulation ${
                    paymentMethod === "card"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted border-border"
                  }`}
                >
                  <CreditCard className="size-4" />
                  Card
                </button>
                <button
                  onClick={() => setPaymentMethod("bank")}
                  className={`py-2 px-1 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 touch-manipulation ${
                    paymentMethod === "bank"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted border-border"
                  }`}
                >
                  <Landmark className="size-4" />
                  Transfer
                </button>
                <button
                  onClick={handleOpenMixed}
                  className={`py-2 px-1 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 touch-manipulation ${
                    paymentMethod === "mixed"
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted border-border"
                  }`}
                >
                  <RefreshCw className="size-4" />
                  Mixed
                </button>
              </div>

              {/* Amount Display & Keypad */}
              <div className="space-y-3">
                <div className="bg-muted/40 border border-border/80 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-xs shadow-inner">
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase">Received</span>
                    <span className="font-extrabold text-sm font-mono text-primary mt-0.5">LKR {Number(amountReceived).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase">Remaining</span>
                    <span className="font-bold text-sm font-mono text-destructive mt-0.5">LKR {balance.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block uppercase">Change Due</span>
                    <span className="font-bold text-sm font-mono text-emerald-600 mt-0.5">LKR {changeDue.toLocaleString()}</span>
                  </div>
                </div>

                {/* Quick Cash Buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs font-bold touch-manipulation border-border/60 bg-muted/10"
                    disabled={paymentMethod === "card" || paymentMethod === "bank"}
                    onClick={() => handleQuickCash(1000)}
                  >
                    +1K
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs font-bold touch-manipulation border-border/60 bg-muted/10"
                    disabled={paymentMethod === "card" || paymentMethod === "bank"}
                    onClick={() => handleQuickCash(5000)}
                  >
                    +5K
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs font-bold touch-manipulation border-border/60 bg-muted/10"
                    disabled={paymentMethod === "card" || paymentMethod === "bank"}
                    onClick={() => handleQuickCash(10000)}
                  >
                    +10K
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="font-mono text-xs font-bold text-primary touch-manipulation"
                    disabled={paymentMethod === "card" || paymentMethod === "bank"}
                    onClick={() => handleQuickCash("full")}
                  >
                    Full
                  </Button>
                </div>

                {/* Touch Keypad */}
                <div className="grid grid-cols-3 gap-1.5 max-w-[280px] mx-auto">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map(btn => {
                    const isBack = btn === "⌫";
                    const isClear = btn === "C";
                    const isAction = isBack || isClear;

                    return (
                      <button
                        key={btn}
                        disabled={paymentMethod === "card" || paymentMethod === "bank"}
                        onClick={() => handleKeypadPress(btn)}
                        className={`h-11 rounded-xl text-sm font-bold font-mono transition-all border active:scale-90 touch-manipulation flex items-center justify-center ${
                          isAction
                            ? "bg-muted/80 text-muted-foreground border-border/80 hover:bg-muted"
                            : "bg-card text-foreground border-border hover:bg-muted"
                        } disabled:opacity-50`}
                      >
                        {btn}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Bottom Checkout Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button
                variant="outline"
                size="lg"
                className="h-14 font-semibold text-destructive hover:bg-destructive/10 border-destructive/20 rounded-xl"
                onClick={() => {
                  if (confirm("Reset current checkout basket?")) {
                    setCart([]);
                    setDiscount(0);
                    setCustomerName("");
                    setSelectedAgent("none");
                    setSelectedDriver("none");
                    setSelectedGuide("none");
                    setAmountReceived("0");
                  }
                }}
                disabled={cart.length === 0}
              >
                <X className="size-4 mr-2" /> Cancel Sale
              </Button>

              <Button
                size="lg"
                className="h-14 font-bold text-sm bg-gradient-to-r from-primary to-accent hover:opacity-95 shadow-lg shadow-primary/20 rounded-xl"
                disabled={cart.length === 0 || checkoutMutation.isPending || (paymentMethod === "cash" && Number(amountReceived) < calculations.gross_amount)}
                onClick={() => checkoutMutation.mutate()}
              >
                {checkoutMutation.isPending ? (
                  <span className="flex items-center gap-1.5"><RefreshCw className="size-4 animate-spin" /> Recording...</span>
                ) : (
                  <span className="flex items-center gap-1.5">Checkout Invoice <ArrowRight className="size-4" /></span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* DIALOG: Mixed payment split builder                      */}
      {/* ======================================================== */}
      <Dialog open={showMixedDialog} onOpenChange={setShowMixedDialog}>
        <DialogContent className="max-w-md print:hidden">
          <DialogHeader>
            <DialogTitle>Mixed Payment Split</DialogTitle>
            <DialogDescription>
              Divide the total bill between Cash and Card payments. Total must equal gross amount.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20 text-center text-xs">
              <span className="text-muted-foreground block font-medium">Gross Collectable Total:</span>
              <span className="font-extrabold text-lg text-primary font-mono">{formatMoney(calculations.gross_amount)}</span>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="mixedCash" className="text-xs">Cash Amount (LKR)</Label>
                <Input
                  id="mixedCash"
                  type="number"
                  placeholder="0.00"
                  value={mixedCashAmount}
                  onChange={e => setMixedCashAmount(e.target.value)}
                  className="h-11 font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mixedCard" className="text-xs">Card / Bank Transfer Amount (LKR)</Label>
                <Input
                  id="mixedCard"
                  type="number"
                  placeholder="0.00"
                  value={mixedCardAmount}
                  onChange={e => setMixedCardAmount(e.target.value)}
                  className="h-11 font-mono text-sm"
                />
              </div>

              {/* Audit validation indicator */}
              {Number(mixedCashAmount) + Number(mixedCardAmount) > 0 && (
                <div className="flex items-center gap-2 text-xs border p-2.5 rounded-lg border-border/80">
                  <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Entered Sum: <strong className="text-foreground font-mono">LKR {(Number(mixedCashAmount) + Number(mixedCardAmount)).toLocaleString()}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => { setShowMixedDialog(false); setPaymentMethod("cash"); }}>Cancel</Button>
            <Button className="w-full sm:w-auto bg-primary" onClick={confirmMixedPayment}>Confirm Split</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DIALOG: Edit line item price                             */}
      {/* ======================================================== */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="max-w-sm print:hidden">
          <DialogHeader>
            <DialogTitle>Edit Line Price</DialogTitle>
            <DialogDescription>
              Adjust unit price for {editingItem?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="linePrice" className="text-xs">Custom Unit Price (LKR)</Label>
            <Input
              id="linePrice"
              type="number"
              value={editPrice}
              onChange={e => setEditPrice(e.target.value)}
              className="h-11 font-mono text-sm mt-1.5"
            />
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button className="bg-primary" onClick={saveEditedItem}>Save Price</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* DIALOG: Checkout Success & Receipt Print Overlay          */}
      {/* ======================================================== */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-md print:hidden">
          <DialogHeader>
            <div className="mx-auto bg-emerald-500/10 size-14 rounded-full flex items-center justify-center text-emerald-500 mb-2.5 animate-pulse">
              <CheckCircle className="size-8" />
            </div>
            <DialogTitle className="text-center text-xl font-bold text-foreground">Sale Completed Successfully</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Transaction has been committed to the public ledger ledger securely.
            </DialogDescription>
          </DialogHeader>

          {invoice && (
            <div className="space-y-3.5">
              <div className="border rounded-xl p-4 bg-muted/20 text-xs space-y-2.5 font-sans border-border/80">
                <div className="flex justify-between border-b pb-1.5 border-border/40">
                  <span className="text-muted-foreground">Invoice Reference</span>
                  <span className="font-semibold text-primary">{invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between border-b pb-1.5 border-border/40">
                  <span className="text-muted-foreground">Collected Cash</span>
                  <span className="font-bold text-foreground font-mono">{formatMoney(Number(invoice.gross_amount))}</span>
                </div>
                {invoice.agents && (
                  <div className="flex justify-between border-b pb-1.5 border-border/40">
                    <span className="text-muted-foreground">Agent: {invoice.agents.company_name}</span>
                    <span className="font-medium text-emerald-600 font-mono">+{formatMoney(Number(invoice.agent_commission_amount))} ({invoice.agent_commission_rate}%)</span>
                  </div>
                )}
                {invoice.drivers && (
                  <div className="flex justify-between border-b pb-1.5 border-border/40">
                    <span className="text-muted-foreground">Driver: {invoice.drivers.full_name}</span>
                    <span className="font-medium text-amber-600 font-mono">+{formatMoney(Number(invoice.driver_commission_amount))} ({invoice.driver_commission_rate}%)</span>
                  </div>
                )}
                {invoiceGuideObj && (
                  <div className="flex justify-between border-b pb-1.5 border-border/40">
                    <span className="text-muted-foreground">Guide: {invoiceGuideObj.name}</span>
                    <span className="font-medium text-yellow-600 font-mono">+{formatMoney(Number(invoiceGuideObj.amount))} ({invoiceGuideObj.rate}%)</span>
                  </div>
                )}
              </div>

              {/* QR Code display */}
              <div className="flex flex-col items-center p-3 bg-card border rounded-xl border-border/80 shadow-sm max-w-[200px] mx-auto">
                <img src={qrUrl} alt="Receipt verification QR" className="size-28 border p-1 rounded bg-white" />
                <span className="text-[8px] text-muted-foreground text-center mt-1.5 max-w-[150px]">
                  Verification QR code scan to verify financial integrity.
                </span>
              </div>
            </div>
          )}

          <DialogFooter className="grid grid-cols-3 gap-2 mt-4 sm:space-x-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowReceiptDialog(false);
                if (invoice) {
                  // Direct route link to invoice details
                  window.location.href = `/app/sales/${invoice.id}`;
                }
              }}
              className="text-xs h-10 px-2"
            >
              View Ledger
            </Button>
            <Button
              variant="outline"
              onClick={handlePrint}
              className="text-xs h-10 px-2 gap-1.5"
            >
              <Printer className="size-4" /> Print Thermal
            </Button>
            <Button
              onClick={() => {
                setShowReceiptDialog(false);
                setCompletedSaleId(null);
              }}
              className="text-xs h-10 px-2 bg-primary font-bold"
            >
              New Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
