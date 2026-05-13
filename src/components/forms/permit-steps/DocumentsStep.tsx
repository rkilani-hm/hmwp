import { useEffect, useState } from 'react';
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
  RefreshCw,
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

/**
 * Build a user-friendly error explanation from a backend error code
 * or raw message. Returns a title (what happened) and a hint (how to
 * fix it). Surfaces the actual cause instead of a generic "couldn't
 * read" message so the user knows whether to retry, re-take the
 * photo, or contact support.
 */
function describeExtractionError(
  code: string | undefined,
  detail: string | undefined,
): { title: string; hint: string } {
  const raw = (detail || '').toLowerCase();

  switch (code) {
    case 'ai_not_configured':
      return {
        title: 'Auto-read is not configured on this server',
        hint: 'Your document is still attached and will be submitted. An administrator needs to enable the AI service.',
      };
    case 'ai_quota_exhausted':
      return {
        title: 'AI auto-read quota has been used up for this month',
        hint: 'Your document is still attached. Ask an administrator to add credits, or proceed and the reviewer will read it manually.',
      };
    case 'ai_rate_limited':
      return {
        title: 'AI service is temporarily busy',
        hint: 'Wait 30 seconds and tap "Try again". Your file is already attached.',
      };
    case 'missing_image':
      return {
        title: 'The image could not be sent to the server',
        hint: 'The file may be empty or corrupted. Remove it and re-attach the photo.',
      };
    case 'ai_empty_response':
    case 'ai_parse_failed':
      return {
        title: 'AI couldn\'t understand the photo',
        hint: 'Re-take the photo with better lighting, no glare, and the whole card visible inside the frame.',
      };
    case 'ai_request_failed':
      return {
        title: 'The AI service returned an error',
        hint: 'Tap "Try again" in a moment. If it keeps failing, your document is still attached and will be reviewed manually.',
      };
    case 'internal_error':
      return {
        title: 'An unexpected error occurred while reading the document',
        hint: detail
          ? `Details: ${detail}. Tap "Try again", or remove and re-upload the file.`
          : 'Tap "Try again", or remove and re-upload the file.',
      };
  }

  // Fall back to pattern-matching the raw message
  if (raw.includes('network') || raw.includes('fetch') || raw.includes('failed to fetch')) {
    return {
      title: 'Couldn\'t reach the AI service',
      hint: 'Check your internet connection and tap "Try again".',
    };
  }
  if (raw.includes('timeout') || raw.includes('timed out')) {
    return {
      title: 'The AI service took too long to respond',
      hint: 'Tap "Try again". If the photo is very large, try a smaller one.',
    };
  }
  if (raw.includes('too large') || raw.includes('413')) {
    return {
      title: 'The image is too large to process',
      hint: 'Re-take the photo at a lower resolution, or use a different photo.',
    };
  }
  if (raw.includes('heic') || raw.includes('convert')) {
    return {
      title: 'Couldn\'t convert the iPhone photo (HEIC) to JPEG',
      hint: 'Open the photo on your phone, save it as JPEG, then upload it again. Or use a non-iPhone photo.',
    };
  }

  return {
    title: 'Couldn\'t auto-read this document',
    hint: detail
      ? `Reason: ${detail}. The file is still attached — tap "Try again" or proceed and it will be reviewed manually.`
      : 'The file is still attached — tap "Try again" or proceed and it will be reviewed manually.',
  };
}

/**
 * iPhones save photos as HEIC by default. Browsers other than Safari
 * can't render HEIC in <img> tags, and Gemini Vision can't decode
 * HEIC at all. So before doing ANYTHING with the file (preview,
 * downscaling, extraction), we convert HEIC → JPEG.
 *
 * heic2any is lazy-loaded only when needed (it's ~700KB; not worth
 * shipping to users who pick JPEGs). Falls back to the original file
 * if conversion fails — the user will still see the "Couldn't read"
 * message but at least the file is attached.
 */
function isHeicFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'heic' || ext === 'heif' ||
    file.type === 'image/heic' || file.type === 'image/heif';
}

