import { useNativePush } from '@/hooks/useNativePush';

/**
 * Headless component that registers the native device for push once the user
 * is authenticated. Renders nothing and is a no-op on the web build. Mounted
 * inside AuthProvider (so it sees the signed-in user) and BrowserRouter (so
 * notification taps can navigate).
 */
export function NativePushInit() {
  useNativePush();
  return null;
}
