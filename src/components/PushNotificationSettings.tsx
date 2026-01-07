import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export function PushNotificationSettings() {
  const {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Push Notifications
          </CardTitle>
          <CardDescription>
            Push notifications are not supported in this browser.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Receive instant notifications about permit updates, approvals, and more.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <p className="font-medium">Enable Push Notifications</p>
            <p className="text-sm text-muted-foreground">
              {isSubscribed
                ? 'You will receive push notifications'
                : permission === 'denied'
                ? 'Notifications are blocked. Please enable in browser settings.'
                : 'Get notified when permits need your attention'}
            </p>
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Switch
              checked={isSubscribed}
              onCheckedChange={handleToggle}
              disabled={permission === 'denied'}
            />
          )}
        </div>

        {permission === 'denied' && (
          <p className="text-sm text-destructive">
            Notifications are blocked. To enable, click the lock icon in your browser's address bar and allow notifications.
          </p>
        )}

        {!isSubscribed && permission !== 'denied' && (
          <Button onClick={subscribe} disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <Bell className="mr-2 h-4 w-4" />
                Enable Notifications
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
