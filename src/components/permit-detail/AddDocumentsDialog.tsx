import { useState } from 'react';
import { Upload, X, Loader2, IdCard, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { validateFile } from '@/hooks/useFileUpload';

type DocType = 'civil_id' | 'driving_license' | 'other';

interface PendingFile {
  file: File;
  documentType: DocType;
  error?: string;
}

interface Props {
  permitId: string;
  permitNo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Post-submission attachment uploader. Available to the requester
 * and approvers (RLS enforced). Uploads to the permit-attachments
 * bucket and inserts permit_attachments rows with no AI extraction
 * (status: 'skipped') — same behavior as the wizard after AI OCR
 * was disabled.
 */
export function AddDocumentsDialog({ permitId, permitNo, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setPending([]);
    setUploading(false);
  };

  const handleFiles = (files: FileList | null, documentType: DocType) => {
    if (!files) return;
    const next: PendingFile[] = [];
    for (const file of Array.from(files)) {
      const v = validateFile(file);
      next.push({ file, documentType, error: v.valid ? undefined : v.error });
    }
    setPending((prev) => [...prev, ...next]);
  };

  const removeAt = (idx: number) => {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateType = (idx: number, documentType: DocType) => {
    setPending((prev) => prev.map((p, i) => (i === idx ? { ...p, documentType } : p)));
  };

  const upload = async () => {
    const valid = pending.filter((p) => !p.error);
    if (valid.length === 0) {
      toast.error('No valid files to upload');
      return;
    }
    setUploading(true);
    const failures: string[] = [];
    const inserted: any[] = [];
    const uploadedPaths: string[] = [];

    try {
      for (const item of valid) {
        const ext = item.file.name.split('.').pop()?.toLowerCase();
        const path = `${permitId}/post-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('permit-attachments')
          .upload(path, item.file, {
            cacheControl: '3600',
            upsert: false,
            contentType: item.file.type || 'application/octet-stream',
          });
        if (upErr) {
          failures.push(`${item.file.name}: ${upErr.message}`);
          continue;
        }
        uploadedPaths.push(path);
        inserted.push({
          permit_id: permitId,
          file_path: path,
          file_name: item.file.name,
          file_size: item.file.size,
          mime_type: item.file.type,
          document_type: item.documentType,
          extraction_status: 'skipped',
          uploaded_by: user?.id,
        });
      }

      if (inserted.length > 0) {
        const { error: insErr } = await supabase
          .from('permit_attachments')
          .insert(inserted);
        if (insErr) {
          // Rollback uploads if DB insert fails
          await supabase.storage.from('permit-attachments').remove(uploadedPaths);
          throw insErr;
        }

        await supabase.from('activity_logs').insert({
          permit_id: permitId,
          action: 'Documents Added',
          performed_by: user?.email || 'Unknown',
          performed_by_id: user?.id,
          details: `Added ${inserted.length} document${inserted.length === 1 ? '' : 's'} to permit ${permitNo}`,
        });
      }

      if (failures.length > 0) {
        toast.error(`Some files failed: ${failures.join('; ')}`);
      } else {
        toast.success(`Added ${inserted.length} document${inserted.length === 1 ? '' : 's'}`);
      }

      queryClient.invalidateQueries({ queryKey: ['permit-attachments', permitId] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add documents');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!uploading) {
          onOpenChange(o);
          if (!o) reset();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add documents</DialogTitle>
          <DialogDescription>
            Attach civil IDs or other documents to permit {permitNo}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Label className="col-span-2">Choose files</Label>
            <Button
              variant="outline"
              asChild
              className="justify-start"
              disabled={uploading}
            >
              <label className="cursor-pointer">
                <IdCard className="w-4 h-4 mr-2" />
                Civil ID
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files, 'civil_id');
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
            <Button
              variant="outline"
              asChild
              className="justify-start"
              disabled={uploading}
            >
              <label className="cursor-pointer">
                <FileText className="w-4 h-4 mr-2" />
                Other document
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.heic,.heif"
                  className="hidden"
                  onChange={(e) => {
                    handleFiles(e.target.files, 'other');
                    e.target.value = '';
                  }}
                />
              </label>
            </Button>
          </div>

          {pending.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pending.map((p, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 rounded-md border p-2 ${
                    p.error ? 'border-destructive/50 bg-destructive/5' : 'border-border'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{p.file.name}</p>
                    {p.error ? (
                      <p className="text-xs text-destructive">{p.error}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {(p.file.size / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>
                  <Select
                    value={p.documentType}
                    onValueChange={(v) => updateType(idx, v as DocType)}
                    disabled={uploading || !!p.error}
                  >
                    <SelectTrigger className="w-36 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="civil_id">Civil ID</SelectItem>
                      <SelectItem value="driving_license">Driving License</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAt(idx)}
                    disabled={uploading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No files selected yet.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={upload} disabled={uploading || pending.length === 0}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload {pending.filter((p) => !p.error).length || ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
