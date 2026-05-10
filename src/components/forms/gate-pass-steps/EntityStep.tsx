import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GatePassFormData, UpdateField } from './types';

interface Props {
  data: GatePassFormData;
  updateField: UpdateField;
}

/** Step 2 (detailed flow) — client/contractor info + unit/floor/area. */
export function EntityStep({ data, updateField }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Client / Contractor Name</Label>
        <Input
          value={data.clientContractorName}
          onChange={(e) => updateField('clientContractorName', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Client Rep / Permit Holder</Label>
        <Input
          value={data.clientRepName}
          onChange={(e) => updateField('clientRepName', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={data.clientRepEmail}
          onChange={(e) => updateField('clientRepEmail', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Contact Number</Label>
        <Input
          value={data.clientRepContact}
          onChange={(e) => updateField('clientRepContact', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Unit / Floor</Label>
        <Input
          value={data.unitFloor}
          onChange={(e) => updateField('unitFloor', e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Authorized Delivery Area</Label>
        <Input
          value={data.deliveryArea}
          onChange={(e) => updateField('deliveryArea', e.target.value)}
        />
      </div>
    </div>
  );
}
