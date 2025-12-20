export type PermitStatus = 
  | 'draft' 
  | 'submitted' 
  | 'under_review' 
  | 'pending_pm' 
  | 'pending_pd' 
  | 'pending_bdcr' 
  | 'pending_mpr' 
  | 'pending_it' 
  | 'pending_fitout' 
  | 'pending_soft_facilities' 
  | 'pending_hard_facilities' 
  | 'pending_pm_service' 
  | 'approved' 
  | 'rejected' 
  | 'closed';

export type UserRole = 
  | 'contractor' 
  | 'helpdesk' 
  | 'pm' 
  | 'pd' 
  | 'bdcr' 
  | 'mpr' 
  | 'it' 
  | 'fitout' 
  | 'soft_facilities' 
  | 'hard_facilities' 
  | 'pm_service' 
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
  requiresSoftFacilities: boolean;
  requiresHardFacilities: boolean;
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
  softFacilitiesApproval: ApprovalRecord;
  hardFacilitiesApproval: ApprovalRecord;
  pmServiceApproval: ApprovalRecord;
  
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
  pending_pm: 'Pending PM',
  pending_pd: 'Pending PD',
  pending_bdcr: 'Pending BDCR',
  pending_mpr: 'Pending MPR',
  pending_it: 'Pending IT',
  pending_fitout: 'Pending Fit-Out',
  pending_soft_facilities: 'Pending Soft Facilities',
  pending_hard_facilities: 'Pending Hard Facilities',
  pending_pm_service: 'Pending PM Service',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
};

export const roleLabels: Record<UserRole, string> = {
  contractor: 'Contractor',
  helpdesk: 'Helpdesk',
  pm: 'Property Management',
  pd: 'Project Development',
  bdcr: 'BDCR',
  mpr: 'MPR',
  it: 'IT Department',
  fitout: 'Fit-Out',
  soft_facilities: 'Soft Facilities',
  hard_facilities: 'Hard Facilities',
  pm_service: 'PM Service Provider',
  admin: 'Administrator',
};
