import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordStrengthIndicator } from '@/components/ui/PasswordStrengthIndicator';
import { Loader2, CheckCircle, AlertCircle, Plus, X } from 'lucide-react';
import alHamraLogo from '@/assets/al-hamra-logo.jpg';
import { toast } from 'sonner';
import { z } from 'zod';
import { normalizeKuwaitPhone } from '@/lib/validation/phone';

/**
 * AcceptInvite — the landing page for an admin-sent tenant invitation.
 *
 * The invite email links here with a recovery token_hash. We verify it
 * (establishing the tenant's session), then collect everything needed in one
 * step: a password + their profile details + their unit(s). On submit we set
 * the password, save the profile, and register the units — then drop them into
 * the app, ready to use.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/\d/, 'Add a number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Add a special character');

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [state, setState] = useState<'verifying' | 'ready' | 'invalid' | 'done'>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [units, setUnits] = useState<{ unit: string; floor: string }[]>([{ unit: '', floor: '' }]);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; phone?: string }>({});
  const [isSaving, setIsSaving] = useState(false);

  // Verify the invite token (token_hash flow — safe from email prefetch).
  useEffect(() => {
    const tokenHash = params.get('token_hash');
    const hash = window.location.hash || '';
    if (!tokenHash) {
      if (/error=|otp_expired/.test(hash)) setState('invalid');
      else setState('invalid');
      return;
    }
    let cancelled = false;
    supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash }).then(async ({ error }) => {
      if (cancelled) return;
      if (error) {
        console.error('Invite verifyOtp failed:', error);
        setState('invalid');
        return;
      }
      window.history.replaceState({}, '', '/accept-invite');
      // Prefill any details the admin already entered.
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name, phone, company_name')
            .eq('id', user.id)
            .maybeSingle();
          if (prof) {
            setFullName(prof.full_name || (user.user_metadata?.full_name as string) || '');
            setPhone(prof.phone || '');
            setCompany(prof.company_name || (user.user_metadata?.company_name as string) || '');
          }
        }
      } catch { /* non-fatal prefill */ }
      setState('ready');
    });
    return () => { cancelled = true; };
  }, [params]);

  const updateUnit = (i: number, f: 'unit' | 'floor', v: string) =>
    setUnits((rows) => rows.map((r, idx) => (idx === i ? { ...r, [f]: v } : r)));
  const addUnit = () => setUnits((rows) => [...rows, { unit: '', floor: '' }]);
  const removeUnit = (i: number) => setUnits((rows) => (rows.length <= 1 ? rows : rows.filter((_, idx) => idx !== i)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    try { passwordSchema.parse(password); } catch (err) {
      if (err instanceof z.ZodError) next.password = err.errors[0].message;
    }
    if (password !== confirm) next.confirm = "Passwords don't match";
    if (!fullName.trim()) { toast.error('Please enter your full name'); return; }
    if (!company.trim()) { toast.error('Please enter your company name'); return; }
    let normalizedPhone: string | null = null;
    if (phone.trim()) {
      normalizedPhone = normalizeKuwaitPhone(phone);
      if (!normalizedPhone) next.phone = 'Enter a valid Kuwaiti mobile (8 digits, e.g. 66001030)';
    }
    if (Object.keys(next).length) { setErrors(next); return; }
    setErrors({});

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Your invite session expired — please reopen the link.'); setState('invalid'); return; }

    setIsSaving(true);
    const toastId = toast.loading('Setting up your account…');
    try {
      // 1. Set the password.
      const { error: pwErr } = await supabase.auth.updateUser({ password });
      if (pwErr) throw pwErr;

      const cleanUnits = units
        .map((u) => ({ unit: u.unit.trim(), floor: u.floor.trim() }))
        .filter((u) => u.unit !== '');

      // 2. Save profile details (primary unit mirrored for back-compat).
      const { error: profErr } = await supabase.from('profiles').update({
        full_name: fullName.trim(),
        phone: normalizedPhone,
        company_name: company.trim(),
        unit: cleanUnits[0]?.unit || null,
        floor: cleanUnits[0]?.floor || null,
      }).eq('id', user.id);
      if (profErr) throw profErr;

      // 3. Register units (deduped).
      if (cleanUnits.length) {
        const seen = new Set<string>();
        const rows = cleanUnits
          .filter((u) => { const k = `${u.unit}|${u.floor}`; if (seen.has(k)) return false; seen.add(k); return true; })
          .map((u) => ({ tenant_id: user.id, unit: u.unit, floor: u.floor }));
        // tenant_units isn't in generated types yet — cast for this insert.
        await (supabase as unknown as { from: (t: string) => any })
          .from('tenant_units').insert(rows);
      }

      toast.success('Welcome! Your account is ready.', { id: toastId });
      setState('done');
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } catch (err: any) {
      console.error('Accept invite error:', err);
      toast.error(err?.message || 'Could not complete setup', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={alHamraLogo} alt="Al Hamra Logo" className="h-20 mx-auto mb-4 object-contain" />
          <h1 className="text-2xl font-display font-bold">WorkPermit</h1>
          <p className="text-muted-foreground">Management System</p>
        </div>

        <Card className="border-border/50 shadow-xl">
          {state === 'verifying' && (
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verifying your invitation…</p>
            </CardContent>
          )}

          {state === 'invalid' && (
            <>
              <CardHeader className="text-center pb-2">
                <div className="flex justify-center mb-3">
                  <div className="rounded-full bg-destructive/15 p-3"><AlertCircle className="h-10 w-10 text-destructive" /></div>
                </div>
                <CardTitle className="font-display text-xl">Invitation invalid or expired</CardTitle>
                <CardDescription className="pt-1">
                  Invitation links expire after 60 minutes and can be used once. Please ask the
                  administrator to resend your invitation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate('/auth', { replace: true })} className="w-full" variant="outline">
                  Go to sign in
                </Button>
              </CardContent>
            </>
          )}

          {state === 'ready' && (
            <>
              <CardHeader className="text-center pb-3">
                <CardTitle className="font-display text-xl">Welcome — complete your registration</CardTitle>
                <CardDescription>Set a password and confirm your details to get started.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="inv-name">Full name</Label>
                    <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-company">Company</Label>
                    <Input id="inv-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Trading Co." />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-phone">Phone / Mobile</Label>
                    <Input id="inv-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="+965 ..." className={errors.phone ? 'border-destructive' : ''} />
                    {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label>Unit(s)</Label>
                    <p className="text-xs text-muted-foreground -mt-1">Add each unit you occupy.</p>
                    {units.map((row, i) => (
                      <div key={i} className="flex gap-2">
                        <Input placeholder="Unit e.g. 1205" value={row.unit} onChange={(e) => updateUnit(i, 'unit', e.target.value)} />
                        <Input placeholder="Floor" className="w-24 shrink-0" value={row.floor} onChange={(e) => updateUnit(i, 'floor', e.target.value)} />
                        {units.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground"
                            onClick={() => removeUnit(i)} aria-label="Remove unit"><X className="h-4 w-4" /></Button>
                        )}
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addUnit} className="w-full">
                      <Plus className="h-4 w-4 mr-1.5" />Add another unit
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="inv-password">Password</Label>
                    <PasswordInput id="inv-password" placeholder="••••••••" value={password}
                      onChange={(e) => setPassword(e.target.value)} className={errors.password ? 'border-destructive' : ''} />
                    <PasswordStrengthIndicator password={password} />
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inv-confirm">Confirm password</Label>
                    <PasswordInput id="inv-confirm" placeholder="••••••••" value={confirm}
                      onChange={(e) => setConfirm(e.target.value)} className={errors.confirm ? 'border-destructive' : ''} />
                    {errors.confirm && <p className="text-sm text-destructive">{errors.confirm}</p>}
                  </div>

                  <Button type="submit" className="w-full" disabled={isSaving}>
                    {isSaving ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Setting up…</>) : 'Create my account'}
                  </Button>
                </form>
              </CardContent>
            </>
          )}

          {state === 'done' && (
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-success/15 p-3"><CheckCircle className="h-10 w-10 text-success" /></div>
              <CardTitle className="font-display text-xl">You're all set</CardTitle>
              <CardDescription>Taking you into the system…</CardDescription>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
