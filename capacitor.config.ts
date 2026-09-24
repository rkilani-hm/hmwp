import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the native Al Hamra Work Permits apps
 * (Android + iOS). The native shells load the built web app from `dist`
 * (run `bun run build` first, then `cap sync`).
 *
 * Push notifications are delivered through Firebase Cloud Messaging (FCM)
 * on both platforms — Android natively and iOS via an APNs key uploaded to
 * Firebase. See docs/MOBILE_BUILD.md for the one-time setup.
 *
 * IMPORTANT: `appId` is the store bundle identifier. Once an app has been
 * published to Google Play / the App Store this value must never change.
 */
const config: CapacitorConfig = {
  appId: 'com.alhamra.permits',
  appName: 'Al Hamra Permits',
  webDir: 'dist',
  // Ship the bundled assets from `dist`. To live-reload against a running
  // dev server instead, set CAP_SERVER_URL (e.g. http://192.168.1.20:5173).
  server: process.env.CAP_SERVER_URL
    ? { url: process.env.CAP_SERVER_URL, cleartext: true }
    : { androidScheme: 'https' },
  plugins: {
    PushNotifications: {
      // Show the alert, play a sound, and bump the badge when a push
      // arrives while the app is in the foreground (iOS).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
