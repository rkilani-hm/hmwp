import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkflowPreview } from '@/components/ui/WorkflowPreview';
import { PdfPreviewDialog } from '@/components/PdfPreviewDialog';
import { usePreviewPermitPdf } from '@/hooks/usePreviewPermitPdf';
import type { WorkLocation } from '@/hooks/useWorkLocations';
import type { PermitFormData } from './types';

interface WorkType {
  id: string;
  name: string;
}

interface Props {
  data: PermitFormData;
  workTypes: WorkType[] | undefined;
  workLocations: WorkLocation[] | undefined;
}

/**
 * Step 5 — summary before submission. Read-only surface so the user can
 * catch mistakes, including a re-render of the WorkflowPreview showing
 * exactly who will receive the approval request.
 *
 * 'Preview PDF' button generates a draft PDF (with PREVIEW watermark)
 * so the user sees exactly how the document will look once submitted.
 * The actual permit row + final PDF are created only on Submit.
 */
export function ReviewStep({ data, workTypes, workLocations }: Props) {
  const { t } = useTranslation();
  const { generatePreview, isGenerating } = usePreviewPermitPdf();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const selectedWorkType = workTypes?.find((wt) => wt.id === data.workTypeId);
  const selectedWorkLocation = workLocations?.find((loc) => loc.id === data.workLocationId);
  const isOtherLocation = data.workLocationId === 'other';
  const workLocationDisplayName = isOtherLocation
    ? data.workLocationOther
    : selectedWorkLocation?.name || '';

  // Free the blob URL when the dialog closes or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePreview = async () => {
    // Free previous URL before generating a fresh one (form may have
    // changed since last preview)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    const url = await generatePreview({
      requesterName: data.requesterName,
      requesterEmail: data.requesterEmail,
      contractorName: data.contractorName,
      contactMobile: data.contactMobile,
      unit: data.unit,
      floor: data.floor,
      workLocationName: workLocationDisplayName,
      workTypeId: data.workTypeId,
      workTypeName: selectedWorkType?.name || '',
      workDescription: data.workDescription,
      workDateFrom: data.workDateFrom,
      workDateTo: data.workDateTo,
      workTimeFrom: data.workTimeFrom,
      workTimeTo: data.workTimeTo,
      urgency: data.urgency,
      attachmentNames: data.attachments.map((a) => a.file.name),
    });

    if (url) {
      setPreviewUrl(url);
      setPreviewOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Preview PDF button — opens the same PdfPreviewDialog used
          for submitted permits, but with a watermarked draft */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handlePreview}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating preview...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Preview PDF
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">
          {t('permits.form.priorityLabel')}:
        </span>
        {data.urgency === 'urgent' ? (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('permits.form.urgencyUrgentSummary')}
          </Badge>
        ) : (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {t('permits.form.urgencyNormalSummary')}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('permits.form.requester')}
          </p>
          <p className="text-sm" dir="auto">{data.requesterName}</p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {data.requesterEmail}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('permits.form.contractor')}
          </p>
          <p className="text-sm" dir="auto">{data.contractorName}</p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {data.contactMobile}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('permits.form.workLocation')}
          </p>
          <p className="text-sm" dir="auto">{workLocationDisplayName}</p>
          <p className="text-sm text-muted-foreground">
            {t('permits.form.unit')} {data.unit}, {t('permits.form.floor')} {data.floor}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('permits.form.workType')}
          </p>
          <p className="text-sm" dir="auto">{selectedWorkType?.name}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">
          {t('permits.form.workDescription')}
        </p>
        <p className="text-sm mt-1 whitespace-pre-wrap" dir="auto">
          {data.workDescription}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('permits.form.schedule')}
          </p>
          <p className="text-sm" dir="ltr">
            {data.workDateFrom} → {data.workDateTo}
          </p>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {data.workTimeFrom} – {data.workTimeTo}
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t('permits.form.attachments')}
          </p>
          <p className="text-sm">
            {data.attachments.length === 0
              ? t('permits.form.noAttachments')
              : t('permits.form.attachmentCount', { count: data.attachments.length })}
          </p>
        </div>
      </div>

      {data.workTypeId && (
        <WorkflowPreview
          workType={selectedWorkType}
          workLocation={selectedWorkLocation}
          isOtherLocation={isOtherLocation}
          className="mt-2"
        />
      )}

      <PdfPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
          }
        }}
        pdfUrl={previewUrl}
        fileName="permit-preview.pdf"
        onDownload={() => {
          if (!previewUrl) return;
          const a = document.createElement('a');
          a.href = previewUrl;
          a.download = 'permit-preview.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
      />
    </div>
  );
}
