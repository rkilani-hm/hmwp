/**
 * Shared types for the permit creation wizard (Phase 3c-2).
 *
 * Each step component receives the full FormData and an updateField
 * callback — simpler than threading field-specific props through five
 * layers. FormData is intentionally flat, not nested, so updateField's
 * Union type stays tractable.
 */

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
  attachments: File[];
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
      return true; // attachments optional
    default:
      return true;
  }
}
