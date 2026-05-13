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

      // supabase-js wraps non-2xx HTTP responses into `error`. Read the
      // response body off the error context where Supabase stashes it
      // so we surface the actual server-side reason instead of the
      // generic "non-2xx status code" string.
      if (error) {
        console.error('Preview PDF transport error:', error);
        let detail = error.message || 'Unknown error';
        try {
          // FunctionsHttpError exposes a Response in .context
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error || body?.message) {
              detail = body.error || body.message;
            }
          }
        } catch {
          // Best-effort; if we can't parse the body, fall back to
          // error.message
        }
        toast.error(`Could not generate preview: ${detail}`);
        return null;
      }

      if (!data?.success || !data.pdfBase64) {
        const code = data?.error || 'preview_failed';
        const message =
          data?.message ||
          (code === 'rate_limited'
            ? 'Too many preview requests. Wait a minute and try again.'
            : code === 'Unauthorized'
              ? 'Your session has expired. Please sign in again.'
              : `Preview generation failed (${code})`);
        toast.error(message);
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
      toast.error(`Could not generate preview: ${(err as Error).message || 'unknown error'}`);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePreview, isGenerating };
}
