
-- =====================================================
-- TourismOS — Phase 1 schema
-- =====================================================

-- Enums
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'branch_manager', 'cashier',
  'travel_agent', 'driver', 'accountant'
);

CREATE TYPE public.sale_status AS ENUM ('draft', 'completed', 'voided');
CREATE TYPE public.commission_status AS ENUM ('pending', 'approved', 'paid', 'cancelled');
CREATE TYPE public.beneficiary_type AS ENUM ('agent', 'driver');
CREATE TYPE public.entity_status AS ENUM ('active', 'suspended');

-- =====================================================
-- TENANTS
-- =====================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  default_currency TEXT NOT NULL DEFAULT 'LKR',
  default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- BRANCHES
-- =====================================================
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  vat_rate NUMERIC(5,2),
  currency TEXT,
  invoice_counter BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES (one per auth user)
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- USER_ROLES (separate table — never on profiles)
-- =====================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Security-definer helpers
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles public.app_role[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles))
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

-- =====================================================
-- AGENTS
-- =====================================================
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  mobile TEXT,
  email TEXT,
  address TEXT,
  default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_agents_tenant ON public.agents(tenant_id);
CREATE INDEX idx_agents_user ON public.agents(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DRIVERS
-- =====================================================
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  nic TEXT,
  vehicle_number TEXT,
  mobile TEXT,
  default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX idx_drivers_tenant ON public.drivers(tenant_id);
CREATE INDEX idx_drivers_user ON public.drivers(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PRODUCTS
-- =====================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SALES (immutable financial snapshot)
-- =====================================================
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  sale_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  customer_name TEXT,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'LKR',
  subtotal NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,2) NOT NULL,
  vat_amount NUMERIC(12,2) NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,
  agent_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  agent_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  driver_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  driver_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  company_revenue NUMERIC(12,2) NOT NULL,
  status public.sale_status NOT NULL DEFAULT 'completed',
  qr_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX idx_sales_tenant_date ON public.sales(tenant_id, sale_date DESC);
CREATE INDEX idx_sales_agent ON public.sales(agent_id);
CREATE INDEX idx_sales_driver ON public.sales(driver_id);
CREATE INDEX idx_sales_branch ON public.sales(branch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SALE ITEMS
-- =====================================================
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL
);
CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- COMMISSIONS
-- =====================================================
CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  beneficiary_type public.beneficiary_type NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  rate NUMERIC(5,2) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status public.commission_status NOT NULL DEFAULT 'pending',
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_commissions_tenant ON public.commissions(tenant_id);
CREATE INDEX idx_commissions_sale ON public.commissions(sale_id);
CREATE INDEX idx_commissions_agent ON public.commissions(agent_id);
CREATE INDEX idx_commissions_driver ON public.commissions(driver_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissions TO authenticated;
GRANT ALL ON public.commissions TO service_role;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PAYMENTS
-- =====================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  commission_id UUID NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proof_url TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX idx_payments_commission ON public.payments(commission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- AUDIT LOGS (append-only)
-- =====================================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_tenant_date ON public.audit_logs(tenant_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- tenants: members see their own tenant
CREATE POLICY "tenant_member_select" ON public.tenants
  FOR SELECT TO authenticated USING (id = public.current_tenant_id());
CREATE POLICY "tenant_admin_update" ON public.tenants
  FOR UPDATE TO authenticated USING (id = public.current_tenant_id() AND public.has_role(auth.uid(), 'super_admin'));

-- branches
CREATE POLICY "branch_tenant_select" ON public.branches
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "branch_admin_write" ON public.branches
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]));

-- profiles: self read/update; admins read tenant
CREATE POLICY "profile_self_select" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant']::public.app_role[])));
CREATE POLICY "profile_self_update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profile_self_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profile_admin_write" ON public.profiles
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'super_admin'));

-- user_roles
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.has_role(auth.uid(), 'super_admin')));

-- agents: tenant-scoped read for staff; agent sees own
CREATE POLICY "agents_select" ON public.agents
  FOR SELECT TO authenticated USING (
    tenant_id = public.current_tenant_id() AND (
      public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','cashier','accountant']::public.app_role[])
      OR user_id = auth.uid()
    )
  );
CREATE POLICY "agents_admin_write" ON public.agents
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]));

-- drivers
CREATE POLICY "drivers_select" ON public.drivers
  FOR SELECT TO authenticated USING (
    tenant_id = public.current_tenant_id() AND (
      public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','cashier','accountant']::public.app_role[])
      OR user_id = auth.uid()
    )
  );
