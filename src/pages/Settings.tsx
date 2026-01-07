import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PushNotificationSettings } from '@/components/PushNotificationSettings';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { User, Mail, Phone, Building2, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const { user, profile, roles } = useAuth();
  const { isSubscribed } = usePushNotifications();
  const [isSending, setIsSending] = useState(false);

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
    contractor: 'Contractor',
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

  const sendTestNotification = async () => {
    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    if (!isSubscribed) {
      toast.error('Please enable push notifications first');
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: '🔔 Test Notification',
          message: 'Push notifications are working correctly!',
          data: { url: '/settings' },
        },
      });

      if (error) throw error;

      if (data?.results?.[0]?.success) {
        toast.success('Test notification sent! Check your device.');
      } else {
        toast.error(data?.results?.[0]?.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error('Failed to send test notification');
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

      <div className="grid gap-6 md:grid-cols-2">
        {/* Profile Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {getInitials(profile?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{profile?.full_name || 'User'}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {roles.map(role => (
                    <span
                      key={role}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    >
                      {roleLabels[role] || role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{profile?.email || 'No email'}</span>
              </div>
              {profile?.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.phone}</span>
                </div>
              )}
              {profile?.company_name && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{profile.company_name}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Push Notifications */}
        <div className="space-y-4">
          <PushNotificationSettings />
          
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
        </div>
      </div>
    </div>
  );
}
