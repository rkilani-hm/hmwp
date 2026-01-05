import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
        toast.error('Failed to generate PDF');
        return null;
      }

      if (data?.pdfUrl) {
        toast.success('PDF generated successfully');
        return data.pdfUrl;
      }

      toast.error(data?.error || 'Failed to generate PDF');
      return null;
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to generate PDF');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generatePdf, isGenerating };
}
