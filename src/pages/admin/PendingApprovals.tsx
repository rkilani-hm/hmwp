import { useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, XCircle, Mail, Phone, Building2, Clock, Inbox } from 'lucide-react';
import {
  usePendingTenants,
  useApproveTenant,
  useRejectTenant,
} from '@/hooks/usePendingTenants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Admin page for reviewing tenant signup applications.
 *
 * Lists every profile with account_status='pending', oldest first.
 * Admin can approve (one-click) or reject (modal asks for an optional
 * reason that the tenant sees on their pending-approval page next time
 * they sign in).
 *
 * Counter and refresh happen automatically via React Query; no manual
 * polling needed.
 */
export default function PendingApprovals() {
  const { data: pending, isLoading, isError } = usePendingTenants();
  const approve = useApproveTenant();
  const reject = useRejectTenant();

  // Approve confirmation
  const [approveTarget, setApproveTarget] = useState<string | null>(null);

  // Reject modal
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = () => {
    if (!approveTarget) return;
    const tenant = pending?.find((t) => t.id === approveTarget);
    if (!tenant) return;
    approve.mutate(
      {
        tenantId: tenant.id,
        tenantEmail: tenant.email,
        tenantName: tenant.full_name,
      },
      {
        onSettled: () => setApproveTarget(null),
      }
    );
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    const tenant = pending?.find((t) => t.id === rejectTarget);
    if (!tenant) return;
    reject.mutate(
      {
        tenantId: tenant.id,
        tenantEmail: tenant.email,
        tenantName: tenant.full_name,
        reason: rejectReason,
      },
      {
        onSettled: () => {
          setRejectTarget(null);
          setRejectReason('');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
          <Inbox className="h-7 w-7 text-primary" aria-hidden="true" />
          Pending Tenant Approvals
        </h1>
        <p className="text-muted-foreground mt-1">
          Review and approve or reject new tenant signups before they can
          submit work permits and gate-pass requests.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-destructive">
            Failed to load pending approvals. Try refreshing.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && pending && pending.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground space-y-2">
            <CheckCircle2 className="h-10 w-10 mx-auto text-primary/40" aria-hidden="true" />
            <p className="font-medium">No pending approvals</p>
            <p className="text-sm">
              You'll see new tenant applications here as they sign up.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && pending && pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <Badge variant="secondary" className="mr-2">{pending.length}</Badge>
            tenant{pending.length === 1 ? '' : 's'} awaiting review
          </p>

          {pending.map((tenant) => (
            <Card key={tenant.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-lg">
                      {tenant.full_name || tenant.email}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1.5 mt-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      Submitted {format(new Date(tenant.created_at), "PPP 'at' p")}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    Pending
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">{tenant.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">{tenant.phone || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">{tenant.company_name || '—'}</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => setApproveTarget(tenant.id)}
                    disabled={approve.isPending || reject.isPending}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setRejectTarget(tenant.id)}
                    disabled={approve.isPending || reject.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Approve confirmation */}
      <AlertDialog
        open={approveTarget !== null}
        onOpenChange={(open) => !open && setApproveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this tenant?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be able to sign in and submit work permits and
              gate-pass requests immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleApprove}>
              Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject with optional reason */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this tenant?</DialogTitle>
            <DialogDescription>
              The applicant will see this status the next time they sign in.
              Optionally include a reason — they'll see it on their pending
              page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              placeholder="e.g. Unable to verify your tenancy details. Please contact permits@alhamra.com.kw."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {rejectReason.length}/500
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
