import {
  IdCard,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AttachmentPreview } from '@/components/ui/AttachmentPreview';
import { cn } from '@/lib/utils';
import { usePermitAttachments, PermitAttachment } from '@/hooks/usePermitAttachments';

interface Props {
  permitId: string;
  /**
   * Legacy attachments array from work_permits.attachments. Used as
   * fallback for permits created before the permit_attachments table
   * was introduced (no per-file metadata available).
   */
  legacyAttachments?: string[];
}

/**
 * Rich attachment viewer for the PermitDetail page.
 *
 * Two rendering modes, selected automatically:
 *
 * - "Rich" — permit_attachments has rows for this permit. Files are
 *   grouped into 'ID Documents' (with AI-extracted holder name,
 *   expiry date, and a green/red validity badge) and 'Other
 *   Documents'. Approvers can see at a glance whether the submitted
 *   IDs are still valid.
 *
 * - "Legacy" — permit_attachments has no rows (permit was submitted
 *   before this feature shipped). Falls back to the flat list of
 *   file paths from work_permits.attachments. No categorization,
 *   no validity badges, no extraction data — but the files are
 *   still viewable.
 */
export function PermitAttachmentsView({ permitId, legacyAttachments = [] }: Props) {
  const { data: attachments, isLoading } = usePermitAttachments(permitId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  // No rows in permit_attachments and no legacy paths either
  if ((!attachments || attachments.length === 0) && legacyAttachments.length === 0) {
    return <p className="text-sm text-muted-foreground">No attachments</p>;
  }

  // Legacy fallback — no per-file metadata available
  if (!attachments || attachments.length === 0) {
    return (
      <div className="space-y-2">
        {legacyAttachments.map((filePath, index) => {
          const filename = filePath.includes('/')
            ? decodeURIComponent(filePath.split('/').pop() || `attachment-${index + 1}`)
            : filePath;
          return (
            <AttachmentPreview
              key={index}
              filePath={filePath}
              filename={filename}
            />
          );
        })}
      </div>
    );
  }

  // Rich mode: group by document_type
  const idDocs = attachments.filter(
    (a) => a.document_type === 'civil_id' || a.document_type === 'driving_license',
  );
  const otherDocs = attachments.filter((a) => a.document_type === 'other');

  return (
    <div className="space-y-6">
      {idDocs.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <IdCard className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">ID Documents</h4>
            <span className="text-xs text-muted-foreground">
              ({idDocs.length})
            </span>
          </div>
          <div className="space-y-2">
            {idDocs.map((att) => (
              <IdAttachmentCard key={att.id} attachment={att} />
            ))}
          </div>
        </section>
      )}

      {otherDocs.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <h4 className="font-semibold text-sm">Other Documents</h4>
            <span className="text-xs text-muted-foreground">
              ({otherDocs.length})
            </span>
          </div>
          <div className="space-y-2">
            {otherDocs.map((att) => (
              <AttachmentPreview
                key={att.id}
                filePath={att.file_path}
                filename={att.file_name}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function IdAttachmentCard({ attachment }: { attachment: PermitAttachment }) {
  const {
    extraction_status,
    extracted_name,
    extracted_expiry_date,
    extracted_id_number,
    extracted_nationality,
    is_valid,
    document_type,
  } = attachment;

  return (
    <Card
      className={cn(
        'p-3 transition-colors',
        extraction_status === 'success' && is_valid === true && 'border-success/40 bg-success/5',
        extraction_status === 'success' && is_valid === false && 'border-destructive/40 bg-destructive/5',
        extraction_status === 'failed' && 'border-warning/40 bg-warning/5',
      )}
    >
      <CardContent className="p-0 space-y-3">
        {/* Top row: badges + thumbnail / preview */}
        <div className="flex items-start gap-3">
          <IdCard className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{attachment.file_name}</p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {extraction_status === 'processing' && (
                <Badge variant="outline" className="gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Processing...
                </Badge>
              )}

              {extraction_status === 'success' && is_valid === true && (
                <Badge variant="outline" className="gap-1.5 border-success text-success bg-success/10">
                  <CheckCircle className="w-3 h-3" />
                  Valid
                </Badge>
              )}

              {extraction_status === 'success' && is_valid === false && (
                <Badge variant="outline" className="gap-1.5 border-destructive text-destructive bg-destructive/10">
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
                <Badge variant="outline" className="gap-1.5 border-warning text-warning bg-warning/10">
                  <AlertTriangle className="w-3 h-3" />
                  Couldn't read
                </Badge>
              )}

              {extraction_status === 'pending' && (
                <Badge variant="outline" className="gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Pending
                </Badge>
              )}

              <Badge variant="secondary" className="text-xs">
                {document_type === 'driving_license' ? 'Driving License' : 'Civil ID'}
              </Badge>
            </div>

            {/* Extracted fields */}
            {extraction_status === 'success' && (
              <div className="mt-2 text-xs space-y-0.5">
                {extracted_name && (
                  <p>
                    <span className="font-medium text-muted-foreground">Holder:</span>{' '}
                    <span className="font-medium">{extracted_name}</span>
                  </p>
                )}
                {extracted_id_number && (
                  <p>
                    <span className="font-medium text-muted-foreground">ID Number:</span>{' '}
                    <span className="font-mono">{extracted_id_number}</span>
                  </p>
                )}
                {extracted_expiry_date && (
                  <p>
                    <span className="font-medium text-muted-foreground">Expires:</span>{' '}
                    <span className={cn(
                      is_valid === false && 'text-destructive font-medium',
                      is_valid === true && 'text-foreground',
                    )}>
                      {extracted_expiry_date}
                    </span>
                  </p>
                )}
                {extracted_nationality && (
                  <p>
                    <span className="font-medium text-muted-foreground">Nationality:</span>{' '}
                    {extracted_nationality}
                  </p>
                )}
              </div>
            )}

            {extraction_status === 'failed' && attachment.extraction_error && (
              <p className="mt-1.5 text-xs text-muted-foreground italic">
                {attachment.extraction_error}
              </p>
            )}
          </div>
        </div>

        {/* The actual file preview / download */}
        <AttachmentPreview
          filePath={attachment.file_path}
          filename={attachment.file_name}
        />
      </CardContent>
    </Card>
  );
}
