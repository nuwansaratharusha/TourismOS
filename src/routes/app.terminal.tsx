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
  Printer, X, FileText, ChevronLeft, RefreshCw, Smartphone, Landmark, Receipt, Sparkles, User, Car
} from "lucide-react";
import { toast } from "sonner";

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
    return branches.find(b => b.id === profile?.branch_id) || branches[0];
  }, [branches, profile]);

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

  const vatRate = activeBranchObj?.vat_rate ?? 18.00;
  const numAmount = Number(amount) || 0;

  const calcResult = useMemo(() => {
    return calculateSale({
      items: [{ description: "Quick Touch Sale", quantity: 1, unit_price: numAmount }],
      vat_rate: vatRate,
      agent_rate: activeAgentObj?.default_commission_rate ?? 0,
      driver_rate: activeDriverObj?.default_commission_rate ?? 0
    });
  }, [numAmount, vatRate, activeAgentObj, activeDriverObj]);

  const resetTerminal = () => {
    setAmount("0");
    setSelectedAgent("none");
    setSelectedDriver("none");
    setCustomerName("");
  };

  // Perform Sale Submission
  const handleRecordSale = async () => {
    if (numAmount <= 0) {
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
      notes: "Quick entry sale via Cashier Touch Terminal" + (isOnline ? "" : " (Offline Mode)"),
      items: [{
        product_id: null,
        description: "Quick Touch Sale",
        quantity: 1,
        unit_price: numAmount
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
        isOffline: true
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
          saleId
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
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-display select-none">
      
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
        <header className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <Link to="/app" className="flex items-center text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="size-5 mr-1" />
              <span className="text-sm font-semibold tracking-tight">Main System</span>
            </Link>
            <div className="h-4 w-px bg-slate-800" />
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
              <div className="text-xs text-slate-400 font-semibold">{activeBranchObj?.name || "—"}</div>
              <div className="text-[10px] text-slate-500 font-medium">Cashier: {profile?.full_name || "—"}</div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
              <Clock className="size-3.5 text-slate-500" />
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
        <div className="flex-1 flex min-h-0 bg-slate-950">
          
          {/* 1. LEFT PANEL: PARTNER SELECTION */}
          <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-slate-800 shrink-0">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Landmark className="size-4 text-indigo-400" />
                Partner Selection
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              {/* TRAVEL AGENT */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-slate-400">Travel Agent</Label>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
                  <Input 
                    placeholder="Search travel agents..."
                    value={agentSearch}
                    onChange={e => setAgentSearch(e.target.value)}
                    className="pl-9 h-9 bg-slate-950 border-slate-800 text-sm rounded-lg"
                  />
                  {agentSearch && (
                    <button 
                      onClick={() => setAgentSearch("")} 
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {/* Stars/Favorites Quick list */}
                {favoriteAgents.length > 0 && !agentSearch && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Favorites</div>
                    <div className="flex flex-wrap gap-1.5">
                      {favoriteAgents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgent(selectedAgent === agent.id ? "none" : agent.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            selectedAgent === agent.id
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10"
                              : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
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
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Recent</div>
                    <div className="flex flex-wrap gap-1.5">
                      {recentAgents.map(agent => (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgent(selectedAgent === agent.id ? "none" : agent.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            selectedAgent === agent.id
                              ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/10"
                              : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                          }`}
                        >
                          {agent.company_name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scrollable list box */}
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 max-h-48 overflow-y-auto">
                  {filteredAgentsList.length === 0 ? (
                    <div className="p-4 text-xs text-center text-slate-500">No agents found</div>
                  ) : (
                    <div className="divide-y divide-slate-800/40">
                      <button
                        onClick={() => setSelectedAgent("none")}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-900/50 ${
                          selectedAgent === "none" ? "bg-slate-900 text-indigo-400" : "text-slate-400"
                        }`}
                      >
                        No Travel Agent
                      </button>
                      {filteredAgentsList.map(agent => (
                        <div 
                          key={agent.id}
                          className={`flex items-center justify-between px-3 py-2 transition-all hover:bg-slate-900/50 ${
                            selectedAgent === agent.id ? "bg-slate-900/80 text-white" : ""
                          }`}
                        >
                          <button
                            onClick={() => setSelectedAgent(selectedAgent === agent.id ? "none" : agent.id)}
                            className="flex-1 text-left text-xs font-semibold truncate"
                          >
                            <div>{agent.company_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">Code: {agent.code} · Rate: {agent.default_commission_rate}%</div>
                          </button>
                          <button
                            onClick={() => toggleFavorite(agent.id)}
                            className="ml-2 p-1 text-slate-500 hover:text-amber-400 transition-colors"
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
              <div className="space-y-3 pt-4 border-t border-slate-800/40">
                <Label className="text-xs font-semibold text-slate-400">Driver</Label>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
                  <Input 
                    placeholder="Search drivers..."
                    value={driverSearch}
                    onChange={e => setDriverSearch(e.target.value)}
                    className="pl-9 h-9 bg-slate-950 border-slate-800 text-sm rounded-lg"
                  />
                  {driverSearch && (
                    <button 
                      onClick={() => setDriverSearch("")} 
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                {/* Scrollable list box */}
                <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 max-h-40 overflow-y-auto">
                  {filteredDriversList.length === 0 ? (
                    <div className="p-4 text-xs text-center text-slate-500">No drivers found</div>
                  ) : (
                    <div className="divide-y divide-slate-800/40">
                      <button
                        onClick={() => setSelectedDriver("none")}
                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-900/50 ${
                          selectedDriver === "none" ? "bg-slate-900 text-indigo-400" : "text-slate-400"
                        }`}
                      >
                        No Driver (Self-arrival)
                      </button>
                      {filteredDriversList.map(driver => (
                        <button
                          key={driver.id}
                          onClick={() => setSelectedDriver(selectedDriver === driver.id ? "none" : driver.id)}
                          className={`w-full text-left px-3 py-2 text-xs font-semibold transition-all hover:bg-slate-900/50 ${
                            selectedDriver === driver.id ? "bg-slate-900 text-white" : "text-slate-400"
                          }`}
                        >
                          <div>{driver.full_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">Plate: {driver.vehicle_number || "N/A"} · Rate: {driver.default_commission_rate}%</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* CUSTOMER NAME DETAILS */}
              <div className="space-y-2 pt-4 border-t border-slate-800/40">
                <Label htmlFor="customer" className="text-xs font-semibold text-slate-400">Customer Details (Optional)</Label>
                <Input 
                  id="customer"
                  placeholder="Enter customer name..."
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs rounded-lg"
                />
              </div>

              {/* SELECTION PREVIEWS */}
              <div className="space-y-2 pt-4">
                {activeAgentObj && (
                  <Card className="p-3 bg-indigo-950/20 border-indigo-500/20 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-400">Active Travel Agent</div>
                      <div className="text-xs font-bold truncate text-slate-200">{activeAgentObj.company_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-200">{activeAgentObj.default_commission_rate}%</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Commission</div>
                    </div>
                  </Card>
                )}

                {activeDriverObj && (
                  <Card className="p-3 bg-sky-950/20 border-sky-500/20 flex justify-between items-center">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-sky-400">Active Driver</div>
                      <div className="text-xs font-bold truncate text-slate-200">{activeDriverObj.full_name}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-slate-200">{activeDriverObj.default_commission_rate}%</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Commission</div>
                    </div>
                  </Card>
                )}
              </div>

            </div>
          </aside>

          {/* 2. CENTER PANEL: LARGE KEYPAD & DISPLAY */}
          <main className="flex-1 bg-slate-950 flex flex-col min-w-0 min-h-0">
            
            {/* Display container */}
            <div className="p-6 pb-2 shrink-0">
              <div className="w-full p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between h-28 relative">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">SALE AMOUNT (LKR)</span>
                <div className="text-right font-mono text-3xl md:text-4xl font-extrabold text-indigo-400 tracking-tight select-all">
                  {formatMoney(Number(amount)).replace("LKR", "").trim()}
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
                        ? "bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800/80"
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
                    className="flex-1 flex flex-col justify-center items-center rounded-xl bg-slate-900/40 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 text-slate-300 font-mono active:scale-[0.98]"
                  >
                    <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">+ Add</span>
                    <span className="text-xs md:text-sm font-extrabold text-indigo-400">
                      {val.toLocaleString()}
                    </span>
                  </Button>
                ))}
              </div>

            </div>
          </main>

          {/* 3. RIGHT PANEL: LIVE CALCULATION SHEET */}
          <aside className="w-80 border-l border-slate-800 bg-slate-900/50 flex flex-col min-h-0 shrink-0">
            <div className="p-4 border-b border-slate-800 shrink-0">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Receipt className="size-4 text-indigo-400" />
                Live calculations
              </h2>
            </div>

            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-6">
                
                {/* Ledger preview lines */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                    <span className="text-xs font-semibold text-slate-400">Sale Amount</span>
                    <span className="text-sm font-mono font-bold text-slate-200">{formatMoney(calcResult.subtotal)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block">VAT Amount</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Rate: {vatRate}%</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-slate-200">{formatMoney(calcResult.vat_amount)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block">Agent Commission</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Rate: {calcResult.agent_rate}%</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-indigo-400">-{formatMoney(calcResult.agent_amount)}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b border-slate-800/50">
                    <div>
                      <span className="text-xs font-semibold text-slate-400 block">Driver Commission</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Rate: {calcResult.driver_rate}%</span>
                    </div>
                    <span className="text-sm font-mono font-bold text-sky-400">-{formatMoney(calcResult.driver_amount)}</span>
                  </div>
                </div>

                {/* Net keep card */}
                <Card className="p-4 bg-slate-900 border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Company Net Revenue</div>
                  <div className="text-2xl font-mono font-extrabold text-emerald-400">
                    {formatMoney(calcResult.company_revenue)}
                  </div>
                  <div className="text-[9px] text-slate-500 mt-1.5 leading-normal">
                    Amount remaining after subtracting agent and driver commission payouts (VAT excluded from revenue base).
                  </div>
                </Card>
              </div>

              {/* Total display card */}
              <div className="mt-6 pt-4 border-t border-slate-800/80">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Gross Payable</span>
                  <span className="text-xl font-mono font-extrabold text-indigo-400">
                    {formatMoney(calcResult.gross_amount)}
                  </span>
                </div>
              </div>
            </div>
          </aside>

        </div>

        {/* BOTTOM ACTION BUTTONS */}
        <footer className="h-20 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between shrink-0">
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="px-6 h-12 text-slate-400 hover:text-white hover:bg-slate-800 text-sm font-bold rounded-xl"
              onClick={resetTerminal}
            >
              Clear
            </Button>
            <Button
              asChild
              variant="outline"
              className="px-6 h-12 border-slate-800 hover:bg-slate-800 text-slate-300 text-sm font-bold rounded-xl"
            >
              <Link to="/app">Cancel</Link>
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="px-6 h-12 bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 text-sm font-bold rounded-xl gap-2 active:scale-95"
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
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 p-6 rounded-2xl">
          <DialogHeader className="text-center">
            <div className="mx-auto flex items-center justify-center size-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-3 border border-emerald-500/20">
              <CheckCircle2 className="size-6 animate-bounce" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-white">
              {successData?.isOffline ? "Saved Offline" : "Transaction Successful"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              {successData?.isOffline 
                ? "This transaction has been successfully queued in LocalStorage. It will sync automatically as soon as internet connection is restored."
                : "The transaction has been snapshot to the general ledger and all associated portals updated in real time."}
            </DialogDescription>
          </DialogHeader>

          {successData && (
            <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-850 divide-y divide-slate-800/40 text-xs font-mono space-y-2.5">
              <div className="flex justify-between pt-1">
                <span className="text-slate-500">Invoice Number:</span>
                <span className="font-bold text-slate-200">{successData.invoiceNumber}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Sale Amount:</span>
                <span className="font-bold text-slate-200">{formatMoney(successData.amount)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Agent Commission:</span>
                <span className="font-bold text-indigo-400">+{formatMoney(successData.agentCommission)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-slate-500">Driver Commission:</span>
                <span className="font-bold text-sky-400">+{formatMoney(successData.driverCommission)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 flex sm:justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-300 text-xs h-10 rounded-xl"
                onClick={handlePrint}
              >
                <Printer className="size-3.5 mr-1" />
                Print
              </Button>
              {successData && !successData.isOffline && successData.saleId && (
                <Button
                  asChild
                  variant="outline"
                  className="bg-slate-950 border-slate-800 hover:bg-slate-900 text-slate-300 text-xs h-10 rounded-xl"
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

    </div>
  );
}
