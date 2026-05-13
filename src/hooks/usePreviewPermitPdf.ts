import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Form payload sent to the preview-permit-pdf edge function. Mirrors
 * the wizard's PermitFormData but resolved — work type and location
 * are passed as display NAMES (the edge function doesn't need to look
 * them up beyond the workflow steps).
 */
export interface PreviewFormPayload {
  requesterName: string;
  requesterEmail: string;
  contractorName: string;
  contactMobile: string;
  unit: string;
  floor: string;
  workLocationName: string;
  workTypeId: string;
  workTypeName: string;
  workDescription: string;
  workDateFrom: string;
  workDateTo: string;
  workTimeFrom: string;
  workTimeTo: string;
  urgency: 'normal' | 'urgent';
  attachmentNames: string[];
}

/**
 * Calls preview-permit-pdf with the wizard form data and returns a
 * blob URL the caller can hand to PdfPreviewDialog.
 *
 * Returns null on failure (toast already shown). Always remember to
 * URL.revokeObjectURL() the returned URL when no longer needed.
 */
export function usePreviewPermitPdf() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePreview = async (formData: PreviewFormPayload): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('preview-permit-pdf', {
        body: { formData },
      });

      if (error) {
        console.error('Preview PDF error:', error);
        toast.error('Could not generate preview. Please try again.');
        return null;
      }

      if (!data?.success || !data.pdfBase64) {
        const msg = data?.error || 'Preview generation failed';
        toast.error(msg);
        return null;
      }

      // Convert base64 → Blob → object URL so the existing
      // PdfPreviewDialog can render it via its iframe.
      const byteCharacters = atob(data.pdfBase64);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error('Preview PDF unexpected error:', err);
      toast.error('Could not generate preview. Please try again.');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePreview, isGenerating };
}
