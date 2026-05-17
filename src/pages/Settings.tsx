import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PushNotificationSettings } from '@/components/PushNotificationSettings';
import { BiometricDevices } from '@/components/BiometricDevices';
import { LanguageToggle } from '@/components/LanguageToggle';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useBiometricAuth } from '@/hooks/useBiometricAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, Phone, Building2, Send, Loader2, Pencil, Save, X, Upload, ImageIcon, Fingerprint, KeyRound, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UserSignaturesCard } from '@/components/settings/UserSignaturesCard';

export default function Settings() {
  const { user, profile, roles, refreshProfile, isApprover } = useAuth();
  const { isSubscribed } = usePushNotifications();
  const { isSupported: biometricSupported, isChecking: checkingBiometric } = useBiometricAuth();
  const isMobile = useIsMobile();
  const [isSending, setIsSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  // Tenant master data — captured at signup, used as defaults in every
  // permit/gate-pass wizard. Editable here so tenants can update when
  // they move units without needing an admin.
  const [unit, setUnit] = useState('');
  const [floor, setFloor] = useState('');
  const [authPreference, setAuthPreference] = useState<'password' | 'biometric'>('password');

  // Load company logo URL
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Sync form state when profile loads/changes (profile may load async)
  useEffect(() => {
    if (profile && !isEditing) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setCompanyName(profile.company_name || '');
      setUnit(profile.unit || '');
      setFloor(profile.floor || '');
      setAuthPreference((profile.auth_preference as 'password' | 'biometric') || 'password');
    }
  }, [profile, isEditing]);

  // Fetch logo URL when profile changes
  useEffect(() => {
    if (profile?.company_logo) {
      const { data } = supabase.storage
        .from('company-logos')
        .getPublicUrl(profile.company_logo);
      setLogoUrl(data.publicUrl);
    } else {
      setLogoUrl(null);
    }
  }, [profile?.company_logo]);

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const roleLabels: Record<string, string> = {
    contractor: 'Client',
    helpdesk: 'Helpdesk',
    pm: 'Property Management',
    pd: 'Project Development',
    bdcr: 'BDCR',
    mpr: 'MPR',
    it: 'IT Department',
    fitout: 'Fit-Out',
    ecovert_supervisor: 'Ecovert Supervisor',
    pmd_coordinator: 'PMD Coordinator',
    admin: 'Administrator',
  };

  const startEditing = () => {
    setFullName(profile?.full_name || '');
    setPhone(profile?.phone || '');
    setCompanyName(profile?.company_name || '');
    setUnit(profile?.unit || '');
    setFloor(profile?.floor || '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setFullName(profile?.full_name || '');
    setPhone(profile?.phone || '');
    setCompanyName(profile?.company_name || '');
    setUnit(profile?.unit || '');
    setFloor(profile?.floor || '');
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo file size must be less than 2MB');
      return;
    }

    setIsUploadingLogo(true);
    const toastId = toast.loading('Uploading logo...');

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/company-logo-${Date.now()}.${fileExt}`;

      // Delete old logo if exists
      if (profile?.company_logo) {
        await supabase.storage.from('company-logos').remove([profile.company_logo]);
      }

      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Upsert profile with new logo path (covers cases where profile row doesn't exist yet)
      const email = profile?.email || user.email;
      if (!email) throw new Error('Missing email for profile');

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert(
          { id: user.id, email, company_logo: fileName },
          { onConflict: 'id' }
        );

      if (updateError) throw updateError;

      // Get public URL
      const { data } = supabase.storage
        .from('company-logos')
        .getPublicUrl(fileName);

      setLogoUrl(data.publicUrl);
      toast.success('Logo uploaded successfully!', { id: toastId });

      // Refresh profile data
      await refreshProfile();
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo', { id: toastId });
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const saveProfile = async () => {
    if (!user) return;

    setIsSaving(true);
    const toastId = toast.loading('Saving profile...');

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
            phone: phone.trim() || null,
            company_name: companyName.trim() || null,
            // Tenant master data — trimmed, blank → null so the
            // wizards' pre-fill logic doesn't have to distinguish
            // '' from missing.
            unit: unit.trim() || null,
            floor: floor.trim() || null,
            auth_preference: isApprover() ? authPreference : undefined,
          },
          { onConflict: 'id' }
        );

      if (error) throw error;

      toast.success('Profile updated successfully!', { id: toastId });
      setIsEditing(false);

      // Refresh profile data
      await refreshProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile', { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestNotification = async () => {
    if (isSending) return;

    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    if (!isSubscribed) {
      toast.error('Please enable push notifications first');
      return;
    }

    setIsSending(true);
    const toastId = toast.loading('Sending test notification...');

    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: 'Test Notification',
          message: 'Push notifications are working correctly!',
          data: { url: '/settings' },
        },
      });

      if (error) throw error;

      const sent = typeof data?.sent === 'number' ? data.sent : 0;
      const failed = typeof data?.failed === 'number' ? data.failed : 0;

      if (sent > 0 && failed === 0) {
        toast.success('Test notification sent! Check your device.', { id: toastId });
      } else if (sent > 0 && failed > 0) {
        toast.message(`Sent to ${sent} device(s); ${failed} failed.`, { id: toastId });
      } else if (sent === 0 && failed > 0) {
        toast.error('Failed to send notification to your device.', { id: toastId });
      } else {
        toast.error('No push subscription found. Try re-enabling notifications.', { id: toastId });
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error('Failed to send test notification', { id: toastId });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile Card */}
        <Card className="lg:row-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>Your account information</CardDescription>
            </div>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelEditing} disabled={isSaving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button size="sm" onClick={saveProfile} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar and Company Logo Section */}
            <div className="flex items-start gap-6">
              <div className="flex flex-col items-center gap-2">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                    {getInitials(profile?.full_name)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs text-muted-foreground">Your Avatar</p>
              </div>

              {/* Company Logo */}
              <div className="flex flex-col items-center gap-2">
                <div 
                  className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center bg-muted/50 overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt="Company Logo" 
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-[10px]">Add Logo</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={isUploadingLogo}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                >
                  {isUploadingLogo ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  {logoUrl ? 'Change' : 'Upload'}
                </Button>
              </div>
            </div>

            {/* Roles Display */}
            <div className="flex flex-wrap gap-1">
              {roles.map(role => (
                <span
                  key={role}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                >
                  {roleLabels[role] || role}
                </span>
              ))}
            </div>

            {/* Profile Form */}
            {isEditing ? (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={profile?.email || ''}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter your phone number"
                    type="tel"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter your company name"
                  />
                </div>

                {/* Unit + Floor — tenant master data. Side-by-side row
                    so they take the same vertical space as a single
                    field. Used as pre-fill defaults in the work-permit
                    + gate-pass wizards. Optional; leave blank if not
                    applicable. */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Input
                      id="unit"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g. 1205"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floor">Floor</Label>
                    <Input
                      id="floor"
                      value={floor}
                      onChange={(e) => setFloor(e.target.value)}
                      placeholder="e.g. 12"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-3 text-sm">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">{profile?.full_name || 'Not set'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{profile?.email || 'No email'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{profile?.phone || 'Not set'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>{profile?.company_name || 'Not set'}</span>
                </div>
                {/* Unit + Floor — shown alongside company so admins
                    and approvers reviewing the profile see all the
                    master data in one block. MapPin icon reused for
                    consistency with the Pending Approvals card. */}
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span>
                    Unit {profile?.unit || '—'} · Floor {profile?.floor || '—'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Push Notifications and Approver Settings */}
        <div className="space-y-4">
          <PushNotificationSettings />
          
          {/* Authentication Preference - Only for approvers */}
          {isApprover() && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Fingerprint className="h-4 w-4" />
                  Approval Authentication
                </CardTitle>
                <CardDescription>
                  Choose your default authentication method for approving permits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup 
                  value={authPreference} 
                  onValueChange={(v) => setAuthPreference(v as 'password' | 'biometric')}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="password" id="auth-password" />
                    <Label htmlFor="auth-password" className="flex items-center gap-2 cursor-pointer flex-1">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Password</p>
                        <p className="text-xs text-muted-foreground">Enter your password to confirm approvals</p>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value="biometric" id="auth-biometric" disabled={!isMobile || checkingBiometric || !biometricSupported} />
                    <Label htmlFor="auth-biometric" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Fingerprint className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Fingerprint / Face ID</p>
                        <p className="text-xs text-muted-foreground">
                          {checkingBiometric 
                            ? 'Checking biometric support...'
                            : !isMobile 
                              ? 'Only available on mobile devices'
                              : !biometricSupported 
                                ? 'Not supported on this device'
                                : 'Use biometric authentication on mobile'}
                        </p>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
                {authPreference !== ((profile?.auth_preference as 'password' | 'biometric') || 'password') && (
                  <Button 
                    onClick={saveProfile} 
                    disabled={isSaving}
                    size="sm"
                    className="w-full"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Preference
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Language toggle — English default, Arabic via one tap */}
          <LanguageToggle />

          {/* Test Notification Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                Test Push Notification
              </CardTitle>
              <CardDescription>
                Send a test notification to verify your setup
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                onClick={sendTestNotification}
                disabled={isSending || !isSubscribed}
                className="w-full"
              >
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Test Notification
                  </>
                )}
              </Button>
              {!isSubscribed && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Enable push notifications above to test
                </p>
              )}
            </CardContent>
          </Card>

          {/* Saved signature & initials — pre-loaded into every approval pad */}
          <UserSignaturesCard />

          {/* Registered biometric devices (WebAuthn) */}
          <BiometricDevices />
        </div>
      </div>
    </div>
  );
}
