// supabase/functions/_shared/approvals-dualwrite.ts
//
// Phase 2b — dual-write helper for permit_approvals and gate_pass_approvals.
//
// The source of truth in Phase 2b is still the legacy per-role columns on
// work_permits / gate_passes. This helper mirrors every approval write into
// the new approvals tables so they stay in sync while we migrate readers.
//
// Failures here are LOGGED BUT NOT THROWN — we do not want a write to the
// new table to break live approvals. Drift is detectable via the reconcile
// SQL functions and can be repaired.
//
// Once Phase 2b readers are switched over, this helper becomes the primary
// write path and the legacy column writes become the mirror. At that point
// we flip the failure policy to throw.

// Loose type — accepts the real Supabase client without fighting its generics.
// deno-lint-ignore no-explicit-any
type SupabaseLike = any;

export interface PermitApprovalMirror {
  permitId: string;
  roleName: string;                    // e.g. "helpdesk", "pm", "head_cr"
  status: "approved" | "rejected" | "skipped";
  approverUserId: string;
  approverName: string;
  approverEmail: string;
  approvedAt: string;                  // ISO
  comments: string | null;
  signature: string | null;
  signatureHash: string | null;
  authMethod: "password" | "webauthn";
  webauthnCredentialId: string | null; // row id from webauthn_credentials (uuid), NOT the raw credential_id text
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: Record<string, unknown> | null;
}

export async function mirrorPermitApproval(
  client: SupabaseLike,
  m: PermitApprovalMirror,
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      permit_id: m.permitId,
      role_name: m.roleName,
      status: m.status,
      approver_user_id: m.approverUserId,
      approver_name: m.approverName,
      approver_email: m.approverEmail,
      approved_at: m.approvedAt,
      comments: m.comments,
      signature: m.signature,
      signature_hash: m.signatureHash,
      auth_method: m.authMethod,
      webauthn_credential_id: m.webauthnCredentialId,
      ip_address: m.ipAddress,
      user_agent: m.userAgent,
      device_info: m.deviceInfo ?? {},
      updated_at: m.approvedAt,
    };
    const { error } = await client
      .from("permit_approvals")
      .upsert(row, { onConflict: "permit_id,role_name" });
    if (error) {
      console.error("[dualwrite] permit_approvals upsert failed:", error);
    }
  } catch (err) {
    console.error("[dualwrite] permit_approvals threw:", err);
  }
}

export interface GatePassApprovalMirror {
  gatePassId: string;
  roleName: string;
  status: "approved" | "rejected" | "skipped";
  approverUserId: string;
  approverName: string;
  approverEmail: string;
  approvedAt: string;
  comments: string | null;
  signature: string | null;
  signatureHash: string | null;
  authMethod: "password" | "webauthn";
  webauthnCredentialId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: Record<string, unknown> | null;
  // extras that only apply to specific gate pass roles
  extra?: {
    cctv_confirmed?: boolean;
    material_action?: "received" | "released";
  };
}

export async function mirrorGatePassApproval(
  client: SupabaseLike,
  m: GatePassApprovalMirror,
): Promise<void> {
  try {
    const row: Record<string, unknown> = {
      gate_pass_id: m.gatePassId,
      role_name: m.roleName,
      status: m.status,
      approver_user_id: m.approverUserId,
      approver_name: m.approverName,
      approver_email: m.approverEmail,
      approved_at: m.approvedAt,
      comments: m.comments,
      signature: m.signature,
      signature_hash: m.signatureHash,
      auth_method: m.authMethod,
      webauthn_credential_id: m.webauthnCredentialId,
      ip_address: m.ipAddress,
      user_agent: m.userAgent,
      device_info: m.deviceInfo ?? {},
      extra: m.extra ?? {},
      updated_at: m.approvedAt,
    };
    const { error } = await client
      .from("gate_pass_approvals")
      .upsert(row, { onConflict: "gate_pass_id,role_name" });
    if (error) {
      console.error("[dualwrite] gate_pass_approvals upsert failed:", error);
    }
  } catch (err) {
    console.error("[dualwrite] gate_pass_approvals threw:", err);
  }
}
