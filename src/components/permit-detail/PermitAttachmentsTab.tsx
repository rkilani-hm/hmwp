import { useMemo, useState } from 'react';
import {
  IdCard,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { usePermitAttachments, type PermitAttachment } from '@/hooks/usePermitAttachments';
import { AddDocumentsDialog } from './AddDocumentsDialog';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  permitId: string;
  permitNo?: string;
  requesterId?: string;
  /**
   * Legacy attachments array from work_permits.attachments text[].
   * Used as fallback when no permit_attachments rows exist (e.g.
   * permits created before the AI extraction feature shipped).
   */
  legacyAttachments?: string[];
}

/**
 * Attachments tab for PermitDetail. Two-mode rendering:
 *
 *   - NEW MODE: permit_attachments rows exist → categorized display
 *     with ID Documents (with validity badges + extracted holder
 *     name + expiry) and Other Documents (plain list).
 *
 *   - LEGACY MODE: no permit_attachments rows but the legacy
 *     work_permits.attachments text[] has paths → falls back to the
 *     original flat list of AttachmentPreview cards. Used for any
 *     permit created before the feature.
 */
export function PermitAttachmentsTab({ permitId, legacyAttachments = [] }: Props) {
  const { data: attachments, isLoading } = usePermitAttachments(permitId);

  const { idDocs, otherDocs } = useMemo(() => {
    if (!attachments) return { idDocs: [], otherDocs: [] };
    return {
      idDocs: attachments.filter(
        (a) => a.document_type === 'civil_id' || a.document_type === 'driving_license',
      ),
      otherDocs: attachments.filter((a) => a.document_type === 'other'),
    };
  }, [attachments]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Attachments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasNew = attachments && attachments.length > 0;
  const hasLegacy = legacyAttachments.length > 0;

  // Empty state
  if (!hasNew && !hasLegacy) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Attachments</CardTitle>
          <CardDescription>No files attached</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Legacy-only mode — render the old flat list. Old permits never
  // had categorization or extraction; show them in plain form.
  if (!hasNew && hasLegacy) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Attachments</CardTitle>
          <CardDescription>
            {legacyAttachments.length} file{legacyAttachments.length === 1 ? '' : 's'} attached
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {legacyAttachments.map((filePath, idx) => {
              const filename = filePath.includes('/')
                ? decodeURIComponent(filePath.split('/').pop() || `attachment-${idx + 1}`)
                : filePath;
              return (
                <AttachmentPreview key={idx} filePath={filePath} filename={filename} />
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  // New mode — categorized display
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display">Attachments</CardTitle>
          <CardDescription>
            {(attachments?.length ?? 0)} file{(attachments?.length ?? 0) === 1 ? '' : 's'} attached
          </CardDescription>
        </CardHeader>
      </Card>

      {idDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IdCard className="h-4 w-4 text-primary" />
              ID Documents
              <span className="text-sm font-normal text-muted-foreground">
                ({idDocs.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {idDocs.map((att) => (
              <IdAttachmentItem key={att.id} attachment={att} />
            ))}
          </CardContent>
        </Card>
      )}

      {otherDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Other Documents
              <span className="text-sm font-normal text-muted-foreground">
                ({otherDocs.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {otherDocs.map((att) => (
              <AttachmentPreview
                key={att.id}
                filePath={att.file_path}
                filename={att.file_name}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Single ID document row with extraction badge + preview.
 *
 * Visual hierarchy:
 *   - Top: file preview (image / pdf / generic icon)
 *   - Middle: holder name (big), document type tag, validity badge
 *   - Bottom: expiry date + nationality + ID number, all small
 *
 * Color cues:
 *   - Green border/bg when valid
 *   - Red border/bg when expired
 *   - Warning amber when extraction failed (still attached, just unverified)
 */
function IdAttachmentItem({ attachment }: { attachment: PermitAttachment }) {
  const {
    extraction_status,
    extracted_name,
    extracted_id_number,
    extracted_expiry_date,
    extracted_nationality,
    is_valid,
    document_type,
  } = attachment;

  const borderClass =
    extraction_status === 'success' && is_valid === true
      ? 'border-success/50 bg-success/5'
      : extraction_status === 'success' && is_valid === false
        ? 'border-destructive/50 bg-destructive/5'
        : extraction_status === 'failed'
          ? 'border-warning/50 bg-warning/5'
          : 'border-border';

  // Mask the ID number — show only last 4 digits. Civil IDs are 12
  // digits in Kuwait; we mask for shoulder-surfing protection in
  // approver inboxes.
  const maskedIdNumber = extracted_id_number
    ? `${'•'.repeat(Math.max(0, extracted_id_number.length - 4))}${extracted_id_number.slice(-4)}`
    : null;

  return (
    <div className={`rounded-lg border-2 ${borderClass} p-3 space-y-3`}>
      {/* Preview + filename */}
      <AttachmentPreview filePath={attachment.file_path} filename={attachment.file_name} />

      {/* Extraction result block */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        {/* Status row: validity badge + document type chip */}
        <div className="flex items-center gap-2 flex-wrap">
          {extraction_status === 'processing' && (
            <Badge variant="outline" className="gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Reading ID...
            </Badge>
          )}

          {extraction_status === 'success' && is_valid === true && (
            <Badge
              variant="outline"
              className="gap-1.5 border-success text-success bg-success/10 font-semibold"
            >
              <CheckCircle className="w-3 h-3" />
              Valid
            </Badge>
          )}

          {extraction_status === 'success' && is_valid === false && (
            <Badge
              variant="outline"
              className="gap-1.5 border-destructive text-destructive bg-destructive/10 font-semibold"
            >
              <XCircle className="w-3 h-3" />
              Expired
            </Badge>
          )}

          {extraction_status === 'success' && is_valid === null && (
            <Badge variant="outline" className="gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              No expiry detected
            </Badge>
          )}

          {extraction_status === 'failed' && (
            <Badge
              variant="outline"
              className="gap-1.5 border-warning text-warning bg-warning/10"
            >
              <AlertTriangle className="w-3 h-3" />
              Couldn't read — verify manually
            </Badge>
          )}

          <Badge variant="secondary" className="text-xs">
            {document_type === 'driving_license' ? 'Driving License' : 'Civil ID'}
          </Badge>
        </div>

        {/* Extracted holder name — prominent */}
        {extracted_name && (
          <p className="font-semibold text-base">{extracted_name}</p>
        )}

        {/* Detail row: expiry, nationality, masked id number */}
        {(extracted_expiry_date || extracted_nationality || maskedIdNumber) && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {extracted_expiry_date && (
              <p>
                <span className="font-medium text-foreground">Expiry:</span>{' '}
                {extracted_expiry_date}
              </p>
            )}
            {extracted_nationality && (
              <p>
                <span className="font-medium text-foreground">Nationality:</span>{' '}
                {extracted_nationality}
              </p>
            )}
            {maskedIdNumber && (
              <p>
                <span className="font-medium text-foreground">ID Number:</span>{' '}
                {maskedIdNumber}
              </p>
            )}
          </div>
        )}

        {extraction_status === 'failed' && attachment.extraction_error && (
          <p className="text-xs text-muted-foreground italic">
            {attachment.extraction_error}
          </p>
        )}
      </div>
    </div>
  );
}
