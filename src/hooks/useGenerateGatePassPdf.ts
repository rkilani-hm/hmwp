import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseEdgeFunctionError } from '@/utils/edgeFunctionErrors';

export function useGenerateGatePassPdf() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePdf = async (gatePassId: string): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        toast.error('Your session has expired. Please sign in again.');
        return null;
      }

      const { data, error } = await supabase.functions.invoke('generate-gate-pass-pdf', {
        body: { gatePassId },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (error) {
        console.error('Error generating gate pass PDF:', error);
        const userFriendlyMessage = parseEdgeFunctionError(error, data);
        toast.error(userFriendlyMessage);
        return null;
      }

      if (data?.pdfUrl) {
        toast.success('Gate pass PDF generated successfully');
        return data.pdfUrl;
      }

      toast.error(data?.error || 'Failed to generate PDF. Please try again.');
      return null;
    } catch (err: any) {
      console.error('Error:', err);
      toast.error(parseEdgeFunctionError(err, null));
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePdf, isGenerating };
}
