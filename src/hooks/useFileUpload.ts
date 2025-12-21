import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useFileUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFiles = async (
    files: File[],
    permitId: string
  ): Promise<string[]> => {
    if (files.length === 0) return [];

    setIsUploading(true);
    setProgress(0);
    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${permitId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('permit-attachments')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from('permit-attachments')
          .getPublicUrl(fileName);

        uploadedUrls.push(urlData.publicUrl);
        setProgress(((i + 1) / files.length) * 100);
      }

      return uploadedUrls;
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload files');
      return uploadedUrls;
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const deleteFile = async (url: string): Promise<boolean> => {
    try {
      // Extract path from URL
      const urlParts = url.split('/permit-attachments/');
      if (urlParts.length < 2) return false;

      const filePath = urlParts[1];
      const { error } = await supabase.storage
        .from('permit-attachments')
        .remove([filePath]);

      if (error) {
        console.error('Delete error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  };

  return {
    uploadFiles,
    deleteFile,
    isUploading,
    progress,
  };
}
