import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { motion } from 'framer-motion';
import { z } from 'zod';

/**
 * Reset Password page — handler for the magic-link email Supabase
 * sends from supabase.auth.resetPasswordForEmail.
 *
 * Flow:
 *   1. User clicks reset link in email
 *   2. Supabase consumes the link, creates a temporary 'recovery'
 *      session, drops them here
 *   3. We detect the recovery session (auth state event 'PASSWORD_RECOVERY')
 *      and render the new-password form
 *   4. User submits → updateUser({ password }) → toast success →
 *      bounce to /auth so they sign in with the new password
 *
 * Edge cases handled:
 *   - Link expired / invalid → show error + 'Request new link' button
 *   - User loads /reset-password directly without a recovery session
 *     → show error explaining the link is required
 *   - Password doesn't meet policy → inline validation
 */

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/\d/, 'Password must contain a number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain a special character');

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  // Three possible states:
  //   'verifying' — Supabase hasn't told us yet whether the recovery
  //                  session is valid (renders a spinner)
  //   'ready'    — recovery session confirmed; render the form
  //   'invalid'  — link expired / never had a recovery session;
  //                render the error card
  //   'done'     — password successfully updated; render success card
  const [state, setState] = useState<'verifying' | 'ready' | 'invalid' | 'done'>('verifying');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  // Detect whether we have a recovery session. Supabase emits
  // 'PASSWORD_RECOVERY' immediately after consuming the magic-link
  // tokens from the URL hash. If we already have a regular session
  // (user has been signed in for a while and just clicked an old
  // link), we still allow the password change.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setState('ready');
      } else if (event === 'SIGNED_IN' && session) {
        // Some flows fire SIGNED_IN instead of PASSWORD_RECOVERY
        // depending on how the link was opened. Either is fine.
        setState('ready');
      }
    });

    // Fallback: if no event fires within 3 seconds, the link is
    // either expired or the user navigated here directly without
    // a recovery session. Show the error state.
    const timeout = setTimeout(() => {
      setState((current) => (current === 'verifying' ? 'invalid' : current));
    }, 3000);

    // Check if a session already exists from a freshly-consumed
    // recovery link in the URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState((current) => (current === 'verifying' ? 'ready' : current));
        clearTimeout(timeout);
      }
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Inline validation
    const next: typeof errors = {};
    try {
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) next.password = err.errors[0].message;
    }
    if (password !== confirmPassword) {
      next.confirm = "Passwords don't match";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});

    setIsSaving(true);
    const { error } = await updatePassword(password);
    setIsSaving(false);

    if (!error) {
      setState('done');
      // After a brief pause, sign out so the user signs back in
      // with the new password (gives the success card visible)
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/auth', { replace: true });
      }, 2500);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <img src={alHamraLogo} alt="Al Hamra Logo" className="h-20 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-display font-bold">WorkPermit</h1>
          <p className="text-muted-foreground">Management System</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          {state === 'verifying' && (
            <>
              <CardHeader className="text-center">
                <CardTitle className="font-display text-xl">Verifying reset link</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              </CardContent>
            </>
          )}

          {state === 'invalid' && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="flex justify-center mb-3">
                  <div className="rounded-full bg-destructive/15 p-3">
                    <AlertCircle className="h-10 w-10 text-destructive" />
                  </div>
                </div>
                <CardTitle className="font-display text-xl">Reset link invalid or expired</CardTitle>
                <CardDescription className="pt-1">
                  Password-reset links expire after 60 minutes and can only be
                  used once. Request a new one to continue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => navigate('/auth', { replace: true })}
                  className="w-full"
                >
                  Back to sign in
                </Button>
              </CardContent>
            </>
          )}

          {state === 'ready' && (
            <>
              <CardHeader className="text-center pb-4">
                <CardTitle className="font-display text-xl">Choose a new password</CardTitle>
                <CardDescription>
                  Pick something at least 8 characters with upper + lower case,
                  a number, and a special character.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={errors.password ? 'border-destructive' : ''}
                      autoFocus
                    />
                    {errors.password && (
                      <p className="text-sm text-destructive">{errors.password}</p>
                    )}
                    {password && <PasswordStrengthIndicator password={password} />}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={errors.confirm ? 'border-destructive' : ''}
                    />
                    {errors.confirm && (
                      <p className="text-sm text-destructive">{errors.confirm}</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating password...
                      </>
                    ) : (
                      'Update password'
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {state === 'done' && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="flex justify-center mb-3">
                  <div className="rounded-full bg-success/15 p-3">
                    <CheckCircle className="h-10 w-10 text-success" />
                  </div>
                </div>
                <CardTitle className="font-display text-xl">Password updated</CardTitle>
                <CardDescription className="pt-1">
                  Your password has been changed. Redirecting you to sign in...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