async function convertHeicToJpeg(file: File): Promise<File> {
  try {
    const heic2any = (await import('heic2any')).default;
    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });
    // heic2any returns Blob | Blob[]; for single-image HEICs it's just Blob
    const blob = Array.isArray(result) ? result[0] : result;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.error('HEIC conversion failed:', err);
    // Re-throw so the caller can surface the actual error rather than
    // silently passing the unconvertible file to the AI
    throw new Error(
      'Could not convert HEIC image to JPEG. Try taking the photo again ' +
      'or use your phone\'s "Most Compatible" camera setting to save as JPEG.'
    );
  }
}

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

  // Free all preview URLs on unmount. Each entry's previewUrl was
  // created via URL.createObjectURL; leaking them eats memory until
  // the page refreshes.
  useEffect(() => {
    return () => {
      data.attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Lazy import so the validator's file-type list stays in one place.
    // The validator is the source of truth — if it rejects, the upload
    // would fail later anyway; surfacing the error here is much kinder.
    const { validateFile } = await import('@/hooks/useFileUpload');

    const newAttachments: AttachmentWithMetadata[] = files.map((file) => {
      const v = validateFile(file);
      const heic = isHeicFile(file);

      // For HEIC we'll create the preview URL AFTER conversion, when
      // we have a JPEG the browser can actually render.
      const isImage = file.type.startsWith('image/') ||
        /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i.test(file.name);
      const previewUrl = !heic && isImage ? URL.createObjectURL(file) : undefined;

      let initialStatus: AttachmentWithMetadata['extractionStatus'];
      if (!v.valid) {
        initialStatus = 'failed';
      } else if (documentType === 'other') {
        initialStatus = 'skipped';
      } else if (heic) {
        // HEIC needs conversion before anything else can happen
        initialStatus = 'converting';
      } else {
        initialStatus = 'pending';
      }

      return {
        file,
        documentType,
        validationError: v.valid ? undefined : v.error,
        previewUrl,
        extractionStatus: initialStatus,
        extractionError: !v.valid ? v.error : undefined,
      };
    });

    const updated = [...data.attachments, ...newAttachments];
    updateField('attachments', updated);

    // Phase 2: for ID documents, convert HEIC first (if needed), then
    // run extraction. We chain via prepareAndExtract so the UI status
    // smoothly transitions converting → processing → success/failed.
    if (documentType !== 'other') {
      for (const att of newAttachments) {
        if (att.validationError) continue;
        prepareAndExtract(att, updated);
      }
    }
  };

  /**
   * Two-phase pipeline for an ID Document attachment:
   *
   *   1. If the file is HEIC, convert to JPEG (heic2any, ~3-5s for
   *      typical 4MB phone photo). On failure, mark as 'failed' with
   *      a clear message — file is STILL ATTACHED, just can't be
   *      auto-read.
   *   2. Run AI extraction on the (possibly converted) JPEG.
   *
   * Status transitions visible to user:
   *   converting → processing → success / failed
   *   pending → processing → success / failed   (non-HEIC)
   */
  const prepareAndExtract = async (
    target: AttachmentWithMetadata,
    snapshot: AttachmentWithMetadata[],
  ) => {
    let workingFile = target.file;
    let workingPreviewUrl = target.previewUrl;

    if (isHeicFile(target.file)) {
      try {
        workingFile = await convertHeicToJpeg(target.file);
        // Now we can build a preview URL from the JPEG
        if (workingPreviewUrl) URL.revokeObjectURL(workingPreviewUrl);
        workingPreviewUrl = URL.createObjectURL(workingFile);

        // Patch in the converted file + new preview, then move to
        // 'pending' state so the extraction effect can kick in.
        patchAttachment(target, {
          file: workingFile,
          previewUrl: workingPreviewUrl,
          extractionStatus: 'pending',
        });
        // The mutated attachment is what subsequent operations target,
        // so we need a fresh reference. patchAttachment created a new
        // object; we re-read it from the current state by name match.
      } catch (err) {
        patchAttachment(target, {
          extractionStatus: 'failed',
          extractionError: (err as Error).message,
        });
        toast.error((err as Error).message);
        return;
      }
    }

    // Extraction. Important: pass the LATEST snapshot, not the stale
    // one — handleFilesAdded built `snapshot` before HEIC conversion
    // mutated the entry.
    runExtraction(target, snapshot, workingFile);
  };

  const runExtraction = async (
    target: AttachmentWithMetadata,
    snapshot: AttachmentWithMetadata[],
    /**
     * If the caller already converted the file (e.g. from HEIC to
     * JPEG in prepareAndExtract), pass it here so we don't re-read
     * the stale `target.file`. Defaults to target.file for callers
     * that don't need conversion.
     */
    overrideFile?: File,
  ) => {
    const sourceFile = overrideFile || target.file;

    // For HEIC paths we already mutated state to extractionStatus
    // 'pending' via patchAttachment, then immediately come here.
    // Just patch to 'processing' directly rather than rebuilding
    // a snapshot that might be stale.
    patchAttachment(target, { extractionStatus: 'processing' });
    setExtractingIds((prev) => new Set(prev).add(target.file.name));

    try {
      const downscaled = await downscaleImage(sourceFile);
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

      // supabase-js wraps non-2xx HTTP responses as { error }; the
      // body is in error.context. Read it so we surface the actual
      // server-side reason instead of a generic transport error.
      if (error) {
        let detail = error.message || 'Unknown error';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error || body?.message) detail = body.error || body.message;
          }
        } catch {
          // best-effort
        }
        throw new Error(detail);
      }
      if (!result?.success) {
        const code = result?.error || 'unknown';
        const detailMsg = result?.message || '';
        const { title, hint } = describeExtractionError(code, detailMsg);
        const message = `${title}. ${hint}`;
        patchAttachment(target, {
          extractionStatus: 'failed',
          extractionError: message,
        });
        if (code !== 'ai_not_configured') toast.warning(title, { description: hint });
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
      const { title, hint } = describeExtractionError(undefined, (err as Error).message);
      patchAttachment(target, {
        extractionStatus: 'failed',
        extractionError: `${title}. ${hint}`,
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
    // Free the image preview URL — these are memory references created
    // via URL.createObjectURL; leaking them grows browser memory until
    // the tab is closed.
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    updateField(
      'attachments',
      data.attachments.filter((a) => a !== target),
    );
  };

  const invalidCount = data.attachments.filter((a) => a.validationError).length;

  return (
    <div className="space-y-6">
      {invalidCount > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-medium text-destructive">
              {invalidCount === 1
                ? '1 file cannot be uploaded'
                : `${invalidCount} files cannot be uploaded`}
            </p>
            <p className="text-foreground/80 mt-0.5">
              Please remove the highlighted file{invalidCount === 1 ? '' : 's'} below
              before submitting the permit. They won't be sent.
            </p>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-center gap-2 mb-3">
          <IdCard className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-base">Employee Civil ID or Driving License</h3>
        </div>

        <UploadZone
          inputId="id-upload"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif"
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
                onRetry={() => prepareAndExtract(att, data.attachments)}
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
  onRetry: () => void;
}

function IdAttachmentCard({ attachment, onRemove, onRetry }: IdAttachmentCardProps) {
  const { extractionStatus, extractedName, extractedExpiryDate, isValid, validationError, previewUrl } = attachment;
  const fileSizeMb = (attachment.file.size / (1024 * 1024)).toFixed(2);

  return (
    <Card
      className={cn(
        'p-3 transition-colors',
        validationError && 'border-destructive/40 bg-destructive/5',
        !validationError && extractionStatus === 'success' && isValid === true && 'border-success/40 bg-success/5',
        !validationError && extractionStatus === 'success' && isValid === false && 'border-destructive/40 bg-destructive/5',
        // 'failed' is informational, not error — file is attached, just
        // not auto-read. Keep card neutral; the amber badge inside
        // signals what happened without making the whole card look
        // broken.
      )}
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail for images, icon for everything else */}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={attachment.file.name}
            className="w-14 h-14 rounded object-cover shrink-0 border border-border"
            onError={(e) => {
              // HEIC doesn't render in most browsers; fall back to icon
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-14 h-14 rounded bg-muted flex items-center justify-center shrink-0 border border-border">
            <IdCard className="w-6 h-6 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{attachment.file.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fileSizeMb} MB</p>

          {/* Validation error — sits ABOVE the extraction badges so the
              user understands the file won't be uploaded at all */}
          {validationError && (
            <div className="mt-2 text-xs text-destructive flex items-start gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {!validationError && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {extractionStatus === 'converting' && (
                <Badge variant="outline" className="gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Converting iPhone photo...
                </Badge>
              )}

              {extractionStatus === 'pending' && (
                <Badge variant="outline" className="gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Preparing...
                </Badge>
              )}

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
                <>
                  <Badge variant="outline" className="gap-1.5 border-warning text-warning bg-warning/10">
                    <AlertTriangle className="w-3 h-3" />
                    Attached, couldn't auto-read
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={onRetry}
                  >
                    <RefreshCw className="w-3 h-3" />
                    Try again
                  </Button>
                </>
              )}

              {attachment.documentType === 'driving_license' && (
                <Badge variant="secondary" className="text-xs">
                  Driving License
                </Badge>
              )}
            </div>
          )}

          {!validationError && extractionStatus === 'success' && (
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

          {!validationError && extractionStatus === 'failed' && attachment.extractionError && (
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
  const { validationError, previewUrl } = attachment;
  const fileSizeMb = (attachment.file.size / (1024 * 1024)).toFixed(2);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 p-2 rounded-md border transition-colors',
        validationError
          ? 'bg-destructive/5 border-destructive/40'
          : 'bg-muted/30 border-border',
      )}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Image preview thumbnail or file icon */}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={attachment.file.name}
            className="w-10 h-10 rounded object-cover shrink-0 border border-border"
            onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm truncate">{attachment.file.name}</p>
          <p className="text-xs text-muted-foreground">{fileSizeMb} MB</p>
          {validationError && (
            <p className="text-xs text-destructive mt-1 flex items-start gap-1">
              <XCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </p>
          )}
        </div>
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
