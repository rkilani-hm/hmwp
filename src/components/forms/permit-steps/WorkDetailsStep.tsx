import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WorkflowPreview } from '@/components/ui/WorkflowPreview';
import { useIsTenantOnly } from '@/hooks/useIsTenantOnly';
import type { WorkLocation } from '@/hooks/useWorkLocations';
import { formatUnit, type TenantUnit } from '@/hooks/useTenantUnits';
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
  /** The tenant's registered units. When present, the Unit field becomes a
   *  picker sourced from these instead of a free-text box. */
  tenantUnits?: TenantUnit[];
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
  tenantUnits,
}: Props) {
  const { t } = useTranslation();

  // When the tenant has registered units, offer them as a picker. Selecting a
  // unit fills both unit + floor. Falls back to free-text (internal users, or
  // tenants who never registered a unit).
  const hasUnitPicker = !!tenantUnits && tenantUnits.length > 0;
  const selectUnit = (unitId: string) => {
    const u = tenantUnits?.find((x) => x.id === unitId);
    if (!u) return;
    updateField('unit', u.unit);
    updateField('floor', u.floor ?? '');
  };
  // Match the currently-entered unit/floor back to a registered unit for the
  // Select's controlled value (so a pre-filled primary unit shows as selected).
  const selectedUnitId =
    tenantUnits?.find((u) => u.unit === data.unit && (u.floor ?? '') === (data.floor ?? ''))?.id ?? '';
  // Tenants don't see the workflow steps panel — workflow routing is
  // an internal concern. Approvers/admins (incl. users who are both
  // tenant + approver) continue to see it.
  const showWorkflow = !useIsTenantOnly();

  const selectedWorkType = workTypes?.find((wt) => wt.id === data.workTypeId);
  const selectedWorkLocation = workLocations?.find((loc) => loc.id === data.workLocationId);
  const isOtherLocation = data.workLocationId === 'other';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('permits.form.buildingZone')} *</Label>
        <RadioGroup
          value={data.buildingZone}
          onValueChange={(v) => updateField('buildingZone', v as PermitFormData['buildingZone'])}
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
        >
          {([
            ['business_tower', 'permits.form.zoneBusinessTower'],
            ['shopping_center', 'permits.form.zoneShoppingCenter'],
            ['carpark', 'permits.form.zoneCarpark'],
            ['outdoor', 'permits.form.zoneOutdoor'],
          ] as const).map(([val, key]) => (
            <Label
              key={val}
              htmlFor={`zone-${val}`}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                data.buildingZone === val ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              }`}
            >
              <RadioGroupItem id={`zone-${val}`} value={val} />
              <span className="text-sm">{t(key)}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="backOfHouse"
          checked={data.backOfHouse}
          onCheckedChange={(checked) => updateField('backOfHouse', checked === true)}
        />
        <Label htmlFor="backOfHouse" className="cursor-pointer">
          {t('permits.form.backOfHouse')}
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {!data.backOfHouse && (
          <div className="space-y-2">
            <Label htmlFor="unit">{t('permits.form.unit')} *</Label>
            {hasUnitPicker ? (
              <Select value={selectedUnitId} onValueChange={selectUnit}>
                <SelectTrigger id="unit">
                  <SelectValue placeholder={t('permits.form.unitPlaceholder') ?? 'Select unit'} />
                </SelectTrigger>
                <SelectContent>
                  {tenantUnits!.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{formatUnit(u)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="unit"
                value={data.unit}
                onChange={(e) => updateField('unit', e.target.value)}
                placeholder={t('permits.form.unitPlaceholder') ?? ''}
                dir="ltr"
              />
            )}
          </div>
        )}
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

      {showWorkflow && (data.workLocationId || data.workTypeId) && (
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
