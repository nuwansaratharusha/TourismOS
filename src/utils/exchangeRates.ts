export interface ExchangeRates {
  [currency: string]: number; // How many LKR for 1 unit of foreign currency
}

export const FALLBACK_LKR_RATES: ExchangeRates = {
  LKR: 1,
  USD: 302.50,
  EUR: 328.80,
  GBP: 385.20,
  AUD: 201.10,
  INR: 3.62
};

const CACHE_KEY = "tourism_os_exchange_rates";
const CACHE_TIME_KEY = "tourism_os_exchange_rates_updated";
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // Cache for 6 hours

export async function fetchLkrRates(): Promise<{ rates: ExchangeRates; isLive: boolean }> {
  if (typeof window === "undefined") {
    return { rates: FALLBACK_LKR_RATES, isLive: false };
  }

  // Check cache first
  try {
    const cachedRatesStr = localStorage.getItem(CACHE_KEY);
    const cachedTimeStr = localStorage.getItem(CACHE_TIME_KEY);
    if (cachedRatesStr && cachedTimeStr) {
      const parsedTime = Number(cachedTimeStr);
      if (Date.now() - parsedTime < CACHE_DURATION_MS) {
        return { rates: JSON.parse(cachedRatesStr), isLive: true };
      }
    }
  } catch (e) {
    console.warn("Failed reading exchange rates cache:", e);
  }

  // Fetch live
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!response.ok) throw new Error("Network response not ok");
    const data = await response.json();
    
    if (data && data.rates && data.rates.LKR) {
      const usdRates = data.rates;
      const lkrRateInUsd = usdRates.LKR;
      
      const resolvedLkrRates: ExchangeRates = { LKR: 1 };
      const targetCurrencies = ["USD", "EUR", "GBP", "AUD", "INR"];
      for (const cur of targetCurrencies) {
        if (usdRates[cur]) {
          resolvedLkrRates[cur] = Number((lkrRateInUsd / usdRates[cur]).toFixed(4));
        } else {
          resolvedLkrRates[cur] = FALLBACK_LKR_RATES[cur];
        }
      }
      
      // Save cache
      localStorage.setItem(CACHE_KEY, JSON.stringify(resolvedLkrRates));
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
      
      return { rates: resolvedLkrRates, isLive: true };
    }
  } catch (err) {
    console.error("Failed fetching live exchange rates:", err);
  }

  // Fallback to expired cache if available
  try {
    const expiredRatesStr = localStorage.getItem(CACHE_KEY);
    if (expiredRatesStr) {
      return { rates: JSON.parse(expiredRatesStr), isLive: false };
    }
  } catch (e) {}

  return { rates: FALLBACK_LKR_RATES, isLive: false };
}
