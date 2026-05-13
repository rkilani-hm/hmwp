/**
 * Shared types for the permit creation wizard (Phase 3c-2).
 *
 * Each step component receives the full FormData and an updateField
 * callback — simpler than threading field-specific props through five
 * layers. FormData is intentionally flat, not nested, so updateField's
 * Union type stays tractable.
 */

/**
 * Wraps a File with categorization + AI-extracted ID fields.
 * Used for attachments in the Documents step. Civil IDs and driving
 * licenses go through OCR via the extract-id-document edge function.
 */
export interface AttachmentWithMetadata {
  file: File;
  documentType: 'civil_id' | 'driving_license' | 'other';

  /**
   * Client-side validation result, computed when the file is added.
   * Files that fail validation stay in the list with validationError
   * set so the user can see WHY — easier than a fleeting toast.
   * Submit blocks until all attachments are valid.
   */
  validationError?: string;

  /**
   * Object URL for image previews (jpeg/png/webp/heic/etc). Created
   * via URL.createObjectURL on add; revoked when the attachment is
   * removed or the wizard unmounts.
   */
  previewUrl?: string;

  // Populated for civil_id / driving_license after extraction:
  extractedName?: string | null;
  extractedIdNumber?: string | null;
  extractedExpiryDate?: string | null;  // YYYY-MM-DD
  extractedIssueDate?: string | null;
  extractedNationality?: string | null;
  isValid?: boolean;  // expiry_date >= today
  extractionStatus: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  extractionError?: string;
}

export interface PermitFormData {
  requesterName: string;
  requesterEmail: string;
  contractorName: string;
  contactMobile: string;
  unit: string;
  floor: string;
  workLocationId: string;
  workLocationOther: string;
  workTypeId: string;
  workDescription: string;
  workDateFrom: string;
  workDateTo: string;
  workTimeFrom: string;
  workTimeTo: string;
  attachments: AttachmentWithMetadata[];
  urgency: 'normal' | 'urgent';
}

export type UpdateField = <K extends keyof PermitFormData>(
  field: K,
  value: PermitFormData[K],
) => void;

/**
 * Validation helper — one source of truth for "can the user move past
 * step N". Used by both the Next button (disable) and by any future
 * inline-error rendering.
 */
export function canProceedFromStep(step: number, data: PermitFormData): boolean {
  switch (step) {
    case 1:
      return !!(
        data.requesterName &&
        data.requesterEmail &&
        data.contractorName &&
        data.contactMobile
      );
    case 2: {
      const hasLocation =
        data.workLocationId === 'other'
          ? data.workLocationOther.trim() !== ''
          : data.workLocationId !== '';
      return !!(
        data.unit &&
        data.floor &&
        hasLocation &&
        data.workTypeId &&
        data.workDescription
      );
    }
    case 3:
      return !!(
        data.workDateFrom &&
        data.workDateTo &&
        data.workTimeFrom &&
        data.workTimeTo
      );
    case 4:
      // Attachments are optional, but if any have been added and fail
      // validation (wrong type, too large, etc.), block progress until
      // the user removes them. This catches the failure UP FRONT instead
      // of letting them complete the wizard and silently lose files at
      // submit time.
      return data.attachments.every((a) => !a.validationError);
    default:
      return true;
  }
}
