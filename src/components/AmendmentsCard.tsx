import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePermitAmendments, type PermitAmendment } from '@/hooks/usePermitAmendments';
import { CalendarClock, IdCard, CheckCircle2, XCircle, Clock, User, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

/**
 * Shows the approval progress of every amendment raised on a permit
 * (extend schedule / add worker IDs): what was requested, who requested it,
 * and where it stands — Pending / Approved / Rejected by Health & Safety,
 * with the resolver + comment once decided.
 *
 * Renders nothing when the permit has no amendments, so it stays out of the
 * way on the vast majority of permits.
 */
const fmtDate = (v: string | null) => {
  if (!v) return '—';
  try { return format(parseISO(v), 'dd MMM yyyy'); } catch { return v; }
};
const fmtDateTime = (v: string | null) => {
  if (!v) return '—';
  try { return format(parseISO(v), 'dd MMM yyyy, HH:mm'); } catch { return v; }
};

function statusStyle(status: PermitAmendment['status']) {
  switch (status) {
    case 'approved':
      return { label: 'Approved', Icon: CheckCircle2, cls: 'text-success', badge: 'bg-success/10 text-success border-success/30' };
    case 'rejected':
      return { label: 'Rejected', Icon: XCircle, cls: 'text-destructive', badge: 'bg-destructive/10 text-destructive border-destructive/30' };
    default:
      return { label: 'Pending H&S approval', Icon: Clock, cls: 'text-warning', badge: 'bg-warning/10 text-warning border-warning/30' };
  }
}

function changeSummary(a: PermitAmendment): string {
  if (a.amendment_type === 'extend') {
    const from = `${fmtDate(a.old_date_to)}${a.old_time_to ? ' ' + a.old_time_to.slice(0, 5) : ''}`;
    const to = `${fmtDate(a.new_date_to)}${a.new_time_to ? ' ' + a.new_time_to.slice(0, 5) : ''}`;
    return `Extend end: ${from} → ${to}`;
  }
  return `Add ${a.added_id_count ?? 'additional'} worker ID(s)`;
}

export function AmendmentsCard({ permitId }: { permitId: string }) {
  const { data: amendments, isLoading } = usePermitAmendments(permitId);

  if (isLoading || !amendments || amendments.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-muted-foreground" />
          Amendment Requests
          <span className="ml-1 text-xs font-normal text-muted-foreground">({amendments.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {amendments.map((a) => {
          const s = statusStyle(a.status);
          const TypeIcon = a.amendment_type === 'extend' ? CalendarClock : IdCard;
          return (
            <div key={a.id} className="rounded-lg border p-3 space-y-3">
              {/* Header: change summary + status badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <TypeIcon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{changeSummary(a)}</p>
                    {a.reason && <p className="text-xs text-muted-foreground mt-0.5">Reason: {a.reason}</p>}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${s.badge}`}>
                  <s.Icon className="w-3.5 h-3.5" />
                  {s.label}
                </span>
              </div>

              {/* Progress: Requested -> H&S decision */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{a.requested_by_name || 'Requester'}</span>
                  <span className="text-muted-foreground">· {fmtDateTime(a.created_at)}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-1.5 rounded-md px-2 py-1 bg-muted/60">
                  <s.Icon className={`w-3.5 h-3.5 ${s.cls}`} />
                  {a.status === 'pending' ? (
                    <span className="text-muted-foreground">Awaiting Health &amp; Safety</span>
                  ) : (
                    <span className="font-medium">
                      {s.label} by {a.resolved_by_name || 'H&S'}
                      {a.resolved_at && <span className="text-muted-foreground font-normal"> · {fmtDateTime(a.resolved_at)}</span>}
                    </span>
                  )}
                </div>
              </div>

              {a.resolution_comment && (
                <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2">
                  “{a.resolution_comment}”
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
