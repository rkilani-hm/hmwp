import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  Paperclip,
  X,
  IdCard,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  PermitFormData,
  UpdateField,
  AttachmentWithMetadata,
} from './types';

interface Props {
  data: PermitFormData;
  updateField: UpdateField;
}

/**
 * Step 4 — categorized document attachments with AI extraction.
 *
 * Two upload sections:
 *   1. ID Documents (civil IDs + driving licenses) — AI extracts
 *      the holder name + expiry date, shows validity badge.
 *   2. Other Documents — anything else; no extraction.
 *
 * When the user picks a file for an ID slot, we call the
 * extract-id-document edge function with the file as base64.
 * Extraction takes ~2-5 seconds; UI shows spinner → green
 * "Valid" or red "Expired" badge + extracted name.
 */

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_ID_DIMENSION = 1600;

async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(
        MAX_ID_DIMENSION / img.width,
        MAX_ID_DIMENSION / img.height,
        1,
      );
      if (ratio >= 1) {
        URL.revokeObjectURL(url);
        resolve(file);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
        },
        'image/jpeg',
        0.9,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function DocumentsStep({ data, updateField }: Props) {
  useTranslation();
  const [, setExtractingIds] = useState<Set<string>>(new Set());

  const idAttachments = data.attachments.filter(
    (a) => a.documentType === 'civil_id' || a.documentType === 'driving_license',
  );
  const otherAttachments = data.attachments.filter((a) => a.documentType === 'other');

  const patchAttachment = (
    target: AttachmentWithMetadata,
    patch: Partial<AttachmentWithMetadata>,
  ) => {
    updateField(
      'attachments',
      data.attachments.map((a) => (a === target ? { ...a, ...patch } : a)),
    );
  };

  const handleFilesAdded = async (
    files: File[],
    documentType: AttachmentWithMetadata['documentType'],
  ) => {
    const newAttachments: AttachmentWithMetadata[] = files.map((file) => ({
      file,
      documentType,
      extractionStatus: documentType === 'other' ? 'skipped' : 'pending',
    }));

    const updated = [...data.attachments, ...newAttachments];
    updateField('attachments', updated);

    if (documentType !== 'other') {
      for (const att of newAttachments) {
        runExtraction(att, updated);
      }
    }
  };

  const runExtraction = async (
    target: AttachmentWithMetadata,
    snapshot: AttachmentWithMetadata[],
  ) => {
    const withProcessing = snapshot.map((a) =>
      a === target ? { ...a, extractionStatus: 'processing' as const } : a,
    );
    updateField('attachments', withProcessing);
    setExtractingIds((prev) => new Set(prev).add(target.file.name));

    try {
      const downscaled = await downscaleImage(target.file);
      const base64 = await fileToBase64(downscaled);

      const { data: result, error } = await supabase.functions.invoke(
        'extract-id-document',
        {
          body: {
            imageBase64: base64,
            mimeType: downscaled.type || 'image/jpeg',
            documentType: target.documentType,
          },
        },
      );

      if (error) throw new Error(error.message);
      if (!result?.success) {
        const code = result?.error || 'unknown';
        const message =
          code === 'ai_not_configured'
            ? 'AI extraction is not yet configured. Document attached; please verify validity manually.'
            : code === 'ai_quota_exhausted'
              ? 'AI quota exhausted — please add credits in Lovable settings.'
              : code === 'ai_rate_limited'
                ? 'AI service is busy. Try again in a moment.'
                : `Extraction failed: ${code}`;
        patchAttachment(target, {
          extractionStatus: 'failed',
          extractionError: message,
        });
        if (code !== 'ai_not_configured') toast.warning(message);
        return;
      }

      const ex = result.extracted;
      const today = new Date().toISOString().split('T')[0];
      const isValid = ex.expiry_date ? ex.expiry_date >= today : null;

      patchAttachment(target, {
        extractionStatus: 'success',
        extractedName: ex.name,
        extractedIdNumber: ex.id_number,
        extractedExpiryDate: ex.expiry_date,
        extractedIssueDate: ex.issue_date,
        extractedNationality: ex.nationality,
        isValid: isValid ?? undefined,
        documentType:
          ex.document_type === 'driving_license' || ex.document_type === 'civil_id'
            ? ex.document_type
            : target.documentType,
      });
    } catch (err) {
      console.error('Extraction error:', err);
      patchAttachment(target, {
        extractionStatus: 'failed',
        extractionError: (err as Error).message,
      });
    } finally {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.file.name);
        return next;
      });
    }
  };

  const removeAttachment = (target: AttachmentWithMetadata) => {
    updateField(
      'attachments',
      data.attachments.filter((a) => a !== target),
    );
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <IdCard className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">ID Documents</h3>
          <span className="text-sm text-muted-foreground">
            (Civil IDs, Driving Licenses)
          </span>
        </div>

        <UploadZone
          inputId="id-upload"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onFilesAdded={(files) => handleFilesAdded(files, 'civil_id')}
          helperText="Upload civil IDs or driving licenses. We'll automatically read the name and expiry date."
        />

        {idAttachments.length > 0 && (
          <div className="mt-4 space-y-3">
            {idAttachments.map((att, idx) => (
              <IdAttachmentCard
                key={`id-${idx}-${att.file.name}`}
                attachment={att}
                onRemove={() => removeAttachment(att)}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">Other Documents</h3>
          <span className="text-sm text-muted-foreground">
            (Drawings, NDAs, proof of insurance, etc.)
          </span>
        </div>

        <UploadZone
          inputId="other-upload"
          accept="*"
          onFilesAdded={(files) => handleFilesAdded(files, 'other')}
          helperText="Anything else relevant to this permit."
        />

        {otherAttachments.length > 0 && (
          <div className="mt-4 space-y-2">
            {otherAttachments.map((att, idx) => (
              <OtherAttachmentRow
                key={`other-${idx}-${att.file.name}`}
                attachment={att}
                onRemove={() => removeAttachment(att)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface UploadZoneProps {
  inputId: string;
  accept: string;
  onFilesAdded: (files: File[]) => void;
  helperText: string;
}

function UploadZone({ inputId, accept, onFilesAdded, helperText }: UploadZoneProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    onFilesAdded(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
        'border-border hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      <input
        type="file"
        id={inputId}
        className="hidden"
        multiple
        accept={accept}
        onChange={handleChange}
      />
      <label htmlFor={inputId} className="cursor-pointer flex flex-col items-center gap-2">
        <Upload className="w-7 h-7 text-muted-foreground" />
        <span className="text-sm font-medium">Click to upload</span>
        <span className="text-xs text-muted-foreground max-w-xs">{helperText}</span>
      </label>
    </div>
  );
}

interface IdAttachmentCardProps {
  attachment: AttachmentWithMetadata;
  onRemove: () => void;
}

function IdAttachmentCard({ attachment, onRemove }: IdAttachmentCardProps) {
  const { extractionStatus, extractedName, extractedExpiryDate, isValid } = attachment;

  return (
    <Card
      className={cn(
        'p-3 transition-colors',
        extractionStatus === 'success' && isValid === true && 'border-success/40 bg-success/5',
        extractionStatus === 'success' && isValid === false && 'border-destructive/40 bg-destructive/5',
        extractionStatus === 'failed' && 'border-warning/40 bg-warning/5',
      )}
    >
      <div className="flex items-start gap-3">
        <IdCard className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{attachment.file.name}</p>

          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {extractionStatus === 'processing' && (
              <Badge variant="outline" className="gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Reading ID...
              </Badge>
            )}

            {extractionStatus === 'success' && isValid === true && (
              <Badge variant="outline" className="gap-1.5 border-success text-success bg-success/10">
                <CheckCircle className="w-3 h-3" />
                Valid
              </Badge>
            )}

            {extractionStatus === 'success' && isValid === false && (
              <Badge variant="outline" className="gap-1.5 border-destructive text-destructive bg-destructive/10">
                <XCircle className="w-3 h-3" />
                Expired
              </Badge>
            )}

            {extractionStatus === 'success' && isValid === undefined && (
              <Badge variant="outline" className="gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                No expiry detected
              </Badge>
            )}

            {extractionStatus === 'failed' && (
              <Badge variant="outline" className="gap-1.5 border-warning text-warning bg-warning/10">
                <AlertTriangle className="w-3 h-3" />
                Couldn't read
              </Badge>
            )}

            {attachment.documentType === 'driving_license' && (
              <Badge variant="secondary" className="text-xs">
                Driving License
              </Badge>
            )}
          </div>

          {extractionStatus === 'success' && (
            <div className="mt-2 text-xs space-y-0.5 text-muted-foreground">
              {extractedName && (
                <p>
                  <span className="font-medium text-foreground">Holder:</span>{' '}
                  {extractedName}
                </p>
              )}
              {extractedExpiryDate && (
                <p>
                  <span className="font-medium text-foreground">Expiry:</span>{' '}
                  {extractedExpiryDate}
                </p>
              )}
            </div>
          )}

          {extractionStatus === 'failed' && attachment.extractionError && (
            <p className="mt-1.5 text-xs text-muted-foreground italic">
              {attachment.extractionError}
            </p>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-7 w-7"
          onClick={onRemove}
          type="button"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

interface OtherAttachmentRowProps {
  attachment: AttachmentWithMetadata;
  onRemove: () => void;
}

function OtherAttachmentRow({ attachment, onRemove }: OtherAttachmentRowProps) {
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/30 border border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm truncate">{attachment.file.name}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-7 w-7"
        onClick={onRemove}
        type="button"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
