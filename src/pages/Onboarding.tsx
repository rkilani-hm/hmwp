import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, User, Phone, Building2 } from 'lucide-react';

const Onboarding = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Pre-fill from existing profile if available
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setCompanyName(profile.company_name || '');
    }
  }, [profile]);

  const isProfileComplete = () => {
    return fullName.trim() && phone.trim() && companyName.trim();
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

      const { error } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            email,
            full_name: fullName.trim(),
            phone: phone.trim(),
            company_name: companyName.trim(),
          },
          { onConflict: 'id' }
        );

      if (error) throw error;

      await refreshProfile();

      toast.success('Profile completed successfully!', { id: toastId });
      navigate('/', { replace: true });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(error.message || 'Failed to save profile', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Welcome! Complete Your Profile</CardTitle>
          <CardDescription>
            Please provide your details to get started. All fields are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
