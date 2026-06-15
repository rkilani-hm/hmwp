import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PermitFormData, UpdateField } from './types';

interface Props {
  data: PermitFormData;
  updateField: UpdateField;
}

/**
 * Step 3 — when. Priority/urgency UI has been removed; all permits now
 * carry a fixed 24-hour SLA. The `urgency` field on PermitFormData is
 * defaulted to 'normal' for backward compatibility with the existing
 * submission payload.
 */
export function ScheduleStep({ data, updateField }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="workDateFrom">{t('permits.form.startDate')} *</Label>
          <Input
            id="workDateFrom"
            type="date"
            value={data.workDateFrom}
            onChange={(e) => updateField('workDateFrom', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workDateTo">{t('permits.form.endDate')} *</Label>
          <Input
            id="workDateTo"
            type="date"
            value={data.workDateTo}
            onChange={(e) => updateField('workDateTo', e.target.value)}
            min={data.workDateFrom || undefined}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="workTimeFrom">{t('permits.form.startTime')} *</Label>
          <Input
            id="workTimeFrom"
            type="time"
            value={data.workTimeFrom}
            onChange={(e) => updateField('workTimeFrom', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workTimeTo">{t('permits.form.endTime')} *</Label>
          <Input
            id="workTimeTo"
            type="time"
            value={data.workTimeTo}
            onChange={(e) => updateField('workTimeTo', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
