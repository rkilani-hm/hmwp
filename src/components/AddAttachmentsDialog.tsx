import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Upload,
  Paperclip,
  X,
  IdCard,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAddPermitAttachments, type AttachmentToAdd } from '@/hooks/useAddPermitAttachments';

interface Props {
  permitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PendingFile = AttachmentToAdd & {
  previewUrl?: string;
  validationError?: string;
};

/**
 * Modal launched from PermitDetail's Attachments tab. Lets creators
 * and approvers add additional civil IDs or other documents AFTER a
 * permit has already been submitted (e.g. helpdesk realises an ID
 * was missing during review).
 *
 * Mirrors the wizard's DocumentsStep UX:
 *   - Two upload zones: 'Employee Civil ID or Driving License' and
 *     'Other Documents'
 *   - Image thumbnails for picked files
 *   - Inline validation error on rejected files
 *   - Submit button disabled while any file is invalid
 *
 * Submits via useAddPermitAttachments — failures abort the whole
 * batch with a detailed error; no partial commits.
 */
export function AddAttachmentsDialog({ permitId, open, onOpenChange }: Props) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const addAttachments = useAddPermitAttachments(permitId);

  // Free object URLs on close + on unmount
  useEffect(() => {
    if (!open) {
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      setPending([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = async (files: File[], documentType: AttachmentToAdd['documentType']) => {
    const { validateFile } = await import('@/hooks/useFileUpload');
    const next: PendingFile[] = files.map((file) => {
      const v = validateFile(file);
      const isImage =
        file.type.startsWith('image/') ||
        /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(file.name);
      return {
        file,
        documentType,
        previewUrl: isImage && v.valid ? URL.createObjectURL(file) : undefined,
        validationError: v.valid ? undefined : v.error,
      };
    });
    setPending((prev) => [...prev, ...next]);
  };

  const removeAt = (idx: number) => {
    setPending((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async () => {
    if (pending.length === 0) return;
    // Strip preview/validation metadata before sending to the hook
    const payload: AttachmentToAdd[] = pending
      .filter((p) => !p.validationError)
      .map((p) => ({ file: p.file, documentType: p.documentType }));
    if (payload.length === 0) return;

    addAttachments.mutate(payload, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const invalidCount = pending.filter((p) => p.validationError).length;
  const validCount = pending.length - invalidCount;
  const isUploading = addAttachments.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add attachments</DialogTitle>
          <DialogDescription>
            Upload additional civil IDs or supporting documents for this permit.
            The activity log will record who added them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* IDs section */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <IdCard className="w-4 h-4 text-primary" />
              <h4 className="font-medium text-sm">Employee Civil ID or Driving License</h4>
            </div>
            <UploadZone
              inputId="add-attach-id"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
              onFilesAdded={(files) => handleFiles(files, 'civil_id')}
            />
          </section>

          {/* Other docs section */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-primary" />
              <h4 className="font-medium text-sm">Other Documents</h4>
            </div>
            <UploadZone
              inputId="add-attach-other"
              accept="*"
              onFilesAdded={(files) => handleFiles(files, 'other')}
            />
          </section>

          {/* Pending file list */}
          {pending.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {validCount} ready to upload
                {invalidCount > 0 && ` · ${invalidCount} invalid`}
              </p>
              {pending.map((p, idx) => (
                <PendingFileRow
                  key={`${idx}-${p.file.name}`}
                  file={p}
                  onRemove={() => removeAt(idx)}
                />
              ))}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={validCount === 0 || invalidCount > 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              `Upload ${validCount > 0 ? `${validCount} file${validCount === 1 ? '' : 's'}` : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadZone({
  inputId,
  accept,
  onFilesAdded,
}: {
  inputId: string;
  accept: string;
  onFilesAdded: (files: File[]) => void;
}) {
  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
        'border-border hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      <input
        type="file"
        id={inputId}
        className="hidden"
        multiple
        accept={accept}
        onChange={(e) => {
          if (!e.target.files) return;
          onFilesAdded(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <label htmlFor={inputId} className="cursor-pointer flex items-center justify-center gap-2 text-sm">
        <Upload className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">Click to add files</span>
      </label>
    </div>
  );
}

function PendingFileRow({ file, onRemove }: { file: PendingFile; onRemove: () => void }) {
  const sizeMb = (file.file.size / (1024 * 1024)).toFixed(2);
  return (
    <Card
      className={cn(
        'p-2 flex items-center gap-3',
        file.validationError && 'border-destructive/40 bg-destructive/5',
      )}
    >
      {file.previewUrl ? (
        <img
          src={file.previewUrl}
          alt={file.file.name}
          className="w-10 h-10 rounded object-cover shrink-0 border border-border"
          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
        />
      ) : (
        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate font-medium">{file.file.name}</p>
        <p className="text-xs text-muted-foreground">
          {file.documentType === 'other' ? 'Other Document' : 'Civil ID / Driving License'}
          {' · '}
          {sizeMb} MB
        </p>
        {file.validationError && (
          <p className="text-xs text-destructive mt-0.5 flex items-start gap-1">
            <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{file.validationError}</span>
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onRemove}>
        <X className="w-4 h-4" />
      </Button>
    </Card>
  );
}