CREATE POLICY "drivers_admin_write" ON public.drivers
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]));

-- products
CREATE POLICY "products_tenant_select" ON public.products
  FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE POLICY "products_admin_write" ON public.products
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]));

-- sales: agents/drivers see own; staff sees tenant
CREATE POLICY "sales_select" ON public.sales
  FOR SELECT TO authenticated USING (
    tenant_id = public.current_tenant_id() AND (
      public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','cashier','accountant']::public.app_role[])
      OR agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
      OR driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
    )
  );
-- Inserts handled by RPC (security definer); block direct inserts except admins
CREATE POLICY "sales_admin_modify" ON public.sales
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]));

-- sale_items: visible via parent sale
CREATE POLICY "sale_items_select" ON public.sale_items
  FOR SELECT TO authenticated USING (
    sale_id IN (SELECT id FROM public.sales WHERE tenant_id = public.current_tenant_id())
  );
CREATE POLICY "sale_items_admin_modify" ON public.sale_items
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager']::public.app_role[]));

-- commissions
CREATE POLICY "commissions_select" ON public.commissions
  FOR SELECT TO authenticated USING (
    tenant_id = public.current_tenant_id() AND (
      public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant','cashier']::public.app_role[])
      OR agent_id IN (SELECT id FROM public.agents WHERE user_id = auth.uid())
      OR driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
    )
  );
CREATE POLICY "commissions_admin_modify" ON public.commissions
  FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant']::public.app_role[]));

-- payments
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated USING (
    tenant_id = public.current_tenant_id() AND (
      public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant']::public.app_role[])
      OR commission_id IN (
        SELECT c.id FROM public.commissions c
        LEFT JOIN public.agents a ON a.id = c.agent_id
        LEFT JOIN public.drivers d ON d.id = c.driver_id
        WHERE a.user_id = auth.uid() OR d.user_id = auth.uid()
      )
    )
  );
CREATE POLICY "payments_admin_write" ON public.payments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant']::public.app_role[]))
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant']::public.app_role[]));

-- audit_logs
CREATE POLICY "audit_select" ON public.audit_logs
  FOR SELECT TO authenticated USING (
    tenant_id = public.current_tenant_id()
    AND public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','accountant']::public.app_role[])
  );
CREATE POLICY "audit_insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());

