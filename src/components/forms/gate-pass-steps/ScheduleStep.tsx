import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { shiftingMethodLabels } from '@/types/gatePass';
import type { ShiftingMethod } from '@/types/gatePass';
import type { GatePassFormData, UpdateField } from './types';

interface Props {
  data: GatePassFormData;
  updateField: UpdateField;
}

/** Step 3 (detailed flow) — dates, times, vehicle, shifting method. */
export function ScheduleStep({ data, updateField }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Valid From</Label>
          <Input type="date" value={data.validFrom} onChange={(e) => updateField('validFrom', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Valid To</Label>
          <Input type="date" value={data.validTo} onChange={(e) => updateField('validTo', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Time From</Label>
          <Input type="time" value={data.timeFrom} onChange={(e) => updateField('timeFrom', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Time To</Label>
          <Input type="time" value={data.timeTo} onChange={(e) => updateField('timeTo', e.target.value)} />
        </div>
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
      </div>

      <div className="space-y-2">
        <Label>Shifting Method</Label>
        <Select
          value={data.shiftingMethod}
          onValueChange={(v) => updateField('shiftingMethod', v as ShiftingMethod)}
        >
          <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
          <SelectContent>
            {Object.entries(shiftingMethodLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data.shiftingMethod === 'forklift' && (
          <Alert variant="destructive" className="mt-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Valid Work Permit required for forklift operation.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
