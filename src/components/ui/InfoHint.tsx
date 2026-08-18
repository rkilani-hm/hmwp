import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface InfoHintProps {
  /** Short explanation shown in the popover (English). */
  description: string;
  /** Optional Arabic explanation, shown under the English one (RTL). */
  descriptionAr?: string;
  /** Optional bold heading inside the popover. */
  title?: string;
  /** For the button's aria-label, e.g. the metric name. */
  label?: string;
  className?: string;
}

/**
 * A small "ⓘ" affordance that opens a brief popover explaining a metric, card
 * or chart. Drop it next to any title. Reused by StatsCard and chart headers so
 * every dashboard explains itself the same way.
 *
 * Note: the trigger stops click propagation (so it doesn't follow a card link)
 * but must NOT call preventDefault — Radix skips its own open handler when the
 * event's default was prevented, which would stop the popover opening.
 */
export function InfoHint({ description, descriptionAr, title, label, className }: InfoHintProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label ? `What does "${label}" mean?` : 'What does this mean?'}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'inline-flex items-center text-muted-foreground/70 hover:text-foreground transition-colors',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 text-sm font-normal"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <p className="font-semibold mb-1">{title}</p>}
        <p className="text-muted-foreground">{description}</p>
        {descriptionAr && (
          <p className="text-muted-foreground mt-2" dir="rtl">{descriptionAr}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
