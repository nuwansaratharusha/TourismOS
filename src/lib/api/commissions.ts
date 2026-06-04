import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const processCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      saleId: z.string().uuid(),
      agentId: z.string().uuid().nullable(),
      driverId: z.string().uuid().nullable(),
      agentCommissionRate: z.number().min(0).max(100),
      driverCommissionRate: z.number().min(0).max(100),
    })
  )
  .handler(async ({ data, context }) => {
    // Dynamic import of server-only supabase client
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Authenticated user context check
    const userId = context.userId;
    if (!userId) {
      throw new Error("Unauthorized: No authenticated user context");
    }

    // 2. Role authorization check
    const { data: userRoles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError || !userRoles) {
      throw new Error("Unauthorized: Failed to resolve user roles");
    }

    const roles = userRoles.map((r: any) => r.role);
    const hasAccess = roles.some((r: string) => ["super_admin", "branch_manager", "accountant"].includes(r));
    if (!hasAccess) {
      throw new Error("Forbidden: Only Super Admin, Branch Manager, or Commission Analytics (Accountant) can process commissions");
    }

    // 3. Fetch current sale
    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("*")
      .eq("id", data.saleId)
      .single();

    if (saleError || !sale) {
      throw new Error("Sale record not found");
    }

    // Check if commissions are already approved or paid to preserve immutability
    const { data: existingComms } = await supabaseAdmin
      .from("commissions")
      .select("status")
      .eq("sale_id", data.saleId);

    const isLocked = existingComms?.some((c: any) => ["approved", "paid"].includes(c.status));
    if (isLocked) {
      throw new Error("Forbidden: Commissions for this transaction are already approved or paid and cannot be modified");
    }

    // 4. Calculate Commission values
    const netAmount = Number(sale.subtotal) - Number(sale.discount);
    const agentAmount = Math.round((netAmount * data.agentCommissionRate) / 100 * 100) / 100;
    const driverAmount = Math.round((netAmount * data.driverCommissionRate) / 100 * 100) / 100;
    const companyRevenue = Math.round((netAmount - agentAmount - driverAmount) * 100) / 100;

    // 5. Update Sale Record
    const updatedNotes = sale.notes && sale.notes.includes("[Processed]") 
      ? sale.notes 
      : `${sale.notes || ""} [Processed]`.trim();

    const { error: updateSaleError } = await supabaseAdmin
      .from("sales")
      .update({
        agent_id: data.agentId,
        driver_id: data.driverId,
        agent_commission_rate: data.agentCommissionRate,
        agent_commission_amount: agentAmount,
        driver_commission_rate: data.driverCommissionRate,
        driver_commission_amount: driverAmount,
        company_revenue: companyRevenue,
        notes: updatedNotes
      } as any)
      .eq("id", data.saleId);

    if (updateSaleError) {
      throw new Error(`Failed to update sale record: ${updateSaleError.message}`);
    }

    // 6. Manage Commissions records
    const { error: deleteCommsError } = await supabaseAdmin
      .from("commissions")
      .delete()
      .eq("sale_id", data.saleId);

    if (deleteCommsError) {
      throw new Error(`Failed to reset commissions: ${deleteCommsError.message}`);
    }

    // Insert new commission records if beneficiaries are selected
    if (data.agentId) {
      const { error: insertAgentCommErr } = await supabaseAdmin
        .from("commissions")
        .insert({
          tenant_id: sale.tenant_id,
          sale_id: sale.id,
          beneficiary_type: "agent",
          agent_id: data.agentId,
          rate: data.agentCommissionRate,
          amount: agentAmount,
          status: "pending",
          paid_amount: 0
        } as any);

      if (insertAgentCommErr) {
        throw new Error(`Failed to create agent commission: ${insertAgentCommErr.message}`);
      }
    }

    if (data.driverId) {
      const { error: insertDriverCommErr } = await supabaseAdmin
        .from("commissions")
        .insert({
          tenant_id: sale.tenant_id,
          sale_id: sale.id,
          beneficiary_type: "driver",
          driver_id: data.driverId,
          rate: data.driverCommissionRate,
          amount: driverAmount,
          status: "pending",
          paid_amount: 0
        } as any);

      if (insertDriverCommErr) {
        throw new Error(`Failed to create driver commission: ${insertDriverCommErr.message}`);
      }
    }

    // 7. Insert Audit Log
    const { error: auditError } = await supabaseAdmin
      .from("audit_logs")
      .insert({
        tenant_id: sale.tenant_id,
        user_id: userId,
        action: "commission.processed",
        entity_type: "sale",
        entity_id: sale.id,
        metadata: {
          invoice_number: sale.invoice_number,
          agent_id: data.agentId,
          driver_id: data.driverId,
          agent_commission_rate: data.agentCommissionRate,
          driver_commission_rate: data.driverCommissionRate,
          agent_commission_amount: agentAmount,
          driver_commission_amount: driverAmount,
          company_revenue: companyRevenue
        }
      } as any);

    if (auditError) {
      console.error("Failed to write audit log:", auditError);
    }

    return {
      success: true,
      saleId: sale.id,
      invoiceNumber: sale.invoice_number,
      agentCommissionAmount: agentAmount,
      driverCommissionAmount: driverAmount,
      companyRevenue: companyRevenue
    };
  });