-- =====================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- COMMISSION ENGINE — atomic sale creation
-- =====================================================
CREATE OR REPLACE FUNCTION public.create_sale(payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID := public.current_tenant_id();
  v_branch_id UUID := (payload->>'branch_id')::uuid;
  v_agent_id UUID := NULLIF(payload->>'agent_id','')::uuid;
  v_driver_id UUID := NULLIF(payload->>'driver_id','')::uuid;
  v_customer TEXT := payload->>'customer_name';
  v_discount NUMERIC := COALESCE((payload->>'discount')::numeric, 0);
  v_vat_rate NUMERIC;
  v_items JSONB := COALESCE(payload->'items','[]'::jsonb);
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_gross NUMERIC;
  v_vat_amount NUMERIC;
  v_net NUMERIC;
  v_agent_rate NUMERIC := 0;
  v_driver_rate NUMERIC := 0;
  v_agent_amount NUMERIC := 0;
  v_driver_amount NUMERIC := 0;
  v_company_rev NUMERIC;
  v_invoice_no TEXT;
  v_counter BIGINT;
  v_branch_code TEXT;
  v_sale_id UUID;
  v_currency TEXT;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant context';
  END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['super_admin','branch_manager','cashier']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized to record sales';
  END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id required';
  END IF;
  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Sale must have at least one item';
  END IF;

  -- Resolve VAT rate: branch override → tenant default
  SELECT COALESCE(b.vat_rate, t.default_vat_rate), COALESCE(b.currency, t.default_currency)
    INTO v_vat_rate, v_currency
  FROM public.branches b JOIN public.tenants t ON t.id = b.tenant_id
  WHERE b.id = v_branch_id AND b.tenant_id = v_tenant_id;
  IF v_vat_rate IS NULL THEN RAISE EXCEPTION 'Invalid branch'; END IF;

  -- Sum items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_subtotal := v_subtotal + ((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric);
  END LOOP;

  -- Financial snapshot
  v_net := v_subtotal - v_discount;
  v_vat_amount := ROUND(v_net * v_vat_rate / 100, 2);
  v_gross := v_net + v_vat_amount;

  -- Resolve commission rates from current agent/driver records (snapshot at sale time)
  IF v_agent_id IS NOT NULL THEN
    SELECT default_commission_rate INTO v_agent_rate FROM public.agents
    WHERE id = v_agent_id AND tenant_id = v_tenant_id AND status = 'active';
    IF v_agent_rate IS NULL THEN RAISE EXCEPTION 'Invalid or suspended agent'; END IF;
    v_agent_amount := ROUND(v_net * v_agent_rate / 100, 2);
  END IF;

  IF v_driver_id IS NOT NULL THEN
    SELECT default_commission_rate INTO v_driver_rate FROM public.drivers
    WHERE id = v_driver_id AND tenant_id = v_tenant_id AND status = 'active';
    IF v_driver_rate IS NULL THEN RAISE EXCEPTION 'Invalid or suspended driver'; END IF;
    v_driver_amount := ROUND(v_net * v_driver_rate / 100, 2);
  END IF;

  v_company_rev := v_net - v_agent_amount - v_driver_amount;

  -- Generate invoice number atomically
  UPDATE public.branches SET invoice_counter = invoice_counter + 1
    WHERE id = v_branch_id RETURNING invoice_counter, code INTO v_counter, v_branch_code;
  v_invoice_no := v_branch_code || '-' || to_char(now(),'YYYYMM') || '-' || lpad(v_counter::text, 5, '0');

  -- Insert sale
  INSERT INTO public.sales (
    tenant_id, branch_id, invoice_number, customer_name, agent_id, driver_id, cashier_id,
    currency, subtotal, discount, vat_rate, vat_amount, gross_amount, net_amount,
    agent_commission_rate, agent_commission_amount, driver_commission_rate, driver_commission_amount,
    company_revenue, status
  ) VALUES (
    v_tenant_id, v_branch_id, v_invoice_no, v_customer, v_agent_id, v_driver_id, auth.uid(),
    v_currency, v_subtotal, v_discount, v_vat_rate, v_vat_amount, v_gross, v_net,
    v_agent_rate, v_agent_amount, v_driver_rate, v_driver_amount,
    v_company_rev, 'completed'
  ) RETURNING id INTO v_sale_id;

  -- Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.sale_items (sale_id, product_id, description, quantity, unit_price, line_total)
    VALUES (
      v_sale_id,
      NULLIF(v_item->>'product_id','')::uuid,
      v_item->>'description',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      ROUND((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric, 2)
    );
  END LOOP;

  -- Commission ledger entries
  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.commissions (tenant_id, sale_id, beneficiary_type, agent_id, rate, amount, status)
    VALUES (v_tenant_id, v_sale_id, 'agent', v_agent_id, v_agent_rate, v_agent_amount, 'pending');
  END IF;
  IF v_driver_id IS NOT NULL THEN
    INSERT INTO public.commissions (tenant_id, sale_id, beneficiary_type, driver_id, rate, amount, status)
    VALUES (v_tenant_id, v_sale_id, 'driver', v_driver_id, v_driver_rate, v_driver_amount, 'pending');
  END IF;

  -- Audit
  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_tenant_id, auth.uid(), 'sale.created', 'sale', v_sale_id,
    jsonb_build_object('invoice_number', v_invoice_no, 'gross', v_gross, 'agent_id', v_agent_id, 'driver_id', v_driver_id));

  RETURN v_sale_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale(JSONB) TO authenticated;

-- =====================================================
-- Realtime
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
ALTER PUBLICATION supabase_realtime ADD TABLE public.commissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;

-- =====================================================
-- SEED: Gunatilake Batiks tenant + main branch
-- =====================================================
INSERT INTO public.tenants (id, name, slug, default_currency, default_vat_rate)
VALUES ('11111111-1111-1111-1111-111111111111', 'Gunatilake Batiks', 'gunatilake-batiks', 'LKR', 18.00);

INSERT INTO public.branches (tenant_id, name, code, address)
VALUES ('11111111-1111-1111-1111-111111111111', 'Main Showroom', 'MAIN', 'Sri Lanka');

INSERT INTO public.products (tenant_id, sku, name, unit_price) VALUES
  ('11111111-1111-1111-1111-111111111111', 'BAT-SAR-001', 'Hand-painted Batik Saree', 18500),
  ('11111111-1111-1111-1111-111111111111', 'BAT-SHT-001', 'Batik Shirt (Men)', 4500),
  ('11111111-1111-1111-1111-111111111111', 'BAT-WAL-001', 'Wall Hanging — Large', 12000),
  ('11111111-1111-1111-1111-111111111111', 'BAT-SCF-001', 'Silk Batik Scarf', 3200);
