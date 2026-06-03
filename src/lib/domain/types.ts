/**
 * TourismOS domain types
 * Framework-agnostic. Safe to copy out of Lovable into any TS backend or client.
 */

export type AppRole =
  | "super_admin"
  | "branch_manager"
  | "cashier"
  | "travel_agent"
  | "driver"
  | "accountant";

export type SaleStatus = "draft" | "completed" | "voided";
export type CommissionStatus = "pending" | "approved" | "paid" | "cancelled";
export type BeneficiaryType = "agent" | "driver";
export type EntityStatus = "active" | "suspended";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  default_currency: string;
  default_vat_rate: number;
  logo_url: string | null;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: string | null;
  vat_rate: number | null;
  currency: string | null;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  branch_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
}

export interface Agent {
  id: string;
  tenant_id: string;
  user_id: string | null;
  code: string;
  company_name: string;
  contact_person: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  default_commission_rate: number;
  status: EntityStatus;
}

export interface Driver {
  id: string;
  tenant_id: string;
  user_id: string | null;
  code: string;
  full_name: string;
  nic: string | null;
  vehicle_number: string | null;
  mobile: string | null;
  default_commission_rate: number;
  status: EntityStatus;
}

export interface SaleItem {
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface SaleRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  invoice_number: string;
  sale_date: string;
  customer_name: string | null;
  agent_id: string | null;
  driver_id: string | null;
  cashier_id: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  vat_rate: number;
  vat_amount: number;
  gross_amount: number;
  net_amount: number;
  agent_commission_rate: number;
  agent_commission_amount: number;
  driver_commission_rate: number;
  driver_commission_amount: number;
  company_revenue: number;
  status: SaleStatus;
  qr_token: string;
}
