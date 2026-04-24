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
      admin_deletion_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          performed_by: string
          performed_by_email: string
          performed_by_name: string
          record_details: string | null
          record_id: string
          record_identifier: string
          record_type: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          performed_by: string
          performed_by_email: string
          performed_by_name: string
          record_details?: string | null
          record_id: string
          record_identifier: string
          record_type: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          performed_by?: string
          performed_by_email?: string
          performed_by_name?: string
          record_details?: string | null
          record_id?: string
          record_identifier?: string
          record_type?: string
        }
        Relationships: []
      }
      gate_pass_approvals: {
        Row: {
          approved_at: string | null
          approver_email: string | null
          approver_name: string | null
          approver_user_id: string | null
          auth_method: string | null
          comments: string | null
          created_at: string
          device_info: Json | null
          extra: Json | null
          gate_pass_id: string
          id: string
          ip_address: string | null
          role_id: string | null
          role_name: string
          signature: string | null
          signature_hash: string | null
          status: string
          updated_at: string
          user_agent: string | null
          webauthn_credential_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approver_email?: string | null
          approver_name?: string | null
          approver_user_id?: string | null
          auth_method?: string | null
          comments?: string | null
          created_at?: string
          device_info?: Json | null
          extra?: Json | null
          gate_pass_id: string
          id?: string
          ip_address?: string | null
          role_id?: string | null
          role_name: string
          signature?: string | null
          signature_hash?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          webauthn_credential_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approver_email?: string | null
          approver_name?: string | null
          approver_user_id?: string | null
          auth_method?: string | null
          comments?: string | null
          created_at?: string
          device_info?: Json | null
          extra?: Json | null
          gate_pass_id?: string
          id?: string
          ip_address?: string | null
          role_id?: string | null
          role_name?: string
          signature?: string | null
          signature_hash?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          webauthn_credential_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_pass_approvals_gate_pass_id_fkey"
            columns: ["gate_pass_id"]
            isOneToOne: false
            referencedRelation: "gate_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_webauthn_credential_id_fkey"
            columns: ["webauthn_credential_id"]
            isOneToOne: false
            referencedRelation: "webauthn_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_pass_items: {
        Row: {
          gate_pass_id: string
          id: string
          is_high_value: boolean
          item_details: string
          quantity: string
          remarks: string | null
          serial_number: number
        }
        Insert: {
          gate_pass_id: string
          id?: string
          is_high_value?: boolean
          item_details: string
          quantity?: string
          remarks?: string | null
          serial_number: number
        }
        Update: {
          gate_pass_id?: string
          id?: string
          is_high_value?: boolean
          item_details?: string
          quantity?: string
          remarks?: string | null
          serial_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "gate_pass_items_gate_pass_id_fkey"
            columns: ["gate_pass_id"]
            isOneToOne: false
            referencedRelation: "gate_passes"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_pass_type_workflows: {
        Row: {
          created_at: string | null
          id: string
          pass_type: string
          updated_at: string | null
          workflow_template_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          pass_type: string
          updated_at?: string | null
          workflow_template_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          pass_type?: string
          updated_at?: string | null
          workflow_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_pass_type_workflows_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_passes: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          client_contractor_name: string | null
          client_rep_contact: string | null
          client_rep_email: string | null
          client_rep_name: string | null
          completed_at: string | null
          completed_by: string | null
          cr_coordinator_comments: string | null
          cr_coordinator_date: string | null
          cr_coordinator_name: string | null
          cr_coordinator_signature: string | null
          created_at: string
          date_of_request: string
          delivery_area: string | null
          delivery_type: string | null
          finance_comments: string | null
          finance_date: string | null
          finance_name: string | null
          finance_signature: string | null
          has_high_value_asset: boolean
          head_cr_comments: string | null
          head_cr_date: string | null
          head_cr_name: string | null
          head_cr_signature: string | null
          hm_security_pmd_comments: string | null
          hm_security_pmd_date: string | null
          hm_security_pmd_material_action: string | null
          hm_security_pmd_name: string | null
          hm_security_pmd_signature: string | null
          id: string
          is_archived: boolean
          pass_category: string
          pass_no: string
          pass_type: string
          pdf_url: string | null
          purpose: string | null
          requester_email: string
          requester_id: string
          requester_name: string
          security_cctv_confirmed: boolean | null
          security_comments: string | null
          security_date: string | null
          security_name: string | null
          security_pmd_comments: string | null
          security_pmd_date: string | null
          security_pmd_material_action: string | null
          security_pmd_name: string | null
          security_pmd_signature: string | null
          security_signature: string | null
          shifting_method: string | null
          status: string
          store_manager_comments: string | null
          store_manager_date: string | null
          store_manager_name: string | null
          store_manager_signature: string | null
          time_from: string | null
          time_to: string | null
          unit_floor: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          vehicle_license_plate: string | null
          vehicle_make_model: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          client_contractor_name?: string | null
          client_rep_contact?: string | null
          client_rep_email?: string | null
          client_rep_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cr_coordinator_comments?: string | null
          cr_coordinator_date?: string | null
          cr_coordinator_name?: string | null
          cr_coordinator_signature?: string | null
          created_at?: string
          date_of_request?: string
          delivery_area?: string | null
          delivery_type?: string | null
          finance_comments?: string | null
          finance_date?: string | null
          finance_name?: string | null
          finance_signature?: string | null
          has_high_value_asset?: boolean
          head_cr_comments?: string | null
          head_cr_date?: string | null
          head_cr_name?: string | null
          head_cr_signature?: string | null
          hm_security_pmd_comments?: string | null
          hm_security_pmd_date?: string | null
          hm_security_pmd_material_action?: string | null
          hm_security_pmd_name?: string | null
          hm_security_pmd_signature?: string | null
          id?: string
          is_archived?: boolean
          pass_category: string
          pass_no: string
          pass_type: string
          pdf_url?: string | null
          purpose?: string | null
          requester_email: string
          requester_id: string
          requester_name: string
          security_cctv_confirmed?: boolean | null
          security_comments?: string | null
          security_date?: string | null
          security_name?: string | null
          security_pmd_comments?: string | null
          security_pmd_date?: string | null
          security_pmd_material_action?: string | null
          security_pmd_name?: string | null
          security_pmd_signature?: string | null
          security_signature?: string | null
          shifting_method?: string | null
          status?: string
          store_manager_comments?: string | null
          store_manager_date?: string | null
          store_manager_name?: string | null
          store_manager_signature?: string | null
          time_from?: string | null
          time_to?: string | null
          unit_floor?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vehicle_license_plate?: string | null
          vehicle_make_model?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          client_contractor_name?: string | null
          client_rep_contact?: string | null
          client_rep_email?: string | null
          client_rep_name?: string | null
          completed_at?: string | null
          completed_by?: string | null
          cr_coordinator_comments?: string | null
          cr_coordinator_date?: string | null
          cr_coordinator_name?: string | null
          cr_coordinator_signature?: string | null
          created_at?: string
          date_of_request?: string
          delivery_area?: string | null
          delivery_type?: string | null
          finance_comments?: string | null
          finance_date?: string | null
          finance_name?: string | null
          finance_signature?: string | null
          has_high_value_asset?: boolean
          head_cr_comments?: string | null
          head_cr_date?: string | null
          head_cr_name?: string | null
          head_cr_signature?: string | null
          hm_security_pmd_comments?: string | null
          hm_security_pmd_date?: string | null
          hm_security_pmd_material_action?: string | null
          hm_security_pmd_name?: string | null
          hm_security_pmd_signature?: string | null
          id?: string
          is_archived?: boolean
          pass_category?: string
          pass_no?: string
          pass_type?: string
          pdf_url?: string | null
          purpose?: string | null
          requester_email?: string
          requester_id?: string
          requester_name?: string
          security_cctv_confirmed?: boolean | null
          security_comments?: string | null
          security_date?: string | null
          security_name?: string | null
          security_pmd_comments?: string | null
          security_pmd_date?: string | null
          security_pmd_material_action?: string | null
          security_pmd_name?: string | null
          security_pmd_signature?: string | null
          security_signature?: string | null
          shifting_method?: string | null
          status?: string
          store_manager_comments?: string | null
          store_manager_date?: string | null
          store_manager_name?: string | null
          store_manager_signature?: string | null
          time_from?: string | null
          time_to?: string | null
          unit_floor?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          vehicle_license_plate?: string | null
          vehicle_make_model?: string | null
        }
        Relationships: []
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
      permissions: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          label: string
          name: string
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          label: string
          name: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          label?: string
          name?: string
        }
        Relationships: []
      }
      permit_approvals: {
        Row: {
          approved_at: string | null
          approver_email: string | null
          approver_name: string | null
          approver_user_id: string | null
          auth_method: string | null
          comments: string | null
          created_at: string
          device_info: Json | null
          id: string
          ip_address: string | null
          permit_id: string
          role_id: string | null
          role_name: string
          signature: string | null
          signature_hash: string | null
          status: string
          updated_at: string
          user_agent: string | null
          webauthn_credential_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approver_email?: string | null
          approver_name?: string | null
          approver_user_id?: string | null
          auth_method?: string | null
          comments?: string | null
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          permit_id: string
          role_id?: string | null
          role_name: string
          signature?: string | null
          signature_hash?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          webauthn_credential_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approver_email?: string | null
          approver_name?: string | null
          approver_user_id?: string | null
          auth_method?: string | null
          comments?: string | null
          created_at?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          permit_id?: string
          role_id?: string | null
          role_name?: string
          signature?: string | null
          signature_hash?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          webauthn_credential_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_approvals_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_webauthn_credential_id_fkey"
            columns: ["webauthn_credential_id"]
            isOneToOne: false
            referencedRelation: "webauthn_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_workflow_audit: {
        Row: {
          created_at: string | null
          id: string
          ip_address: string | null
          modification_type: string
          modified_by: string
          modified_by_email: string
          modified_by_name: string
          new_steps: Json | null
          new_work_type_id: string | null
          original_steps: Json | null
          original_work_type_id: string | null
          permit_id: string
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          modification_type: string
          modified_by: string
          modified_by_email: string
          modified_by_name: string
          new_steps?: Json | null
          new_work_type_id?: string | null
          original_steps?: Json | null
          original_work_type_id?: string | null
          permit_id: string
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: string | null
          modification_type?: string
          modified_by?: string
          modified_by_email?: string
          modified_by_name?: string
          new_steps?: Json | null
          new_work_type_id?: string | null
          original_steps?: Json | null
          original_work_type_id?: string | null
          permit_id?: string
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_workflow_audit_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_workflow_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_required: boolean
          permit_id: string
          workflow_step_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_required: boolean
          permit_id: string
          workflow_step_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_required?: boolean
          permit_id?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permit_workflow_overrides_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_workflow_overrides_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_preference: string | null
          company_logo: string | null
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
          auth_preference?: string | null
          company_logo?: string | null
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
          auth_preference?: string | null
          company_logo?: string | null
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          label: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          label: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          label?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      signature_audit_logs: {
        Row: {
          action: string
          auth_method: string | null
          created_at: string
          device_info: Json | null
          gate_pass_id: string | null
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
          webauthn_credential_id: string | null
        }
        Insert: {
          action: string
          auth_method?: string | null
          created_at?: string
          device_info?: Json | null
          gate_pass_id?: string | null
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
          webauthn_credential_id?: string | null
        }
        Update: {
          action?: string
          auth_method?: string | null
          created_at?: string
          device_info?: Json | null
          gate_pass_id?: string | null
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
          webauthn_credential_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_audit_logs_gate_pass_id_fkey"
            columns: ["gate_pass_id"]
            isOneToOne: false
            referencedRelation: "gate_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_audit_logs_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_audit_logs_webauthn_credential_id_fkey"
            columns: ["webauthn_credential_id"]
            isOneToOne: false
            referencedRelation: "webauthn_credentials"
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
          role_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_challenges: {
        Row: {
          binding: Json
          challenge: string
          consumed: boolean
          created_at: string
          expires_at: string
          id: string
          purpose: string
          user_id: string
        }
        Insert: {
          binding?: Json
          challenge: string
          consumed?: boolean
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          user_id: string
        }
        Update: {
          binding?: Json
          challenge?: string
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          user_id?: string
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          aaguid: string | null
          backup_eligible: boolean | null
          backup_state: boolean | null
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          backup_eligible?: boolean | null
          backup_state?: boolean | null
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
          user_id: string
        }
        Update: {
          aaguid?: string | null
          backup_eligible?: boolean | null
          backup_state?: boolean | null
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      work_locations: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location_type: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_type?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location_type?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      work_permits: {
        Row: {
          archived_at: string | null
          archived_by: string | null
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
          cr_coordinator_approver_email: string | null
          cr_coordinator_approver_name: string | null
          cr_coordinator_comments: string | null
          cr_coordinator_date: string | null
          cr_coordinator_signature: string | null
          cr_coordinator_status: string | null
          created_at: string
          customer_service_approver_email: string | null
          customer_service_approver_name: string | null
          customer_service_comments: string | null
          customer_service_date: string | null
          customer_service_signature: string | null
          customer_service_status: string | null
          ecovert_supervisor_approver_email: string | null
          ecovert_supervisor_approver_name: string | null
          ecovert_supervisor_comments: string | null
          ecovert_supervisor_date: string | null
          ecovert_supervisor_signature: string | null
          ecovert_supervisor_status: string | null
          external_company_name: string | null
          external_contact_person: string | null
          fitout_approver_email: string | null
          fitout_approver_name: string | null
          fitout_comments: string | null
          fitout_date: string | null
          fitout_signature: string | null
          fitout_status: string | null
          floor: string
          fmsp_approval_approver_email: string | null
          fmsp_approval_approver_name: string | null
          fmsp_approval_comments: string | null
          fmsp_approval_date: string | null
          fmsp_approval_signature: string | null
          fmsp_approval_status: string | null
          head_cr_approver_email: string | null
          head_cr_approver_name: string | null
          head_cr_comments: string | null
          head_cr_date: string | null
          head_cr_signature: string | null
          head_cr_status: string | null
          helpdesk_approver_email: string | null
          helpdesk_approver_name: string | null
          helpdesk_comments: string | null
          helpdesk_date: string | null
          helpdesk_signature: string | null
          helpdesk_status: string | null
          id: string
          is_archived: boolean
          is_internal: boolean | null
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
          parent_permit_id: string | null
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
          pm_signature: string | null
          pm_status: string | null
          pmd_coordinator_approver_email: string | null
          pmd_coordinator_approver_name: string | null
          pmd_coordinator_comments: string | null
          pmd_coordinator_date: string | null
          pmd_coordinator_signature: string | null
          pmd_coordinator_status: string | null
          requester_email: string
          requester_id: string | null
          requester_name: string
          rework_comments: string | null
          rework_version: number | null
          sla_breached: boolean | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["permit_status"]
          unit: string
          updated_at: string
          urgency: string | null
          work_date_from: string
          work_date_to: string
          work_description: string
          work_location: string
          work_location_id: string | null
          work_location_other: string | null
          work_time_from: string
          work_time_to: string
          work_type_id: string | null
          workflow_customized: boolean | null
          workflow_modified_at: string | null
          workflow_modified_by: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
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
          cr_coordinator_approver_email?: string | null
          cr_coordinator_approver_name?: string | null
          cr_coordinator_comments?: string | null
          cr_coordinator_date?: string | null
          cr_coordinator_signature?: string | null
          cr_coordinator_status?: string | null
          created_at?: string
          customer_service_approver_email?: string | null
          customer_service_approver_name?: string | null
          customer_service_comments?: string | null
          customer_service_date?: string | null
          customer_service_signature?: string | null
          customer_service_status?: string | null
          ecovert_supervisor_approver_email?: string | null
          ecovert_supervisor_approver_name?: string | null
          ecovert_supervisor_comments?: string | null
          ecovert_supervisor_date?: string | null
          ecovert_supervisor_signature?: string | null
          ecovert_supervisor_status?: string | null
          external_company_name?: string | null
          external_contact_person?: string | null
          fitout_approver_email?: string | null
          fitout_approver_name?: string | null
          fitout_comments?: string | null
          fitout_date?: string | null
          fitout_signature?: string | null
          fitout_status?: string | null
          floor: string
          fmsp_approval_approver_email?: string | null
          fmsp_approval_approver_name?: string | null
          fmsp_approval_comments?: string | null
          fmsp_approval_date?: string | null
          fmsp_approval_signature?: string | null
          fmsp_approval_status?: string | null
          head_cr_approver_email?: string | null
          head_cr_approver_name?: string | null
          head_cr_comments?: string | null
          head_cr_date?: string | null
          head_cr_signature?: string | null
          head_cr_status?: string | null
          helpdesk_approver_email?: string | null
          helpdesk_approver_name?: string | null
          helpdesk_comments?: string | null
          helpdesk_date?: string | null
          helpdesk_signature?: string | null
          helpdesk_status?: string | null
          id?: string
          is_archived?: boolean
          is_internal?: boolean | null
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
          parent_permit_id?: string | null
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
          pm_signature?: string | null
          pm_status?: string | null
          pmd_coordinator_approver_email?: string | null
          pmd_coordinator_approver_name?: string | null
          pmd_coordinator_comments?: string | null
          pmd_coordinator_date?: string | null
          pmd_coordinator_signature?: string | null
          pmd_coordinator_status?: string | null
          requester_email: string
          requester_id?: string | null
          requester_name: string
          rework_comments?: string | null
          rework_version?: number | null
          sla_breached?: boolean | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          unit: string
          updated_at?: string
          urgency?: string | null
          work_date_from: string
          work_date_to: string
          work_description: string
          work_location: string
          work_location_id?: string | null
          work_location_other?: string | null
          work_time_from: string
          work_time_to: string
          work_type_id?: string | null
          workflow_customized?: boolean | null
          workflow_modified_at?: string | null
          workflow_modified_by?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
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
          cr_coordinator_approver_email?: string | null
          cr_coordinator_approver_name?: string | null
          cr_coordinator_comments?: string | null
          cr_coordinator_date?: string | null
          cr_coordinator_signature?: string | null
          cr_coordinator_status?: string | null
          created_at?: string
          customer_service_approver_email?: string | null
          customer_service_approver_name?: string | null
          customer_service_comments?: string | null
          customer_service_date?: string | null
          customer_service_signature?: string | null
          customer_service_status?: string | null
          ecovert_supervisor_approver_email?: string | null
          ecovert_supervisor_approver_name?: string | null
          ecovert_supervisor_comments?: string | null
          ecovert_supervisor_date?: string | null
          ecovert_supervisor_signature?: string | null
          ecovert_supervisor_status?: string | null
          external_company_name?: string | null
          external_contact_person?: string | null
          fitout_approver_email?: string | null
          fitout_approver_name?: string | null
          fitout_comments?: string | null
          fitout_date?: string | null
          fitout_signature?: string | null
          fitout_status?: string | null
          floor?: string
          fmsp_approval_approver_email?: string | null
          fmsp_approval_approver_name?: string | null
          fmsp_approval_comments?: string | null
          fmsp_approval_date?: string | null
          fmsp_approval_signature?: string | null
          fmsp_approval_status?: string | null
          head_cr_approver_email?: string | null
          head_cr_approver_name?: string | null
          head_cr_comments?: string | null
          head_cr_date?: string | null
          head_cr_signature?: string | null
          head_cr_status?: string | null
          helpdesk_approver_email?: string | null
          helpdesk_approver_name?: string | null
          helpdesk_comments?: string | null
          helpdesk_date?: string | null
          helpdesk_signature?: string | null
          helpdesk_status?: string | null
          id?: string
          is_archived?: boolean
          is_internal?: boolean | null
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
          parent_permit_id?: string | null
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
          pm_signature?: string | null
          pm_status?: string | null
          pmd_coordinator_approver_email?: string | null
          pmd_coordinator_approver_name?: string | null
          pmd_coordinator_comments?: string | null
          pmd_coordinator_date?: string | null
          pmd_coordinator_signature?: string | null
          pmd_coordinator_status?: string | null
          requester_email?: string
          requester_id?: string | null
          requester_name?: string
          rework_comments?: string | null
          rework_version?: number | null
          sla_breached?: boolean | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["permit_status"]
          unit?: string
          updated_at?: string
          urgency?: string | null
          work_date_from?: string
          work_date_to?: string
          work_description?: string
          work_location?: string
          work_location_id?: string | null
          work_location_other?: string | null
          work_time_from?: string
          work_time_to?: string
          work_type_id?: string | null
          workflow_customized?: boolean | null
          workflow_modified_at?: string | null
          workflow_modified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_permits_parent_permit_id_fkey"
            columns: ["parent_permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_permits_work_location_id_fkey"
            columns: ["work_location_id"]
            isOneToOne: false
            referencedRelation: "work_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_permits_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      work_type_step_config: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean
          work_type_id: string
          workflow_step_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required: boolean
          work_type_id: string
          workflow_step_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean
          work_type_id?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_type_step_config_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_type_step_config_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
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
          requires_ecovert_supervisor: boolean | null
          requires_fitout: boolean
          requires_it: boolean
          requires_mpr: boolean
          requires_pd: boolean
          requires_pm: boolean
          requires_pmd_coordinator: boolean | null
          workflow_template_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          requires_bdcr?: boolean
          requires_ecovert_supervisor?: boolean | null
          requires_fitout?: boolean
          requires_it?: boolean
          requires_mpr?: boolean
          requires_pd?: boolean
          requires_pm?: boolean
          requires_pmd_coordinator?: boolean | null
          workflow_template_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          requires_bdcr?: boolean
          requires_ecovert_supervisor?: boolean | null
          requires_fitout?: boolean
          requires_it?: boolean
          requires_mpr?: boolean
          requires_pd?: boolean
          requires_pm?: boolean
          requires_pmd_coordinator?: boolean | null
          workflow_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_types_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          can_be_skipped: boolean | null
          created_at: string | null
          id: string
          is_required_default: boolean | null
          role_id: string
          step_name: string | null
          step_order: number
          updated_at: string | null
          workflow_template_id: string
        }
        Insert: {
          can_be_skipped?: boolean | null
          created_at?: string | null
          id?: string
          is_required_default?: boolean | null
          role_id: string
          step_name?: string | null
          step_order: number
          updated_at?: string | null
          workflow_template_id: string
        }
        Update: {
          can_be_skipped?: boolean | null
          created_at?: string | null
          id?: string
          is_required_default?: boolean | null
          role_id?: string
          step_name?: string | null
          step_order?: number
          updated_at?: string | null
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
          workflow_type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
          workflow_type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
          workflow_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      gate_pass_pending_approvals: {
        Row: {
          approved_at: string | null
          approver_email: string | null
          approver_name: string | null
          approver_user_id: string | null
          auth_method: string | null
          comments: string | null
          created_at: string | null
          device_info: Json | null
          extra: Json | null
          gate_pass_id: string | null
          has_high_value_asset: boolean | null
          id: string | null
          ip_address: string | null
          pass_no: string | null
          pass_status: string | null
          pass_type: string | null
          requester_name: string | null
          role_id: string | null
          role_name: string | null
          signature: string | null
          signature_hash: string | null
          status: string | null
          updated_at: string | null
          user_agent: string | null
          webauthn_credential_id: string | null
          workflow_step_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_pass_approvals_gate_pass_id_fkey"
            columns: ["gate_pass_id"]
            isOneToOne: false
            referencedRelation: "gate_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_webauthn_credential_id_fkey"
            columns: ["webauthn_credential_id"]
            isOneToOne: false
            referencedRelation: "webauthn_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_active_approvers: {
        Row: {
          approval_id: string | null
          contractor_name: string | null
          created_at: string | null
          is_archived: boolean | null
          permit_created_at: string | null
          permit_id: string | null
          permit_no: string | null
          permit_status: Database["public"]["Enums"]["permit_status"] | null
          permit_updated_at: string | null
          requester_email: string | null
          requester_id: string | null
          requester_name: string | null
          role_id: string | null
          role_name: string | null
          sla_breached: boolean | null
          sla_deadline: string | null
          status: string | null
          updated_at: string | null
          urgency: string | null
          work_date_from: string | null
          work_date_to: string | null
          work_description: string | null
          work_location: string | null
          work_type_id: string | null
          workflow_step_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_approvals_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_permits_work_type_id_fkey"
            columns: ["work_type_id"]
            isOneToOne: false
            referencedRelation: "work_types"
            referencedColumns: ["id"]
          },
        ]
      }
      permit_pending_approvals: {
        Row: {
          approved_at: string | null
          approver_email: string | null
          approver_name: string | null
          approver_user_id: string | null
          auth_method: string | null
          comments: string | null
          created_at: string | null
          device_info: Json | null
          id: string | null
          ip_address: string | null
          permit_id: string | null
          permit_no: string | null
          permit_status: Database["public"]["Enums"]["permit_status"] | null
          requester_name: string | null
          role_id: string | null
          role_name: string | null
          signature: string | null
          signature_hash: string | null
          sla_deadline: string | null
          status: string | null
          updated_at: string | null
          urgency: string | null
          user_agent: string | null
          webauthn_credential_id: string | null
          workflow_step_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permit_approvals_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "work_permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_webauthn_credential_id_fkey"
            columns: ["webauthn_credential_id"]
            isOneToOne: false
            referencedRelation: "webauthn_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permit_approvals_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cleanup_expired_webauthn_challenges: { Args: never; Returns: undefined }
      ensure_permit_pending_approvals: {
        Args: { _permit_id: string }
        Returns: number
      }
      get_pending_status_for_role: {
        Args: { role_name: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approver: { Args: { _user_id: string }; Returns: boolean }
      is_gate_pass_approver: { Args: { _user_id: string }; Returns: boolean }
      reconcile_gate_pass_approvals: {
        Args: { _gate_pass_id: string }
        Returns: undefined
      }
      reconcile_permit_approvals: {
        Args: { _permit_id: string }
        Returns: undefined
      }
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
        | "ecovert_supervisor"
        | "pmd_coordinator"
      permit_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "rework_needed"
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
        | "pending_customer_service"
        | "pending_cr_coordinator"
        | "pending_head_cr"
        | "pending_fmsp_approval"
        | "pending_pmd_coordinator"
        | "pending_ecovert_supervisor"
        | "superseded"
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
        "ecovert_supervisor",
        "pmd_coordinator",
      ],
      permit_status: [
        "draft",
        "submitted",
        "under_review",
        "rework_needed",
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
        "pending_customer_service",
        "pending_cr_coordinator",
        "pending_head_cr",
        "pending_fmsp_approval",
        "pending_pmd_coordinator",
        "pending_ecovert_supervisor",
        "superseded",
      ],
    },
  },
} as const
