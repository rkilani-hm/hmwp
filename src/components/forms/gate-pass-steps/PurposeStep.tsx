import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { gatePassTypeLabels } from '@/types/gatePass';
import type { GatePassFormData, UpdateField } from './types';
import { WorkflowPreview } from './WorkflowPreview';

interface Props {
  data: GatePassFormData;
  updateField: UpdateField;
}

/**
 * Step 5 (detailed flow) — purpose textarea + summary card.
 * isGeneric is derived from data.category to skip item summary on
 * generic-delivery permits.
 */
export function PurposeStep({ data, updateField }: Props) {
  const isGeneric = data.category === 'generic_delivery_permit';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Purpose of Material Shifting / Delivery</Label>
        <Textarea
          value={data.purpose}
          onChange={(e) => updateField('purpose', e.target.value)}
          rows={4}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Category:</strong>{' '}
            {data.category === 'detailed_material_pass'
              ? 'Detailed Material Pass'
              : 'Generic Delivery Permit'}
          </p>
          <p>
            <strong>Type:</strong>{' '}
            {data.passType ? gatePassTypeLabels[data.passType] : '-'}
          </p>
          <p>
            <strong>Client:</strong> {data.clientContractorName || '-'}
          </p>
          <p>
            <strong>Location:</strong> {data.unitFloor || '-'} / {data.deliveryArea || '-'}
          </p>
          <p>
            <strong>Validity:</strong> {data.validFrom || '-'} to {data.validTo || '-'}
          </p>
          {!isGeneric && (
            <p>
              <strong>Items:</strong> {data.items.filter((i) => i.item_details).length}{' '}
              item(s),{' '}
              {data.items.some((i) => i.is_high_value)
                ? '⚠️ Contains high-value assets'
                : 'No high-value assets'}
            </p>
          )}
        </CardContent>
      </Card>

      <WorkflowPreview passType={data.passType} />
    </div>
  );
}
