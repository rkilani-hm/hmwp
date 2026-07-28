import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, ArrowDownToLine, ArrowUpFromLine, FileText } from 'lucide-react';
import { WorkflowTypeSelect } from './WorkflowTypeSelect';
import { AutoWorkflowChip } from './AutoWorkflowChip';

/**
 * Minimal gate-pass details — just what's needed to move items in/out. Item
 * detail is optional (tenants often don't know exactly what's coming yet). No
 * vehicle / shifting-method / value fields.
 */
export interface GatePassData {
  direction: 'in' | 'out' | 'both';
  whatMoving: string;
  company: string;
  contactPerson: string;
  mobile: string;
  unit: string;
  floor: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
}

export const emptyGatePassData: GatePassData = {
  direction: 'in', whatMoving: '', company: '', contactPerson: '', mobile: '',
  unit: '', floor: '', dateFrom: '', dateTo: '', timeFrom: '08:00', timeTo: '17:00',
};

type Update = <K extends keyof GatePassData>(k: K, v: GatePassData[K]) => void;

function L({ en, ar, required, optional }: { en: string; ar: string; required?: boolean; optional?: boolean }) {
  return (
    <Label className="flex flex-wrap items-baseline gap-x-2">
      <span>
        {en}
        {required && <span className="text-destructive"> *</span>}
        {optional && <span className="text-muted-foreground text-xs font-normal"> (optional)</span>}
      </span>
      <span className="text-xs text-muted-foreground font-normal" dir="rtl">{ar}</span>
    </Label>
  );
}

const DIRECTIONS: { key: GatePassData['direction']; icon: typeof ArrowDownToLine; en: string; ar: string }[] = [
  { key: 'in', icon: ArrowDownToLine, en: 'Bringing items IN', ar: 'إدخال مواد' },
  { key: 'out', icon: ArrowUpFromLine, en: 'Taking items OUT', ar: 'إخراج مواد' },
  { key: 'both', icon: ArrowRightLeft, en: 'Both', ar: 'إدخال وإخراج' },
];

export function GatePassDetailsStep({
  data, update, workTypes, workTypesLoading, workTypeId, onWorkTypeChange,
  autoWorkTypeName,
}: {
  data: GatePassData;
  update: Update;
  workTypes?: { id: string; name: string }[];
  workTypesLoading?: boolean;
  workTypeId: string;
  onWorkTypeChange: (v: string) => void;
  /** When set, the workflow is resolved automatically and the manual picker is hidden. */
  autoWorkTypeName?: string | null;
}) {
  const grid2 = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
  return (
    <div className="space-y-5">
      {autoWorkTypeName ? (
        <AutoWorkflowChip workTypeName={autoWorkTypeName} />
      ) : (
        // Fallback (e.g. internal scope): pick the workflow manually.
        <WorkflowTypeSelect
          workTypes={workTypes}
          loading={workTypesLoading}
          value={workTypeId}
          onChange={onWorkTypeChange}
        />
      )}

      {/* Direction — the key question */}
      <div className="space-y-2">
        <L en="What do you need to do?" ar="ما الذي تريد فعله؟" required />
        <RadioGroup
          value={data.direction}
          onValueChange={(v) => update('direction', v as GatePassData['direction'])}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2"
        >
          {DIRECTIONS.map(({ key, icon: Icon, en, ar }) => (
            <Label
              key={key}
              htmlFor={`dir-${key}`}
              className={`flex items-center gap-2 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
                data.direction === key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
              }`}
            >
              <RadioGroupItem id={`dir-${key}`} value={key} />
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-sm">
                {en}<span className="block text-xs text-muted-foreground" dir="rtl">{ar}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      {/* What's being moved — optional */}
      <div className="space-y-1.5">
        <L en="What's being moved?" ar="ما هي المواد؟" optional />
        <Textarea
          rows={2}
          value={data.whatMoving}
          onChange={(e) => update('whatMoving', e.target.value)}
          placeholder="e.g. furniture, supplies, equipment — leave blank if not confirmed yet"
        />
      </div>

      {/* Who + where */}
      <div className={grid2}>
        <div className="space-y-1.5"><L en="Delivery / collection by (company)" ar="جهة التوصيل / الاستلام" required /><Input value={data.company} onChange={(e) => update('company', e.target.value)} /></div>
        <div className="space-y-1.5"><L en="Contact person on site" ar="مسؤول التواصل في الموقع" /><Input value={data.contactPerson} onChange={(e) => update('contactPerson', e.target.value)} /></div>
        <div className="space-y-1.5"><L en="Mobile" ar="الهاتف" /><Input type="tel" value={data.mobile} onChange={(e) => update('mobile', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><L en="Unit" ar="الوحدة" required /><Input value={data.unit} onChange={(e) => update('unit', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Floor" ar="الطابق" /><Input value={data.floor} onChange={(e) => update('floor', e.target.value)} /></div>
        </div>
      </div>

      {/* Access window */}
      <div className="space-y-2">
        <L en="When?" ar="متى؟" required />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5"><L en="Date from" ar="من تاريخ" /><Input type="date" value={data.dateFrom} onChange={(e) => update('dateFrom', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Date to" ar="إلى تاريخ" /><Input type="date" value={data.dateTo} onChange={(e) => update('dateTo', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Time from" ar="من وقت" /><Input type="time" value={data.timeFrom} onChange={(e) => update('timeFrom', e.target.value)} /></div>
          <div className="space-y-1.5"><L en="Time to" ar="إلى وقت" /><Input type="time" value={data.timeTo} onChange={(e) => update('timeTo', e.target.value)} /></div>
        </div>
      </div>

      {/* Live preview of the printed gate pass */}
      <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Preview the <b>gate pass</b> security will see.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 shrink-0"
          onClick={async () => {
            const [{ buildGatePassPdf }, { loadPdfAssets }] = await Promise.all([
              import('@/lib/pdf/gatePassPdf'),
              import('@/lib/pdf/brand'),
            ]);
            const bytes = await buildGatePassPdf(data, {}, { assets: await loadPdfAssets() });
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }}
        >
          <FileText className="h-4 w-4" />
          Preview PDF
        </Button>
      </div>
    </div>
  );
}
