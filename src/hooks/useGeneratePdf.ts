import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useGeneratePdf() {
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePdf = async (permitId: string): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-permit-pdf', {
        body: { permitId },
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
