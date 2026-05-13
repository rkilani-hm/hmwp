import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, User, Phone, Building2 } from 'lucide-react';
import { getEmailsForRole } from '@/utils/emailNotifications';

const Onboarding = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Which fields actually need filling? A tenant who provided all
  // three at signup (the normal path post-2026-05-11) shouldn't see
  // any of them again here. Computed off the SERVER profile, not the
  // local form state, so a user who clears a field can't trick us
  // into asking for it again.
  const missingFields = useMemo(() => {
    if (!profile) return { fullName: true, phone: true, companyName: true };
    return {
      fullName: !profile.full_name?.trim(),
      phone: !profile.phone?.trim(),
      companyName: !profile.company_name?.trim(),
    };
  }, [profile]);

  const nothingMissing = !missingFields.fullName && !missingFields.phone && !missingFields.companyName;

  // Pre-fill from existing profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setCompanyName(profile.company_name || '');
    }
  }, [profile]);

  // If the profile is already complete (e.g. user navigated here
  // manually with a complete profile), bounce them home. Wrapped in
  // useEffect so the navigate happens after render, not during.
  useEffect(() => {
    if (profile && nothingMissing) {
      navigate('/', { replace: true });
    }
  }, [profile, nothingMissing, navigate]);

  const isProfileComplete = () => {
    // After this form submits, ALL three must be populated — using
    // either the value the user just typed, or the value already on
    // the server profile.
    const finalName = (missingFields.fullName ? fullName : profile?.full_name) || '';
    const finalPhone = (missingFields.phone ? phone : profile?.phone) || '';
    const finalCompany = (missingFields.companyName ? companyName : profile?.company_name) || '';
    return finalName.trim() && finalPhone.trim() && finalCompany.trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isProfileComplete()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading('Saving your profile...');

    try {
      const email = profile?.email || user.email;
      if (!email) throw new Error('Missing email for profile');

      // Build the update payload from ONLY the fields that were
      // missing. Don't overwrite existing populated fields with the
      // local form's prefilled-then-edited value (defensive — avoids
      // a user accidentally clearing a server-side phone number).
      const updatePayload: { id: string; email: string; full_name?: string; phone?: string; company_name?: string } = { id: user.id, email };
      if (missingFields.fullName) updatePayload.full_name = fullName.trim();
      if (missingFields.phone) updatePayload.phone = phone.trim();
      if (missingFields.companyName) updatePayload.company_name = companyName.trim();

      const { error } = await supabase
        .from('profiles')
        .upsert(updatePayload, { onConflict: 'id' });

      if (error) throw error;

      await refreshProfile();

      // If this is a self-signup tenant just completing their profile
      // (account_status still 'pending'), notify the admin team that a
      // new application is in the queue. Admin-created users land as
      // 'approved' so this branch is skipped for them. Best-effort —
      // failures here don't block the user from continuing.
      const wasPendingSelfSignup = profile?.account_status === 'pending';
      if (wasPendingSelfSignup) {
        try {
          const adminEmails = await getEmailsForRole('admin');
          if (adminEmails.length > 0) {
            await supabase.functions.invoke('send-email-notification', {
              body: {
                to: adminEmails,
                subject: 'New tenant application — review required',
                notificationType: 'account_pending_review',
                details: {
                  tenantName: fullName.trim() || profile?.full_name || '',
                  tenantEmail: email,
                  tenantCompany: companyName.trim() || profile?.company_name || '',
                  tenantPhone: phone.trim() || profile?.phone || '',
                },
              },
            });
          }
        } catch (notifyErr) {
          console.error('Admin notification failed (non-fatal):', notifyErr);
        }
      }

      toast.success('Profile completed successfully!', { id: toastId });
      navigate('/', { replace: true });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(error.message || 'Failed to save profile', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  // While we're in the bounce-home effect, render nothing rather than
  // flashing a partially-filled form
  if (profile && nothingMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Complete your profile</CardTitle>
          <CardDescription>
            We need a few more details before you can start submitting permits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {missingFields.fullName && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  required
                />
              </div>
            )}

            {missingFields.phone && (
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Enter your phone number"
                  required
                />
              </div>
            )}

            {missingFields.companyName && (
              <div className="space-y-2">
                <Label htmlFor="companyName" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Company Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter your company name"
                  required
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSaving || !isProfileComplete()}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Continue to Dashboard'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Onboarding;
