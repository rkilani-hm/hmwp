# Al Hamra Work Permits — Mobile Apps (Android + iOS)

This guide takes the existing web app and produces installable **Android (APK/AAB)**
and **iOS (IPA)** builds that receive **push notifications when a permit needs the
approver's action** — the same events that already trigger in-app and Web Push
notifications now also reach the approver's phone.

The app is wrapped natively with **Capacitor**. Push is delivered through
**Firebase Cloud Messaging (FCM)** on both platforms (Android directly, iOS via an
APNs key uploaded to Firebase), so the backend has a single send path.

> **You need a Mac for iOS.** Android can be built on Windows/Linux/Mac. A signed
> iOS `.ipa` can only be produced on macOS with Xcode. Everything up to that point
> (the iOS project, Firebase config, capabilities) is prepared for you here.

---

## 0. What's already wired up in this repo

| Piece | Where | Status |
|---|---|---|
| Capacitor config | `capacitor.config.ts` (`appId: com.alhamra.workpermit`) | ✅ committed |
| Capacitor + Firebase plugins | `package.json` (`@capacitor/*`, `@capacitor-firebase/messaging`, `firebase`) | ✅ committed |
| Native push registration | `src/hooks/useNativePush.ts` + `<NativePushInit />` in `src/App.tsx` | ✅ committed |
| Device-token storage | `device_tokens` table — `supabase/migrations/20260923120000_device_tokens.sql` | ✅ committed |
| FCM delivery | `supabase/functions/send-push-notification/index.ts` (reads `device_tokens`, sends via FCM) | ✅ committed |

You provide the **Firebase project + credentials** (below) and run the **build
commands**. Nothing about the web app changes — on the web the app keeps using the
existing Web Push, and all the native code is a no-op in the browser.

---

## 1. One-time backend setup (do this once)

### 1a. Apply the migration
The `device_tokens` table ships as a migration. It is applied the same way as every
other migration in this project (Lovable / Supabase). Confirm it exists:
`Supabase → Table editor → device_tokens`.

### 1b. Create a Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** (e.g. `al-hamra-work-permits`). Google Analytics is optional.
2. You'll add the Android and iOS apps to this project in sections 3 and 4.

### 1c. Give the backend an FCM service account (the `FCM_SERVICE_ACCOUNT` secret)
1. Firebase Console → ⚙ **Project settings → Service accounts → Generate new private key**. A JSON file downloads.
2. In Supabase: **Project settings → Edge Functions → Secrets** (or `supabase secrets set`), add a secret named **`FCM_SERVICE_ACCOUNT`** whose value is the **entire contents** of that JSON file (paste it as-is).
3. Redeploy `send-push-notification` so it picks up the secret.

> Until `FCM_SERVICE_ACCOUNT` is set, mobile delivery is skipped silently and Web
> Push keeps working — nothing breaks.

---

## 2. Generate the native projects (once, per machine)

From the repo root:

```bash
bun install
bun run build            # produces dist/ that Capacitor wraps
npx cap add android      # creates android/  (run on any OS)
npx cap add ios          # creates ios/      (run on a Mac)
npx cap sync             # copies web build + native plugins into both
```

`android/` and `ios/` are generated folders. Commit them if you want them in git,
or keep them local — either is fine; they're rebuilt by `cap add`/`cap sync`.

---

## 3. Android — build the APK / AAB

### 3a. Register the Android app in Firebase
1. Firebase Console → **Add app → Android**.
2. **Android package name:** `com.alhamra.workpermit` (must match `capacitor.config.ts`).
3. Download **`google-services.json`** and place it at **`android/app/google-services.json`**.
4. `npx cap sync android`.

> The `@capacitor-firebase/messaging` plugin wires the Firebase Gradle plugin
> automatically; just having `google-services.json` in place is enough.

### 3b. Create a signing key (once)
```bash
keytool -genkey -v -keystore al-hamra-wp.keystore -alias alhamra -keyalg RSA -keysize 2048 -validity 10000
```
Keep `al-hamra-wp.keystore` and its passwords safe — **Play requires the same key for every future update.** (Or enroll in Google Play App Signing and let Google hold the upload key.)

