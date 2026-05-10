import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { gatePassTypeLabels } from '@/types/gatePass';
import type { GatePassCategory, GatePassType } from '@/types/gatePass';
import type { GatePassFormData, UpdateField } from './types';
import { WorkflowPreview } from './WorkflowPreview';

interface Props {
  data: GatePassFormData;
  updateField: UpdateField;
}

/** Step 1 — pick category + pass type. Drives subsequent step layout. */
export function CategoryStep({ data, updateField }: Props) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Pass Category *</Label>
        <Select
          value={data.category}
          onValueChange={(v) => updateField('category', v as GatePassCategory)}
        >
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="detailed_material_pass">Detailed Material Pass</SelectItem>
            <SelectItem value="generic_delivery_permit">Generic Delivery Permit</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Pass Type *</Label>
        <Select
          value={data.passType}
          onValueChange={(v) => updateField('passType', v as GatePassType)}
        >
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            {Object.entries(gatePassTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <WorkflowPreview passType={data.passType} />
    </div>
  );
}
