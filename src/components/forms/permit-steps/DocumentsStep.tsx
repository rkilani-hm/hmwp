import { useTranslation } from 'react-i18next';
import { Upload, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PermitFormData, UpdateField } from './types';

interface Props {
  data: PermitFormData;
  updateField: UpdateField;
}

/**
 * Step 4 — optional document attachments. Accepts multiple files of any
 * type; server-side validation rejects anything larger than 10MB.
 */
export function DocumentsStep({ data, updateField }: Props) {
  const { t } = useTranslation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files);
    updateField('attachments', [...data.attachments, ...newFiles]);
    // Reset the input so selecting the same file again triggers onChange
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    updateField(
      'attachments',
      data.attachments.filter((_, i) => i !== index),
    );
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
          'border-border hover:border-primary/40 hover:bg-primary/5',
        )}
      >
        <input
          type="file"
          id="file-upload"
          className="hidden"
          multiple
          onChange={handleFileChange}
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center gap-2"
        >
          <Upload className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">{t('permits.form.dropFilesHere')}</p>
          <p className="text-xs text-muted-foreground">
            {t('permits.form.dropFilesHint')}
          </p>
        </label>
      </div>

      {data.attachments.length > 0 && (
        <ul className="space-y-2">
          {data.attachments.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-3 bg-muted rounded-lg"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate" dir="auto">
                  {file.name}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeFile(index)}
                aria-label={t('common.delete') ?? 'Remove'}
              >
                <X className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
