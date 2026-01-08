export type PermitStatus = 
  | 'draft' 
  | 'submitted' 
  | 'under_review' 
  | 'rework_needed'
  | 'pending_pm' 
  | 'pending_pd' 
  | 'pending_bdcr' 
  | 'pending_mpr' 
  | 'pending_it' 
  | 'pending_fitout' 
  | 'pending_ecovert_supervisor' 
  | 'pending_pmd_coordinator' 
  | 'approved' 
  | 'rejected' 
  | 'closed'
  | 'cancelled';

export type UserRole = 
  | 'contractor' 
  | 'helpdesk' 
  | 'pm' 
  | 'pd' 
  | 'bdcr' 
  | 'mpr' 
  | 'it' 
  | 'fitout' 
  | 'ecovert_supervisor' 
  | 'pmd_coordinator' 
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
  pending_pm: 'Pending PM',
  pending_pd: 'Pending PD',
  pending_bdcr: 'Pending BDCR',
  pending_mpr: 'Pending MPR',
  pending_it: 'Pending IT',
  pending_fitout: 'Pending Fit-Out',
  pending_ecovert_supervisor: 'Pending Ecovert Supervisor',
  pending_pmd_coordinator: 'Pending PMD Coordinator',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export const roleLabels: Record<UserRole, string> = {
  contractor: 'Client',
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  ecovert_supervisor: 'Ecovert Supervisor',
  pmd_coordinator: 'PMD Coordinator',
  admin: 'Administrator',
};
