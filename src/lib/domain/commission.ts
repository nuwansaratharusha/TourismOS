/**
 * Pure commission/VAT calculator — mirrors the database `create_sale` RPC.
 * Used for live POS previews and for unit testing outside Lovable.
 * Keep these formulas identical to the SQL in migration 0001.
 */
import type { SaleItem } from "./types";

export interface CalcInput {
  items: SaleItem[];
  discount?: number;
  vat_rate: number;
  agent_rate?: number;
  driver_rate?: number;
}

export interface CalcResult {
  subtotal: number;
  discount: number;
  net_amount: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  agent_rate: number;
  agent_amount: number;
  driver_rate: number;
  driver_amount: number;
  company_revenue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateSale(input: CalcInput): CalcResult {
  const subtotal = input.items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
    0,
  );
  const discount = Number(input.discount || 0);
  const net = subtotal - discount;
  const vat_amount = round2((net * input.vat_rate) / 100);
  const gross = net + vat_amount;

  const agent_rate = Number(input.agent_rate || 0);
  const driver_rate = Number(input.driver_rate || 0);
  const agent_amount = round2((net * agent_rate) / 100);
  const driver_amount = round2((net * driver_rate) / 100);
  const company_revenue = round2(net - agent_amount - driver_amount);

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    net_amount: round2(net),
    vat_rate: input.vat_rate,
    vat_amount,
    gross_amount: round2(gross),
    agent_rate,
    agent_amount,
    driver_rate,
    driver_amount,
    company_revenue,
  };
}

export function formatMoney(amount: number, currency = "LKR"): string {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
