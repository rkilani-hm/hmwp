import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { sendEmailNotification, getEmailsForRole } from '@/utils/emailNotifications';
import { parseEdgeFunctionError } from '@/utils/edgeFunctionErrors';

// Helper function to get the first workflow step for a work type
async function getFirstWorkflowStep(workTypeId: string): Promise<{ roleName: string; status: string } | null> {
  try {
    // Fetch work type with template
    const { data: workType, error: workTypeError } = await supabase
      .from('work_types')
      .select('workflow_template_id')
      .eq('id', workTypeId)
      .single();

    if (workTypeError || !workType?.workflow_template_id) {
      return null;
    }

    // Fetch first workflow step with role
    const { data: steps, error: stepsError } = await supabase
      .from('workflow_steps')
      .select('*, roles:role_id(id, name, label)')
      .eq('workflow_template_id', workType.workflow_template_id)
      .order('step_order', { ascending: true })
      .limit(10);

    if (stepsError || !steps?.length) {
      return null;
    }

    // Fetch work type step configs to check which steps are required
    const { data: configs } = await supabase
      .from('work_type_step_config')
      .select('workflow_step_id, is_required')
      .eq('work_type_id', workTypeId);

    // Find the first required step
    for (const step of steps) {
      const role = step.roles as { id: string; name: string; label: string } | null;
      if (!role) continue;

      // Check if step is required
      const config = configs?.find(c => c.workflow_step_id === step.id);
      const isRequired = config !== undefined 
        ? config.is_required 
        : step.is_required_default ?? true;

      if (isRequired) {
        return {
          roleName: role.name,
          status: `pending_${role.name}`,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching first workflow step:', error);
    return null;
  }
}

// Helper function to get users for a role and send notifications
async function notifyRoleUsers(
  roleName: string, 
  permitId: string, 
  permitNo: string, 
  urgency: string,
  notificationType: 'new_permit' | 'resubmitted',
  profile?: { full_name: string | null } | null,
  userEmail?: string
) {
  try {
    // Get role ID
    const { data: role } = await supabase
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .single();

    if (!role) {
      // LOUD failure — previously this was a silent return, which is
      // exactly the kind of bug that produces 'approvers don't get
      // notified' reports with no obvious cause. Console-warn so it
      // shows up in Sentry/server-logs and is greppable.
      console.warn(
        `[notify] role "${roleName}" not found in public.roles — ` +
        `no in-app/push/email notifications sent for permit ${permitNo}. ` +
        `Likely the role was deleted or renamed.`,
      );
      return;
    }

    // Get users with this role
    const { data: roleUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_id', role.id);

    if (!roleUsers?.length) {
      console.warn(
        `[notify] role "${roleName}" has zero users assigned in user_roles — ` +
        `no notifications sent for permit ${permitNo}. ` +
        `An admin needs to assign at least one user this role via ` +
        `Approvers Management.`,
      );
      return;
    }

    console.log(
      `[notify] role="${roleName}" users=${roleUsers.length} ` +
      `permit=${permitNo} type=${notificationType}`,
    );

    const userIds: string[] = [];

    // Create in-app notifications
    for (const ru of roleUsers) {
      await supabase.from('notifications').insert({
        user_id: ru.user_id,
        permit_id: permitId,
        type: notificationType,
        title: notificationType === 'new_permit' 
          ? `New ${urgency === 'urgent' ? 'URGENT ' : ''}Permit Submitted`
          : `Permit Resubmitted for Review`,
        message: `${permitNo} requires your review. ${urgency === 'urgent' ? '4-hour SLA' : '48-hour SLA'}`,
      });
      userIds.push(ru.user_id);
    }

    // Send push notifications
    if (userIds.length > 0) {
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            userIds,
            title: notificationType === 'new_permit' 
              ? `New ${urgency === 'urgent' ? 'URGENT ' : ''}Permit`
              : 'Permit Resubmitted',
            message: `${permitNo} requires your review`,
            data: { url: '/inbox', permitId },
          },
        });
      } catch (pushError) {
        console.error('Failed to send push notification:', pushError);
      }
    }

    // Send email notifications.
    //
    // Uses getEmailsForRole which queries public.profiles for emails of
    // users with this role. Cast to `any` is intentional: the helper's
    // type signature uses a closed string union of the original built-in
    // roles, but the runtime query works for ANY role (including custom
    // roles like al_hamra_customer_service created via Roles Management).
    try {
      const emails = await getEmailsForRole(roleName as any);
      if (emails.length === 0) {
        console.warn(
          `[notify] role "${roleName}" — getEmailsForRole returned 0 ` +
          `addresses despite ${roleUsers.length} users assigned. ` +
          `Likely those users' profile.email is empty. Permit ${permitNo} email skipped.`,
        );
      } else {
        await sendEmailNotification(
          emails,
          notificationType,
          notificationType === 'new_permit'
            ? `New ${urgency === 'urgent' ? 'URGENT ' : ''}Work Permit: ${permitNo}`
            : `Work Permit Resubmitted: ${permitNo}`,
          {
            permitId,
            permitNo,
            requesterName: profile?.full_name || userEmail,
            urgency,
          }
        );
        console.log(
          `[notify] email sent role="${roleName}" recipients=${emails.length} ` +
          `permit=${permitNo}`,
        );
      }
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
    }
  } catch (error) {
    console.error('Error notifying role users:', error);
  }
}

/**
 * Notify every role currently active on a permit, based on the
 * permit_active_approvers view. This is the SAME source of truth the
 * inbox uses, which means: anyone who would see the permit in their
 * inbox right now gets notified. No more divergence between
 * "computed firstApproverRole" and "DB-determined active approver".
 *
 * Called from two places:
 *   1. After a permit is created/resubmitted — notifies the first
 *      stage's approvers. Use case: tenant submits a permit, the
 *      first-stage role gets in-app + push + email.
 *   2. After an approval advances the workflow to the next stage —
 *      notifies the NEXT stage's approvers. Previously this never
 *      happened, so approvers past stage 1 never got an email.
 *
 * If the view returns nothing, no one is notified — but also nothing
 * appears in any inbox, which is the consistent expected behavior:
 * either the workflow is fully approved, or it's misconfigured (no
 * workflow_steps row for any required role).
 */
