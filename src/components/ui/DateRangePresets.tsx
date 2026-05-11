import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { format, startOfMonth, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

export type DateRange = { from: Date | null; to: Date | null };
export type DateRangePreset = 'all' | '7d' | '30d' | 'mtd';

export function presetToRange(preset: DateRangePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case '7d': return { from: subDays(now, 7), to: now };
    case '30d': return { from: subDays(now, 30), to: now };
    case 'mtd': return { from: startOfMonth(now), to: now };
    case 'all':
    default: return { from: null, to: null };
  }
}

interface Props {
  preset: DateRangePreset;
  onPresetChange: (p: DateRangePreset) => void;
  range: DateRange;
  onRangeChange: (r: DateRange) => void;
}

/**
 * Compact date-range picker with 4 presets (7d / 30d / MTD / All time)
 * plus two calendar popovers for custom from/to. Used by Reports + SLA
 * dashboards. When a custom date is picked, preset becomes effectively
 * "custom" (we don't add a separate state for that — just `null` preset).
 */
export function DateRangePresets({ preset, onPresetChange, range, onRangeChange }: Props) {
  const presets: { id: DateRangePreset; label: string }[] = [
    { id: 'all', label: 'All time' },
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: 'mtd', label: 'Month to date' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <Button
          key={p.id}
          size="sm"
          variant={preset === p.id ? 'default' : 'outline'}
          onClick={() => {
            onPresetChange(p.id);
            onRangeChange(presetToRange(p.id));
          }}
        >
          {p.label}
        </Button>
      ))}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className={cn('font-normal', !range.from && 'text-muted-foreground')}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {range.from ? format(range.from, 'MMM d, yyyy') : 'From'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={range.from ?? undefined}
            onSelect={(d) => onRangeChange({ ...range, from: d ?? null })}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className={cn('font-normal', !range.to && 'text-muted-foreground')}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {range.to ? format(range.to, 'MMM d, yyyy') : 'To'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={range.to ?? undefined}
            onSelect={(d) => onRangeChange({ ...range, to: d ?? null })}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>

      {(range.from || range.to) && preset !== 'all' && (
        <Button size="sm" variant="ghost" onClick={() => {
          onPresetChange('all');
          onRangeChange({ from: null, to: null });
        }}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
