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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          id: string
          performed_by: string
          performed_by_id: string | null
          permit_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          id?: string
          performed_by: string
          performed_by_id?: string | null
          permit_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          id?: string
          performed_by?: string
          performed_by_id?: string | null
          permit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string | null
          permit_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          permit_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string | null
          permit_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      signature_audit_logs: {
        Row: {
          action: string
          created_at: string
          device_info: Json | null
          id: string
          ip_address: string | null
          password_verified: boolean | null
          permit_id: string | null
          role: string
          signature_hash: string | null
          user_agent: string | null
          user_email: string
          user_id: string
          user_name: string
        }
        Insert: {
          action: string
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          password_verified?: boolean | null
          permit_id?: string | null
          role: string
          signature_hash?: string | null
          user_agent?: string | null
          user_email: string
          user_id: string
          user_name: string
        }
        Update: {
          action?: string
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          password_verified?: boolean | null
          permit_id?: string | null
          role?: string
          signature_hash?: string | null
          user_agent?: string | null
          user_email?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_audit_logs_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          action_type: string
          created_at: string
          details: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_email: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          details?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          details?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_permits: {
        Row: {
          attachments: string[] | null
          bdcr_approver_email: string | null
          bdcr_approver_name: string | null
          bdcr_comments: string | null
          bdcr_date: string | null
          bdcr_signature: string | null
          bdcr_status: string | null
          closed_by: string | null
          closed_date: string | null
          closing_clean_confirmed: boolean | null
          closing_incidents: string | null
          closing_remarks: string | null
          contact_mobile: string
          contractor_name: string
          created_at: string
          fitout_approver_email: string | null
          fitout_approver_name: string | null
          fitout_comments: string | null
          fitout_date: string | null
          fitout_signature: string | null
          fitout_status: string | null
          floor: string
          hard_facilities_approver_email: string | null
          hard_facilities_approver_name: string | null
          hard_facilities_comments: string | null
          hard_facilities_date: string | null
          hard_facilities_signature: string | null
          hard_facilities_status: string | null
          helpdesk_approver_email: string | null
          helpdesk_approver_name: string | null
          helpdesk_comments: string | null
          helpdesk_date: string | null
          helpdesk_signature: string | null
          helpdesk_status: string | null
          id: string
          it_approver_email: string | null
          it_approver_name: string | null
          it_comments: string | null
          it_date: string | null
          it_signature: string | null
          it_status: string | null
          mpr_approver_email: string | null
          mpr_approver_name: string | null
          mpr_comments: string | null
          mpr_date: string | null
          mpr_signature: string | null
          mpr_status: string | null
          pd_approver_email: string | null
          pd_approver_name: string | null
          pd_comments: string | null
          pd_date: string | null
          pd_signature: string | null
          pd_status: string | null
          pdf_url: string | null
          permit_no: string
          pm_approver_email: string | null
          pm_approver_name: string | null
          pm_comments: string | null
          pm_date: string | null
          pm_service_approver_email: string | null
          pm_service_approver_name: string | null
          pm_service_comments: string | null
          pm_service_date: string | null
          pm_service_signature: string | null
          pm_service_status: string | null
          pm_signature: string | null
          pm_status: string | null
          requester_email: string
          requester_id: string | null
          requester_name: string
          sla_breached: boolean | null
          sla_deadline: string | null
          soft_facilities_approver_email: string | null
          soft_facilities_approver_name: string | null
          soft_facilities_comments: string | null
          soft_facilities_date: string | null
          soft_facilities_signature: string | null
          soft_facilities_status: string | null
          status: Database["public"]["Enums"]["permit_status"]
          unit: string
          updated_at: string
          urgency: string | null
          work_date_from: string
          work_date_to: string
          work_description: string
          work_location: string
          work_time_from: string
          work_time_to: string
          work_type_id: string | null
        }
        Insert: {
          attachments?: string[] | null
          bdcr_approver_email?: string | null
          bdcr_approver_name?: string | null
          bdcr_comments?: string | null
          bdcr_date?: string | null
          bdcr_signature?: string | null
          bdcr_status?: string | null
          closed_by?: string | null
          closed_date?: string | null
          closing_clean_confirmed?: boolean | null
          closing_incidents?: string | null
          closing_remarks?: string | null
          contact_mobile: string
          contractor_name: string
          created_at?: string
          fitout_approver_email?: string | null
          fitout_approver_name?: string | null
          fitout_comments?: string | null
          fitout_date?: string | null
          fitout_signature?: string | null
          fitout_status?: string | null
          floor: string
          hard_facilities_approver_email?: string | null
          hard_facilities_approver_name?: string | null
          hard_facilities_comments?: string | null
          hard_facilities_date?: string | null
          hard_facilities_signature?: string | null
          hard_facilities_status?: string | null
          helpdesk_approver_email?: string | null
          helpdesk_approver_name?: string | null
          helpdesk_comments?: string | null
          helpdesk_date?: string | null
          helpdesk_signature?: string | null
          helpdesk_status?: string | null
          id?: string
          it_approver_email?: string | null
          it_approver_name?: string | null
          it_comments?: string | null
          it_date?: string | null
          it_signature?: string | null
          it_status?: string | null
          mpr_approver_email?: string | null
          mpr_approver_name?: string | null
          mpr_comments?: string | null
          mpr_date?: string | null
          mpr_signature?: string | null
          mpr_status?: string | null
          pd_approver_email?: string | null
          pd_approver_name?: string | null
          pd_comments?: string | null
          pd_date?: string | null
          pd_signature?: string | null
          pd_status?: string | null
          pdf_url?: string | null
          permit_no: string
          pm_approver_email?: string | null
          pm_approver_name?: string | null
          pm_comments?: string | null
          pm_date?: string | null
          pm_service_approver_email?: string | null
          pm_service_approver_name?: string | null
          pm_service_comments?: string | null
          pm_service_date?: string | null
          pm_service_signature?: string | null
          pm_service_status?: string | null
          pm_signature?: string | null
          pm_status?: string | null
          requester_email: string
          requester_id?: string | null
          requester_name: string
          sla_breached?: boolean | null
          sla_deadline?: string | null
          soft_facilities_approver_email?: string | null
          soft_facilities_approver_name?: string | null
          soft_facilities_comments?: string | null
          soft_facilities_date?: string | null
          soft_facilities_signature?: string | null
          soft_facilities_status?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          unit: string
          updated_at?: string
          urgency?: string | null
          work_date_from: string
          work_date_to: string
          work_description: string
          work_location: string
          work_time_from: string
          work_time_to: string
          work_type_id?: string | null
        }
        Update: {
          attachments?: string[] | null
          bdcr_approver_email?: string | null
          bdcr_approver_name?: string | null
          bdcr_comments?: string | null
          bdcr_date?: string | null
          bdcr_signature?: string | null
          bdcr_status?: string | null
          closed_by?: string | null
          closed_date?: string | null
          closing_clean_confirmed?: boolean | null
          closing_incidents?: string | null
          closing_remarks?: string | null
          contact_mobile?: string
          contractor_name?: string
          created_at?: string
          fitout_approver_email?: string | null
          fitout_approver_name?: string | null
          fitout_comments?: string | null
          fitout_date?: string | null
          fitout_signature?: string | null
          fitout_status?: string | null
          floor?: string
          hard_facilities_approver_email?: string | null
          hard_facilities_approver_name?: string | null
          hard_facilities_comments?: string | null
          hard_facilities_date?: string | null
          hard_facilities_signature?: string | null
          hard_facilities_status?: string | null
          helpdesk_approver_email?: string | null
          helpdesk_approver_name?: string | null
          helpdesk_comments?: string | null
          helpdesk_date?: string | null
          helpdesk_signature?: string | null
          helpdesk_status?: string | null
          id?: string
          it_approver_email?: string | null
          it_approver_name?: string | null
          it_comments?: string | null
          it_date?: string | null
          it_signature?: string | null
          it_status?: string | null
          mpr_approver_email?: string | null
          mpr_approver_name?: string | null
          mpr_comments?: string | null
          mpr_date?: string | null
          mpr_signature?: string | null
          mpr_status?: string | null
          pd_approver_email?: string | null
          pd_approver_name?: string | null
          pd_comments?: string | null
          pd_date?: string | null
          pd_signature?: string | null
          pd_status?: string | null
          pdf_url?: string | null
          permit_no?: string
          pm_approver_email?: string | null
          pm_approver_name?: string | null
          pm_comments?: string | null
          pm_date?: string | null
          pm_service_approver_email?: string | null
          pm_service_approver_name?: string | null
          pm_service_comments?: string | null
          pm_service_date?: string | null
          pm_service_signature?: string | null
          pm_service_status?: string | null
          pm_signature?: string | null
          pm_status?: string | null
          requester_email?: string
          requester_id?: string | null
          requester_name?: string
          sla_breached?: boolean | null
          sla_deadline?: string | null
          soft_facilities_approver_email?: string | null
          soft_facilities_approver_name?: string | null
          soft_facilities_comments?: string | null
          soft_facilities_date?: string | null
          soft_facilities_signature?: string | null
          soft_facilities_status?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          unit?: string
          updated_at?: string
          urgency?: string | null
          work_date_from?: string
          work_date_to?: string
          work_description?: string
          work_location?: string
          work_time_from?: string
          work_time_to?: string
          work_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_permits_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      work_types: {
        Row: {
          created_at: string
          id: string
          name: string
          requires_bdcr: boolean
          requires_fitout: boolean
          requires_hard_facilities: boolean
          requires_it: boolean
          requires_mpr: boolean
          requires_pd: boolean
          requires_pm: boolean
          requires_soft_facilities: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          requires_bdcr?: boolean
          requires_fitout?: boolean
          requires_hard_facilities?: boolean
          requires_it?: boolean
          requires_mpr?: boolean
          requires_pd?: boolean
          requires_pm?: boolean
          requires_soft_facilities?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          requires_bdcr?: boolean
          requires_fitout?: boolean
          requires_hard_facilities?: boolean
          requires_it?: boolean
          requires_mpr?: boolean
          requires_pd?: boolean
          requires_pm?: boolean
          requires_soft_facilities?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approver: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "contractor"
        | "helpdesk"
        | "pm"
        | "pd"
        | "bdcr"
        | "mpr"
        | "it"
        | "fitout"
        | "soft_facilities"
        | "hard_facilities"
        | "pm_service"
        | "admin"
      permit_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "pending_pm"
        | "pending_pd"
        | "pending_bdcr"
        | "pending_mpr"
        | "pending_it"
        | "pending_fitout"
        | "pending_soft_facilities"
        | "pending_hard_facilities"
        | "pending_pm_service"
        | "approved"
        | "rejected"
        | "closed"
        | "cancelled"
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
        "contractor",
        "helpdesk",
        "pm",
        "pd",
        "bdcr",
        "mpr",
        "it",
        "fitout",
        "soft_facilities",
        "hard_facilities",
        "pm_service",
        "admin",
      ],
      permit_status: [
        "draft",
        "submitted",
        "under_review",
        "pending_pm",
        "pending_pd",
        "pending_bdcr",
        "pending_mpr",
        "pending_it",
        "pending_fitout",
        "pending_soft_facilities",
        "pending_hard_facilities",
        "pending_pm_service",
        "approved",
        "rejected",
        "closed",
        "cancelled",
      ],
    },
  },
} as const