### 3c. Build
**Easiest (Android Studio):**
```bash
npx cap open android
```
Then **Build → Generate Signed Bundle / APK →** choose **Android App Bundle (.aab)** for the Play Store, or **APK** for direct install/side-loading → select your keystore → **release**.

**Command line:**
```bash
cd android
./gradlew bundleRelease     # AAB → android/app/build/outputs/bundle/release/  (upload to Play)
./gradlew assembleRelease   # APK → android/app/build/outputs/apk/release/     (side-load/testing)
```

### 3d. Submit to Google Play
1. <https://play.google.com/console> → **Create app**.
2. Upload the **`.aab`** to an **Internal testing** track first (fastest way to test on a real device), then promote to Production.
3. Fill store listing, content rating, data-safety form; add testers by email.

---

## 4. iOS — build the IPA (macOS + Xcode required)

### 4a. Register the iOS app in Firebase
1. Firebase Console → **Add app → iOS**.
2. **Apple bundle ID:** `com.alhamra.workpermit`.
3. Download **`GoogleService-Info.plist`** and add it to the Xcode project under **`ios/App/App/`** (drag into the `App` target in Xcode so it's bundled).

### 4b. Upload the APNs key to Firebase (this is what lets FCM reach iOS)
1. <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles → Keys → +** → enable **Apple Push Notifications service (APNs)** → download the **`.p8`** key. Note the **Key ID** and your **Team ID**.
2. Firebase Console → **Project settings → Cloud Messaging → Apple app configuration → APNs Authentication Key → Upload** the `.p8` with its Key ID + Team ID.

### 4c. Xcode setup
```bash
npx cap open ios        # opens ios/App/App.xcworkspace
```
In Xcode:
1. Select the **App** target → **Signing & Capabilities** → set your **Team** (from your Apple Developer account) and confirm **Bundle Identifier** = `com.alhamra.workpermit`.
2. **+ Capability → Push Notifications**.
3. **+ Capability → Background Modes** → tick **Remote notifications**.
4. If CocoaPods isn't installed: `sudo gem install cocoapods`, then `cd ios/App && pod install`.

### 4d. Archive & distribute
Xcode → **Product → Archive** → **Distribute App**:
- **App Store Connect** → upload for TestFlight / App Store review, **or**
- **Ad Hoc / Development** → export a signed `.ipa` for registered test devices.

### 4e. Submit to the App Store
1. <https://appstoreconnect.apple.com> → **My Apps → +** → create the app with bundle ID `com.alhamra.workpermit`.
2. Use **TestFlight** to test on real devices first, then submit for review.

---

## 5. How the push actually flows

1. Approver installs the app and signs in.
2. `useNativePush` requests notification permission, gets the device's **FCM token**, and upserts it into **`device_tokens`** (`user_id`, `token`, `platform`).
3. A permit is submitted / advances to that approver. The existing server code calls **`send-push-notification`** with the approver's `userId` — exactly as it already does for Web Push.
4. `send-push-notification` now also looks up that user's rows in `device_tokens` and sends each an FCM message (title, body, and `data.permitId`).
5. Tapping the notification opens the app at **`/permits/<permitId>`** (handled in `useNativePush`).

No changes were needed at any of the existing notification call sites — mobile
delivery was added inside `send-push-notification`, so every event that already
notified an approver now reaches their phone too.

---

## 6. Testing checklist

- [ ] `FCM_SERVICE_ACCOUNT` secret set in Supabase; `send-push-notification` redeployed.
- [ ] `google-services.json` in `android/app/`; `GoogleService-Info.plist` in `ios/App/App/`.
- [ ] APNs `.p8` uploaded to Firebase (iOS only).
- [ ] Install on a device, sign in as an approver, **allow notifications**.
- [ ] Confirm a row appears in `device_tokens` for that user with the right `platform`.
- [ ] Submit a permit routed to that approver → phone receives the push → tap opens the permit.
- [ ] Check the `send-push-notification` logs: they report `mobile <n>` sent.

---

## 7. Updating the app later

After any change to the web app:
```bash
bun run build && npx cap sync
```
then rebuild in Android Studio / Xcode and upload a new version (bump the version /
build number). The `appId`/bundle ID must never change once published.