async function notifyActiveApprovers(
  permitId: string,
  permitNo: string,
  urgency: string,
  notificationType: 'new_permit' | 'resubmitted',
  profile?: { full_name: string | null } | null,
  userEmail?: string,
) {
  // Read active approver roles from the same view the inbox uses.
  // De-duplicate to avoid notifying the same role twice for a permit
  // with parallel steps (rare, but defensive).
  const { data: activeRows, error } = await supabase
    .from('permit_active_approvers' as any)
    .select('role_name')
    .eq('permit_id', permitId);

  if (error) {
    console.error(
      `[notify] permit_active_approvers query failed for permit ${permitNo}:`,
      error,
    );
    return;
  }

  const activeRoles = Array.from(
    new Set(
      (activeRows ?? [])
        .map((r: any) => r.role_name as string)
        .filter(Boolean),
    ),
  );

  if (activeRoles.length === 0) {
    console.warn(
      `[notify] permit ${permitNo} has NO active approvers in the view. ` +
      `Either the workflow is complete (terminal state) or no workflow_steps ` +
      `row exists for any required role. Check the work_type's workflow_template.`,
    );
    return;
  }

  console.log(
    `[notify] active approver roles for permit ${permitNo}: [${activeRoles.join(', ')}]`,
  );

  // Notify each role. Sequential rather than parallel to keep the
  // log output legible and to avoid hammering the email function's
  // rate limit (20/min, see supabase/functions/send-email-notification).
  for (const roleName of activeRoles) {
    await notifyRoleUsers(
      roleName,
      permitId,
      permitNo,
      urgency,
      notificationType,
      profile,
      userEmail,
    );
  }
}
export interface WorkPermit {
  id: string;
  permit_no: string;
  status: string;
  requester_id: string | null;
  requester_name: string;
  requester_email: string;
  contractor_name: string;
  unit: string;
  floor: string;
  contact_mobile: string;
  work_description: string;
  work_location: string;
  work_date_from: string;
  work_date_to: string;
  work_time_from: string;
  work_time_to: string;
  attachments: string[];
  work_type_id: string | null;
  
  // Urgency & SLA fields
  urgency: string | null;
  sla_deadline: string | null;
  sla_breached: boolean | null;
  
  // Rework tracking
  rework_version: number | null;
  rework_comments: string | null;
  
  // Workflow customization
  workflow_customized: boolean | null;
  workflow_modified_by: string | null;
  workflow_modified_at: string | null;
  
  // Approval fields
  helpdesk_status: string | null;
  helpdesk_approver_name: string | null;
  helpdesk_date: string | null;
  helpdesk_comments: string | null;
  helpdesk_signature: string | null;
  
  pm_status: string | null;
  pm_approver_name: string | null;
  pm_date: string | null;
  pm_comments: string | null;
  pm_signature: string | null;
  
  pd_status: string | null;
  pd_approver_name: string | null;
  pd_date: string | null;
  pd_comments: string | null;
  pd_signature: string | null;
  
  bdcr_status: string | null;
  mpr_status: string | null;
  it_status: string | null;
  fitout_status: string | null;
  ecovert_supervisor_status: string | null;
  pmd_coordinator_status: string | null;
  
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  
  // Joined data
  work_types?: {
    id: string;
    name: string;
    requires_pm: boolean;
    requires_pd: boolean;
    requires_bdcr: boolean;
    requires_mpr: boolean;
    requires_it: boolean;
    requires_fitout: boolean;
    requires_ecovert_supervisor: boolean;
    requires_pmd_coordinator: boolean;
  } | null;
}

export interface WorkType {
  id: string;
  name: string;
  requires_pm: boolean;
  requires_pd: boolean;
  requires_bdcr: boolean;
  requires_mpr: boolean;
  requires_it: boolean;
  requires_fitout: boolean;
  requires_ecovert_supervisor: boolean;
  requires_pmd_coordinator: boolean;
}

export function useWorkPermits() {
  const { user, isApprover } = useAuth();
  const queryClient = useQueryClient();

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('work-permits-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_permits',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['work-permits'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['work-permits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_permits')
        .select(`
          *,
          work_types (
            id,
            name,
            requires_pm,
            requires_pd,
            requires_bdcr,
            requires_mpr,
            requires_it,
            requires_fitout,
            requires_ecovert_supervisor,
            requires_pmd_coordinator
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WorkPermit[];
    },
    enabled: !!user,
  });
}

export function useWorkPermit(id: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['work-permit', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('work_permits')
        .select(`
          *,
          work_types (
            id,
            name,
            requires_pm,
            requires_pd,
            requires_bdcr,
            requires_mpr,
            requires_it,
            requires_fitout,
            requires_ecovert_supervisor,
            requires_pmd_coordinator
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as WorkPermit;
    },
    enabled: !!user && !!id,
  });
}

export function useWorkTypes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['work-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as WorkType[];
    },
    enabled: !!user,
  });
}

