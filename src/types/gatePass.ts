export type GatePassCategory = 'detailed_material_pass' | 'generic_delivery_permit';

export type GatePassType =
  | 'material_out'
  | 'material_in'
  | 'asset_transfer'
  | 'scrap_disposal'
  | 'contractor_tools'
  | 'internal_shifting';

export type GatePassStatus =
  | 'draft'
  | 'pending_store_manager'
  | 'pending_finance'
  | 'pending_security'
  | 'pending_security_pmd'
  | 'pending_cr_coordinator'
  | 'pending_head_cr'
  | 'pending_hm_security_pmd'
  | 'approved'
  | 'rejected'
  | 'completed';

export type ShiftingMethod = 'manually' | 'material_trolley' | 'pallet_trolley' | 'forklift';

export type DeliveryType = 'goods' | 'food' | 'materials';

export interface GatePassItem {
  id?: string;
  gate_pass_id?: string;
  serial_number: number;
  item_details: string;
  quantity: string;
  remarks: string;
  is_high_value: boolean;
}

export interface GatePass {
  id: string;
  pass_no: string;
  pass_category: GatePassCategory;
  pass_type: GatePassType;
  status: GatePassStatus;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  date_of_request: string;
  client_contractor_name: string | null;
  client_rep_name: string | null;
  client_rep_email: string | null;
  client_rep_contact: string | null;
  unit_floor: string | null;
  delivery_area: string | null;
  valid_from: string | null;
  valid_to: string | null;
  time_from: string | null;
  time_to: string | null;
  vehicle_make_model: string | null;
  vehicle_license_plate: string | null;
  shifting_method: ShiftingMethod | null;
  purpose: string | null;
  has_high_value_asset: boolean;
  store_manager_name: string | null;
  store_manager_date: string | null;
  store_manager_comments: string | null;
  store_manager_signature: string | null;
  finance_name: string | null;
  finance_date: string | null;
  finance_comments: string | null;
  finance_signature: string | null;
  security_name: string | null;
  security_date: string | null;
  security_comments: string | null;
  security_signature: string | null;
  security_cctv_confirmed: boolean;
  security_pmd_name: string | null;
  security_pmd_date: string | null;
  security_pmd_comments: string | null;
  security_pmd_signature: string | null;
  security_pmd_material_action: string | null;
  completed_at: string | null;
  completed_by: string | null;
  delivery_type: DeliveryType | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  items?: GatePassItem[];
}

export const gatePassCategoryLabels: Record<GatePassCategory, string> = {
  detailed_material_pass: 'Detailed Material Pass',
  generic_delivery_permit: 'Generic Delivery Permit',
};

export const gatePassTypeLabels: Record<GatePassType, string> = {
  material_out: 'Material Out',
  material_in: 'Material In',
  asset_transfer: 'Asset Transfer',
  scrap_disposal: 'Scrap Disposal',
  contractor_tools: 'Contractor Tools',
  internal_shifting: 'Internal Shifting',
};

export const gatePassStatusLabels: Record<string, string> = {
  draft: 'Draft',
  pending_store_manager: 'Pending Store Manager',
  pending_finance: 'Pending Finance',
  pending_security: 'Pending Security',
  pending_security_pmd: 'Pending Security PMD',
  pending_cr_coordinator: 'Pending CR Coordinator',
  pending_head_cr: 'Pending Head CR',
  pending_hm_security_pmd: 'Pending HM Security PMD',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
};

export const shiftingMethodLabels: Record<ShiftingMethod, string> = {
  manually: 'Manually',
  material_trolley: 'Material Trolley',
  pallet_trolley: 'Pallet Trolley',
  forklift: 'Forklift',
};

export const deliveryTypeLabels: Record<DeliveryType, string> = {
  goods: 'Goods',
  food: 'Food',
  materials: 'Materials',
};
