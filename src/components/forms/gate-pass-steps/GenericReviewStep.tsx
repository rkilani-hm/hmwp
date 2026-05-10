import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { gatePassTypeLabels, deliveryTypeLabels } from '@/types/gatePass';
import type { GatePassFormData } from './types';
import { WorkflowPreview } from './WorkflowPreview';

interface Props {
  data: GatePassFormData;
}

/**
 * Generic-flow review step — read-only summary of what the user has
 * entered, plus the workflow preview so they see who reviews next.
 * No fields editable here; if anything's wrong they go Back.
 */
export function GenericReviewStep({ data }: Props) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Category:</strong> Generic Delivery Permit
          </p>
          <p>
            <strong>Type:</strong>{' '}
            {data.passType ? gatePassTypeLabels[data.passType] : '-'}
          </p>
          <p>
            <strong>Delivery Type:</strong>{' '}
            {data.deliveryType ? deliveryTypeLabels[data.deliveryType] : '-'}
          </p>
          <p>
            <strong>Vehicle:</strong> {data.vehicleMakeModel || '-'} (
            {data.vehicleLicensePlate || '-'})
          </p>
          <p>
            <strong>Validity:</strong> {data.validFrom || '-'} to {data.validTo || '-'}
          </p>
          <p>
            <strong>Items:</strong> {data.items.filter((i) => i.item_details).length}{' '}
            item(s),{' '}
            {data.items.some((i) => i.is_high_value)
              ? '⚠️ Contains high-value assets'
              : 'No high-value assets'}
          </p>
        </CardContent>
      </Card>

      <WorkflowPreview passType={data.passType} />
    </div>
  );
}
