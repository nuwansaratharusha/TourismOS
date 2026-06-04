import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { calculateSale, formatMoney } from "@/lib/domain/commission";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Clock, Wifi, WifiOff, Search, Star, Trash2, CheckCircle2, 
  Printer, X, FileText, ChevronLeft, RefreshCw, Smartphone, Landmark, Receipt, Sparkles, User, Car,
  Sun, Moon, Coins, Settings, DollarSign
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
  calcResult: any;
  cashierName: string;
  branchName: string;
}

function CashierTerminal() {
  const { profile, roles } = useAuth();

  // Enforce Roles
  if (!roles.some(r => ["super_admin", "branch_manager", "cashier"].includes(r))) {
    return <Navigate to="/app" />;
  }

  // Theme state and toggle synchronization
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

  // Resolve current active rate (custom override or official rate)
  const activeRate = useMemo(() => {
    if (selectedCurrency === "LKR") return 1;
    return customRates[selectedCurrency] || exchangeRates[selectedCurrency] || 1;
  }, [selectedCurrency, customRates, exchangeRates]);

  // Local Settings Overrides State
  const [customVatRate, setCustomVatRate] = useState<number | null>(null);
  const [customBranchId, setCustomBranchId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [tempVatRate, setTempVatRate] = useState<string>("");

  // Core Terminal State
  const [amount, setAmount] = useState<string>("0");
  const [selectedAgent, setSelectedAgent] = useState<string>("none");
  const [selectedDriver, setSelectedDriver] = useState<string>("none");
  const [customerName, setCustomerName] = useState<string>("");
  
  // Lists Cache
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  
  // Search state
  const [agentSearch, setAgentSearch] = useState("");
  const [driverSearch, setDriverSearch] = useState("");

  // Connection & Offline Queue
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineQueue, setOfflineQueue] = useState<OfflineTransaction[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Time ticker
  const [currentTime, setCurrentTime] = useState<string>("");

  // Success dialog
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{
    invoiceNumber: string;
    amount: number;
    agentCommission: number;
    driverCommission: number;
    isOffline: boolean;
    saleId?: string;
    currency?: string;
    foreignAmount?: number;
    exchangeRate?: number;
  } | null>(null);

  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // Refs for focusing & printing
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Tick clock
  useEffect(() => {
    setCurrentTime(new Date().toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }));
    const interval = setInterval(() => {
      setCurrentTime(new Date().toLocaleString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync isOnline status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial storage check
    const savedFavorites = localStorage.getItem("tourism_os_favorite_agents");
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));

    const savedRecents = localStorage.getItem("tourism_os_recent_agents");
    if (savedRecents) setRecents(JSON.parse(savedRecents));

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

  // Resolve current active branch
  const activeBranchObj = useMemo(() => {
    if (!branches || branches.length === 0) return null;
    const targetBranchId = customBranchId || profile?.branch_id;
    return branches.find(b => b.id === targetBranchId) || branches[0];
  }, [branches, profile, customBranchId]);

  // Fetch Agents
  const { data: agents } = useQuery({
    queryKey: ["terminal-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*").eq("status", "active");
      if (error) throw error;
      return data;
    }
  });

  // Fetch Drivers
  const { data: drivers } = useQuery({
    queryKey: ["terminal-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drivers").select("*").eq("status", "active");
      if (error) throw error;
      return data;
    }
  });

  // Favorites & Recents helper arrays
  const favoriteAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(a => favorites.includes(a.id));
  }, [agents, favorites]);

  const recentAgents = useMemo(() => {
    if (!agents) return [];
    return agents.filter(a => recents.includes(a.id));
  }, [agents, recents]);

  // Handle stars / favorites
  const toggleFavorite = (agentId: string) => {
    let updated;
    if (favorites.includes(agentId)) {
      updated = favorites.filter(id => id !== agentId);
    } else {
      updated = [...favorites, agentId];
    }
    setFavorites(updated);
    localStorage.setItem("tourism_os_favorite_agents", JSON.stringify(updated));
    toast.success(favorites.includes(agentId) ? "Removed from favorites" : "Added to favorites");
  };

  const addToRecentAgents = (agentId: string) => {
    let updated = [agentId, ...recents.filter(id => id !== agentId)].slice(0, 3);
    setRecents(updated);
    localStorage.setItem("tourism_os_recent_agents", JSON.stringify(updated));
  };

  // Keyboard controls keydown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showSuccess) return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return; // Ignore key capture when user is actively searching
      }

      if (e.key >= "0" && e.key <= "9") {
        handleKeyPress(e.key);
      } else if (e.key === "Backspace") {
        handleKeyPress("Backspace");
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        handleKeyPress("C");
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleRecordSale();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [amount, selectedAgent, selectedDriver, isOnline, offlineQueue, activeBranchObj]);

  // Keypad processing
  const handleKeyPress = (val: string) => {
    if (val === "C") {
      setAmount("0");
    } else if (val === "Backspace") {
      if (amount.length <= 1) {
        setAmount("0");
      } else {
        setAmount(amount.slice(0, -1));
      }
    } else if (val === "00") {
      if (amount === "0") return;
      setAmount(amount + "00");
    } else {
      // Numbers 0-9
      if (amount === "0") {
        if (val !== "0") setAmount(val);
      } else {
        // limit size to 9 digits to prevent overflow
        if (amount.length < 9) {
          setAmount(amount + val);
        }
      }
    }
  };

  const handleQuickAdd = (value: number) => {
    const current = Number(amount) || 0;
    setAmount(String(current + value));
  };

  // Resolve rates and calculate
  const activeAgentObj = useMemo(() => agents?.find(a => a.id === selectedAgent), [agents, selectedAgent]);
  const activeDriverObj = useMemo(() => drivers?.find(d => d.id === selectedDriver), [drivers, selectedDriver]);

  const vatRate = customVatRate !== null ? customVatRate : (activeBranchObj?.vat_rate ?? 18.00);
  const enteredAmount = Number(amount) || 0;

  const lkrAmount = useMemo(() => {
    if (selectedCurrency === "LKR") return enteredAmount;
    return Number((enteredAmount * activeRate).toFixed(2));
  }, [enteredAmount, selectedCurrency, activeRate]);

  const calcResult = useMemo(() => {
    return calculateSale({
      items: [{ description: "Quick Touch Sale", quantity: 1, unit_price: lkrAmount }],
      vat_rate: vatRate,
      agent_rate: activeAgentObj?.default_commission_rate ?? 0,
      driver_rate: activeDriverObj?.default_commission_rate ?? 0
    });
  }, [lkrAmount, vatRate, activeAgentObj, activeDriverObj]);

  const resetTerminal = () => {
    setAmount("0");
    setSelectedAgent("none");
    setSelectedDriver("none");
    setCustomerName("");
  };

  // Perform Sale Submission
  const handleRecordSale = async () => {
    if (enteredAmount <= 0) {
      toast.error("Please enter a valid sale amount");
      return;
    }
    if (!activeBranchObj) {
      toast.error("Active branch context not found");
      return;
    }

    const payload = {
      branch_id: activeBranchObj.id,
      agent_id: selectedAgent === "none" ? null : selectedAgent,
      driver_id: selectedDriver === "none" ? null : selectedDriver,
      customer_name: customerName.trim() || null,
      discount: 0,
      notes: "Quick entry sale via Cashier Touch Terminal" + 
        (selectedCurrency !== "LKR" ? ` (Paid ${enteredAmount} ${selectedCurrency} @ rate ${activeRate} LKR)` : "") +
        (isOnline ? "" : " (Offline Mode)"),
      items: [{
        product_id: null,
        description: "Quick Touch Sale" + (selectedCurrency !== "LKR" ? ` (Paid ${enteredAmount} ${selectedCurrency})` : ""),
        quantity: 1,
        unit_price: lkrAmount
      }]
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
        calcResult,
        cashierName: profile?.full_name || "Cashier Staff",
        branchName: activeBranchObj.name
      };

      const newQueue = [...offlineQueue, offlineItem];
      setOfflineQueue(newQueue);
      localStorage.setItem("tourism_os_offline_queue", JSON.stringify(newQueue));

      setSuccessData({
        invoiceNumber: mockInvoice,
        amount: calcResult.subtotal,
        agentCommission: calcResult.agent_amount,
        driverCommission: calcResult.driver_amount,
        isOffline: true,
        currency: selectedCurrency,
        foreignAmount: enteredAmount,
        exchangeRate: activeRate
      });
      setShowSuccess(true);
      toast.warning("Saved to local offline queue. Will auto-sync when online.");
      resetTerminal();
    } else {
      // Online mode
      setCheckoutBusy(true);
      try {
        const { data: saleId, error } = await supabase.rpc("create_sale", { payload: payload as any });
        if (error) throw error;

        // Add to recents
        if (selectedAgent && selectedAgent !== "none") {
          addToRecentAgents(selectedAgent);
        }

        const { data: saleDetails, error: loadErr } = await supabase
          .from("sales")
          .select("invoice_number, agent_commission_amount, driver_commission_amount")
          .eq("id", saleId)
          .single();
        
        if (loadErr) throw loadErr;

        setSuccessData({
          invoiceNumber: saleDetails.invoice_number,
          amount: calcResult.subtotal,
          agentCommission: saleDetails.agent_commission_amount,
          driverCommission: saleDetails.driver_commission_amount,
          isOffline: false,
          saleId,
          currency: selectedCurrency,
          foreignAmount: enteredAmount,
          exchangeRate: activeRate
        });
        setShowSuccess(true);
        toast.success("Transaction recorded successfully!");
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
        console.error("Failed syncing offline transaction:", item, err);
        failedCount++;
      }
    }

    setOfflineQueue(remainingQueue);
    localStorage.setItem("tourism_os_offline_queue", JSON.stringify(remainingQueue));
    setIsSyncing(false);

    if (failedCount > 0) {
      toast.error(`Sync completed with errors. Synced: ${syncedCount}, Failed: ${failedCount}`, { id: "sync-toast" });
    } else {
      toast.success(`Successfully synced all ${syncedCount} offline transactions!`, { id: "sync-toast" });
    }
  };

  // Auto-sync effect on network return
  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      handleSyncOffline();
    }
  }, [isOnline]);

  // Starred agent lists
  const filteredAgentsList = useMemo(() => {
    if (!agents) return [];
    return agents.filter(a => 
      a.company_name.toLowerCase().includes(agentSearch.toLowerCase()) ||
      a.code.toLowerCase().includes(agentSearch.toLowerCase())
    );
  }, [agents, agentSearch]);

  const filteredDriversList = useMemo(() => {
    if (!drivers) return [];
    return drivers.filter(d => 
      d.full_name.toLowerCase().includes(driverSearch.toLowerCase()) ||
      d.code.toLowerCase().includes(driverSearch.toLowerCase())
    );
  }, [drivers, driverSearch]);

  // Quick print handler
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
        </div>
        <table className="w-full text-left mb-2 text-[10px]">
          <thead>
            <tr className="border-b border-dashed border-black">
              <th className="pb-1">Item Description</th>
              <th className="text-right pb-1">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-1">Quick Touch Sale</td>
              <td className="text-right py-1">{formatMoney(calcResult.subtotal)}</td>
            </tr>
          </tbody>
        </table>
        <div className="border-t border-dashed border-black pt-2 space-y-1 mb-3 text-[10px]">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatMoney(calcResult.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>VAT ({vatRate}%):</span>
            <span>{formatMoney(calcResult.vat_amount)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm border-t border-dashed border-black pt-1">
            <span>GROSS AMOUNT:</span>
            <span>{formatMoney(calcResult.gross_amount)}</span>
          </div>
        </div>
        <div className="border-t border-dashed border-black pt-2 text-[8px] text-center text-gray-500">
          <div>Commissions recorded automatically.</div>
          {activeAgentObj && <div>Agent: {activeAgentObj.company_name}</div>}
          {activeDriverObj && <div>Driver: {activeDriverObj.full_name}</div>}
          <div className="mt-2 font-bold text-[9px] text-black">Thank you! Come again.</div>
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
                {offlineQueue.length} Pending Unsynced
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

        {/* MAIN MODULE PANELS */}
        <div className="flex-1 flex min-h-0 bg-background">
          
          {/* 1. LEFT PANEL: PARTNER SELECTION */}
          <aside className="w-80 border-r border-border bg-card/50 flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-border shrink-0">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="size-4 text-indigo-400" />
                Partner Selection
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              {/* TRAVEL AGENT */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground">Travel Agent</Label>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground/80" />
                  <Input 
                    placeholder="Search travel agents..."
                    value={agentSearch}
                    onChange={e => setAgentSearch(e.target.value)}
                    className="pl-9 h-9 bg-background border-input text-foreground text-sm rounded-lg"
                  />
                  {agentSearch && (
                    <button 
                      onClick={() => setAgentSearch("")} 
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {/* Stars/Favorites Quick list */}
                {favoriteAgents.length > 0 && !agentSearch && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Favorites</div>
                    <div className="flex flex-wrap gap-1.5">
                      {favoriteAgents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgent(selectedAgent === agent.id ? "none" : agent.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            selectedAgent === agent.id
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10"
                              : "bg-background text-foreground border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          {agent.company_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recents List */}
                {recentAgents.length > 0 && !agentSearch && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Recent</div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentAgents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgent(selectedAgent === agent.id ? "none" : agent.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            selectedAgent === agent.id
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10"
                              : "bg-background text-foreground border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          {agent.company_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scrollable list box */}
                <div className="border border-border rounded-lg overflow-hidden bg-background max-h-48 overflow-y-auto">
                  {filteredAgentsList.length === 0 ? (
                    <div className="p-4 text-xs text-center text-muted-foreground">No agents found</div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      <button
                        onClick={() => setSelectedAgent("none")}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/50 ${
                          selectedAgent === "none" ? "bg-muted text-primary" : "text-muted-foreground"
                        }`}
                      >
                        No Travel Agent
                      </button>
                      {filteredAgentsList.map(agent => (
                        <div 
                          key={agent.id}
                          className={`flex items-center justify-between px-3 py-2 transition-all hover:bg-muted/50 ${
                            selectedAgent === agent.id ? "bg-muted text-foreground" : ""
                          }`}
                        >
                          <button
                            onClick={() => setSelectedAgent(selectedAgent === agent.id ? "none" : agent.id)}
                            className="flex-1 text-left text-xs font-semibold truncate"
                          >
                            <div>{agent.company_name}</div>
                            <div className="text-[10px] text-muted-foreground/75 font-mono">Code: {agent.code} · Rate: {agent.default_commission_rate}%</div>
                          </button>
                          <button
                            onClick={() => toggleFavorite(agent.id)}
                            className="ml-2 p-1 text-muted-foreground/80 hover:text-amber-400 transition-colors"
                          >
                            <Star className={`size-3.5 ${favorites.includes(agent.id) ? "fill-amber-400 text-amber-400" : ""}`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* DRIVER */}
              <div className="space-y-3 pt-4 border-t border-border/40">
                <Label className="text-xs font-semibold text-muted-foreground">Driver</Label>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground/80" />
                  <Input 
                    placeholder="Search drivers..."
                    value={driverSearch}
                    onChange={e => setDriverSearch(e.target.value)}
                    className="pl-9 h-9 bg-background border-input text-foreground text-sm rounded-lg"
                  />
                  {driverSearch && (
                    <button 
                      onClick={() => setDriverSearch("")} 
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {/* Scrollable list box */}
                <div className="border border-border rounded-lg overflow-hidden bg-background max-h-40 overflow-y-auto">
                  {filteredDriversList.length === 0 ? (
                    <div className="p-4 text-xs text-center text-muted-foreground">No drivers found</div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      <button
                        onClick={() => setSelectedDriver("none")}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/50 ${
                          selectedDriver === "none" ? "bg-muted text-primary" : "text-muted-foreground"
                        }`}
                      >
                        No Driver (Self-arrival)
                      </button>
                      {filteredDriversList.map(driver => (
                        <button
                          key={driver.id}
                          onClick={() => setSelectedDriver(selectedDriver === driver.id ? "none" : driver.id)}
                          className={`w-full text-left px-3 py-2 text-xs font-semibold transition-all hover:bg-muted/50 ${
                            selectedDriver === driver.id ? "bg-muted text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <div>{driver.full_name}</div>
                          <div className="text-[10px] text-muted-foreground/75 font-mono">Plate: {driver.vehicle_number || "N/A"} · Rate: {driver.default_commission_rate}%</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* CUSTOMER NAME DETAILS */}
              <div className="space-y-2 pt-4 border-t border-border/40">
                <Label htmlFor="customer" className="text-xs font-semibold text-muted-foreground">Customer Details (Optional)</Label>
                <Input 
                  id="customer"
                  placeholder="Enter customer name..."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="bg-background border-input text-foreground text-xs rounded-lg"
                />
              </div>

              {/* SELECTION PREVIEWS */}
              <div className="space-y-2 pt-4">
                {activeAgentObj && (
                  <Card className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-500/20 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">Active Travel Agent</div>
                      <div className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">{activeAgentObj.company_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{activeAgentObj.default_commission_rate}%</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Commission</div>
                    </div>
                  </Card>
                )}

                {activeDriverObj && (
                  <Card className="p-3 bg-sky-50/50 dark:bg-sky-950/20 border-sky-100 dark:border-sky-500/20 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-sky-600 dark:text-sky-400">Active Driver</div>
                      <div className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">{activeDriverObj.full_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{activeDriverObj.default_commission_rate}%</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Commission</div>
                    </div>
                  </Card>
                )}
              </div>

            </div>
          </aside>

          {/* 2. CENTER PANEL: LARGE KEYPAD & DISPLAY */}
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
                        setAmount("0");
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
                    {customRates[selectedCurrency] && (
                      <span className="ml-1 size-1.5 rounded-full bg-amber-500" title="Custom rate override active" />
                    )}
                  </button>
                )}
              </div>

              {/* Amount Display Board */}
              <div className="w-full p-4 bg-card border border-border rounded-2xl flex items-center justify-between h-28 relative">
                <div className="flex flex-col justify-between h-full">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    ENTERED AMOUNT ({selectedCurrency})
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
                    {enteredAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </div>
                  {selectedCurrency !== "LKR" && (
                    <div className="text-xs md:text-sm font-semibold text-muted-foreground font-mono mt-0.5">
                      ≈ LKR {lkrAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Layout Grid for Keypad + Multipliers */}
            <div className="flex-1 p-6 pt-2 grid grid-cols-4 gap-6 min-h-0">
              
              {/* Keypad Grid (3/4 Columns) */}
              <div className="col-span-3 grid grid-cols-3 gap-3">
                {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "00", "C"].map(btn => (
                  <Button
                    key={btn}
                    onClick={() => handleKeyPress(btn)}
                    variant={btn === "C" ? "destructive" : "secondary"}
                    className={`h-full text-xl md:text-2xl font-bold rounded-2xl transition-all active:scale-[0.98] ${
                      btn === "C" 
                        ? "bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive/20"
                        : "bg-card hover:bg-accent hover:text-accent-foreground text-foreground border border-border"
                    }`}
                  >
                    {btn === "C" ? (
                      <span className="tracking-widest uppercase text-xs">Clear</span>
                    ) : (
                      btn
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

          {/* 3. RIGHT PANEL: LIVE CALCULATION SHEET */}
          <aside className="w-80 border-l border-border bg-card/50 flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-border shrink-0">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="size-4 text-indigo-400" />
                Live calculations
              </h2>
            </div>

            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                
                {/* Ledger preview lines */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">Sale Amount</span>
                      {selectedCurrency !== "LKR" && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono">
                          ≈ {selectedCurrency} {(calcResult.subtotal / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold text-foreground">{formatMoney(calcResult.subtotal)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">VAT Amount</span>
                      <span className="text-[9px] text-muted-foreground/80 font-bold uppercase block">Rate: {vatRate}%</span>
                      {selectedCurrency !== "LKR" && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 block">
                          ≈ {selectedCurrency} {(calcResult.vat_amount / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold text-foreground">{formatMoney(calcResult.vat_amount)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">Agent Commission</span>
                      <span className="text-[9px] text-muted-foreground/80 font-bold uppercase block">Rate: {calcResult.agent_rate}%</span>
                      {selectedCurrency !== "LKR" && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 block">
                          ≈ {selectedCurrency} {(calcResult.agent_amount / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">-{formatMoney(calcResult.agent_amount)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-border/50">
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground block">Driver Commission</span>
                      <span className="text-[9px] text-muted-foreground/80 font-bold uppercase block">Rate: {calcResult.driver_rate}%</span>
                      {selectedCurrency !== "LKR" && (
                        <span className="text-[10px] text-muted-foreground/80 font-mono mt-0.5 block">
                          ≈ {selectedCurrency} {(calcResult.driver_amount / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold text-sky-600 dark:text-sky-400">-{formatMoney(calcResult.driver_amount)}</span>
                  </div>
                </div>

                {/* Net keep card */}
                <Card className="p-4 bg-card border-border">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 flex justify-between">
                    <span>Company Net Revenue</span>
                    {selectedCurrency !== "LKR" && (
                      <span className="text-[10px] font-mono font-bold text-muted-foreground/80 lowercase">
                        ≈ {selectedCurrency} {(calcResult.company_revenue / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                    {formatMoney(calcResult.company_revenue)}
                  </div>
                  <div className="text-[9px] text-muted-foreground/80 mt-1.5 leading-normal">
                    Amount remaining after subtracting agent and driver commission payouts (VAT excluded from revenue base).
                  </div>
                </Card>
              </div>

              {/* Total display card */}
              <div className="mt-6 pt-4 border-t border-border/80">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground block">Gross Payable</span>
                    {selectedCurrency !== "LKR" && (
                      <span className="text-[10px] font-mono font-semibold text-muted-foreground mt-0.5 block">
                        ≈ {selectedCurrency} {(calcResult.gross_amount / activeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <span className="text-xl font-mono font-extrabold text-primary">
                    {formatMoney(calcResult.gross_amount)}
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
              {successData?.isOffline ? "Saved Offline" : "Transaction Successful"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {successData?.isOffline 
                ? "This transaction has been successfully queued in LocalStorage. It will sync automatically as soon as internet connection is restored."
                : "The transaction has been snapshot to the general ledger and all associated portals updated in real time."}
            </DialogDescription>
          </DialogHeader>

          {successData && (
            <div className="mt-4 p-4 rounded-xl bg-background border border-border divide-y divide-border/40 text-xs font-mono space-y-2.5">
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Invoice Number:</span>
                <span className="font-bold text-foreground">{successData.invoiceNumber}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">Sale Amount (LKR):</span>
                <span className="font-bold text-foreground">{formatMoney(successData.amount)}</span>
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
                  <div className="flex justify-between pt-2">
                    <span className="text-muted-foreground">Exchange Rate:</span>
                    <span className="font-bold text-muted-foreground">
                      1 {successData.currency} = {successData.exchangeRate?.toFixed(2)} LKR
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">Agent Commission:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">+{formatMoney(successData.agentCommission)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">Driver Commission:</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">+{formatMoney(successData.driverCommission)}</span>
              </div>
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
                Print
              </Button>
              {successData && !successData.isOffline && successData.saleId && (
                <Button
                  asChild
                  variant="outline"
                  className="bg-background border-border hover:bg-muted text-foreground text-xs h-10 rounded-xl"
                >
                  <Link to={`/app/sales/${successData.saleId}`}>
                    <FileText className="size-3.5 mr-1" />
                    View Invoice
                  </Link>
                </Button>
              )}
            </div>

            <Button
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-10 px-5 rounded-xl shadow-md font-bold"
              onClick={() => {
                setShowSuccess(false);
                setSuccessData(null);
              }}
            >
              New Transaction
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
              Manually override the exchange rate for {selectedCurrency} payments. This will apply only to this terminal session.
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
              Configure session-level overrides for cashier transactions. These parameters apply immediately.
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
              <Label htmlFor="custom-vat" className="text-xs font-semibold text-muted-foreground font-display">Local VAT Rate (%)</Label>
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
              <p className="text-[10px] text-muted-foreground/80 leading-normal">
                Standard showroom VAT: <span className="font-semibold">{(customBranchId ? branches?.find(b => b.id === customBranchId)?.vat_rate : branches?.find(b => b.id === profile?.branch_id)?.vat_rate) || 18.00}%</span>
              </p>
            </div>

            {/* Offline sync details */}
            <div className="space-y-2 pt-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-muted-foreground">Offline Buffer Queue</span>
                <span className="font-mono text-muted-foreground font-bold">{offlineQueue.length} transactions</span>
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
                toast.success("Terminal overrides saved successfully!");
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
