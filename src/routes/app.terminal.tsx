import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatMoney } from "@/lib/domain/commission";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Clock, Wifi, WifiOff, Trash2, CheckCircle2, 
  Printer, X, FileText, ChevronLeft, RefreshCw, Smartphone, Landmark, Receipt,
  Sun, Moon, Coins, Settings, Plus, Delete
} from "lucide-react";
import { toast } from "sonner";
import { fetchLkrRates, type ExchangeRates } from "@/utils/exchangeRates";

export const Route = createFileRoute("/app/terminal")({
  component: CashierTerminal,
});

interface OfflineTransaction {
  id: string;
  payload: any;
  mockInvoice: string;
  timestamp: string;
  subtotal: number;
  vatAmount: number;
  grossAmount: number;
  cashierName: string;
  branchName: string;
}

interface AccumulatedEntry {
  id: string;
  amount: number;
}

function CashierTerminal() {
  const { profile, roles } = useAuth();

  // Enforce Roles (Cashier, Branch Manager, Super Admin)
  if (!roles.some(r => ["super_admin", "branch_manager", "cashier"].includes(r))) {
    return <Navigate to="/app" />;
  }

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") return saved;
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === "dark" ? "light" : "dark"));
  };

  // Currency & Exchange Rates State
  const [selectedCurrency, setSelectedCurrency] = useState<string>("LKR");
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({
    LKR: 1,
    USD: 302.50,
    EUR: 328.80,
    GBP: 385.20,
    AUD: 201.10,
    INR: 3.62
  });
  const [isRatesLive, setIsRatesLive] = useState<boolean>(false);
  const [customRates, setCustomRates] = useState<ExchangeRates>({});
  const [showRateModal, setShowRateModal] = useState<boolean>(false);
  const [tempRateValue, setTempRateValue] = useState<string>("");

  // Fetch Exchange Rates on Mount
  useEffect(() => {
    async function loadRates() {
      const result = await fetchLkrRates();
      setExchangeRates(result.rates);
      setIsRatesLive(result.isLive);
    }
    loadRates();
  }, []);

  const activeRate = useMemo(() => {
    if (selectedCurrency === "LKR") return 1;
    return customRates[selectedCurrency] || exchangeRates[selectedCurrency] || 1;
  }, [selectedCurrency, customRates, exchangeRates]);

  // Settings Overrides State
  const [customVatRate, setCustomVatRate] = useState<number | null>(null);
  const [customBranchId, setCustomBranchId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [tempVatRate, setTempVatRate] = useState<string>("");

  // Keypad & Accumulator State
  const [currentEntry, setCurrentEntry] = useState<string>("0");
  const [accumulatedEntries, setAccumulatedEntries] = useState<AccumulatedEntry[]>([]);
  const [customerName, setCustomerName] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");

  // Connection & Offline Queue
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineTransaction[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Clock
  const [currentTime, setCurrentTime] = useState<string>("");

  // Success dialog
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{
    invoiceNumber: string;
    subtotal: number;
    vatAmount: number;
    grossAmount: number;
    isOffline: boolean;
    saleId?: string;
    currency?: string;
    foreignAmount?: number;
    exchangeRate?: number;
  } | null>(null);

  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Sync clock
  useEffect(() => {
    const tick = () => {
      setCurrentTime(new Date().toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync isOnline status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const savedQueue = localStorage.getItem("tourism_os_offline_queue");
    if (savedQueue) setOfflineQueue(JSON.parse(savedQueue));

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Fetch branches
  const { data: branches } = useQuery({
    queryKey: ["terminal-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*");
      if (error) throw error;
      return data;
    }
  });

  const activeBranchObj = useMemo(() => {
    if (!branches || branches.length === 0) return null;
    const targetBranchId = customBranchId || profile?.branch_id;
    return branches.find(b => b.id === targetBranchId) || branches[0];
  }, [branches, profile, customBranchId]);

  // Keypad actions
  const handleKeyPress = (val: string) => {
    if (val === "C") {
      setCurrentEntry("0");
    } else if (val === "Backspace") {
      if (currentEntry.length <= 1) {
        setCurrentEntry("0");
      } else {
        setCurrentEntry(currentEntry.slice(0, -1));
      }
    } else if (val === "00") {
      if (currentEntry === "0") return;
      setCurrentEntry(currentEntry + "00");
    } else if (val === "+") {
      // Accumulate current entry into running total list
      const numVal = Number(currentEntry) || 0;
      if (numVal > 0) {
        setAccumulatedEntries(prev => [...prev, { id: Math.random().toString(36).substring(2, 9), amount: numVal }]);
        setCurrentEntry("0");
        toast.success(`Added ${formatMoney(numVal, selectedCurrency)} to bill`);
      }
    } else {
      // Numbers 0-9
      if (currentEntry === "0") {
        if (val !== "0") setCurrentEntry(val);
      } else {
        if (currentEntry.length < 9) {
          setCurrentEntry(currentEntry + val);
        }
      }
    }
  };

  // Keyboard support listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSuccess) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return; // Ignore key capture when user is typing in inputs
      }

      if (e.key >= "0" && e.key <= "9") {
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        handleKeyPress("Backspace");
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        handleKeyPress("C");
      } else if (e.key === "+") {
        e.preventDefault();
        handleKeyPress("+");
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleRecordSale();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentEntry, accumulatedEntries, selectedCurrency, isOnline, offlineQueue, activeBranchObj]);

  const handleQuickAdd = (value: number) => {
    const current = Number(currentEntry) || 0;
    setCurrentEntry(String(current + value));
  };

  const removeAccumulatedEntry = (id: string) => {
    setAccumulatedEntries(prev => prev.filter(item => item.id !== id));
    toast.info("Item removed from bill");
  };

  // Calculations
  const vatRate = customVatRate !== null ? customVatRate : (activeBranchObj?.vat_rate ?? 18.00);

  // Total in selected currency
  const selectedCurrencySubtotal = useMemo(() => {
    const accum = accumulatedEntries.reduce((sum, item) => sum + item.amount, 0);
    return accum + (Number(currentEntry) || 0);
  }, [accumulatedEntries, currentEntry]);

  // Convert to LKR base
  const lkrSubtotal = useMemo(() => {
    if (selectedCurrency === "LKR") return selectedCurrencySubtotal;
    return Number((selectedCurrencySubtotal * activeRate).toFixed(2));
  }, [selectedCurrencySubtotal, selectedCurrency, activeRate]);

  const vatAmount = useMemo(() => {
    return Math.round((lkrSubtotal * vatRate / 100) * 100) / 100;
  }, [lkrSubtotal, vatRate]);

  const grossAmount = useMemo(() => {
    return lkrSubtotal + vatAmount;
  }, [lkrSubtotal, vatAmount]);

  const resetTerminal = () => {
    setCurrentEntry("0");
    setAccumulatedEntries([]);
    setCustomerName("");
    setPaymentMethod("cash");
  };

  // Record Sale Action
  const handleRecordSale = async () => {
    const totalToBill = lkrSubtotal;
    if (totalToBill <= 0) {
      toast.error("Please enter a valid amount before checking out");
      return;
    }
    if (!activeBranchObj) {
      toast.error("Active branch context not found");
      return;
    }

    // Build itemized list of all accumulated entries + any remaining current entry
    const finalEntries = [...accumulatedEntries];
    const finalCurrent = Number(currentEntry) || 0;
    if (finalCurrent > 0) {
      finalEntries.push({ id: "final", amount: finalCurrent });
    }

    const payload = {
      branch_id: activeBranchObj.id,
      agent_id: null,
      driver_id: null,
      customer_name: customerName.trim() || null,
      discount: 0,
      notes: `Retail Touch checkout via Cashier Terminal (${paymentMethod.toUpperCase()})` + 
        (selectedCurrency !== "LKR" ? ` (Paid ${selectedCurrencySubtotal} ${selectedCurrency} @ rate ${activeRate} LKR)` : "") +
        (isOnline ? "" : " (Offline Buffer)"),
      items: finalEntries.map((entry, idx) => ({
        product_id: null,
        description: `Batik touch item #${idx + 1}` + (selectedCurrency !== "LKR" ? ` (${entry.amount} ${selectedCurrency})` : ""),
        quantity: 1,
        unit_price: selectedCurrency === "LKR" ? entry.amount : Number((entry.amount * activeRate).toFixed(2))
      }))
    };

    if (!isOnline) {
      // Offline mode
      const yyyymm = new Date().toISOString().slice(0, 7).replace("-", "");
      const mockInvoice = `${activeBranchObj.code || "MAIN"}-${yyyymm}-OFFLINE-${Math.floor(10000 + Math.random() * 90000)}`;
      
      const offlineItem: OfflineTransaction = {
        id: Math.random().toString(36).substring(2, 11),
        payload,
        mockInvoice,
        timestamp: new Date().toISOString(),
        subtotal: lkrSubtotal,
        vatAmount,
        grossAmount,
        cashierName: profile?.full_name || "Cashier Staff",
        branchName: activeBranchObj.name
      };

      const newQueue = [...offlineQueue, offlineItem];
      setOfflineQueue(newQueue);
      localStorage.setItem("tourism_os_offline_queue", JSON.stringify(newQueue));

      setSuccessData({
        invoiceNumber: mockInvoice,
        subtotal: lkrSubtotal,
        vatAmount,
        grossAmount,
        isOffline: true,
        currency: selectedCurrency,
        foreignAmount: selectedCurrencySubtotal,
        exchangeRate: activeRate
      });
      setShowSuccess(true);
      toast.warning("Saved to local offline database. It will sync automatically.");
      resetTerminal();
    } else {
      // Online mode
      setCheckoutBusy(true);
      try {
        const { data: saleId, error } = await supabase.rpc("create_sale", { payload: payload as any });
        if (error) throw error;

        const { data: saleDetails, error: loadErr } = await supabase
          .from("sales")
          .select("invoice_number")
          .eq("id", saleId)
          .single();
        
        if (loadErr) throw loadErr;

        setSuccessData({
          invoiceNumber: saleDetails.invoice_number,
          subtotal: lkrSubtotal,
          vatAmount,
          grossAmount,
          isOffline: false,
          saleId,
          currency: selectedCurrency,
          foreignAmount: selectedCurrencySubtotal,
          exchangeRate: activeRate
        });
        setShowSuccess(true);
        toast.success("Transaction recorded and sent to Commission Analytics Queue!");
        resetTerminal();
      } catch (err: any) {
        toast.error(err.message || "Failed to commit sale. Please try again.");
      } finally {
        setCheckoutBusy(false);
      }
    }
  };

  // Sync Offline Queue
  const handleSyncOffline = async () => {
    if (!isOnline || offlineQueue.length === 0 || isSyncing) return;
    setIsSyncing(true);
    toast.loading(`Syncing ${offlineQueue.length} offline transactions...`, { id: "sync-toast" });

    let remainingQueue = [...offlineQueue];
    let syncedCount = 0;
    let failedCount = 0;

    for (const item of offlineQueue) {
      try {
        const { error } = await supabase.rpc("create_sale", { payload: item.payload as any });
        if (error) throw error;
        
        remainingQueue = remainingQueue.filter(q => q.id !== item.id);
        syncedCount++;
      } catch (err) {
        console.error("Failed syncing transaction:", item, err);
        failedCount++;
      }
    }

    setOfflineQueue(remainingQueue);
    localStorage.setItem("tourism_os_offline_queue", JSON.stringify(remainingQueue));
    setIsSyncing(false);

    if (failedCount > 0) {
      toast.error(`Sync completed with errors. Synced: ${syncedCount}, Failed: ${failedCount}`, { id: "sync-toast" });
    } else {
      toast.success(`Successfully synced all ${syncedCount} transactions!`, { id: "sync-toast" });
    }
  };

  // Auto-sync effect on network return
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      handleSyncOffline();
    }
  }, [isOnline]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden font-display select-none">
      
      {/* ─── INVISIBLE PRINT AREA FOR THERMAL RECEIPTS ─── */}
      <div className="hidden print:block w-[80mm] p-4 bg-white text-black text-xs font-mono">
        <div className="text-center font-bold text-base mb-1">GUNATILAKE BATIKS</div>
        <div className="text-center text-[10px] mb-3">
          {activeBranchObj?.name || "Main Showroom"}<br />
          {activeBranchObj?.address || "Sri Lanka"}<br />
          TEL: +94 11 234 5678
        </div>
        <div className="border-b border-dashed border-black pb-2 mb-2">
          {successData && <div>INVOICE: {successData.invoiceNumber}</div>}
          <div>DATE: {new Date().toLocaleString()}</div>
          <div>CASHIER: {profile?.full_name || "Staff"}</div>
          {customerName && <div>CUSTOMER: {customerName}</div>}
          <div className="uppercase">PAYMENT: {paymentMethod}</div>
        </div>
        
        <div className="text-[10px] font-bold pb-1 border-b border-dashed border-black">Bill Items</div>
        <table className="w-full text-left mb-2 text-[10px]">
          <tbody>
            {accumulatedEntries.map((item, idx) => (
              <tr key={item.id}>
                <td className="py-1">Batik item #{idx + 1}</td>
                <td className="text-right py-1">{formatMoney(item.amount, selectedCurrency)}</td>
              </tr>
            ))}
            {Number(currentEntry) > 0 && (
              <tr>
                <td className="py-1">Batik item #{accumulatedEntries.length + 1}</td>
                <td className="text-right py-1">{formatMoney(Number(currentEntry), selectedCurrency)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="border-t border-dashed border-black pt-2 space-y-1 mb-3 text-[10px]">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatMoney(lkrSubtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>VAT ({vatRate}%):</span>
            <span>{formatMoney(vatAmount)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm border-t border-dashed border-black pt-1">
            <span>GROSS TOTAL:</span>
            <span>{formatMoney(grossAmount)}</span>
          </div>
          {selectedCurrency !== "LKR" && successData && (
            <div className="flex justify-between text-[8px] italic text-gray-700">
              <span>Paid in {selectedCurrency}:</span>
              <span>{selectedCurrency} {successData.foreignAmount?.toFixed(2)}</span>
            </div>
          )}
        </div>
        <div className="border-t border-dashed border-black pt-2 text-[8px] text-center text-gray-500">
          <div>Receipt issued by Touch Billing Terminal.</div>
          <div className="mt-2 font-bold text-[9px] text-black">Thank you for visiting us!</div>
        </div>
      </div>

      {/* ─── WEB TERMINAL UI (HIDDEN ON PRINT) ─── */}
      <div className="print:hidden flex-1 flex flex-col min-h-0">
        
        {/* HEADER / TOP SECTION */}
        <header className="h-16 px-6 bg-card border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Link to="/app" className="flex items-center text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="size-5 mr-1" />
              <span className="text-sm font-semibold tracking-tight">Main System</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Smartphone className="size-5 text-indigo-400" />
              <h1 className="font-extrabold text-base tracking-tight bg-gradient-to-r from-indigo-400 to-sky-400 bg-clip-text text-transparent">
                Cashier Touch Terminal
              </h1>
            </div>
            {offlineQueue.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs font-semibold px-2 animate-pulse gap-1"
                onClick={handleSyncOffline}
                disabled={!isOnline || isSyncing}
              >
                <RefreshCw className={`size-3 ${isSyncing ? "animate-spin" : ""}`} />
                {offlineQueue.length} Pending Sync
              </Button>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-muted-foreground font-semibold">{activeBranchObj?.name || "—"}</div>
              <div className="text-[10px] text-muted-foreground/70 font-medium">Cashier: {profile?.full_name || "—"}</div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-lg border border-border bg-background/50 hover:bg-muted shrink-0"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-indigo-500" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setTempVatRate(String(vatRate));
                setShowSettingsModal(true);
              }}
              className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-lg border border-border bg-background/50 hover:bg-muted shrink-0"
              title="Terminal Settings"
            >
              <Settings className="size-4 text-indigo-500 dark:text-indigo-400" />
            </Button>

            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-background px-3 py-1.5 rounded-lg border border-border">
              <Clock className="size-3.5 text-muted-foreground/75" />
              {currentTime}
            </div>

            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isOnline 
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            }`}>
              {isOnline ? (
                <>
                  <Wifi className="size-3.5" />
                  <span>ONLINE</span>
                </>
              ) : (
                <>
                  <WifiOff className="size-3.5" />
                  <span>OFFLINE MODE</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* MAIN TERMINAL PANELS */}
        <div className="flex-1 flex min-h-0 bg-background">
          
          {/* 1. LEFT PANEL: RECEIPT TAPE / RUNNING TOTALS */}
          <aside className="w-80 border-r border-border bg-card/50 flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-border shrink-0 flex items-center justify-between">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="size-4 text-indigo-400" />
                Receipt Tape
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-background border border-border rounded text-muted-foreground">
                {accumulatedEntries.length + (Number(currentEntry) > 0 ? 1 : 0)} items
              </span>
            </div>

            {/* Scrollable list of items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {accumulatedEntries.length === 0 && Number(currentEntry) === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                  <Receipt className="size-10 text-muted-foreground/30 mb-2 stroke-[1.5]" />
                  <p className="text-xs font-medium">Register is empty</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1 leading-normal">Enter amounts on the keypad and tap "+" to build the transaction.</p>
                </div>
              ) : (
                <>
                  {accumulatedEntries.map((item, idx) => (
                    <div 
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border hover:border-destructive/30 transition-all group"
                    >
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Item #{idx + 1}</div>
                        <div className="text-xs font-bold font-mono">{formatMoney(item.amount, selectedCurrency)}</div>
                      </div>
                      <button
                        onClick={() => removeAccumulatedEntry(item.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Remove entry"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}

                  {Number(currentEntry) > 0 && (
                    <div className="p-2.5 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 border-dashed animate-pulse">
                      <div className="text-[10px] uppercase font-bold text-indigo-500 dark:text-indigo-400">Current Entry</div>
                      <div className="text-xs font-bold font-mono text-indigo-600 dark:text-indigo-400">
                        {formatMoney(Number(currentEntry), selectedCurrency)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Optional Customer Name & Payment Method selectors */}
            <div className="p-4 border-t border-border bg-card shrink-0 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customer" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Name (Optional)</Label>
                <Input 
                  id="customer"
                  placeholder="Enter name..."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="bg-background border-input text-foreground text-xs rounded-lg h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Method</Label>
                <div className="grid grid-cols-3 gap-1">
                  {["cash", "card", "qr"].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-1.5 rounded-lg text-[10px] font-extrabold uppercase border tracking-wider transition-all ${
                        paymentMethod === method
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* 2. CENTER PANEL: KEYPAD & DISPLAY */}
          <main className="flex-1 bg-background flex flex-col min-w-0 min-h-0">
            
            {/* Display container */}
            <div className="p-6 pb-2 shrink-0 space-y-3">
              {/* Currency Selector Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border p-2 rounded-2xl">
                <div className="flex items-center gap-1.5 pl-2">
                  <Coins className="size-4 text-primary shrink-0" />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Currency</span>
                </div>
                
                <div className="flex gap-1">
                  {[
                    { code: "LKR", flag: "🇱🇰" },
                    { code: "USD", flag: "🇺🇸" },
                    { code: "EUR", flag: "🇪🇺" },
                    { code: "GBP", flag: "🇬🇧" },
                    { code: "AUD", flag: "🇦🇺" },
                    { code: "INR", flag: "🇮🇳" }
                  ].map(cur => (
                    <button
                      key={cur.code}
                      onClick={() => {
                        setSelectedCurrency(cur.code);
                        setCurrentEntry("0");
                        setAccumulatedEntries([]);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all ${
                        selectedCurrency === cur.code
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      }`}
                    >
                      <span>{cur.flag}</span>
                      <span>{cur.code}</span>
                    </button>
                  ))}
                </div>

                {selectedCurrency !== "LKR" && (
                  <button
                    onClick={() => {
                      setTempRateValue(String(activeRate));
                      setShowRateModal(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-mono font-bold bg-muted hover:bg-muted/80 text-muted-foreground border border-border transition-colors ml-auto mr-1"
                    title="Click to edit exchange rate"
                  >
                    <span>1 {selectedCurrency} = {activeRate.toFixed(2)} LKR</span>
                    <Settings className="size-3 text-muted-foreground/60 ml-1" />
                  </button>
                )}
              </div>

              {/* Amount Display Board */}
              <div className="w-full p-4 bg-card border border-border rounded-2xl flex items-center justify-between h-28 relative">
                <div className="flex flex-col justify-between h-full">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Keypad Entry ({selectedCurrency})
                  </span>
                  {selectedCurrency !== "LKR" && (
                    <span className="text-[9px] font-semibold text-muted-foreground/75 uppercase tracking-wide">
                      Rate: {activeRate.toFixed(2)} LKR
                    </span>
                  )}
                </div>

                <div className="text-right flex flex-col justify-center">
                  <div className="font-mono text-3xl md:text-4xl font-extrabold text-primary tracking-tight select-all">
                    {selectedCurrency === "LKR" ? "Rs " : `${selectedCurrency} `}
                    {Number(currentEntry).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                  {selectedCurrency !== "LKR" && (
                    <div className="text-xs md:text-sm font-semibold text-muted-foreground font-mono mt-0.5">
                      ≈ LKR {Number((Number(currentEntry) * activeRate).toFixed(2)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Layout Grid for Keypad + Multipliers */}
            <div className="flex-1 p-6 pt-2 grid grid-cols-4 gap-6 min-h-0">
              
              {/* Keypad Grid (3/4 Columns) */}
              <div className="col-span-3 grid grid-cols-4 gap-3">
                {/* 14 Keypad buttons */}
                {[
                  { key: "7", label: "7" },
                  { key: "8", label: "8" },
                  { key: "9", label: "9" },
                  { key: "Backspace", label: "Backspace", icon: Delete, variant: "secondary" },
                  
                  { key: "4", label: "4" },
                  { key: "5", label: "5" },
                  { key: "6", label: "6" },
                  { key: "00", label: "00" },
                  
                  { key: "1", label: "1" },
                  { key: "2", label: "2" },
                  { key: "3", label: "3" },
                  { key: "C", label: "Clear", variant: "destructive" },
                  
                  { key: "0", label: "0" },
                  { key: "+", label: "Add (+)", icon: Plus, variant: "primary", span: 3 }
                ].map(btn => (
                  <Button
                    key={btn.key}
                    onClick={() => handleKeyPress(btn.key)}
                    variant={
                      btn.variant === "destructive" ? "destructive" :
                      btn.variant === "primary" ? "default" : "secondary"
                    }
                    className={`h-full rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center ${
                      btn.span ? `col-span-${btn.span}` : ""
                    } ${
                      btn.variant === "primary"
                        ? "bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-2xl"
                        : btn.variant === "destructive"
                        ? "bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive/20 text-xs font-bold uppercase tracking-widest"
                        : "bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border text-2xl font-bold"
                    }`}
                  >
                    {btn.icon ? (
                      <btn.icon className="size-6" />
                    ) : (
                      btn.label
                    )}
                  </Button>
                ))}
              </div>

              {/* Multiplier buttons (1 Column) */}
              <div className="col-span-1 flex flex-col gap-3">
                {[1000, 5000, 10000, 25000, 50000, 100000].map(val => (
                  <Button
                    key={val}
                    onClick={() => handleQuickAdd(val)}
                    variant="outline"
                    className="flex-1 flex flex-col justify-center items-center rounded-xl bg-card/40 border-border hover:border-primary/50 hover:bg-card text-muted-foreground font-mono active:scale-[0.98]"
                  >
                    <span className="text-[9px] uppercase font-bold tracking-widest text-muted-foreground/80">+ Add</span>
                    <span className="text-xs md:text-sm font-extrabold text-primary">
                      {val.toLocaleString()}
                    </span>
                  </Button>
                ))}
              </div>

            </div>
          </main>

          {/* 3. RIGHT PANEL: SALES LEDGER SUMMARY */}
          <aside className="w-80 border-l border-border bg-card/50 flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-border shrink-0">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="size-4 text-indigo-400" />
                Ledger Summary
              </h2>
            </div>

            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                
                {/* Ledger preview lines */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">Subtotal</span>
                      {selectedCurrency !== "LKR" && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono">
                          {selectedCurrency} {selectedCurrencySubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold text-foreground">{formatMoney(lkrSubtotal)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">VAT Amount</span>
                      <span className="text-[9px] text-muted-foreground/80 font-bold uppercase block">Rate: {vatRate}%</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-foreground">{formatMoney(vatAmount)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Card className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/10">
                    <div className="text-[9px] uppercase tracking-wider font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                      Cashier Workflow Note
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Pressing <strong>Record Sale</strong> submits the transaction to the database. All commission rules, travel agent credits, and driver splits are processed securely downstream by Commission Analytics.
                    </p>
                  </Card>
                </div>
              </div>

              {/* Total display card */}
              <div className="mt-6 pt-4 border-t border-border/80 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground block">Gross Total</span>
                    {selectedCurrency !== "LKR" && (
                      <span className="text-[10px] font-mono font-semibold text-muted-foreground mt-0.5 block">
                        ≈ {selectedCurrency} {(grossAmount / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <span className="text-2xl font-mono font-extrabold text-primary">
                    {formatMoney(grossAmount)}
                  </span>
                </div>
              </div>
            </div>
          </aside>

        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <footer className="h-20 bg-card border-t border-border px-6 flex items-center justify-between shrink-0">
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="px-6 h-12 text-muted-foreground hover:text-foreground hover:bg-muted text-sm font-bold rounded-xl"
              onClick={resetTerminal}
            >
              Clear
            </Button>
            <Button
              asChild
              variant="outline"
              className="px-6 h-12 border-border hover:bg-muted text-foreground text-sm font-bold rounded-xl"
            >
              <Link to="/app">Cancel</Link>
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="px-6 h-12 bg-muted text-foreground border border-border hover:bg-accent hover:text-accent-foreground text-sm font-bold rounded-xl gap-2 active:scale-95"
              onClick={handlePrint}
            >
              <Printer className="size-4" />
              Print Receipt
            </Button>

            <Button
              className="px-10 h-12 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-extrabold rounded-xl gap-2 shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
              onClick={handleRecordSale}
              disabled={checkoutBusy}
            >
              {checkoutBusy ? (
                <span>Recording...</span>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  Record Sale
                </>
              )}
            </Button>
          </div>
        </footer>

      </div>

      {/* ─── SUCCESS MODAL OVERLAY ─── */}
      <Dialog open={showSuccess} onOpenChange={setShowSuccess}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground p-6 rounded-2xl">
          <DialogHeader className="text-center">
            <div className="mx-auto flex items-center justify-center size-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-3 border border-emerald-500/20">
              <CheckCircle2 className="size-6 animate-bounce" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              {successData?.isOffline ? "Saved Offline" : "Transaction Recorded"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {successData?.isOffline 
                ? "This transaction has been successfully queued in LocalStorage. It will sync automatically as soon as internet connection is restored."
                : "The bill has been created successfully and pushed to the Commission Analytics queue."}
            </DialogDescription>
          </DialogHeader>

          {successData && (
            <div className="mt-4 p-4 rounded-xl bg-background border border-border divide-y divide-border/40 text-xs font-mono space-y-2.5">
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Invoice Number:</span>
                <span className="font-bold text-foreground">{successData.invoiceNumber}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">Subtotal:</span>
                <span className="font-bold text-foreground">{formatMoney(successData.subtotal)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">VAT Amount:</span>
                <span className="font-bold text-foreground">{formatMoney(successData.vatAmount)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">Gross Paid (LKR):</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatMoney(successData.grossAmount)}</span>
              </div>
              {successData.currency && successData.currency !== "LKR" && (
                <>
                  <div className="flex justify-between pt-2">
                    <span className="text-muted-foreground">Paid Currency:</span>
                    <span className="font-bold text-amber-500 uppercase">{successData.currency}</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-muted-foreground">Paid Amount:</span>
                    <span className="font-bold text-foreground">
                      {successData.currency} {successData.foreignAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="mt-6 flex sm:justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="bg-background border-border hover:bg-muted text-foreground text-xs h-10 rounded-xl"
                onClick={handlePrint}
              >
                <Printer className="size-3.5 mr-1" />
                Print Receipt
              </Button>
            </div>

            <Button
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-10 px-5 rounded-xl shadow-md font-bold"
              onClick={() => {
                setShowSuccess(false);
                setSuccessData(null);
              }}
            >
              Next Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── EXCHANGE RATE OVERRIDE MODAL ─── */}
      <Dialog open={showRateModal} onOpenChange={setShowRateModal}>
        <DialogContent className="sm:max-w-sm bg-card border-border text-foreground p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Settings className="size-5 text-primary" />
              Adjust Exchange Rate
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Manually override the exchange rate for {selectedCurrency} payments.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-rate" className="text-xs font-semibold text-muted-foreground">
                Exchange Rate (LKR per 1 {selectedCurrency})
              </Label>
              <div className="relative">
                <Input
                  id="custom-rate"
                  type="number"
                  step="0.01"
                  value={tempRateValue}
                  onChange={e => setTempRateValue(e.target.value)}
                  placeholder={exchangeRates[selectedCurrency]?.toFixed(2) || "300.00"}
                  className="bg-background border-input text-foreground text-sm rounded-xl pl-3 pr-12 font-mono"
                />
                <div className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">
                  LKR
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-xs h-10 rounded-xl"
              onClick={() => {
                const updatedRates = { ...customRates };
                delete updatedRates[selectedCurrency];
                setCustomRates(updatedRates);
                setShowRateModal(false);
                toast.success(`Reset ${selectedCurrency} rate to standard`);
              }}
            >
              Reset to Standard
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-10 rounded-xl font-bold"
              onClick={() => {
                const numVal = Number(tempRateValue);
                if (isNaN(numVal) || numVal <= 0) {
                  toast.error("Please enter a valid rate");
                  return;
                }
                setCustomRates(prev => ({
                  ...prev,
                  [selectedCurrency]: numVal
                }));
                setShowRateModal(false);
                toast.success(`Exchange rate set: 1 ${selectedCurrency} = ${numVal.toFixed(2)} LKR`);
              }}
            >
              Apply Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── TERMINAL SETTINGS OVERRIDES MODAL ─── */}
      <Dialog open={showSettingsModal} onOpenChange={setShowSettingsModal}>
        <DialogContent className="sm:max-w-md bg-card border-border text-foreground p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Settings className="size-5 text-primary" />
              Terminal Settings Override
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Configure session-level overrides for cashier transactions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4 divide-y divide-border/40">
            {/* Showroom context switcher */}
            <div className="space-y-2 pb-4">
              <Label className="text-xs font-semibold text-muted-foreground">Active Showroom / Branch</Label>
              <select
                value={customBranchId || profile?.branch_id || ""}
                onChange={e => {
                  setCustomBranchId(e.target.value || null);
                }}
                className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {branches?.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground/80 leading-normal">
                Cashier profile default: <span className="font-semibold">{branches?.find(b => b.id === profile?.branch_id)?.name || "Not assigned"}</span>
              </p>
            </div>

            {/* Local VAT rate overrides */}
            <div className="space-y-2 pt-4">
              <Label htmlFor="custom-vat" className="text-xs font-semibold text-muted-foreground">Local VAT Rate (%)</Label>
              <div className="relative">
                <Input
                  id="custom-vat"
                  type="number"
                  step="0.01"
                  value={tempVatRate}
                  onChange={e => setTempVatRate(e.target.value)}
                  placeholder={activeBranchObj?.vat_rate?.toFixed(2) || "18.00"}
                  className="bg-background border-input text-foreground text-sm rounded-xl pl-3 pr-12 font-mono"
                />
                <div className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">%</div>
              </div>
            </div>

            {/* Offline sync details */}
            <div className="space-y-2 pt-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-muted-foreground">Offline Buffer Queue</span>
                <span className="font-mono text-muted-foreground font-bold">{offlineQueue.length} bills</span>
              </div>
              {offlineQueue.length > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    handleSyncOffline();
                    setShowSettingsModal(false);
                  }}
                  className="w-full text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-9 font-bold"
                  disabled={!isOnline || isSyncing}
                >
                  <RefreshCw className="size-3.5 mr-1 animate-spin" />
                  Sync Buffer Database
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-xs h-10 rounded-xl"
              onClick={() => {
                setCustomVatRate(null);
                setCustomBranchId(null);
                setTempVatRate("");
                setShowSettingsModal(false);
                toast.success("Restored standard branch configurations");
              }}
            >
              Reset Defaults
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-10 rounded-xl font-bold"
              onClick={() => {
                const numVal = Number(tempVatRate);
                if (tempVatRate !== "" && (isNaN(numVal) || numVal < 0 || numVal > 100)) {
                  toast.error("Please enter a valid VAT rate between 0 and 100");
                  return;
                }
                setCustomVatRate(tempVatRate !== "" ? numVal : null);
                setShowSettingsModal(false);
                toast.success("Terminal overrides applied!");
              }}
            >
              Apply Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
