import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { deliveryTypeLabels } from '@/types/gatePass';
import type { DeliveryType } from '@/types/gatePass';
import type { GatePassFormData, UpdateField } from './types';

interface Props {
  data: GatePassFormData;
  updateField: UpdateField;
}

/**
 * Step 2 (generic flow) — delivery type, vehicle, dates, and purpose.
 * Compressed compared to the detailed flow's 3-step path because
 * generic permits don't need entity/schedule separation.
 */
export function GenericDeliveryStep({ data, updateField }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Delivery Type</Label>
        <Select
          value={data.deliveryType}
          onValueChange={(v) => updateField('deliveryType', v as DeliveryType)}
        >
          <SelectTrigger><SelectValue placeholder="Select delivery type" /></SelectTrigger>
          <SelectContent>
            {Object.entries(deliveryTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Vehicle Make/Model</Label>
          <Input value={data.vehicleMakeModel} onChange={(e) => updateField('vehicleMakeModel', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>License Plate</Label>
          <Input value={data.vehicleLicensePlate} onChange={(e) => updateField('vehicleLicensePlate', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Valid From</Label>
          <Input type="date" value={data.validFrom} onChange={(e) => updateField('validFrom', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Valid To</Label>
          <Input type="date" value={data.validTo} onChange={(e) => updateField('validTo', e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Purpose</Label>
        <Textarea
          value={data.purpose}
          onChange={(e) => updateField('purpose', e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
}
