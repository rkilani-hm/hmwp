import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SignaturePad } from '@/components/ui/SignaturePad';
import { Skeleton } from '@/components/ui/skeleton';
import { PenLine, Save, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useSavedSignature, useUpdateSavedSignature } from '@/hooks/useSavedSignature';
import { toast } from 'sonner';

/**
 * Settings card that lets the user capture and persist a signature
 * and a separate initials block. Both are stored as PNG data URLs on
 * the user's profile row.
 *
 * Once saved, these are auto-loaded into the SecureApprovalDialog so
 * the user can approve permits / gate passes with a single tap
 * instead of signing from scratch every time.
 *
 * Layout: two side-by-side pads (stacked on mobile). Each has its own
 * Save / Clear actions and a preview of the currently-saved value
 * underneath the pad.
 */
export function UserSignaturesCard() {
  const { data: saved, isLoading } = useSavedSignature();
  const update = useUpdateSavedSignature();

  // Local "in progress" state — what's currently drawn in each pad
  // but not yet saved. Distinct from `saved` which is the persisted
  // server value. We commit to `saved` only when the user clicks Save.
  const [pendingSig, setPendingSig] = useState<string | null>(null);
  const [pendingInitials, setPendingInitials] = useState<string | null>(null);

  // Reset pending state when saved data refreshes (e.g. after save).
  useEffect(() => {
    setPendingSig(null);
    setPendingInitials(null);
  }, [saved?.signature_updated_at]);

  const lastUpdated = saved?.signature_updated_at
    ? format(parseISO(saved.signature_updated_at), 'PPpp')
    : null;

  const handleSaveSignature = async () => {
    if (!pendingSig) {
      toast.error('Please draw a signature first');
      return;
    }
    await update.mutateAsync({ signature: pendingSig });
    toast.success('Signature saved');
  };

  const handleClearSignature = async () => {
    if (!saved?.signature_data) return;
    if (!confirm('Remove your saved signature?')) return;
    await update.mutateAsync({ signature: null });
    toast.success('Signature removed');
  };

  const handleSaveInitials = async () => {
    if (!pendingInitials) {
      toast.error('Please draw your initials first');
      return;
    }
    await update.mutateAsync({ initials: pendingInitials });
    toast.success('Initials saved');
  };

  const handleClearInitials = async () => {
    if (!saved?.initials_data) return;
    if (!confirm('Remove your saved initials?')) return;
    await update.mutateAsync({ initials: null });
    toast.success('Initials removed');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          Signature & Initials
        </CardTitle>
        <CardDescription>
          Save your signature and initials once. They'll be pre-loaded automatically
          whenever you approve a work permit or gate pass — one tap to confirm,
          or clear and draw fresh anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {isLoading ? (
          <>
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        ) : (
          <>
            {/* ============== FULL SIGNATURE ============== */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Signature</h3>
                {saved?.signature_data && (
                  <span className="text-xs text-muted-foreground">
                    Saved {lastUpdated && `· ${lastUpdated}`}
                  </span>
                )}
              </div>

              {/* Current saved preview (only if no pending edits) */}
              {saved?.signature_data && !pendingSig && (
                <div className="border rounded-lg bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    Currently saved
                  </div>
                  <img
                    src={saved.signature_data}
                    alt="Saved signature"
                    className="max-h-32 object-contain"
                  />
                </div>
              )}

              {/* Pad for drawing a new signature */}
              <div>
                <div className="text-xs text-muted-foreground mb-2">
                  {saved?.signature_data
                    ? 'Draw below to replace your saved signature'
                    : 'Draw your signature below'}
                </div>
                <SignaturePad
                  onSave={setPendingSig}
                  height={200}
                  disabled={update.isPending}
                />
              </div>

              <div className="flex gap-2 justify-end">
                {saved?.signature_data && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearSignature}
                    disabled={update.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove saved
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSignature}
                  disabled={!pendingSig || update.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saved?.signature_data ? 'Replace saved signature' : 'Save signature'}
                </Button>
              </div>
            </div>

            {/* ============== INITIALS ============== */}
            <div className="space-y-3 border-t pt-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">Initials</h3>
              </div>

              {saved?.initials_data && !pendingInitials && (
                <div className="border rounded-lg bg-muted/30 p-3">
                  <div className="text-xs text-muted-foreground mb-2">
                    Currently saved
                  </div>
                  <img
                    src={saved.initials_data}
                    alt="Saved initials"
                    className="max-h-20 object-contain"
                  />
                </div>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-2">
                  {saved?.initials_data
                    ? 'Draw below to replace your saved initials'
                    : 'Draw your initials below — for shorter confirmations and multi-step PDF acknowledgments'}
                </div>
                <SignaturePad
                  onSave={setPendingInitials}
                  height={140}
                  disabled={update.isPending}
                />
              </div>

              <div className="flex gap-2 justify-end">
                {saved?.initials_data && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearInitials}
                    disabled={update.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove saved
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveInitials}
                  disabled={!pendingInitials || update.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saved?.initials_data ? 'Replace saved initials' : 'Save initials'}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
