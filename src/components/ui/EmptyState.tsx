import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * EmptyState — Phase 3c-1.
 *
 * Standard pattern used by list pages when there is no data. Keeps the
 * shape of a Card so it slots into the same column layout as a real
 * result, rather than collapsing to zero height. Icon is wrapped in a
 * soft muted circle — consistent with the design language used elsewhere
 * for status chips and avatars.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-medium mb-1" dir="auto">
          {title}
        </h3>
        {description && (
          <p className="text-muted-foreground max-w-md" dir="auto">
            {description}
          </p>
        )}
        {action && <div className="mt-6">{action}</div>}
      </CardContent>
    </Card>
  );
}
