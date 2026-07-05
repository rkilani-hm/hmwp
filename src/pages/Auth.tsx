import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';
import { Loader2, Info, CheckCircle, Mail, Clock, Plus, X } from 'lucide-react';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { motion } from 'framer-motion';
import { z } from 'zod';
import { emailSchema, passwordSchema } from '@/lib/validation/auth';
import { normalizeKuwaitPhone } from '@/lib/validation/phone';

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('signin');

  // After a successful tenant signup we show a dedicated confirmation
  // card explaining the approval workflow instead of just dropping
  // them back on the signin tab with no context. submittedEmail is
  // remembered so the card can echo it back ("we'll email you at
  // x@y.com once your account is activated").
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  // Forgot-password mode: when toggled, the Card swaps its tabbed
  // form for a single email input + a "reset link sent" confirmation.
  // Pattern matches signupSuccess so all three Card variants share the
  // same shell.
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordEmailError, setForgotPasswordEmailError] = useState('');
  const [resetLinkSent, setResetLinkSent] = useState(false);
  
  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInErrors, setSignInErrors] = useState<{ email?: string; password?: string }>({});
  
  // Sign Up state
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpPhone, setSignUpPhone] = useState('');
  const [signUpCompany, setSignUpCompany] = useState('');
  // Tenant master data — captured at signup, stored on profile + tenant_units,
  // re-used as defaults in the work-permit + gate-pass wizards. A tenant can
  // register more than one unit (e.g. two units in the tower). Optional; rows
  // can be left blank and filled in later. Always at least one row on screen.
  const [signUpUnits, setSignUpUnits] = useState<{ unit: string; floor: string }[]>([
    { unit: '', floor: '' },
  ]);

  const updateUnitRow = (i: number, field: 'unit' | 'floor', value: string) => {
    setSignUpUnits((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  };
  const addUnitRow = () => setSignUpUnits((rows) => [...rows, { unit: '', floor: '' }]);
  const removeUnitRow = (i: number) =>
    setSignUpUnits((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));
  const [signUpErrors, setSignUpErrors] = useState<{ email?: string; password?: string; name?: string; phone?: string; company?: string }>({});

  const validateSignIn = () => {
    const errors: { email?: string; password?: string } = {};
    
    try {
      emailSchema.parse(signInEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(signInPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.password = e.errors[0].message;
      }
    }
    
    setSignInErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateSignUp = () => {
    const errors: { email?: string; password?: string; name?: string; phone?: string; company?: string } = {};

    if (!signUpName.trim()) {
      errors.name = 'Name is required';
    }
    if (!signUpPhone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!normalizeKuwaitPhone(signUpPhone)) {
      errors.phone = 'Enter a valid Kuwaiti mobile number (8 digits, e.g. 66001030)';
    }
    if (!signUpCompany.trim()) {
      errors.company = 'Company name is required';
    }
    
    try {
      emailSchema.parse(signUpEmail);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.email = e.errors[0].message;
      }
    }
    
    try {
      passwordSchema.parse(signUpPassword);
    } catch (e) {
      if (e instanceof z.ZodError) {
        errors.password = e.errors[0].message;
      }
    }
    
    setSignUpErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignIn()) return;
    
    setIsLoading(true);
    const { error } = await signIn(signInEmail, signInPassword);
    setIsLoading(false);
    
    if (!error) {
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignUp()) return;
    
    setIsLoading(true);
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, {
      phone: normalizeKuwaitPhone(signUpPhone) ?? signUpPhone,
      companyName: signUpCompany,
      units: signUpUnits,
    });
    setIsLoading(false);
    
    if (!error) {
      // Notify the admin team that a new tenant is waiting in the Pending
      // Approvals queue. Best-effort + server-side (the account is 'pending'
      // and can't sign in, so this runs unauthenticated via a public edge
      // function that resolves admin emails and sends with the service role).
      // Never blocks the signup confirmation.
      supabase.functions
        .invoke('notify-new-tenant', { body: { email: signUpEmail } })
        .catch((e) => console.error('New-tenant admin notification failed (non-fatal):', e));

      // Show the confirmation card. Remember the email for the
      // signin form when the user comes back later (after admin
      // approval). Clear sensitive fields immediately.
      setSubmittedEmail(signUpEmail);
      setSignInEmail(signUpEmail);
      setSignUpPassword('');
      setSignupSuccess(true);
    }
  };

  // Called from the confirmation card's 'Back to sign in' button.
  // Resets the success state and switches the tab; the signin
  // email is already pre-filled from handleSignUp above.
  const handleReturnToSignIn = () => {
    setSignupSuccess(false);
    setActiveTab('signin');
    // Clear the rest of the signup form for hygiene
    setSignUpName('');
    setSignUpPhone('');
    setSignUpCompany('');
    setSignUpUnits([{ unit: '', floor: '' }]);
    setSignUpEmail('');
  };

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordEmailError('');

    // Validate email format before hitting Supabase
    try {
      emailSchema.parse(forgotPasswordEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setForgotPasswordEmailError(err.errors[0].message);
      }
      return;
    }

    setIsLoading(true);
    const { error } = await resetPassword(forgotPasswordEmail);
    setIsLoading(false);

    if (!error) {
      // Always show the success screen — resetPassword() swallows
      // "user not found" errors to avoid leaking which emails are
      // registered.
      setResetLinkSent(true);
    }
  };

  const handleBackFromForgotPassword = () => {
    setForgotPasswordMode(false);
    setResetLinkSent(false);
    setForgotPasswordEmail('');
    setForgotPasswordEmailError('');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={alHamraLogo}
            alt="Al Hamra Logo"
            className="h-20 mx-auto mb-4 object-contain"
          />
          <h1 className="text-2xl font-display font-bold">WorkPermit</h1>
          <p className="text-muted-foreground">Management System</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          {forgotPasswordMode ? (
            // Forgot-password flow: collect email, send reset link,
            // show 'check your email' confirmation. Two states in
            // one branch (form vs confirmation) controlled by
            // resetLinkSent.
            resetLinkSent ? (
              <>
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-3">
                    <div className="rounded-full bg-success/15 p-3">
                      <CheckCircle className="h-10 w-10 text-success" />
                    </div>
                  </div>
                  <CardTitle className="font-display text-xl">
                    Check your email
                  </CardTitle>
                  <CardDescription className="pt-1">
                    If an account exists for{' '}
                    <span className="font-medium">{forgotPasswordEmail}</span>,
                    we've sent a password reset link.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-md bg-muted/50 border border-border px-3 py-2.5 text-sm flex gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">
                      Click the link in the email to choose a new password.
                      The link expires in 60 minutes for security. Check
                      your spam folder if you don't see it within a few
                      minutes.
                    </span>
                  </div>
                  <Button
                    onClick={handleBackFromForgotPassword}
                    className="w-full"
                    variant="outline"
                  >
                    Back to sign in
                  </Button>
                </CardContent>
              </>
            ) : (
              <>
                <CardHeader className="text-center pb-2">
                  <CardTitle className="font-display text-xl">
                    Reset your password
                  </CardTitle>
                  <CardDescription className="pt-1">
                    Enter the email you signed up with. We'll send a link
                    to reset your password.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendResetLink} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="you@example.com"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        className={forgotPasswordEmailError ? 'border-destructive' : ''}
                        autoFocus
                      />
                      {forgotPasswordEmailError && (
                        <p className="text-sm text-destructive">{forgotPasswordEmailError}</p>
                      )}
                    </div>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send reset link'
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={handleBackFromForgotPassword}
                    >
                      Back to sign in
                    </Button>
                  </form>
                </CardContent>
              </>
            )
          ) : signupSuccess ? (
            // Post-signup confirmation. Shown after a tenant submits
            // the registration form successfully. The account is in
            // 'pending' status server-side — admin must approve
            // before they can sign in. This screen sets that
            // expectation clearly so the tenant doesn't keep trying
            // to sign in and hitting the "pending approval" error.
            <>
              <CardHeader className="text-center pb-2">
                <div className="flex justify-center mb-3">
                  <div className="rounded-full bg-success/15 p-3">
                    <CheckCircle className="h-10 w-10 text-success" />
                  </div>
                </div>
                <CardTitle className="font-display text-xl">
                  Registration received
                </CardTitle>
                <CardDescription className="pt-1">
                  Thank you for signing up. Your account has been
                  submitted for review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {submittedEmail && (
                  <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-sm flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Submitted as</span>
                    <span className="font-medium truncate">{submittedEmail}</span>
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <p className="font-medium">What happens next:</p>
                  <ol className="space-y-2.5 pl-1">
                    <li className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        1
                      </span>
                      <span>
                        Our team reviews new registrations — usually within
                        one business day.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        2
                      </span>
                      <span>
                        You'll receive an email at the address above as soon
                        as your account is activated.
                      </span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        3
                      </span>
                      <span>
                        Once activated, sign in to start submitting work
                        permits and gate passes.
                      </span>
                    </li>
                  </ol>
                </div>

                <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2.5 text-sm flex gap-2">
                  <Clock className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Signing in before activation will show a
                    "pending approval" message. That's expected — please
                    wait for the confirmation email.
                  </span>
                </div>

                <Button
                  onClick={handleReturnToSignIn}
                  className="w-full"
                  variant="outline"
                >
                  Back to sign in
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="text-center pb-4">
                <CardTitle className="font-display text-xl">Welcome</CardTitle>
                <CardDescription>Sign in to your account, or sign up as a new tenant</CardDescription>
              </CardHeader>
              <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Tenant Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      className={signInErrors.email ? 'border-destructive' : ''}
                    />
                    {signInErrors.email && (
                      <p className="text-sm text-destructive">{signInErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <button
                        type="button"
                        onClick={() => setForgotPasswordMode(true)}
                        className="text-xs text-primary hover:underline focus:outline-none focus:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <PasswordInput
                      id="signin-password"
                      placeholder="••••••••"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      className={signInErrors.password ? 'border-destructive' : ''}
                    />
                    {signInErrors.password && (
                      <p className="text-sm text-destructive">{signInErrors.password}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                {/* Helper banner: clarifies who should self-register here.
                    Internal Al Hamra staff (approvers, admins) get accounts
                    from the admin team — they shouldn't sign up here. */}
                <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 flex gap-3">
                  <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-sm text-foreground/80 leading-snug">
                    Sign up here if you're a <strong>tenant</strong> who needs to
                    submit work permits or gate-pass requests for your unit.
                    Al&nbsp;Hamra staff: please contact your administrator to be
                    issued an account — don't register here.
                  </p>
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      className={signUpErrors.name ? 'border-destructive' : ''}
                    />
                    {signUpErrors.name && (
                      <p className="text-sm text-destructive">{signUpErrors.name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      className={signUpErrors.email ? 'border-destructive' : ''}
                    />
                    {signUpErrors.email && (
                      <p className="text-sm text-destructive">{signUpErrors.email}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone / Mobile</Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="+965 1234 5678"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      className={signUpErrors.phone ? 'border-destructive' : ''}
                    />
                    {signUpErrors.phone && (
                      <p className="text-sm text-destructive">{signUpErrors.phone}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-company">Company Name</Label>
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Acme Trading Co."
                      value={signUpCompany}
                      onChange={(e) => setSignUpCompany(e.target.value)}
                      className={signUpErrors.company ? 'border-destructive' : ''}
                    />
                    {signUpErrors.company && (
                      <p className="text-sm text-destructive">{signUpErrors.company}</p>
                    )}
                  </div>
                  {/* Units: optional tenant master data. A tenant can register
                      more than one unit — each becomes a tenant_units row and
                      is selectable when creating a work permit or gate pass.
                      The first unit is also stored as the profile's primary
                      unit for backward compatibility. */}
                  <div className="space-y-2">
                    <Label>Unit(s)</Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Add each unit you occupy. You'll pick which unit a permit or
                      gate pass is for when you create it.
                    </p>
                    <div className="space-y-2">
                      {signUpUnits.map((row, i) => (
                        <div key={i} className="flex gap-2">
                          <Input
                            type="text"
                            placeholder="Unit e.g. 1205"
                            aria-label={`Unit ${i + 1}`}
                            value={row.unit}
                            onChange={(e) => updateUnitRow(i, 'unit', e.target.value)}
                          />
                          <Input
                            type="text"
                            placeholder="Floor e.g. 12"
                            aria-label={`Floor ${i + 1}`}
                            className="w-28 shrink-0"
                            value={row.floor}
                            onChange={(e) => updateUnitRow(i, 'floor', e.target.value)}
                          />
                          {signUpUnits.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-muted-foreground"
                              onClick={() => removeUnitRow(i)}
                              aria-label={`Remove unit ${i + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addUnitRow}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      Add another unit
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <PasswordInput
                      id="signup-password"
                      placeholder="••••••••"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      className={signUpErrors.password ? 'border-destructive' : ''}
                    />
                    <PasswordStrengthIndicator password={signUpPassword} />
                    {signUpErrors.password && (
                      <p className="text-sm text-destructive">{signUpErrors.password}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating tenant account...
                      </>
                    ) : (
                      'Create Tenant Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