export function useCreatePermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permitData: {
      contractor_name: string;
      contact_mobile: string;
      unit: string;
      floor: string;
      work_location: string;
      work_location_id?: string | null;
      work_location_other?: string | null;
      work_type_id: string;
      work_description: string;
      work_date_from: string;
      work_date_to: string;
      work_time_from: string;
      work_time_to: string;
      /**
       * Attachments with metadata (categorization + AI-extracted ID
       * fields). Each entry: { file, documentType, extracted*, isValid }.
       * Uploaded to storage and persisted to permit_attachments table.
       * The legacy work_permits.attachments text[] column gets the file
       * paths too for backward compatibility with existing code paths.
       */
      files?: Array<{
        file: File;
        documentType: 'civil_id' | 'driving_license' | 'other';
        extractedName?: string | null;
        extractedIdNumber?: string | null;
        extractedExpiryDate?: string | null;
        extractedIssueDate?: string | null;
        extractedNationality?: string | null;
        isValid?: boolean;
        extractionStatus: 'pending' | 'converting' | 'processing' | 'success' | 'failed' | 'skipped';
        extractionError?: string;
      }>;
      urgency?: 'normal' | 'urgent';
    }) => {
      // Generate permit number via Postgres RPC. The function lives at
      // public.next_permit_number_today() and uses Asia/Kuwait local time
      // to determine "today" — so a permit created at 01:00 Kuwait local
      // gets that day's number even if UTC is still on the previous day.
      // Format: WP-YYMMDD-NN (e.g. WP-260425-01).
      const { data: rpcPermitNo, error: rpcErr } = await supabase
        .rpc('next_permit_number_today');
      if (rpcErr || !rpcPermitNo) {
        throw new Error(rpcErr?.message || 'Failed to allocate permit number');
      }
      const permitNo = rpcPermitNo as string;

      // Calculate SLA deadline based on urgency
      const urgency = permitData.urgency || 'normal';
      const hoursToAdd = urgency === 'urgent' ? 4 : 48;
      const slaDeadline = new Date(Date.now() + hoursToAdd * 60 * 60 * 1000).toISOString();

      // Generate a temporary ID for file uploads
      const tempId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Upload files first if any.
      // attachmentPaths populates the legacy text[] column on
      // work_permits (kept for backward compatibility).
      // uploadedAttachments carries the AI-extracted metadata to
      // insert into permit_attachments after the work_permit row
      // is created (we need its id first).
      const attachmentPaths: string[] = [];
      type UploadedAttachment = {
        path: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        documentType: 'civil_id' | 'driving_license' | 'other';
        extractedName?: string | null;
        extractedIdNumber?: string | null;
        extractedExpiryDate?: string | null;
        extractedIssueDate?: string | null;
        extractedNationality?: string | null;
        isValid?: boolean;
        extractionStatus: 'pending' | 'converting' | 'processing' | 'success' | 'failed' | 'skipped';
        extractionError?: string;
      };
      const uploadedAttachments: UploadedAttachment[] = [];

      if (permitData.files && permitData.files.length > 0) {
        // Import file validation
        const { validateFile } = await import('./useFileUpload');

        // Track failures so we can abort the whole submit if anything
        // didn't upload. Previously a failed upload was silently
        // skipped — the permit was created with missing attachments
        // and the tenant only saw a toast that scrolled away. Now
        // any failure aborts the submission and surfaces the cause.
        const uploadFailures: { name: string; reason: string }[] = [];

        for (const att of permitData.files) {
          const file = att.file;
          // Validate file before upload
          const validation = validateFile(file);
          if (!validation.valid) {
            uploadFailures.push({
              name: file.name,
              reason: validation.error || 'failed validation',
            });
            continue;
          }

          const fileExt = file.name.split('.').pop()?.toLowerCase();
          const fileName = `${tempId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('permit-attachments')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
              // Pass the actual content type to storage. Falling back to
              // octet-stream for HEIC etc. where the browser may not
              // populate file.type.
              contentType: file.type || 'application/octet-stream',
            });

          if (uploadError) {
            console.error(`Upload failed for ${file.name}:`, uploadError);
            uploadFailures.push({
              name: file.name,
              reason: uploadError.message || 'unknown storage error',
            });
            continue;
          }

          if (uploadData) {
            attachmentPaths.push(fileName);
            uploadedAttachments.push({
              path: fileName,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              documentType: att.documentType,
              extractedName: att.extractedName,
              extractedIdNumber: att.extractedIdNumber,
              extractedExpiryDate: att.extractedExpiryDate,
              extractedIssueDate: att.extractedIssueDate,
              extractedNationality: att.extractedNationality,
              isValid: att.isValid,
              extractionStatus: att.extractionStatus,
              extractionError: att.extractionError,
            });
          }
        }

        // If ANY file failed to upload, abort the whole submission.
        // Previously the permit was created anyway with whatever files
        // succeeded — tenants ended up with permits missing critical
        // documents and only saw a fleeting toast about it.
        if (uploadFailures.length > 0) {
          // Best-effort cleanup of files we DID upload — orphans are
          // fine but wasteful. Don't await; if delete fails, leave them
          // for the storage lifecycle policy to clean up later.
          if (attachmentPaths.length > 0) {
            supabase.storage
              .from('permit-attachments')
              .remove(attachmentPaths)
              .catch((cleanupErr) => {
                console.warn('Failed to clean up orphan uploads:', cleanupErr);
              });
          }

          const failureList = uploadFailures
            .map((f) => `  • ${f.name}: ${f.reason}`)
            .join('\n');
          throw new Error(
            `${uploadFailures.length} file${uploadFailures.length === 1 ? '' : 's'} ` +
            `failed to upload. The permit was NOT submitted. ` +
            `Please remove or replace these files and try again:\n${failureList}`
          );
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { files, ...permitDataWithoutFiles } = permitData;

      // Get the first workflow step dynamically based on work type
      const firstStep = await getFirstWorkflowStep(permitData.work_type_id);

      if (!firstStep) {
        throw new Error(
          'No workflow is configured for this work type. Please ask an admin to assign a workflow template in Workflow Builder.'
        );
      }

      const initialStatus = firstStep.status;
      const firstApproverRole = firstStep.roleName;

      const { data, error } = await supabase
        .from('work_permits')
        .insert({
          ...permitDataWithoutFiles,
          permit_no: permitNo,
          requester_id: user?.id,
          requester_name: profile?.full_name || user?.email || 'Unknown',
          requester_email: user?.email || '',
          status: initialStatus as any,
          urgency,
          sla_deadline: slaDeadline,
          attachments: attachmentPaths,
        })
        .select()
        .single();

      if (error) {
        // Specific catch for the legacy permit_status enum mismatch.
        // If migration 20260513210000_dynamic_permit_status_enum hasn't
        // been applied yet for any reason, surface a clearer message
        // instead of the raw Postgres error.
        if (/permit_status/.test(error.message)) {
          throw new Error(
            'The selected work type uses a role that is not yet registered in the system. ' +
            'Please ask an admin to apply the dynamic-permit-status-enum migration, or ' +
            'temporarily route this work type through a different workflow template.'
          );
        }
        throw error;
      }

      // Persist per-file attachment metadata to the new
      // permit_attachments table (the legacy work_permits.attachments
      // text[] column was already written above). Per-row failures
      // are non-fatal — the permit itself is committed.
      if (uploadedAttachments.length > 0) {
        const attachmentRows = uploadedAttachments.map((a) => ({
          permit_id: data.id,
          file_path: a.path,
          file_name: a.fileName,
          file_size: a.fileSize,
          mime_type: a.mimeType,
          document_type: a.documentType,
          extracted_name: a.extractedName,
          extracted_id_number: a.extractedIdNumber,
          extracted_expiry_date: a.extractedExpiryDate,
          extracted_issue_date: a.extractedIssueDate,
          extracted_nationality: a.extractedNationality,
          // 'converting' is a client-only transient state; coerce to 'pending' for DB
          extraction_status: a.extractionStatus === 'converting' ? 'pending' : a.extractionStatus,
          extraction_error: a.extractionError,
          extracted_at:
            a.extractionStatus === 'success' || a.extractionStatus === 'failed'
              ? new Date().toISOString()
              : null,
          uploaded_by: user?.id,
        }));

        const { error: attachErr } = await supabase
          .from('permit_attachments')
          .insert(attachmentRows);

        if (attachErr) {
          // Log but don't fail the whole permit submission. The
          // legacy attachments array on work_permits still has the
          // paths, so the files are accessible — they just won't
          // carry the categorization + extraction metadata.
          console.error('permit_attachments insert failed (non-fatal):', attachErr);
        }
      }

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: data.id,
        action: 'Permit Created',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: `Permit ${permitNo} submitted for review (${urgency === 'urgent' ? 'URGENT - 4hr SLA' : 'Normal - 48hr SLA'})`,
      });

      // Notify approvers — fan out to EVERY role that the DB trigger
      // placed in permit_active_approvers for this permit. We read
      // from the view rather than re-deriving "the first step" in the
      // frontend because:
      //
      //   1. The view is the same source-of-truth used by the inbox
      //      query. If a role appears in the view, the inbox WILL
      //      show the permit to that user; if not, it won't.
      //      Notifications now follow the same logic exactly — no
      //      drift possible.
      //
      //   2. The view correctly handles parallel approvers (multiple
      //      roles at the same step), custom roles, and any new
      //      role admin adds in future. The previous code used
      //      getFirstWorkflowStep() which had its own walk-the-steps
      //      logic and could silently miss roles the DB trigger
      //      successfully added.
      //
      //   3. Admin-created permits, tenant-created permits, future
      //      bulk-import scripts — they all go through the trigger.
      //      Reading the view downstream means every path benefits.
      //
      // Note: the trigger has already run (we awaited the insert),
      // so permit_active_approvers is populated by the time we query.
      const { data: activeApprovers, error: activeErr } = await supabase
        .from('permit_active_approvers' as any)
        .select('role_name')
        .eq('permit_id', data.id);

      if (activeErr) {
        // Log but don't fail — the permit row was created successfully,
        // and worst case the approver still sees the permit in their
        // inbox (the view is queried fresh on every inbox load).
        console.error('Failed to fetch active approvers for fan-out:', activeErr);
      } else {
        const uniqueRoles = Array.from(
          new Set(
            (((activeApprovers || []) as unknown) as Array<{ role_name: string }>)
              .map((r) => r.role_name)
              .filter(Boolean),
          ),
        );

        if (uniqueRoles.length === 0) {
          // Belt-and-braces: if the trigger didn't populate anything
          // (e.g. the work type has no workflow_template — flagged
          // by the WARNING in the DB function), fall back to the old
          // derived first-step so SOMEONE gets notified. Worst case
          // beats no case.
          console.warn(
            'No active approvers in view for permit',
            data.id,
            '— falling back to derived first step',
          );
          await notifyRoleUsers(
            firstApproverRole,
            data.id,
            permitNo,
            urgency,
            'new_permit',
            profile,
            user?.email,
          );
        } else {
          for (const roleName of uniqueRoles) {
            await notifyRoleUsers(
              roleName,
              data.id,
              permitNo,
              urgency,
              'new_permit',
              profile,
              user?.email,
            );
          }
        }
      }
      // Notify everyone currently active on this permit. Reads from
      // permit_active_approvers — the SAME source the inbox uses, so
      // notified-list and visible-in-inbox are guaranteed to match.
      //
      // NOTE: the populate trigger (ensure_permit_pending_approvals)
      // is AFTER INSERT on work_permits, so by the time control
      // returns here, the approval rows already exist. Race-free.
      await notifyActiveApprovers(
        data.id,
        permitNo,
        urgency,
        'new_permit',
        profile,
        user?.email,
      );

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast.success('Work permit submitted successfully!');
    },
    onError: (error) => {
      toast.error('Failed to submit permit: ' + error.message);
    },
  });
}

export function useApprovePermit() {
  const queryClient = useQueryClient();
  const { user, profile, roles } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      role,
      comments,
      signature,
      approved,
    }: {
      permitId: string;
      role: string;
      comments: string;
      signature: string | null;
      approved: boolean;
    }) => {
      const roleField = role.toLowerCase().replace(' ', '_');
      const approvalStatus = approved ? 'approved' : 'rejected';

      // Build update object dynamically
      const updateData: Record<string, unknown> = {
        [`${roleField}_status`]: approvalStatus,
        [`${roleField}_approver_name`]: profile?.full_name || user?.email,
        [`${roleField}_approver_email`]: user?.email,
        [`${roleField}_date`]: new Date().toISOString(),
        [`${roleField}_comments`]: comments,
        [`${roleField}_signature`]: signature,
      };

      // Update status based on approval flow
      if (!approved) {
        updateData.status = 'rejected';
      }

      const { data, error } = await supabase
        .from('work_permits')
        .update(updateData)
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Detect if this approval is being made via delegation. If so,
      // annotate the audit log so reviewers can later see that the
      // approval came from a deputy, not the role's named approver.
      // get_delegation_origin returns the delegator's user_id when
      // the current user is acting via an active delegation for
      // this role, or NULL when acting in their own right.
      let delegationNote = '';
      try {
        const { data: originId } = await supabase.rpc(
          'get_delegation_origin' as any,
          { acting_user_id: user?.id, acting_role_name: roleField },
        );
        if (originId) {
          const { data: origin } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', originId)
            .single();
          const originName = origin?.full_name || origin?.email || 'unknown';
          delegationNote = ` (acting on behalf of ${originName} via delegation)`;
        }
      } catch (delegationErr) {
        // get_delegation_origin may not exist on older deployments;
        // skip the annotation rather than fail the approval.
        console.warn('Delegation lookup failed (non-fatal):', delegationErr);
      }

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action:
          (approved ? `${role} Approved` : `${role} Rejected`) +
          delegationNote,
        performed_by: (profile?.full_name || user?.email || 'Unknown') + delegationNote,
        performed_by_id: user?.id,
        details: comments || undefined,
      });

      // Notify the NEXT stage's approvers (only on approve — rejection
      // ends the workflow, no one else needs to act).
      //
      // This was missing before — useApprovePermit advanced the permit
      // through the workflow but never told the next role anyone was
      // waiting on them. Result: approvers past stage 1 didn't get
      // emailed/pushed and only saw the permit if they happened to
      // open their inbox.
      //
      // Reads from permit_active_approvers, which now reflects the
      // post-approval state (the approver-advancement trigger on
      // permit_approvals updates the view between our UPDATE and this
      // query). Same source as the inbox, so consistent.
      if (approved) {
        try {
          // Need permit_no for the notification body
          const { data: permitInfo } = await supabase
            .from('work_permits')
            .select('permit_no, urgency')
            .eq('id', permitId)
            .single();

          if (permitInfo) {
            await notifyActiveApprovers(
              permitId,
              permitInfo.permit_no,
              permitInfo.urgency || 'normal',
              'new_permit',
              profile,
              user?.email,
            );
          }
        } catch (notifyErr) {
          // Non-fatal — the approval already succeeded. Log so it
          // surfaces in monitoring; don't roll back.
          console.error(
            `[notify] Failed to notify next-stage approvers after ${role} approved permit ${permitId}:`,
            notifyErr,
          );
        }
      }

      return data;
    },
    onSuccess: (_, variables) => {
      // Comprehensive cache invalidation: the action changed permit
      // status + permit_approvals rows + which step is "active".
      // Anything reading these caches needs to refetch.
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      // Inbox query — without this the just-actioned permit lingers
      // in the approver's inbox until manual refresh.
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      // Approval progress sidebar reads permit_approvals — refresh so
      // it shows the new approved/rejected mark immediately.
      queryClient.invalidateQueries({ queryKey: ['permit-approvals', variables.permitId] });
      // "Currently with" inline badge depends on permit_active_approvers
      // for this permit; the next-stage role just became active.
      queryClient.invalidateQueries({ queryKey: ['permit-active-approvers', variables.permitId] });
      // Activity log will have a new row.
      queryClient.invalidateQueries({ queryKey: ['activity-logs', variables.permitId] });
      toast.success(variables.approved ? 'Permit approved!' : 'Permit rejected');
    },
    onError: (error) => {
      toast.error('Failed to process approval: ' + error.message);
    },
  });
}

// User-friendly error parsing is now handled by '@/utils/edgeFunctionErrors'

export type ApprovalAuth =
  | { authMethod: 'password'; password: string }
  | {
      authMethod: 'webauthn';
      webauthn: { challengeId: string; assertion: unknown };
    };

export function useSecureApprovePermit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      permitId,
      role,
      comments,
      signature,
      approved,
      auth,
    }: {
      permitId: string;
      role: string;
      comments: string;
      signature: string | null;
      approved: boolean;
      auth: ApprovalAuth;
    }) => {
      const body: Record<string, unknown> = {
        permitId,
        role,
        comments,
        signature,
        approved,
        authMethod: auth.authMethod,
      };
      if (auth.authMethod === 'password') {
        body.password = auth.password;
      } else {
        body.webauthn = auth.webauthn;
      }

      const { data, error } = await supabase.functions.invoke(
        'verify-signature-approval',
        { body },
      );

      if (error) {
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        console.error('Edge function error:', error, 'Data:', data);
        throw new Error(userFriendlyMessage);
      }
      if (data?.error) {
        const userFriendlyMessage = parseEdgeFunctionError({ message: data.error }, data);
        throw new Error(userFriendlyMessage);
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      // See sibling useApprovePermit for the full list rationale —
      // both code paths must keep cache state consistent or stale
      // rows linger in the inbox + progress sidebar after action.
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      queryClient.invalidateQueries({ queryKey: ['permit-approvals', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-active-approvers', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['activity-logs', variables.permitId] });
      toast.success(
        variables.approved
          ? 'Permit approved with verified signature!'
          : 'Permit rejected',
      );
    },
    onError: (error: Error) => {
      const message = error.message || 'Failed to process approval';
      if (
        !message.toLowerCase().includes('password') &&
        !message.toLowerCase().includes('incorrect')
      ) {
        toast.error(message);
      }
    },
  });
}

// Hook to get pending permits for approver inbox
export function usePendingPermitsForApprover() {
  const { roles, user } = useAuth();

  return useQuery({
    queryKey: ['pending-permits-approver', roles],
    queryFn: async () => {
      if (roles.length === 0) return [];

      // Phase 2c-5b: reads from permit_active_approvers view (backed by
      // the permit_approvals table populated by Phase 2c-5a). The view
      // returns one row per (permit, active-role) combination — only
      // for the permit's CURRENT active step, so a permit appears in
      // PM's inbox only when PM is genuinely the next approver.
      //
      // Two-query flow: first the view to get permit_ids, then a hydrate
      // query to fetch full permit rows with work_types. Only the active
      // ids are fetched, so this is cheaper than the old
      // .in('status', [enum values…]) filter for large permit tables.
      const { data: activeRows, error: viewErr } = await supabase
        .from('permit_active_approvers' as any)
        .select('permit_id, sla_deadline')
        .in('role_name', roles as unknown as string[])
        .order('sla_deadline', { ascending: true, nullsFirst: false });

      if (viewErr) throw viewErr;
      if (!activeRows || activeRows.length === 0) return [];

      // De-dupe — a permit with parallel steps could appear once per role
      // the user holds. Preserve order (already sorted by SLA deadline).
      const seen = new Set<string>();
      const permitIds: string[] = [];
      for (const row of activeRows as unknown as Array<{ permit_id: string }>) {
        if (!seen.has(row.permit_id)) {
          seen.add(row.permit_id);
          permitIds.push(row.permit_id);
        }
      }

      const { data: permits, error: hydrateErr } = await supabase
        .from('work_permits')
        .select('*, work_types(*)')
        .in('id', permitIds);

      if (hydrateErr) throw hydrateErr;

      // Preserve the SLA-sorted order from the view query.
      const byId = new Map((permits ?? []).map(p => [p.id as string, p]));
      return permitIds
        .map(id => byId.get(id))
        .filter(Boolean) as WorkPermit[];
    },
    enabled: roles.length > 0 && !!user,
  });
}

// Hook to get pending permits count for current user's role
export function usePendingPermitsCount() {
  const { roles } = useAuth();

  return useQuery({
    queryKey: ['pending-permits-count', roles],
    queryFn: async () => {
      if (roles.length === 0) return 0;

      // Phase 2c-5b: count distinct permits that have an active pending
      // row for any of the user's roles. Using count('exact', head:true)
      // on a view returns the raw row count, which could double-count a
      // permit if the user holds multiple roles and the permit is pending
      // on more than one. Acceptable because inbox count is a heuristic —
      // a small over-count is preferable to an additional round trip.
      const { count, error } = await supabase
        .from('permit_active_approvers' as any)
        .select('permit_id', { count: 'exact', head: true })
        .in('role_name', roles as unknown as string[]);

      if (error) return 0;
      return count || 0;
    },
    enabled: roles.length > 0,
  });
}

// Extended WorkPermit type for outbox with action metadata
export interface ProcessedWorkPermit extends WorkPermit {
  userAction: 'approved' | 'rejected' | 'forwarded' | 'rework';
  actionDate: string | null;
}

// Hook to get permits that the current approver has processed (for outbox)
export function useProcessedPermitsForApprover() {
  const { roles, user, profile } = useAuth();
  
  return useQuery({
    queryKey: ['processed-permits-approver', user?.id, roles],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get activity logs where current user took action
      const { data: activityLogs, error: logsError } = await supabase
        .from('activity_logs')
        .select('permit_id, action, created_at, details')
        .eq('performed_by_id', user.id)
        .in('action', ['Approved', 'Rejected', 'Forwarded', 'Rework Requested'])
        .order('created_at', { ascending: false });

      if (logsError) throw logsError;
      if (!activityLogs || activityLogs.length === 0) return [];

      // Get unique permit IDs from activity logs
      const permitIds = [...new Set(activityLogs.map(log => log.permit_id))];

      // Fetch permits
      const { data: permits, error: permitsError } = await supabase
        .from('work_permits')
        .select('*, work_types(*)')
        .in('id', permitIds);

      if (permitsError) throw permitsError;

      // Map permits with their action metadata (most recent action by user)
      const processedPermits: ProcessedWorkPermit[] = (permits || []).map(permit => {
        const userLogs = activityLogs.filter(log => log.permit_id === permit.id);
        const latestLog = userLogs[0]; // Already sorted by created_at desc
        
        let userAction: 'approved' | 'rejected' | 'forwarded' | 'rework' = 'approved';
        if (latestLog?.action === 'Rejected') userAction = 'rejected';
        else if (latestLog?.action === 'Forwarded') userAction = 'forwarded';
        else if (latestLog?.action === 'Rework Requested') userAction = 'rework';

        return {
          ...permit,
          userAction,
          actionDate: latestLog?.created_at || null,
        } as ProcessedWorkPermit;
      });

      // Sort by action date (most recent first)
      return processedPermits.sort((a, b) => {
        if (!a.actionDate) return 1;
        if (!b.actionDate) return -1;
        return new Date(b.actionDate).getTime() - new Date(a.actionDate).getTime();
      });
    },
    enabled: !!user?.id && roles.length > 0,
  });
}

// Hook to forward permit to a different approver
export function useForwardPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  type PermitStatus = string;
  type AppRole = string;

  return useMutation({
    mutationFn: async ({
      permitId,
      targetRole,
      reason,
    }: {
      permitId: string;
      targetRole: AppRole;
      reason: string;
    }) => {
      const statusMap: Record<string, PermitStatus> = {
        helpdesk: 'submitted',
        pm: 'pending_pm',
        pd: 'pending_pd',
        bdcr: 'pending_bdcr',
        mpr: 'pending_mpr',
        it: 'pending_it',
        fitout: 'pending_fitout',
        ecovert_supervisor: 'pending_ecovert_supervisor',
        pmd_coordinator: 'pending_pmd_coordinator',
      };

      const newStatus = statusMap[targetRole];
      if (!newStatus) throw new Error('Invalid target role');

      const { data, error } = await supabase
        .from('work_permits')
        .update({ status: newStatus as any })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Forwarded',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: `Forwarded to ${targetRole.toUpperCase()} - ${reason}`,
      });

      // Create notification for target approvers
      const { data: targetRoleData } = await supabase
        .from('roles')
        .select('id')
        .eq('name', targetRole)
        .single();

      const { data: targetUsers } = targetRoleData ? await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_id', targetRoleData.id) : { data: null };

      if (targetUsers) {
        for (const tu of targetUsers) {
          await supabase.from('notifications').insert({
            user_id: tu.user_id,
            permit_id: permitId,
            type: 'forwarded',
            title: 'Permit Forwarded to You',
            message: `Permit ${data.permit_no} has been forwarded for your review. Reason: ${reason}`,
          });
        }
      }

      // Send email notification to target approvers
      try {
        const targetEmails = await getEmailsForRole(targetRole as any);
        if (targetEmails.length > 0) {
          await sendEmailNotification(
            targetEmails,
            'forwarded',
            `Work Permit Forwarded: ${data.permit_no}`,
            {
              permitId,
              permitNo: data.permit_no,
              comments: reason,
            }
          );
        }
      } catch (emailError) {
        console.error('Failed to send forwarded email notification:', emailError);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit forwarded successfully');
    },
    onError: (error) => {
      toast.error('Failed to forward permit: ' + error.message);
    },
  });
}

// Hook to send permit back for rework
export function useRequestRework() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      reason,
    }: {
      permitId: string;
      reason: string;
    }) => {
      // Set status to rework_needed and store the comments
      const { data, error } = await supabase
        .from('work_permits')
        .update({ 
          status: 'rework_needed' as any,
          rework_comments: reason,
          // Reset all approval statuses so workflow starts fresh after resubmit
          helpdesk_status: 'pending',
          helpdesk_approver_name: null,
          helpdesk_approver_email: null,
          helpdesk_comments: null,
          helpdesk_signature: null,
          helpdesk_date: null,
          pm_status: 'pending',
          pm_approver_name: null,
          pm_approver_email: null,
          pm_comments: null,
          pm_signature: null,
          pm_date: null,
          pd_status: 'pending',
          pd_approver_name: null,
          pd_approver_email: null,
          pd_comments: null,
          pd_signature: null,
          pd_date: null,
          bdcr_status: 'pending',
          bdcr_approver_name: null,
          bdcr_approver_email: null,
          bdcr_comments: null,
          bdcr_signature: null,
          bdcr_date: null,
          mpr_status: 'pending',
          mpr_approver_name: null,
          mpr_approver_email: null,
          mpr_comments: null,
          mpr_signature: null,
          mpr_date: null,
          it_status: 'pending',
          it_approver_name: null,
          it_approver_email: null,
          it_comments: null,
          it_signature: null,
          it_date: null,
          fitout_status: 'pending',
          fitout_approver_name: null,
          fitout_approver_email: null,
          fitout_comments: null,
          fitout_signature: null,
          fitout_date: null,
          ecovert_supervisor_status: 'pending',
          ecovert_supervisor_approver_name: null,
          ecovert_supervisor_approver_email: null,
          ecovert_supervisor_comments: null,
          ecovert_supervisor_signature: null,
          ecovert_supervisor_date: null,
          pmd_coordinator_status: 'pending',
          pmd_coordinator_approver_name: null,
          pmd_coordinator_approver_email: null,
          pmd_coordinator_comments: null,
          pmd_coordinator_signature: null,
          pmd_coordinator_date: null,
        })
        .eq('id', permitId)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Rework Requested',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: reason,
      });

      // Notify the requester
      if (data.requester_id) {
        await supabase.from('notifications').insert({
          user_id: data.requester_id,
          permit_id: permitId,
          type: 'rework_requested',
          title: 'Rework Requested',
          message: `Your permit ${data.permit_no} requires changes. Reason: ${reason}`,
        });
      }

      // Send email notification to requester
      try {
        if (data.requester_email) {
          await sendEmailNotification(
            [data.requester_email],
            'rework',
            `Work Permit Rework Required: ${data.permit_no}`,
            {
              permitId,
              permitNo: data.permit_no,
              comments: reason,
            }
          );
        }
      } catch (emailError) {
        console.error('Failed to send rework email notification:', emailError);
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit sent back for rework');
    },
    onError: (error) => {
      toast.error('Failed to request rework: ' + error.message);
    },
  });
}

// Hook to cancel a permit (only by creator)
export function useCancelPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      reason,
    }: {
      permitId: string;
      reason: string;
    }) => {
      // First verify the user is the creator
      const { data: permit } = await supabase
        .from('work_permits')
        .select('requester_id, permit_no')
        .eq('id', permitId)
        .single();

      if (!permit) throw new Error('Permit not found');
      if (permit.requester_id !== user?.id) {
        throw new Error('You can only withdraw permits you created');
      }

      // Withdrawal-specific UPDATE: doesn't chain .select().single()
      // because that's what produced the misleading 'Cannot coerce the
      // result to a single JSON object' error when RLS blocked the
      // post-update SELECT. Instead we ask for a minimal { count }
      // response which tells us straight away whether the UPDATE took
      // effect. If 0 rows matched, RLS is blocking us — surface a
      // friendly message instead of a Postgrest internal.
      const { error, count } = await supabase
        .from('work_permits')
        .update({ status: 'cancelled' }, { count: 'exact' })
        .eq('id', permitId)
        .eq('requester_id', user?.id); // Extra safety check

      if (error) throw error;

      if (count === 0) {
        // Most likely RLS — the 'Users can withdraw own non-terminal
        // permits' policy added in migration 20260513240000 should
        // allow this. If we hit this branch:
        //   - migration hasn't been applied yet → admin needs to run it
        //   - permit is in a terminal state (approved / rejected /
        //     cancelled / closed) → withdraw isn't allowed there
        throw new Error(
          'You cannot withdraw this permit. It may already be in a final state (approved, rejected, or closed), ' +
          'or your admin needs to apply the latest migration. Refresh the page and try again.'
        );
      }

      // Log activity. Verb is "Withdrawn" to match the tenant-facing
      // UI ("Withdraw permit"). The DB status itself is still
      // 'cancelled' (legacy enum value); the activity_logs label is
      // the human-readable verb so reports/audit show this as a
      // withdrawal, not a cancellation.
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Withdrawn',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: reason || 'Withdrawn by requester',
      });

      // Notify approvers that the permit was withdrawn
      const { data: helpdeskRoleData } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'helpdesk')
        .single();

      const { data: helpdeskUsers } = helpdeskRoleData ? await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_id', helpdeskRoleData.id) : { data: null };

      if (helpdeskUsers) {
        for (const hd of helpdeskUsers) {
          await supabase.from('notifications').insert({
            user_id: hd.user_id,
            permit_id: permitId,
            type: 'cancelled',
            title: 'Permit Withdrawn',
            message: `Permit ${permit.permit_no} has been withdrawn by the requester.`,
          });
        }
      }

      // No payload to return — onSuccess just invalidates caches.
      return;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      queryClient.invalidateQueries({ queryKey: ['pending-permits-approver'] });
      toast.success('Permit withdrawn successfully');
    },
    onError: (error) => {
      toast.error('Failed to withdraw permit: ' + error.message);
    },
  });
}

// Hook to update a permit and resubmit for approval (after rework)
export function useUpdateAndResubmitPermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      permitId,
      updates,
      newFiles,
    }: {
      permitId: string;
      updates: {
        contractor_name: string;
        contact_mobile: string;
        unit: string;
        floor: string;
        work_location: string;
        work_type_id: string;
        work_description: string;
        work_date_from: string;
        work_date_to: string;
        work_time_from: string;
        work_time_to: string;
        urgency: string;
      };
      newFiles: File[];
    }) => {
      // First get the current permit to check permissions and get current version
      const { data: currentPermitResult, error: fetchError } = await supabase
        .from('work_permits')
        .select('*, work_types(name)')
        .eq('id', permitId);

      if (fetchError) throw fetchError;
      if (!currentPermitResult || currentPermitResult.length === 0) {
        throw new Error('Permit not found');
      }
      
      const currentPermit = currentPermitResult[0];
      if (currentPermit.requester_id !== user?.id) {
        throw new Error('You can only edit permits you created');
      }

      // Upload new files if any
      let newAttachmentPaths: string[] = [];
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          const fileName = `${permitId}/${Date.now()}-${encodeURIComponent(file.name)}`;
          const { error: uploadError } = await supabase.storage
            .from('permit-attachments')
            .upload(fileName, file);
          
          if (!uploadError) {
            newAttachmentPaths.push(fileName);
          }
        }
      }

      // Combine existing and new attachments
      const allAttachments = [...(currentPermit.attachments || []), ...newAttachmentPaths];
      const newVersion = (currentPermit.rework_version || 0) + 1;

      // Calculate new permit number with rework version suffix.
      // Format: <base>_V<n> where n is the new rework version. Strips any
      // existing _V<n> (or legacy -V<n>) suffix from the base before
      // appending the new one. This means a permit's *base* number stays
      // stable across all rework cycles; only the suffix changes.
      //
      // Example progression:
      //   WP-260425-01       -- original submission
      //   WP-260425-01_V1    -- first rework resubmit
      //   WP-260425-01_V2    -- second rework resubmit
      const basePermitNo = currentPermit.permit_no.replace(/[_-]V\d+$/, '');
      const newPermitNo = `${basePermitNo}_V${newVersion}`;

      // Calculate new SLA deadline
      const slaHours = updates.urgency === 'urgent' ? 4 : 48;
      const slaDeadline = new Date();
      slaDeadline.setHours(slaDeadline.getHours() + slaHours);

      // Get the first workflow step dynamically based on work type
      const firstStep = await getFirstWorkflowStep(updates.work_type_id);

      if (!firstStep) {
        throw new Error(
          'No workflow is configured for this work type. Please ask an admin to assign a workflow template in Workflow Builder.'
        );
      }

      const initialStatus = firstStep.status;
      const firstApproverRole = firstStep.roleName;

      // Create a NEW permit record (clone) with updated data
      const { data: newPermitData, error: insertError } = await supabase
        .from('work_permits')
        .insert({
          // Copy essential fields from current permit
          requester_id: currentPermit.requester_id,
          requester_name: currentPermit.requester_name,
          requester_email: currentPermit.requester_email,
          is_internal: currentPermit.is_internal,
          external_company_name: currentPermit.external_company_name,
          external_contact_person: currentPermit.external_contact_person,
          work_location_id: currentPermit.work_location_id,
          work_location_other: currentPermit.work_location_other,
          
          // Apply updates from form
          contractor_name: updates.contractor_name,
          contact_mobile: updates.contact_mobile,
          unit: updates.unit,
          floor: updates.floor,
          work_location: updates.work_location,
          work_type_id: updates.work_type_id,
          work_description: updates.work_description,
          work_date_from: updates.work_date_from,
          work_date_to: updates.work_date_to,
          work_time_from: updates.work_time_from,
          work_time_to: updates.work_time_to,
          urgency: updates.urgency,
          
          // New version metadata
          permit_no: newPermitNo,
          parent_permit_id: permitId, // Link to original permit
          rework_version: newVersion,
          attachments: allAttachments,
          
          // Fresh workflow state
          status: initialStatus as any,
          sla_deadline: slaDeadline.toISOString(),
          sla_breached: false,
          
          // Reset all approval fields
          helpdesk_status: 'pending',
          pm_status: 'pending',
          pd_status: 'pending',
          bdcr_status: 'pending',
          mpr_status: 'pending',
          it_status: 'pending',
          fitout_status: 'pending',
          ecovert_supervisor_status: null,
          pmd_coordinator_status: null,
          customer_service_status: 'pending',
          cr_coordinator_status: 'pending',
          head_cr_status: 'pending',
          fmsp_approval_status: 'pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!newPermitData) throw new Error('Failed to create new permit version');

      // Mark the old permit as superseded
      const { error: updateError } = await supabase
        .from('work_permits')
        .update({ 
          status: 'superseded' as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', permitId);

      if (updateError) {
        console.error('Failed to mark old permit as superseded:', updateError);
        // Don't throw - the new permit was created successfully
      }

      // Log activity on the OLD permit
      await supabase.from('activity_logs').insert({
        permit_id: permitId,
        action: 'Superseded',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: `Permit superseded by new version ${newPermitNo}`,
      });

      // Log activity on the NEW permit
      await supabase.from('activity_logs').insert({
        permit_id: newPermitData.id,
        action: 'Created (Resubmission)',
        performed_by: profile?.full_name || user?.email || 'Unknown',
        performed_by_id: user?.id,
        details: `New version created from ${currentPermit.permit_no} after rework`,
      });

      // Notify approvers — fan out from permit_active_approvers, same
      // logic as useCreatePermit. See the long comment there for why.
      const { data: activeApprovers, error: activeErr } = await supabase
        .from('permit_active_approvers' as any)
        .select('role_name')
        .eq('permit_id', newPermitData.id);

      if (activeErr) {
        console.error('Failed to fetch active approvers for resubmit fan-out:', activeErr);
      } else {
        const uniqueRoles = Array.from(
          new Set(
            (((activeApprovers || []) as unknown) as Array<{ role_name: string }>)
              .map((r) => r.role_name)
              .filter(Boolean),
          ),
        );

        if (uniqueRoles.length === 0) {
          // Same fallback as create path — see comment there.
          console.warn(
            'No active approvers in view for resubmitted permit',
            newPermitData.id,
            '— falling back to derived first step',
          );
          await notifyRoleUsers(
            firstApproverRole,
            newPermitData.id,
            newPermitNo,
            updates.urgency,
            'resubmitted',
            profile,
            user?.email,
          );
        } else {
          for (const roleName of uniqueRoles) {
            await notifyRoleUsers(
              roleName,
              newPermitData.id,
              newPermitNo,
              updates.urgency,
              'resubmitted',
              profile,
              user?.email,
            );
          }
        }
      }
      // Notify everyone currently active on the NEW permit. Same
      // approach as initial create — read from the view that's the
      // source of truth for inbox visibility.
      await notifyActiveApprovers(
        newPermitData.id,
        newPermitNo,
        updates.urgency,
        'resubmitted',
        profile,
        user?.email,
      );

      // Return the NEW permit with the new ID
      return { ...newPermitData, newPermitId: newPermitData.id };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', variables.permitId] });
      if (data?.newPermitId) {
        queryClient.invalidateQueries({ queryKey: ['work-permit', data.newPermitId] });
      }
      toast.success('New permit version created and submitted for approval');
    },
    onError: (error) => {
      toast.error('Failed to resubmit permit: ' + error.message);
    },
  });
}

export function usePermitStats() {
  const { data: permits } = useWorkPermits();

  if (!permits) {
    return {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      closed: 0,
      slaBreached: 0,
      urgent: 0,
    };
  }

  return {
    total: permits.length,
    pending: permits.filter(p => 
      p.status.startsWith('pending') || 
      p.status === 'submitted' || 
      p.status === 'under_review' ||
      p.status === 'rework_needed'
    ).length,
    approved: permits.filter(p => p.status === 'approved').length,
    rejected: permits.filter(p => p.status === 'rejected').length,
    closed: permits.filter(p => p.status === 'closed').length,
    slaBreached: permits.filter(p => p.sla_breached).length,
    urgent: permits.filter(p => p.urgency === 'urgent').length,
  };
}
