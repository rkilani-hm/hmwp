import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { getFirstWorkflowStep, notifyActiveApprovers } from './_shared';

export function useCreatePermit() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async (permitData: {
      contractor_name: string;
      contact_mobile: string;
      back_of_house?: boolean;
      building_zone?: string | null;
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

      // Fixed 24h SLA for all permits (priority/urgency UI removed).
      const urgency = permitData.urgency || 'normal';
      const SLA_HOURS = 24;
      const slaDeadline = new Date(Date.now() + SLA_HOURS * 60 * 60 * 1000).toISOString();

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
        // Attachments are keyed on the uploader's user id so the storage RLS
        // INSERT policy (first path segment must equal auth.uid()) is satisfied.
        // The work_permits row doesn't exist yet at upload time, so a permit-id
        // folder can't be used — this mirrors the proven company-logos model.
        if (!user?.id) {
          throw new Error('You must be signed in to upload attachments.');
        }

        // Import file validation
        const { validateFile } = await import('../useFileUpload');

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
          const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

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
      // firstStep.roleName is no longer used for fan-out (server-side
      // RPC reads permit_active_approvers directly). Kept only for
      // the initial status enum value above.

      // Contractor registry (Phase 1): find-or-create the contractor and link it
      // to this tenant, so contractors become reusable records visible to admin.
      // Best-effort — a failure here must not block the permit.
      let contractorId: string | null = null;
      try {
        const { data: cid } = await supabase.rpc('upsert_contractor' as any, {
          p_name: permitData.contractor_name,
          p_phone: permitData.contact_mobile,
        });
        contractorId = (cid as string) ?? null;
      } catch (contractorErr) {
        console.warn('Contractor upsert failed (non-fatal):', contractorErr);
      }

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
          contractor_id: contractorId,
        })
        .select()
        .single();

      if (error) {
        // The permit row failed to insert but files were already uploaded —
        // best-effort remove the orphans (now under the `${user.id}/...` path).
        if (attachmentPaths.length > 0) {
          supabase.storage
            .from('permit-attachments')
            .remove(attachmentPaths)
            .catch((cleanupErr) => {
              console.warn('Failed to clean up orphan uploads after permit insert failure:', cleanupErr);
            });
        }

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
        details: `Permit ${permitNo} submitted for review (24h SLA)`,
      });

      // Submission confirmation notification to the requester.
      // This is one of the three notification events tenants are allowed
      // to receive (see filter_tenant_notifications DB trigger). Message
      // includes a tracking link to the permit detail page.
      if (user?.id) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          permit_id: data.id,
          type: 'permit_submitted',
          title: 'Permit Submitted',
          message: `Your work permit ${permitNo} has been submitted. Track its progress here: /permits/${data.id}`,
        });
      }

      // Notify all currently-active approvers for this permit.
      //
      // Runs server-side via the notify_permit_active_approvers RPC
      // because doing this lookup from the tenant's authenticated
      // session is blocked by RLS on user_roles + profiles. See the
      // long comment on the notifyActiveApprovers helper for the full
      // rationale.
      //
      // The DB trigger (ensure_permit_pending_approvals) runs AFTER
      // INSERT on work_permits, so by the time control returns here
      // the approval rows already exist and the RPC will find them.
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
          // Key on the uploader's user id (consistent with useCreatePermit) so
          // the storage RLS INSERT policy (first segment = auth.uid()) passes.
          // The resubmitter is the permit's requester (checked above).
          const fileName = `${user!.id}/${Date.now()}-${encodeURIComponent(file.name)}`;
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
      // Fixed 24h SLA for all permits (rework version).
      const slaHours = 24;
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
      // firstStep.roleName retained for the initial status only;
      // fan-out is now server-side via RPC.

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

      // Notify approvers — server-side RPC. See useCreatePermit for
      // the full rationale.
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
