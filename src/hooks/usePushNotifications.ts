import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// VAPID public key - this is safe to expose publicly
const VAPID_PUBLIC_KEY = 'BBpCI7jKzvj9S9mKUHGMXubvHxc7YXJDeaVcPL94rIVRPLbwTdowgBC0cKb51qVbwOADxFozXOBWRPL7s9_YyUQ';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  permission: NotificationPermission | null;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    permission: null,
  });

  // Check if push notifications are supported
  const isSupported = useCallback(() => {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }, []);

  // Check current subscription status
  const checkSubscription = useCallback(async () => {
    if (!isSupported() || !user) {
      setState(prev => ({ ...prev, isLoading: false, isSupported: false }));
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      // Also check if subscription exists in database
      let dbSubscribed = false;
      if (subscription) {
        const { data } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();
        
        dbSubscribed = !!data;
      }

      setState({
        isSupported: true,
        isSubscribed: !!subscription && dbSubscribed,
        isLoading: false,
        permission: Notification.permission,
      });
    } catch (error) {
      console.error('Error checking subscription:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [isSupported, user]);

  // Register service worker and subscribe to push
  const subscribe = useCallback(async () => {
    if (!isSupported() || !user) {
      toast.error('Push notifications are not supported');
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      toast.error('Push notifications are not configured');
      console.error('VITE_VAPID_PUBLIC_KEY is not set');
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notification permission denied');
        setState(prev => ({ ...prev, isLoading: false, permission }));
        return false;
      }

      // Register service worker for push
      const registration = await navigator.serviceWorker.register('/push-sw.js', {
        scope: '/'
      });
      
      await navigator.serviceWorker.ready;

      // Subscribe to push
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      const subscriptionJson = subscription.toJSON();
      
      // Save subscription to database
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscriptionJson.endpoint!,
        p256dh: subscriptionJson.keys!.p256dh,
        auth: subscriptionJson.keys!.auth,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,endpoint',
      });

      if (error) {
        console.error('Error saving subscription:', error);
        toast.error('Failed to save subscription');
        return false;
      }

      setState({
        isSupported: true,
        isSubscribed: true,
        isLoading: false,
        permission: 'granted',
      });

      toast.success('Push notifications enabled!');
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      toast.error('Failed to enable push notifications');
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [isSupported, user]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!user) return false;

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push manager
        await subscription.unsubscribe();

        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
      }

      setState(prev => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
      }));

      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast.error('Failed to disable push notifications');
      setState(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [user]);

  // Check subscription status on mount
  useEffect(() => {
    if (user) {
      checkSubscription();
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user, checkSubscription]);

  return {
    ...state,
    subscribe,
    unsubscribe,
    checkSubscription,
  };
}
