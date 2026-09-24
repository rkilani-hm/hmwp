import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// device_tokens postdates the generated Supabase types.
const db = supabase as any;

/**
 * Registers the current native device (Android/iOS) for Firebase Cloud
 * Messaging push and stores its FCM token in `device_tokens`, so the existing
 * send-push-notification edge function reaches the approver's phone whenever a
 * permit needs their action.
 *
 * No-op on the web build — the PWA keeps using Web Push (usePushNotifications).
 * Mounted once, high in the tree, via <NativePushInit /> inside AuthProvider.
 */
export function useNativePush() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Keep the latest navigate without re-subscribing listeners on every render.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !user) return;

    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    const platform = Capacitor.getPlatform(); // 'ios' | 'android'

    const saveToken = async (token?: string | null) => {
      if (!token || cancelled) return;
      try {
        await db.from('device_tokens').upsert(
          {
            user_id: user.id,
            token,
            platform,
            device_info: navigator.userAgent?.slice(0, 300) ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token' },
        );
      } catch (e) {
        console.error('device_tokens upsert failed', e);
      }
    };

    const openFromData = (data: Record<string, unknown> | undefined) => {
      const permitId = data?.permitId as string | undefined;
      const url = data?.url as string | undefined;
      if (permitId) navigateRef.current(`/permits/${permitId}`);
      else if (url && url.startsWith('/')) navigateRef.current(url);
    };

    (async () => {
      try {
        // Ask for notification permission (POST_NOTIFICATIONS on Android 13+,
        // the system prompt on iOS). Bail quietly if the user declines.
        let perm = await FirebaseMessaging.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
          perm = await FirebaseMessaging.requestPermissions();
        }
        if (perm.receive !== 'granted' || cancelled) return;

        // Re-registration hands us a fresh token when Firebase rotates it.
        handles.push(
          await FirebaseMessaging.addListener('tokenReceived', (e) => {
            void saveToken(e.token);
          }),
        );

        // Deep-link to the permit when the user taps the notification.
        handles.push(
          await FirebaseMessaging.addListener('notificationActionPerformed', (e) => {
            openFromData(e.notification?.data as Record<string, unknown> | undefined);
          }),
        );

        const { token } = await FirebaseMessaging.getToken();
        await saveToken(token);
      } catch (e) {
        console.error('Native push registration failed', e);
      }
    })();

    return () => {
      cancelled = true;
      handles.forEach((h) => {
        void h.remove();
      });
    };
  }, [user]);
}
