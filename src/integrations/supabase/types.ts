export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          address: string | null
          code: string
          company_name: string
          contact_person: string | null
          created_at: string
          default_commission_rate: number
          email: string | null
          id: string
          mobile: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          code: string
          company_name: string
          contact_person?: string | null
          created_at?: string
          default_commission_rate?: number
          email?: string | null
          id?: string
          mobile?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          code?: string
          company_name?: string
          contact_person?: string | null
          created_at?: string
          default_commission_rate?: number
          email?: string | null
          id?: string
          mobile?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          code: string
          created_at: string
          currency: string | null
          id: string
          invoice_counter: number
          name: string
          tenant_id: string
          vat_rate: number | null
        }
        Insert: {
          address?: string | null
          code: string
          created_at?: string
          currency?: string | null
          id?: string
          invoice_counter?: number
          name: string
          tenant_id: string
          vat_rate?: number | null
        }
        Update: {
          address?: string | null
          code?: string
          created_at?: string
          currency?: string | null
          id?: string
          invoice_counter?: number
          name?: string
          tenant_id?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          agent_id: string | null
          amount: number
          beneficiary_type: Database["public"]["Enums"]["beneficiary_type"]
          created_at: string
          driver_id: string | null
          id: string
          paid_amount: number
          rate: number
          sale_id: string
          status: Database["public"]["Enums"]["commission_status"]
          tenant_id: string
        }
        Insert: {
          agent_id?: string | null
          amount: number
          beneficiary_type: Database["public"]["Enums"]["beneficiary_type"]
          created_at?: string
          driver_id?: string | null
          id?: string
          paid_amount?: number
          rate: number
          sale_id: string
          status?: Database["public"]["Enums"]["commission_status"]
          tenant_id: string
        }
        Update: {
          agent_id?: string | null
          amount?: number
          beneficiary_type?: Database["public"]["Enums"]["beneficiary_type"]
          created_at?: string
          driver_id?: string | null
          id?: string
          paid_amount?: number
          rate?: number
          sale_id?: string
          status?: Database["public"]["Enums"]["commission_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          code: string
          created_at: string
          default_commission_rate: number
          full_name: string
          id: string
          mobile: string | null
          nic: string | null
          status: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          user_id: string | null
          vehicle_number: string | null
        }
        Insert: {
          code: string
          created_at?: string
          default_commission_rate?: number
          full_name: string
          id?: string
          mobile?: string | null
          nic?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id: string
          user_id?: string | null
          vehicle_number?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          default_commission_rate?: number
          full_name?: string
          id?: string
          mobile?: string | null
          nic?: string | null
          status?: Database["public"]["Enums"]["entity_status"]
          tenant_id?: string
          user_id?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          commission_id: string
          created_at: string
          id: string
          paid_at: string
          proof_url: string | null
          recorded_by: string | null
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          commission_id: string
          created_at?: string
          id?: string
          paid_at?: string
          proof_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          commission_id?: string
          created_at?: string
          id?: string
          paid_at?: string
          proof_url?: string | null
          recorded_by?: string | null
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          sku: string | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sku?: string | null
          tenant_id: string
          unit_price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sku?: string | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          tenant_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          tenant_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          description: string
          id: string
          line_total: number
          product_id: string | null
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          line_total: number
          product_id?: string | null
          quantity: number
          sale_id: string
          unit_price: number
        }
        Update: {
          description?: string
          id?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          agent_commission_amount: number
          agent_commission_rate: number
          agent_id: string | null
          branch_id: string
          cashier_id: string | null
          company_revenue: number
          created_at: string
          currency: string
          customer_name: string | null
          discount: number
          driver_commission_amount: number
          driver_commission_rate: number
          driver_id: string | null
          gross_amount: number
          id: string
          invoice_number: string
          net_amount: number
          notes: string | null
          qr_token: string
          sale_date: string
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          agent_commission_amount?: number
          agent_commission_rate?: number
          agent_id?: string | null
          branch_id: string
          cashier_id?: string | null
          company_revenue: number
          created_at?: string
          currency?: string
          customer_name?: string | null
          discount?: number
          driver_commission_amount?: number
          driver_commission_rate?: number
          driver_id?: string | null
          gross_amount: number
          id?: string
          invoice_number: string
          net_amount: number
          notes?: string | null
          qr_token?: string
          sale_date?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          tenant_id: string
          vat_amount: number
          vat_rate: number
        }
        Update: {
          agent_commission_amount?: number
          agent_commission_rate?: number
          agent_id?: string | null
          branch_id?: string
          cashier_id?: string | null
          company_revenue?: number
          created_at?: string
          currency?: string
          customer_name?: string | null
          discount?: number
          driver_commission_amount?: number
          driver_commission_rate?: number
          driver_id?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string
          net_amount?: number
          notes?: string | null
          qr_token?: string
          sale_date?: string
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          tenant_id?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          default_currency: string
          default_vat_rate: number
          id: string
          logo_url: string | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          default_vat_rate?: number
          id?: string
          logo_url?: string | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          default_vat_rate?: number
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_sale: { Args: { payload: Json }; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "branch_manager"
        | "cashier"
        | "travel_agent"
        | "driver"
        | "accountant"
      beneficiary_type: "agent" | "driver"
      commission_status: "pending" | "approved" | "paid" | "cancelled"
      entity_status: "active" | "suspended"
      sale_status: "draft" | "completed" | "voided"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "branch_manager",
        "cashier",
        "travel_agent",
        "driver",
        "accountant",
      ],
      beneficiary_type: ["agent", "driver"],
      commission_status: ["pending", "approved", "paid", "cancelled"],
      entity_status: ["active", "suspended"],
      sale_status: ["draft", "completed", "voided"],
    },
  },
} as const
