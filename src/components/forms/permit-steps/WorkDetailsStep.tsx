import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WorkflowPreview } from '@/components/ui/WorkflowPreview';
import type { WorkLocation } from '@/hooks/useWorkLocations';
import type { PermitFormData, UpdateField } from './types';

interface WorkType {
  id: string;
  name: string;
}

interface Props {
  data: PermitFormData;
  updateField: UpdateField;
  workTypes: WorkType[] | undefined;
  workTypesLoading: boolean;
  workLocations: WorkLocation[] | undefined;
  workLocationsLoading: boolean;
}

/**
 * Step 2 — what work, where. The work type + location drive the workflow
 * that the permit will go through, so we show a WorkflowPreview the
 * moment the user picks either.
 */
export function WorkDetailsStep({
  data,
  updateField,
  workTypes,
  workTypesLoading,
  workLocations,
  workLocationsLoading,
}: Props) {
  const { t } = useTranslation();

  const selectedWorkType = workTypes?.find((wt) => wt.id === data.workTypeId);
  const selectedWorkLocation = workLocations?.find((loc) => loc.id === data.workLocationId);
  const isOtherLocation = data.workLocationId === 'other';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="unit">{t('permits.form.unit')} *</Label>
          <Input
            id="unit"
            value={data.unit}
            onChange={(e) => updateField('unit', e.target.value)}
            placeholder={t('permits.form.unitPlaceholder') ?? ''}
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="floor">{t('permits.form.floor')} *</Label>
          <Input
            id="floor"
            value={data.floor}
            onChange={(e) => updateField('floor', e.target.value)}
            placeholder={t('permits.form.floorPlaceholder') ?? ''}
            dir="ltr"
          />
        </div>
        <div className="space-y-2 sm:col-span-3">
          <Label htmlFor="workLocation">{t('permits.form.workLocation')} *</Label>
          <Select
            value={data.workLocationId}
            onValueChange={(value) => updateField('workLocationId', value)}
          >
            <SelectTrigger id="workLocation">
              <SelectValue placeholder={t('permits.form.selectWorkLocation')} />
            </SelectTrigger>
            <SelectContent>
              {workLocationsLoading ? (
                <SelectItem value="__loading" disabled>
                  {t('common.loading')}
                </SelectItem>
              ) : (
                <>
                  {(workLocations || []).map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="other">{t('permits.form.otherLocation')}</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          {isOtherLocation && (
            <Input
              id="workLocationOther"
              value={data.workLocationOther}
              onChange={(e) => updateField('workLocationOther', e.target.value)}
              placeholder={t('permits.form.workLocationOtherPlaceholder') ?? ''}
              className="mt-2"
              dir="auto"
            />
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workType">{t('permits.form.workType')} *</Label>
        <Select
          value={data.workTypeId}
          onValueChange={(value) => updateField('workTypeId', value)}
        >
          <SelectTrigger id="workType">
            <SelectValue placeholder={t('permits.form.selectWorkType')} />
          </SelectTrigger>
          <SelectContent>
            {workTypesLoading ? (
              <SelectItem value="__loading" disabled>
                {t('common.loading')}
              </SelectItem>
            ) : (
              (workTypes || []).map((wt) => (
                <SelectItem key={wt.id} value={wt.id}>
                  {wt.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="workDescription">{t('permits.form.workDescription')} *</Label>
        <Textarea
          id="workDescription"
          value={data.workDescription}
          onChange={(e) => updateField('workDescription', e.target.value)}
          placeholder={t('permits.form.workDescriptionPlaceholder') ?? ''}
          rows={4}
          dir="auto"
        />
      </div>

      {(data.workLocationId || data.workTypeId) && (
        <WorkflowPreview
          workType={selectedWorkType}
          workLocation={selectedWorkLocation}
          isOtherLocation={isOtherLocation}
          className="mt-4 p-4 bg-muted/30 rounded-lg"
        />
      )}
    </div>
  );
}
