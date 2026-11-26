# Monitoring findings review

## Rules
- Authorized approvers must be able to forward, request rework, and reject without a narrower assignment guard rolling back their decision.
- A recorded rework request must notify the original requester, while unrelated users cannot send that email.
- Pending-permit queries must work with the status enum, including dynamically configured approver roles.

## Checked paths and outcomes
| Place | Code read | Outcome |
| --- | --- | --- |
| Permit forwarding to a role | ForwardPermitDialog, useForwardPermit, live forward_permit_to_role | Existing active-approver authorization retained; status-update trigger fixed. |
| Forwarding to a person | ForwardPermitDialog, useForwardPermitToUser, live forward_permit_to_user | Already compliant: changes routing without updating permit status. |
| Permit detail rework | ReworkDialog, useRequestRework | Trigger fixed; email now dispatched for a registered requester even without the cached email; failed delivery produces a warning. |
| Direct approval/rejection | useApprovePermit | Status updates use the corrected trigger; no flow-specific permission widening. |
| Inbox quick rejection and signed decisions | ApproverInbox, useSecureApprovePermit, verify-signature-approval status-update code | Already uses the authorized service path; still supported by the corrected trigger. |
| New submission | useCreatePermit assignment/notification code | Existing insert authorization preserved; assignment runs through the trusted trigger. |
| Rework resubmission | useUpdateAndResubmitPermit cloning and superseding code | Existing requester flow retained; cloned inserts and old-version status updates use the corrected trigger. |
| Withdrawal | useCancelPermit | Existing requester restriction retained; status update works through corrected trigger. |
| Automatic workflow reassignment | Live _trg_workflow_step_reassign and workflow_steps policies | Fixed the same narrow-guard problem for trusted workflow edits; admin-only editing and settled-status exclusions unchanged. |
| Admin single/bulk reassignment | Live reassign_permit_approvals and reassign_all_active_permits | Already compliant: admin checks satisfy the direct assignment guard; no changes. |
| Notification diagnostics | Live permit_notification_diagnostic | Read-only; mentions the assignment RPC only in diagnostic text; no changes. |
| Direct pending-assignment RPC | Live ensure_permit_pending_approvals | Requester/admin/on-behalf/service guard preserved. New internal helper denies anon and authenticated execution. |
| Rework notification gateway | dispatch-permit-notification | Fixed expected status to rework_needed; specific permit, caller, and recent action checks retained. |
| Browser email adapter | emailNotifications | Already sends only the verified event and permit ID; caller recipients remain ignored. |
| Email sender | send-email-notification rework template and isolated handler tests | Existing rework event/template retained; service-only sender verified with mocked Graph delivery. |
| Dashboard Stuck Permits | StuckPermitsWidget and database query | Finding stale: current code already uses enum-safe status exclusions; no widget changes. |
| All Permits header and tabs | PermitsList, usePermitListCounts | Fixed sibling enum LIKE bug with non-pending exclusions; search/archive filters and list rendering unchanged. |
| Scheduled background callers | cron.job filtered read | No jobs directly invoke assignment, the rework action, or the notification dispatcher. |

## Verification
- Original permission failure reproduced in isolated PostgreSQL before applying the current migrations.
- 53 isolated regression tests cover trigger updates, direct-RPC guards, helper grants, workflow reassignment, settled records, enum filters, and notification authorization/delivery.
- Live database inspection confirms both triggers use the private helper; anon/authenticated cannot execute it, service role can; original public RPC privileges are unchanged.
- Live read-only count queries succeed for both widget and pending-list filters.
- Notification gateway deployed; preview build clean.
- No authentication accounts/sessions, real notification deliveries, production permit updates, or settled-record backfills were created by this verification.
- Browser flow with a signed-in approver and actual mailbox delivery were not exercised; verification is isolated plus live schema/privilege/query checks.