import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface AttachmentToAdd {
  file: File;
  documentType: 'civil_id' | 'driving_license' | 'other';
}

/**
 * Add attachments to an EXISTING work permit (after submission).
 *
 * Used from the PermitDetail page by:
 *   - The requester (their own permit)
 *   - Any approver assigned to the workflow (so e.g. helpdesk can
 *     attach a missing civil ID found later)
 *   - Admins
 *
 * The new files are uploaded to the permit-attachments storage
 * bucket under a path keyed by the actual permit ID, and a row is
 * created in permit_attachments for each. The legacy
 * work_permits.attachments text[] is also appended to preserve
 * compatibility with anywhere still reading the array directly.
 *
 * On any per-file failure, the whole call rejects with a detailed
 * message (orphan uploads cleaned up). No partial commits.
 */
export function useAddPermitAttachments(permitId: string) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (attachments: AttachmentToAdd[]) => {
      if (!user) throw new Error('You must be signed in');
      if (attachments.length === 0) {
        throw new Error('No files selected');
      }

      // Validate every file before doing any upload work
      const { validateFile } = await import('./useFileUpload');
      const failures: { name: string; reason: string }[] = [];
      const uploadedPaths: string[] = [];
      const rows: any[] = [];

      try {
        for (const att of attachments) {
          const file = att.file;
          const validation = validateFile(file);
          if (!validation.valid) {
            failures.push({
              name: file.name,
              reason: validation.error || 'failed validation',
            });
            continue;
          }

          const fileExt = file.name.split('.').pop()?.toLowerCase() || 'bin';
          const storagePath = `${permitId}/${Date.now()}-${Math.random()
            .toString(36)
            .substring(7)}.${fileExt}`;

          const { error: uploadErr } = await supabase.storage
            .from('permit-attachments')
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.type || 'application/octet-stream',
            });

          if (uploadErr) {
            console.error(`Upload failed for ${file.name}:`, uploadErr);
            failures.push({
              name: file.name,
              reason: uploadErr.message || 'storage error',
            });
            continue;
          }

          uploadedPaths.push(storagePath);
          rows.push({
            permit_id: permitId,
            file_path: storagePath,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type || null,
            document_type: att.documentType,
            extraction_status: 'skipped',
            uploaded_by: user.id,
          });
        }

        if (failures.length > 0) {
          // Best-effort cleanup of files that DID succeed; we won't
          // commit a partial set.
          if (uploadedPaths.length > 0) {
            supabase.storage
              .from('permit-attachments')
              .remove(uploadedPaths)
              .catch((err) => console.warn('Cleanup failed:', err));
          }
          const list = failures.map((f) => `  • ${f.name}: ${f.reason}`).join('\n');
          throw new Error(
            `${failures.length} file${failures.length === 1 ? '' : 's'} failed to upload:\n${list}`,
          );
        }

        // Insert permit_attachments rows in one round-trip
        if (rows.length > 0) {
          const { error: insertErr } = await supabase
            .from('permit_attachments')
            .insert(rows);
          if (insertErr) {
            // Roll back the storage uploads
            supabase.storage
              .from('permit-attachments')
              .remove(uploadedPaths)
              .catch((err) => console.warn('Cleanup after insert error failed:', err));
            throw new Error(`Could not save attachment metadata: ${insertErr.message}`);
          }
        }

        // Also append to the legacy work_permits.attachments text[].
        // Read-modify-write the column. Non-fatal if it fails — the
        // permit_attachments rows are the source of truth going forward.
        try {
          const { data: existing } = await supabase
            .from('work_permits')
            .select('attachments')
            .eq('id', permitId)
            .single();
          const merged = [...(existing?.attachments || []), ...uploadedPaths];
          await supabase
            .from('work_permits')
            .update({ attachments: merged })
            .eq('id', permitId);
        } catch (legacyErr) {
          console.warn('Legacy attachments[] update failed (non-fatal):', legacyErr);
        }

        // Log activity so approvers see "files added later"
        await supabase.from('activity_logs').insert({
          permit_id: permitId,
          action: 'Attachments Added',
          performed_by_id: user.id,
          details: `Added ${rows.length} file${rows.length === 1 ? '' : 's'}: ${rows
            .map((r) => r.file_name)
            .join(', ')}`,
        });

        return { added: rows.length };
      } catch (err) {
        // Any uploaded paths we managed before the failure path are
        // already cleaned up in the failure branches; this catch is
        // for unexpected errors only.
        if (uploadedPaths.length > 0 && failures.length === 0) {
          supabase.storage
            .from('permit-attachments')
            .remove(uploadedPaths)
            .catch(() => {});
        }
        throw err;
      }
    },
    onSuccess: ({ added }) => {
      toast.success(
        added === 1
          ? '1 attachment added successfully'
          : `${added} attachments added successfully`,
      );
      queryClient.invalidateQueries({ queryKey: ['permit-attachments', permitId] });
      queryClient.invalidateQueries({ queryKey: ['work-permit', permitId] });
      queryClient.invalidateQueries({ queryKey: ['permit-activity', permitId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add attachments');
    },
  });
}
