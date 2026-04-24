import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PermitFormData, UpdateField } from './types';

interface Props {
  data: PermitFormData;
  updateField: UpdateField;
}

/**
 * Step 1 of the permit wizard — who is requesting and which contractor
 * will perform the work.
 *
 * All four fields are required to proceed; canProceedFromStep(1, data)
 * in types.ts enforces that at the wizard level.
 */
export function RequesterStep({ data, updateField }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="requesterName">
          {t('permits.form.requesterName')} *
        </Label>
        <Input
          id="requesterName"
          value={data.requesterName}
          onChange={(e) => updateField('requesterName', e.target.value)}
          placeholder={t('permits.form.requesterNamePlaceholder') ?? ''}
          dir="auto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="requesterEmail">
          {t('permits.form.requesterEmail')} *
        </Label>
        <Input
          id="requesterEmail"
          type="email"
          value={data.requesterEmail}
          onChange={(e) => updateField('requesterEmail', e.target.value)}
          placeholder={t('permits.form.requesterEmailPlaceholder') ?? ''}
          dir="ltr"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contractorName">
          {t('permits.form.contractorName')} *
        </Label>
        <Input
          id="contractorName"
          value={data.contractorName}
          onChange={(e) => updateField('contractorName', e.target.value)}
          placeholder={t('permits.form.contractorNamePlaceholder') ?? ''}
          dir="auto"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactMobile">
          {t('permits.form.contactMobile')} *
        </Label>
        <Input
          id="contactMobile"
          value={data.contactMobile}
          onChange={(e) => updateField('contactMobile', e.target.value)}
          placeholder={t('permits.form.contactMobilePlaceholder') ?? ''}
          dir="ltr"
        />
      </div>
    </div>
  );
}
