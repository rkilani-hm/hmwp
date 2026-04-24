import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface PermitListSkeletonProps {
  /** Number of skeleton rows to render. Defaults to 3. */
  count?: number;
}

/**
 * PermitListSkeleton — Phase 3c-1.
 *
 * Replaces the centered-spinner loading state on list pages. A spinner
 * gives no sense of how much content is coming; a skeleton approximates
 * the shape of the real card so the layout does not reflow when data
 * lands. Especially important on the approver inbox where the page
 * otherwise jumps as soon as the first permit renders.
 */
export function PermitListSkeleton({ count = 3 }: PermitListSkeletonProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row lg:items-start gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Skeleton className="h-6 w-28" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-4 w-full max-w-md" />
                <Skeleton className="h-4 w-2/3 max-w-sm" />
                <div className="flex flex-wrap gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-3">
                <Skeleton className="h-12 w-24" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
