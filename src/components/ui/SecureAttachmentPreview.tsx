import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Eye, FileText, Image, File, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface SecureAttachmentPreviewProps {
  filePath: string;
  filename: string;
  bucket?: 'permit-attachments' | 'permit-pdfs';
  className?: string;
}

const getFileType = (filename: string): 'image' | 'pdf' | 'other' => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
    return 'image';
  }
  if (ext === 'pdf') {
    return 'pdf';
  }
  return 'other';
};

const getFileIcon = (filename: string) => {
  const type = getFileType(filename);
  switch (type) {
    case 'image':
      return Image;
    case 'pdf':
      return FileText;
    default:
      return File;
  }
};

export function SecureAttachmentPreview({ 
  filePath, 
  filename, 
  bucket = 'permit-attachments',
  className 
}: SecureAttachmentPreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileType = getFileType(filename);
  const FileIcon = getFileIcon(filename);

  // Extract the actual file path from full URL if needed
  const getCleanPath = (path: string): string => {
    if (path.includes(`/${bucket}/`)) {
      const parts = path.split(`/${bucket}/`);
      if (parts.length >= 2) {
        return parts[1].split('?')[0]; // Remove query params
      }
    }
    return path;
  };

  const cleanPath = getCleanPath(filePath);

  // Load thumbnail for images
  useEffect(() => {
    const loadThumbnail = async () => {
      if (fileType === 'image') {
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(cleanPath, 3600); // 1 hour expiry
          
          if (data && !error) {
            setThumbnailUrl(data.signedUrl);
          }
        } catch (e) {
          console.error('Failed to load thumbnail:', e);
        }
      }
    };
    loadThumbnail();
  }, [cleanPath, bucket, fileType]);

  const loadSignedUrl = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(cleanPath, 3600); // 1 hour expiry
      
      if (error) {
        throw error;
      }
      
      if (data) {
        setSignedUrl(data.signedUrl);
      }
    } catch (e: any) {
      console.error('Failed to load file:', e);
      setError(e.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    await loadSignedUrl();
    setPreviewOpen(true);
  };

  const handleDownload = async () => {
    await loadSignedUrl();
    if (signedUrl) {
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const canPreview = fileType === 'image' || fileType === 'pdf';

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between p-3 bg-muted rounded-lg group hover:bg-muted/80 transition-colors",
          className
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-background flex items-center justify-center overflow-hidden">
            {fileType === 'image' && thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={filename}
                className="w-10 h-10 rounded-lg object-cover"
              />
            ) : (
              <FileIcon className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm truncate">{filename}</span>
        </div>
        <div className="flex items-center gap-1">
          {canPreview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePreview}
              disabled={loading}
              title="Preview"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={loading}
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="truncate pr-4">{filename}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {loading && (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center h-64 text-destructive">
                {error}
              </div>
            )}
            {!loading && !error && signedUrl && (
              <>
                {fileType === 'image' ? (
                  <img
                    src={signedUrl}
                    alt={filename}
                    className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
                  />
                ) : fileType === 'pdf' ? (
                  <iframe
                    src={signedUrl}
                    className="w-full h-[70vh] rounded-lg border"
                    title={filename}
                  />
                ) : null}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
