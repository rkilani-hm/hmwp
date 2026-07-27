import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { GitBranch } from 'lucide-react';

/**
 * TEMPORARY (testing): lets the requester pick the work type, which is what
 * drives the approval workflow. Shown on the gate-pass and photoshoot detail
 * steps so those requests can be tested against the existing workflows.
 *
 * Once per-purpose workflows are defined, the work type will be resolved
 * automatically from the chosen purpose and this selector goes away.
 */
export function WorkflowTypeSelect({
  workTypes,
  loading,
  value,
  onChange,
}: {
  workTypes: { id: string; name: string }[] | undefined;
  loading?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-warning/50 bg-warning/5 p-3 space-y-2">
      <Label className="flex flex-wrap items-baseline gap-x-2">
        <span className="flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-warning" />
          Approval workflow (work type)
          <span className="text-destructive">*</span>
        </span>
        <span className="text-xs text-muted-foreground font-normal">— temporary, for testing</span>
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? 'Loading…' : 'Select the workflow to route this request'} />
        </SelectTrigger>
        <SelectContent>
          {loading ? (
            <SelectItem value="__loading" disabled>Loading…</SelectItem>
          ) : (
            (workTypes ?? []).map((wt) => (
              <SelectItem key={wt.id} value={wt.id}>{wt.name}</SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Chooses which approval cycle this request follows. This will be set automatically
        from the request purpose once the per-purpose workflows are finalised.
      </p>
    </div>
  );
}
