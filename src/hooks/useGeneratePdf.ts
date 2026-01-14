import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseEdgeFunctionError } from '@/utils/edgeFunctionErrors';

export function useGeneratePdf() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePdf = async (permitId: string): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        toast.error('Your session has expired. Please sign in again.');
        return null;
      }

      const { data, error } = await supabase.functions.invoke('generate-permit-pdf', {
        body: { permitId },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) {
        console.error('Error generating PDF:', error);
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        toast.error(userFriendlyMessage);
        return null;
      }

      if (data?.pdfUrl) {
        toast.success('PDF generated successfully');
        return data.pdfUrl;
      }

      const errorMessage = data?.error || 'Failed to generate PDF. Please try again.';
      toast.error(errorMessage);
      return null;
    } catch (err: any) {
      console.error('Error:', err);
      const userFriendlyMessage = parseEdgeFunctionError(err, null);
      toast.error(userFriendlyMessage);
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePdf, isGenerating };
}
