// Public API for @/hooks/useWorkPermits.
//
// This file was split from a single ~1,700-line module into concern
// files (audit item D4). The set of symbols importable from
// '@/hooks/useWorkPermits' is IDENTICAL to the pre-split file — every
// existing call site keeps working unchanged.
//
// Internal helpers (getFirstWorkflowStep, notifyActiveApprovers,
// fetchPermitUrgency) live in ./_shared and are intentionally NOT
// re-exported here — they were never part of the public surface.

// Shared public types
export type { WorkPermit, WorkType } from './_shared';

// Read/query hooks (+ ProcessedWorkPermit type)
export {
  useWorkPermits,
  useWorkPermit,
  useWorkTypes,
  usePendingPermitsForApprover,
  usePendingPermitsCount,
  useProcessedPermitsForApprover,
  usePermitStats,
} from './queries';
export type { ProcessedWorkPermit } from './queries';

// Creation / resubmission mutation hooks
export { useCreatePermit, useUpdateAndResubmitPermit } from './create';

// Approval mutation hooks (+ ApprovalAuth type)
export { useApprovePermit, useSecureApprovePermit } from './approve';
export type { ApprovalAuth } from './approve';

// Forward / rework / cancel mutation hooks
export {
  useForwardPermit,
  useForwardPermitToUser,
  useRequestRework,
  useCancelPermit,
} from './actions';
