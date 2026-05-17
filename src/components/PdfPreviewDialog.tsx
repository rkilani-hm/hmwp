import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, ZoomIn, ZoomOut, RotateCw, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pdfUrl: string | null;
  fileName: string;
  onDownload: () => void;
  /** When true, require user to confirm they've visually checked Section 3 before download is enabled. */
  requireSection3Verification?: boolean;
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  pdfUrl,
  fileName,
  onDownload,
  requireSection3Verification = false,
}: PdfPreviewDialogProps) {
  const [zoom, setZoom] = useState(100);
  const [isLoading, setIsLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section3Verified, setSection3Verified] = useState(false);

  // Reset verification when dialog re-opens with a fresh PDF.
  useEffect(() => {
    if (open) setSection3Verified(false);
  }, [open, pdfUrl]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));
  const handleResetZoom = () => setZoom(100);

  const handleOpenInNewTab = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  // Fetch PDF and create blob URL to bypass iframe restrictions
  useEffect(() => {
    if (!open || !pdfUrl) {
      setBlobUrl(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetch(pdfUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch PDF');
        }
        return response.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF preview');
        setIsLoading(false);
      });

    // Cleanup blob URL when dialog closes
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [open, pdfUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="font-display">{fileName}</DialogTitle>
            <div className="flex items-center gap-2">
              {/* Zoom controls */}
              <div className="flex items-center gap-1 border rounded-md px-2 py-1 bg-muted/50">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium w-12 text-center">{zoom}%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleResetZoom}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Action buttons */}
              <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab
              </Button>
              <Button
                size="sm"
                onClick={onDownload}
                disabled={requireSection3Verification && !section3Verified}
                title={
                  requireSection3Verification && !section3Verified
                    ? 'Confirm you have reviewed Section 3 — Approval Chain before downloading'
                    : undefined
                }
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogHeader>

        {requireSection3Verification && (
          <div className="px-6 py-3 border-b bg-amber-50 dark:bg-amber-950/30 flex items-center justify-between gap-4 flex-shrink-0">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Verify Section 3 — Approval Chain
                </p>
                <p className="text-amber-800/80 dark:text-amber-200/80 text-xs mt-0.5">
                  Scroll to Section 3 and confirm each approver row (number badge, role,
                  signer, status pill, and signature) renders correctly before downloading.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100 cursor-pointer flex-shrink-0">
              <Checkbox
                checked={section3Verified}
                onCheckedChange={(v) => setSection3Verified(v === true)}
              />
              I've reviewed Section 3
            </label>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-muted/30 p-4 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-10 gap-4">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={handleOpenInNewTab}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open in New Tab Instead
              </Button>
            </div>
          )}
          {blobUrl && !error && (
            <div
              className="flex justify-center transition-transform duration-200"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
            >
              <iframe
                src={`${blobUrl}#toolbar=0&navpanes=0`}
                className="w-full min-h-[70vh] rounded-lg border shadow-sm bg-white"
                style={{ height: `${70 * (100 / zoom)}vh` }}
                title="PDF Preview"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
