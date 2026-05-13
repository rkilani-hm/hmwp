import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, AlertTriangle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';

/**
 * Banner shown at the top of Approvers Management that lists
 * currently-active approval delegations. The point: when an admin
 * lands on this page they see "X is delegating to Y from … to …
 * for role Z — make sure Y has role Z assigned for that window".
 *
 * This is the connective tissue between the delegation table
 * (records intent + audit attribution) and the user_roles table
 * (gates actual RLS permission). The two are intentionally
 * decoupled — see MyDelegations 'How it works' card — so this
 * banner reminds admins to keep them in sync.
 *
 * If no active delegations, returns null (no clutter).
 */
export function PendingDelegationsBanner() {
  const [expanded, setExpanded] = useState(false);

  const { data: active = [] } = useQuery({
    queryKey: ['active-delegations-for-admin'],
    queryFn: async () => {
      // RLS lets admins see all delegations. Filter to currently-
      // active ones: is_active=true AND now() within window.
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('approval_delegations' as any)
        .select('id, delegator_id, delegate_id, role_id, valid_from, valid_to, reason, roles:role_id(name, label)')
        .eq('is_active', true)
        .lte('valid_from', now)
        .gt('valid_to', now)
        .order('valid_to', { ascending: true });

      if (error) {
        console.error('Could not load active delegations:', error);
        return [];
      }
      if (!data || data.length === 0) return [];

      // Hydrate user names from profiles in one round-trip
      const userIds = new Set<string>();
      data.forEach((d: any) => {
        userIds.add(d.delegator_id);
        userIds.add(d.delegate_id);
      });
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(userIds));
      const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

      return data.map((d: any) => ({
        id: d.id,
        delegator: profileMap.get(d.delegator_id),
        delegate: profileMap.get(d.delegate_id),
        roleName: d.roles?.name ?? null,
        roleLabel: d.roles?.label ?? null,
        validTo: d.valid_to,
        reason: d.reason,
      }));
    },
  });

  if (active.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <Share2 className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm">
                {active.length === 1
                  ? '1 active approval delegation'
                  : `${active.length} active approval delegations`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((e) => !e)}
                className="h-7 text-xs"
              >
                {expanded ? 'Hide' : 'Show details'}
                <ChevronDown
                  className={`w-3 h-3 ml-1 transition-transform ${
                    expanded ? 'rotate-180' : ''
                  }`}
                />
              </Button>
            </div>
            <p className="text-xs text-foreground/80 mt-1 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-warning" />
              <span>
                For each delegation below, confirm the delegate has the
                relevant role assigned. The delegation alone doesn't
                bypass RLS — without the temporary role grant the
                delegate's approve action will fail.
              </span>
            </p>

            {expanded && (
              <ul className="mt-3 space-y-2">
                {active.map((d) => (
                  <li
                    key={d.id}
                    className="text-xs bg-background/60 rounded border border-border/50 px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">
                          {d.delegator?.full_name || d.delegator?.email || 'Unknown'}{' '}
                          <span className="text-muted-foreground">→</span>{' '}
                          {d.delegate?.full_name || d.delegate?.email || 'Unknown'}
                        </p>
                        <p className="text-muted-foreground mt-0.5">
                          Scope:{' '}
                          {d.roleLabel ? (
                            <span className="font-mono bg-muted px-1 rounded">
                              {d.roleLabel}
                            </span>
                          ) : (
                            'all of delegator\'s roles'
                          )}
                          {' · until '}
                          {format(new Date(d.validTo), 'MMM d, yyyy h:mm a')}
                        </p>
                        {d.reason && (
                          <p className="italic text-muted-foreground mt-0.5">
                            "{d.reason}"
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
