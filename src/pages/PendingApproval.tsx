import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, XCircle, LogOut, Mail } from 'lucide-react';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';

/**
 * Holding page shown to tenants whose account_status is 'pending' or
 * 'rejected'. ProtectedRoute redirects users here until an admin
 * approves them; once approved, they're auto-bounced to the home page
 * on next route resolution.
 *
 * No submission UI here on purpose — RLS would block it anyway, and
 * showing the rest of the app would be misleading.
 */
export default function PendingApproval() {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  const status = profile?.account_status ?? 'pending';
  const isRejected = status === 'rejected';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <img
            src={alHamraLogo}
            alt="Al Hamra"
            className="h-14 mx-auto mb-4"
          />
        </div>

        <Card className="border-border/50 shadow-xl">
          <CardHeader className="text-center pb-4">
            <div
              className={
                isRejected
                  ? 'mx-auto mb-3 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center'
                  : 'mx-auto mb-3 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center'
              }
            >
              {isRejected ? (
                <XCircle className="h-6 w-6 text-destructive" aria-hidden="true" />
              ) : (
                <Clock className="h-6 w-6 text-primary" aria-hidden="true" />
              )}
            </div>
            <CardTitle className="font-display text-xl">
              {isRejected ? 'Account not approved' : 'Activation request under processing'}
            </CardTitle>
            <CardDescription>
              {isRejected
                ? 'Your tenant account application was reviewed and not approved at this time.'
                : "Thanks for signing up. Your activation request is still being processed by the Al Hamra team. You'll be able to sign in once it's approved."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isRejected && profile?.account_rejection_reason && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium mb-1">Reason:</p>
                <p className="text-sm text-foreground/80 leading-snug">
                  {profile.account_rejection_reason}
                </p>
              </div>
            )}

            {!isRejected && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm leading-snug text-foreground/80">
                We'll follow up by email at <span className="font-medium">{profile?.email}</span> once
                your account is activated. After that, sign back in to start
                submitting work permits and gate-pass requests.
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-snug">
              <p className="font-medium mb-1 flex items-center gap-2">
                <Mail className="h-4 w-4" aria-hidden="true" />
                Need help?
              </p>
              <p className="text-foreground/80">
                Contact{' '}
                <a
                  href="mailto:permits@alhamra.com.kw"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  permits@alhamra.com.kw
                </a>{' '}
                if you have questions or need to update your application details.
              </p>
            </div>

            {profile && (
              <div className="rounded-md border border-border bg-muted/10 p-3 text-xs space-y-1 text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Email:</span>{' '}
                  {profile.email}
                </p>
                {profile.full_name && (
                  <p>
                    <span className="font-medium text-foreground">Name:</span>{' '}
                    {profile.full_name}
                  </p>
                )}
                {profile.company_name && (
                  <p>
                    <span className="font-medium text-foreground">Company:</span>{' '}
                    {profile.company_name}
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
