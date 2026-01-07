import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PushNotificationSettings } from '@/components/PushNotificationSettings';
import { User, Mail, Phone, Building2 } from 'lucide-react';

export default function Settings() {
  const { profile, roles } = useAuth();

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
        <PushNotificationSettings />
      </div>
    </div>
  );
}
