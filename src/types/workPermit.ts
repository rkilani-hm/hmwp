export type PermitStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'rework_needed'
  // Internal workflow
  | 'pending_pm'
  | 'pending_pd'
  | 'pending_bdcr'
  | 'pending_mpr'
  | 'pending_it'
  | 'pending_fitout'
  | 'pending_ecovert_supervisor'
  | 'pending_pmd_coordinator'
  // Client workflow
  | 'pending_customer_service'
  | 'pending_cr_coordinator'
  | 'pending_head_cr'
  // Facilities / service roles
  | 'pending_soft_facilities'
  | 'pending_hard_facilities'
  | 'pending_pm_service'
  | 'pending_fmsp_approval'
  // Terminal
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'cancelled';

export type UserRole =
  | 'contractor'
  // Client workflow
  | 'customer_service'
  | 'cr_coordinator'
  | 'head_cr'
  // Internal workflow
  | 'helpdesk'
  | 'pm'
  | 'pd'
  | 'bdcr'
  | 'mpr'
  | 'it'
  | 'fitout'
  | 'ecovert_supervisor'
  | 'pmd_coordinator'
  // Facilities / service roles
  | 'soft_facilities'
  | 'hard_facilities'
  | 'pm_service'
  | 'fmsp_approval'
  | 'admin';

export interface WorkType {
  id: string;
  name: string;
  requiresPM: boolean;
  requiresPD: boolean;
  requiresBDCR: boolean;
  requiresMPR: boolean;
  requiresIT: boolean;
  requiresFitOut: boolean;
  requiresEcovertSupervisor: boolean;
  requiresPMDCoordinator: boolean;
}

export interface ApprovalRecord {
  status: 'pending' | 'approved' | 'rejected' | null;
  approverName: string | null;
  approverEmail: string | null;
  date: string | null;
  comments: string | null;
  signature: string | null;
}

export interface WorkPermit {
  id: string;
  permitNo: string;
  status: PermitStatus;
  requesterName: string;
  requesterEmail: string;
  contractorName: string;
  unit: string;
  floor: string;
  contactMobile: string;
  workDescription: string;
  workLocation: string;
  workDateFrom: string;
  workDateTo: string;
  workTimeFrom: string;
  workTimeTo: string;
  attachments: string[];
  workTypeId: string;
  workTypeName?: string;
  
  // Approval records
  helpdeskApproval: ApprovalRecord;
  pmApproval: ApprovalRecord;
  pdApproval: ApprovalRecord;
  bdcrApproval: ApprovalRecord;
  mprApproval: ApprovalRecord;
  itApproval: ApprovalRecord;
  fitoutApproval: ApprovalRecord;
  ecovertSupervisorApproval: ApprovalRecord;
  pmdCoordinatorApproval: ApprovalRecord;
  
  // Closing info
  closingRemarks: string | null;
  closingCleanConfirmed: boolean;
  closingIncidents: string | null;
  closedBy: string | null;
  closedDate: string | null;
  
  // PDF
  pdfUrl: string | null;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface Approver {
  id: string;
  roleName: UserRole;
  approverName: string;
  approverEmail: string;
}

export interface ActivityLog {
  id: string;
  permitId: string;
  action: string;
  performedBy: string;
  performedAt: string;
  details: string;
}

export const statusLabels: Record<PermitStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  rework_needed: 'Rework Needed',

  // Internal workflow
  pending_pm: 'Pending PM',
  pending_pd: 'Pending PD',
  pending_bdcr: 'Pending BDCR',
  pending_mpr: 'Pending MPR',
  pending_it: 'Pending IT',
  pending_fitout: 'Pending Fit-Out',
  pending_ecovert_supervisor: 'Pending Ecovert Supervisor',
  pending_pmd_coordinator: 'Pending PMD Coordinator',

  // Client workflow
  pending_customer_service: 'Pending Customer Service',
  pending_cr_coordinator: 'Pending CR Coordinator',
  pending_head_cr: 'Pending Head of CR',

  // Facilities / service roles
  pending_soft_facilities: 'Pending Soft Facilities',
  pending_hard_facilities: 'Pending Hard Facilities',
  pending_pm_service: 'Pending PM Service',
  pending_fmsp_approval: 'Pending FMSP Approval',

  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const roleLabels: Record<UserRole, string> = {
  contractor: 'Client',

  // Client workflow
  customer_service: 'Customer Service',
  cr_coordinator: 'CR Coordinator',
  head_cr: 'Head of CR',

  // Internal workflow
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',

  // Facilities / service roles
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service',
  fmsp_approval: 'FMSP Approval',

  admin: 'Administrator',
};
