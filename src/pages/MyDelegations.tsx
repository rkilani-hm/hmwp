import { useState, useMemo } from 'react';
import { format, isFuture, isPast } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  UserPlus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  useMyDelegations,
  useCreateDelegation,
  useRevokeDelegation,
  type ApprovalDelegation,
} from '@/hooks/useApprovalDelegations';
import { useRoles } from '@/hooks/useRoles';

/**
 * Self-service approval delegation. Two sections:
 *
 *   - "Delegations I created": authority I've handed to someone else.
 *     Can revoke any active one here.
 *   - "Delegations I received": authority granted to me by others.
 *     Read-only; if active, my inbox automatically reflects it.
 *
 * The 'New delegation' button opens a dialog with delegate picker,
 * optional role scope, date range, and reason.
 */
export default function MyDelegations() {
  const { user, roles } = useAuth();
  const { data: delegations, isLoading } = useMyDelegations();
  const [createOpen, setCreateOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Approval delegation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hand off your approval authority to a teammate temporarily —
            e.g. while you're on leave.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New delegation
            </Button>
          </DialogTrigger>
          <CreateDelegationDialog onDone={() => setCreateOpen(false)} />
        </Dialog>
      </div>

      {/* How it works — explains the two-step nature (delegation record
          + temporary role grant by admin). Visible to everyone on this
          page; collapsed by default so it doesn't dominate the screen
          for returning users. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" />
            How delegation works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-foreground/80 space-y-1.5">
          <p>
            <strong>Step 1.</strong> Create the delegation here. This records
            who is acting on whose behalf, for what time window, and shows
            them the relevant permits in their inbox.
          </p>
          <p>
            <strong>Step 2.</strong> Ask an admin to temporarily grant the
            delegate the relevant role in{' '}
            <span className="font-mono text-[10px] bg-background px-1 rounded border">
              Admin → Approvers Management
            </span>
            . This is what allows approvals to go through — the delegation
            alone doesn't bypass permission checks.
          </p>
          <p>
            <strong>Step 3.</strong> When the delegate approves, the audit
            log will record both their name AND yours
            ("acting on behalf of …"), so reviewers can always see who
            actually clicked approve.
          </p>
          <p className="text-muted-foreground italic pt-1">
            When the delegation window ends, both pieces should be undone:
            the delegation auto-expires; the admin should also remove the
            temporary role.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="created">
        <TabsList>
          <TabsTrigger value="created">
            Delegations I created
            {delegations?.asDelegator && delegations.asDelegator.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {delegations.asDelegator.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="received">
            Delegations I received
            {delegations?.asDelegate && delegations.asDelegate.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {delegations.asDelegate.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="created" className="mt-4">
          {isLoading ? (
            <Loading />
          ) : delegations?.asDelegator.length === 0 ? (
            <EmptyState message="You haven't created any delegations yet." />
          ) : (
            <div className="space-y-3">
              {delegations?.asDelegator.map((d) => (
                <DelegationCard key={d.id} delegation={d} canRevoke />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="received" className="mt-4">
          {isLoading ? (
            <Loading />
          ) : delegations?.asDelegate.length === 0 ? (
            <EmptyState
              message={
                roles.some((r) => r !== 'tenant')
                  ? "No one has delegated their authority to you."
                  : "No one has delegated authority to you yet. When they do, those approvals will appear in your inbox."
              }
            />
          ) : (
            <div className="space-y-3">
              {delegations?.asDelegate.map((d) => (
                <DelegationCard key={d.id} delegation={d} canRevoke={false} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      Loading...
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-sm text-muted-foreground">
        {message}
      </CardContent>
    </Card>
  );
}

function DelegationCard({
  delegation,
  canRevoke,
}: {
  delegation: ApprovalDelegation;
  canRevoke: boolean;
}) {
  const revoke = useRevokeDelegation();

  const status = useMemo(() => {
    if (!delegation.is_active) return 'revoked';
    const now = new Date();
    const from = new Date(delegation.valid_from);
    const to = new Date(delegation.valid_to);
    if (isFuture(from)) return 'scheduled';
    if (isPast(to)) return 'expired';
    return 'active';
  }, [delegation]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {canRevoke ? (
                <>
                  To{' '}
                  <span className="font-semibold">
                    {delegation.delegate_name || delegation.delegate_email}
                  </span>
                </>
              ) : (
                <>
                  From{' '}
                  <span className="font-semibold">
                    {delegation.delegator_name || delegation.delegator_email}
                  </span>
                </>
              )}
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(delegation.valid_from), 'MMM d, yyyy h:mm a')}
              {' → '}
              {format(new Date(delegation.valid_to), 'MMM d, yyyy h:mm a')}
            </CardDescription>
          </div>
          <StatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="text-sm flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Scope:</span>
          {delegation.role_id ? (
            <Badge variant="outline">{delegation.role_label || delegation.role_name}</Badge>
          ) : (
            <Badge variant="outline">All my approval roles</Badge>
          )}
        </div>
        {delegation.reason && (
          <p className="text-sm text-muted-foreground italic">
            "{delegation.reason}"
          </p>
        )}
        {canRevoke && status === 'active' && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => revoke.mutate(delegation.id)}
            disabled={revoke.isPending}
          >
            {revoke.isPending ? (
              <>
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Revoking...
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3 mr-2" />
                Revoke now
              </>
            )}
          </Button>
        )}
        {canRevoke && status === 'scheduled' && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => revoke.mutate(delegation.id)}
            disabled={revoke.isPending}
          >
            <XCircle className="w-3 h-3 mr-2" />
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'active' | 'scheduled' | 'expired' | 'revoked' }) {
  const config = {
    active: {
      icon: CheckCircle2,
      label: 'Active',
      className: 'border-success text-success bg-success/10',
    },
    scheduled: {
      icon: Clock,
      label: 'Scheduled',
      className: 'border-primary text-primary bg-primary/10',
    },
    expired: {
      icon: AlertTriangle,
      label: 'Expired',
      className: 'border-muted-foreground text-muted-foreground bg-muted',
    },
    revoked: {
      icon: XCircle,
      label: 'Revoked',
      className: 'border-destructive text-destructive bg-destructive/10',
    },
  }[status];

  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`gap-1.5 ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function CreateDelegationDialog({ onDone }: { onDone: () => void }) {
  const { user, roles } = useAuth();
  const { data: allRoles = [] } = useRoles();
  const createDelegation = useCreateDelegation();
  const [delegateId, setDelegateId] = useState('');
  const [roleId, setRoleId] = useState<string>('__all__');
  const [validFrom, setValidFrom] = useState(toDatetimeLocal(new Date()));
  const [validTo, setValidTo] = useState(
    toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // +7 days
  );
  const [reason, setReason] = useState('');

  // Roles I CURRENTLY hold — those are the only ones I can delegate.
  // Cross-reference allRoles (which has id+name+label) with my
  // current role names from AuthContext.
  const myRoles = useMemo(() => {
    return allRoles.filter((r) => roles.includes(r.name) && r.name !== 'tenant');
  }, [allRoles, roles]);

  // List of potential delegates: anyone with a profile other than me.
  // Loaded lazily so the dialog opens fast.
  const { data: candidates = [] } = useQuery({
    queryKey: ['delegation-candidates', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .neq('id', user!.id)
        .order('full_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const handleSubmit = () => {
    if (!delegateId) return;
    createDelegation.mutate(
      {
        delegate_id: delegateId,
        role_id: roleId === '__all__' ? null : roleId,
        valid_from: new Date(validFrom).toISOString(),
        valid_to: new Date(validTo).toISOString(),
        reason: reason.trim() || undefined,
      },
      { onSuccess: () => onDone() },
    );
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Delegate approval authority
        </DialogTitle>
        <DialogDescription>
          The delegate will receive your approval permissions for the time
          window you specify.
        </DialogDescription>
      </DialogHeader>

      {/* Admin-action notice — important caveat the delegator needs
          to act on. The delegation table records intent + audit
          attribution, but RLS still gates the actual approve action
          on user_roles, so the delegate must ALSO be temporarily
          granted the role by an admin for approvals to go through.
          Without this step the delegate will see the permit in their
          inbox but the approve button will fail. */}
      <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2.5 text-xs space-y-1">
        <p className="font-medium text-warning flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Admin action required</span>
        </p>
        <p className="text-foreground/80 pl-5">
          After creating this delegation, ask an admin to also grant your
          delegate the role temporarily (under{' '}
          <span className="font-mono text-[10px] bg-muted px-1 rounded">
            Approvers Management
          </span>
          ). This delegation logs intent and audit attribution; the role
          assignment is what lets approvals actually go through.
        </p>
      </div>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="delegate">Delegate</Label>
          <Select value={delegateId} onValueChange={setDelegateId}>
            <SelectTrigger id="delegate">
              <SelectValue placeholder="Pick a teammate..." />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name || c.email}
                  {c.full_name && <span className="text-muted-foreground"> · {c.email}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="role">Scope</Label>
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger id="role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All my approval roles</SelectItem>
              {myRoles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  Only {r.label || r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            By default the delegate inherits all of your approval roles. Pick a
            specific role to delegate only that one.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from">Valid from</Label>
            <Input
              id="from"
              type="datetime-local"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">Valid to</Label>
            <Input
              id="to"
              type="datetime-local"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason (optional)</Label>
          <Textarea
            id="reason"
            placeholder="e.g. On leave 15-22 May"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={createDelegation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!delegateId || createDelegation.isPending}
        >
          {createDelegation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            'Create delegation'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// datetime-local input wants 'YYYY-MM-DDTHH:mm'. Date.toISOString()
// returns UTC; convert via the user's local tz offset so the picker
// pre-fills sensibly.
function toDatetimeLocal(d: Date): string {
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
}
