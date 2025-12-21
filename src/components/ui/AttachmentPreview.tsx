import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Eye, FileText, Image, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachmentPreviewProps {
  url: string;
  filename: string;
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

export function AttachmentPreview({ url, filename, className }: AttachmentPreviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileType = getFileType(filename);
  const FileIcon = getFileIcon(filename);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-background flex items-center justify-center">
            {fileType === 'image' ? (
              <img
                src={url}
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
              onClick={() => setPreviewOpen(true)}
              title="Preview"
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
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
            {fileType === 'image' ? (
              <img
                src={url}
                alt={filename}
                className="w-full h-auto max-h-[70vh] object-contain rounded-lg"
              />
            ) : fileType === 'pdf' ? (
              <iframe
                src={url}
                className="w-full h-[70vh] rounded-lg border"
                title={filename}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
