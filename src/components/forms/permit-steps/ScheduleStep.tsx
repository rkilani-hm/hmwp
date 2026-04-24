import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PermitFormData, UpdateField } from './types';

interface Props {
  data: PermitFormData;
  updateField: UpdateField;
}

/**
 * Step 3 — when, and how fast. The urgency choice drives the SLA the
 * approvers see in the inbox (48h normal vs 4h urgent).
 */
export function ScheduleStep({ data, updateField }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label>{t('permits.form.priorityLevel')} *</Label>
        <RadioGroup
          value={data.urgency}
          onValueChange={(value) =>
            updateField('urgency', value as 'normal' | 'urgent')
          }
          className="grid grid-cols-2 gap-4"
        >
          <label
            htmlFor="urgency-normal"
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
              data.urgency === 'normal'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-muted-foreground',
            )}
          >
            <RadioGroupItem value="normal" id="urgency-normal" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{t('permits.form.urgencyNormal')}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('permits.form.urgencyNormalHint')}
              </p>
            </div>
          </label>
          <label
            htmlFor="urgency-urgent"
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
              data.urgency === 'urgent'
                ? 'border-destructive bg-destructive/5'
                : 'border-border hover:border-muted-foreground',
            )}
          >
            <RadioGroupItem value="urgent" id="urgency-urgent" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="font-medium">{t('permits.form.urgencyUrgent')}</span>
                <Badge variant="destructive" className="text-xs">
                  {t('permits.form.priorityBadge')}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {t('permits.form.urgencyUrgentHint')}
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

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
