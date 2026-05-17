// PerformanceDrilldown — shared drill-down table for the My Performance
// and Approver Performance dashboards. Renders tabs aligned with the
// metric cards (Decisions, Approved, Rejected, On Time, Late, Pending,
// Last 30 days) and lists the underlying permit_approvals rows so a user
// can click through to the source permit.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceStrict } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  filterByCategory,
  type DrilldownCategory,
  type DrilldownRecord,
} from '@/hooks/usePerformanceDrilldown';

interface Props {
  title?: string;
  description?: string;
  records: DrilldownRecord[] | undefined;
  isLoading?: boolean;
  /** When true, includes the Approver column (admin view). */
  showApprover?: boolean;
  /** Initial tab. Defaults to 'all'. */
  defaultCategory?: DrilldownCategory;
  /** Humanize role name. Pages pass their own helper to stay in sync. */
  humanizeRole?: (role: string) => string;
}

const TABS: { id: DrilldownCategory; label: string }[] = [
  { id: 'all', label: 'All decisions' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'on_time', label: 'On time' },
  { id: 'late', label: 'Late' },
  { id: 'pending', label: 'Pending' },
  { id: 'last_30d', label: 'Last 30 days' },
];

function formatResponseTime(minutes: number | null) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h}h`;
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'approved' ? 'default'
    : status === 'rejected' ? 'destructive'
    : status === 'pending' ? 'secondary'
    : 'outline';
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

export function PerformanceDrilldown({
  title = 'Drill-down',
  description = 'The permits and approval records behind each metric.',
  records,
  isLoading,
  showApprover,
  defaultCategory = 'all',
  humanizeRole = (r) => r,
}: Props) {
  const [category, setCategory] = useState<DrilldownCategory>(defaultCategory);

  const counts = useMemo(() => {
    const list = records || [];
    const obj: Record<DrilldownCategory, number> = {
      all: filterByCategory(list, 'all').length,
      approved: filterByCategory(list, 'approved').length,
      rejected: filterByCategory(list, 'rejected').length,
      on_time: filterByCategory(list, 'on_time').length,
      late: filterByCategory(list, 'late').length,
      pending: filterByCategory(list, 'pending').length,
      last_30d: filterByCategory(list, 'last_30d').length,
    };
    return obj;
  }, [records]);

  const filtered = useMemo(
    () => filterByCategory(records || [], category),
    [records, category],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-display">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={category} onValueChange={(v) => setCategory(v as DrilldownCategory)}>
          <TabsList className="flex flex-wrap h-auto">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="gap-2">
                {t.label}
                <Badge variant="outline" className="ml-1 px-1.5 py-0 text-xs">
                  {counts[t.id]}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4 overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No records in this category for the current filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permit</TableHead>
                  <TableHead>Role</TableHead>
                  {showApprover && <TableHead>Approver</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Decision</TableHead>
                  <TableHead className="text-right">Response</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 250).map((r) => (
                  <TableRow key={r.approvalId}>
                    <TableCell>
                      <Link
                        to={`/permits/${r.permitId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.permitNo || r.permitId.slice(0, 8)}
                      </Link>
                      {r.workDescription && (
                        <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                          {r.workDescription}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{humanizeRole(r.roleName)}</Badge>
                    </TableCell>
                    {showApprover && (
                      <TableCell>
                        <div>
                          <p className="text-sm">{r.approverName || '—'}</p>
                          {r.approverEmail && (
                            <p className="text-xs text-muted-foreground">{r.approverEmail}</p>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={r.approvalStatus} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.approvedAt
                        ? format(new Date(r.approvedAt), 'MMM d, yyyy HH:mm')
                        : `Pending since ${format(new Date(r.createdAt), 'MMM d')}`}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {r.responseTimeMinutes != null
                        ? formatResponseTime(r.responseTimeMinutes)
                        : r.approvalStatus === 'pending'
                          ? formatDistanceStrict(new Date(r.createdAt), new Date()) + ' waiting'
                          : '—'}
                    </TableCell>
                    <TableCell>
                      {r.onTime == null ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : r.onTime ? (
                        <Badge variant="default">On time</Badge>
                      ) : (
                        <Badge variant="destructive">Late</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 250 && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              Showing the most recent 250 of {filtered.length} records. Narrow the date range or role filter to see more.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
