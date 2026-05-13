import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Allowed file types and their MIME types
const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  // Images — common phone/camera formats
  'jpg': ['image/jpeg'],
  'jpeg': ['image/jpeg'],
  'png': ['image/png'],
  'gif': ['image/gif'],
  'webp': ['image/webp'],
  // HEIC / HEIF — iPhone default since iOS 11; very common in Kuwait
  // for users photographing civil IDs. Empty MIME often comes back for
  // these on some Safari versions, so the validator falls through to
  // the extension check. The AI extraction edge function and the
  // storage layer both accept arbitrary bytes — no decoding done here.
  'heic': ['image/heic', 'image/heif', ''],
  'heif': ['image/heif', 'image/heic', ''],
  // Scanner formats
  'bmp': ['image/bmp', 'image/x-ms-bmp'],
  'tiff': ['image/tiff'],
  'tif': ['image/tiff'],
  // Documents
  'pdf': ['application/pdf'],
  'doc': ['application/msword'],
  'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'xls': ['application/vnd.ms-excel'],
  'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  // Text
  'txt': ['text/plain'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File "${file.name}" exceeds maximum size of 10MB` 
    };
  }

  // Check file size is not zero
  if (file.size === 0) {
    return { 
      valid: false, 
      error: `File "${file.name}" is empty` 
    };
  }

  // Extract extension and validate
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !ALLOWED_FILE_TYPES[extension]) {
    return { 
      valid: false, 
      error: `File type ".${extension}" is not allowed. Allowed types: ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}` 
    };
  }

  // Validate MIME type matches extension
  const allowedMimeTypes = ALLOWED_FILE_TYPES[extension];
  if (!allowedMimeTypes.includes(file.type) && file.type !== '') {
    // Some browsers don't set MIME type correctly, so we allow empty type
    // but still validate the extension
    console.warn(`MIME type mismatch for ${file.name}: expected ${allowedMimeTypes.join(' or ')}, got ${file.type}`);
  }

  return { valid: true };
}

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
        
        // Validate file before upload
        const validation = validateFile(file);
        if (!validation.valid) {
          toast.error(validation.error);
          continue;
        }

        const fileExt = file.name.split('.').pop()?.toLowerCase();
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

        // Use signed URL instead of public URL (expires in 1 hour)
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from('permit-attachments')
          .createSignedUrl(fileName, 3600);

        if (signedUrlError || !signedUrlData) {
          console.error('Signed URL error:', signedUrlError);
          // Still track the file path for storage
          uploadedUrls.push(fileName);
        } else {
          // Store the path, not the signed URL (URL will be generated on demand)
          uploadedUrls.push(fileName);
        }
        
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

  const deleteFile = async (filePath: string): Promise<boolean> => {
    try {
      // Handle both full URLs and file paths
      let path = filePath;
      if (filePath.includes('/permit-attachments/')) {
        const urlParts = filePath.split('/permit-attachments/');
        if (urlParts.length >= 2) {
          path = urlParts[1].split('?')[0]; // Remove query params if any
        }
      }

      const { error } = await supabase.storage
        .from('permit-attachments')
        .remove([path]);

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

  const getSignedUrl = async (filePath: string, expiresIn: number = 3600): Promise<string | null> => {
    try {
      // Handle both full URLs and file paths
      let path = filePath;
      if (filePath.includes('/permit-attachments/')) {
        const urlParts = filePath.split('/permit-attachments/');
        if (urlParts.length >= 2) {
          path = urlParts[1].split('?')[0]; // Remove query params if any
        }
      }

      const { data, error } = await supabase.storage
        .from('permit-attachments')
        .createSignedUrl(path, expiresIn);

      if (error || !data) {
        console.error('Signed URL error:', error);
        return null;
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Signed URL error:', error);
      return null;
    }
  };

  return {
    uploadFiles,
    deleteFile,
    getSignedUrl,
    isUploading,
    progress,
    validateFile,
  };
}
