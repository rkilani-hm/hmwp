import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// -----------------------------------------------------------------------------
// Firebase Cloud Messaging (FCM) — native mobile delivery.
//
// Native Android/iOS installs register an FCM token in `device_tokens`. We send
// to those via the FCM HTTP v1 API using a Firebase service account supplied in
// the FCM_SERVICE_ACCOUNT env var (the service-account JSON, as a string). This
// runs alongside Web Push so a single send-push-notification call reaches both
// the PWA and the phone. If FCM_SERVICE_ACCOUNT is not set, mobile delivery is
// skipped silently and Web Push still works.
// -----------------------------------------------------------------------------

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const der = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) der[i] = raw.charCodeAt(i);
  return der;
}

// Mint a short-lived OAuth2 access token for the FCM scope from the service
// account (signed JWT bearer grant).
async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const enc = new TextEncoder();
  const headerB64 = b64urlEncode(enc.encode(JSON.stringify(header)));
  const claimB64 = b64urlEncode(enc.encode(JSON.stringify(claim)));
  const unsigned = `${headerB64}.${claimB64}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const jwt = `${unsigned}.${b64urlEncode(new Uint8Array(sig))}`;

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token as string;
}

// Send one FCM v1 message. Returns { ok, drop } — drop=true means the token is
// dead (unregistered / invalid) and should be removed from device_tokens.
async function sendFcm(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; drop: boolean }> {
  const dataStr: Record<string, string> = {};
  for (const [k, v] of Object.entries(data || {})) {
    dataStr[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  const message = {
    message: {
      token,
      notification: { title, body },
      data: dataStr,
      android: { priority: 'HIGH', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default' } } },
    },
  };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    },
  );
  if (res.ok) return { ok: true, drop: false };
  const errText = await res.text();
  // 404 UNREGISTERED or 400 with INVALID_ARGUMENT for a bad token → drop it.
  const drop = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(errText);
  console.error(`FCM send failed (${res.status}) drop=${drop}: ${errText}`);
  return { ok: false, drop };
}

// Convert base64url to Uint8Array
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Generate JWT for VAPID
async function generateVapidJwt(
  audience: string,
  subject: string,
  privateKeyBase64: string
): Promise<string> {
  const header = { alg: 'ES256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: subject,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import private key
  const privateKeyBytes = base64UrlToUint8Array(privateKeyBase64);
  
  // Create a proper JWK for the private key
  const publicKeyBase64 = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const publicKeyBytes = base64UrlToUint8Array(publicKeyBase64);
  
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: btoa(String.fromCharCode(...publicKeyBytes.slice(1, 33))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    y: btoa(String.fromCharCode(...publicKeyBytes.slice(33, 65))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    d: privateKeyBase64,
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  // Convert signature from DER to raw format
  const signatureArray = new Uint8Array(signature);
  const signatureB64 = btoa(String.fromCharCode(...signatureArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${unsignedToken}.${signatureB64}`;
}

// Send push notification using Web Push protocol
async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; icon?: string; tag?: string; data?: Record<string, unknown> },
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = new URL(subscription.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    
    // Generate VAPID authorization
    const vapidJwt = await generateVapidJwt(
      audience,
      'mailto:admin@alhamra.com',
      vapidPrivateKey
    );

    const vapidHeader = `vapid t=${vapidJwt}, k=${vapidPublicKey}`;

    // Encrypt payload using Web Push encryption
    const payloadStr = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payloadStr);

    // Generate encryption keys
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const localKeys = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );

    // Import subscriber's public key
    const p256dhBytes = base64UrlToUint8Array(subscription.p256dh);
    const subscriberKey = await crypto.subtle.importKey(
      'raw',
      p256dhBytes.buffer as ArrayBuffer,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: subscriberKey },
      localKeys.privateKey,
      256
    );

    // Export local public key
    const localPublicKeyRaw = await crypto.subtle.exportKey('raw', localKeys.publicKey);
    const localPublicKeyBytes = new Uint8Array(localPublicKeyRaw);

    // Derive encryption key using HKDF
    const authBytes = base64UrlToUint8Array(subscription.auth);
    
    // Create IKM (Input Keying Material)
    const ikmInfo = new Uint8Array([
      ...encoder.encode('WebPush: info\0'),
      ...p256dhBytes,
      ...localPublicKeyBytes,
    ]);
    
    const sharedSecretArray = new Uint8Array(sharedSecret);
    const ikmKey = await crypto.subtle.importKey(
      'raw',
      sharedSecretArray.buffer as ArrayBuffer,
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    const authBuffer = authBytes.buffer as ArrayBuffer;
    const prk = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: authBuffer,
        info: ikmInfo,
      },
      ikmKey,
      256
    );

    // Derive CEK and nonce
    const prkKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(prk),
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    const cekInfo = encoder.encode('Content-Encoding: aes128gcm\0');
    const cekBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: cekInfo,
      },
      prkKey,
      128
    );

    const nonceInfo = encoder.encode('Content-Encoding: nonce\0');
    const nonceBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: nonceInfo,
      },
      prkKey,
      96
    );

    // Encrypt the payload
    const cek = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(cekBits),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    // Add padding delimiter
    const paddedPayload = new Uint8Array(payloadBytes.length + 1);
    paddedPayload.set(payloadBytes);
    paddedPayload[payloadBytes.length] = 2; // Padding delimiter

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(nonceBits),
      },
      cek,
      paddedPayload
    );

    // Build the aes128gcm encrypted content
    const recordSize = 4096;
    const header = new Uint8Array(21 + localPublicKeyBytes.length);
    header.set(salt, 0); // 16 bytes salt
    header[16] = (recordSize >> 24) & 0xff;
    header[17] = (recordSize >> 16) & 0xff;
    header[18] = (recordSize >> 8) & 0xff;
    header[19] = recordSize & 0xff;
    header[20] = localPublicKeyBytes.length;
    header.set(localPublicKeyBytes, 21);

    const body = new Uint8Array(header.length + new Uint8Array(encrypted).length);
    body.set(header);
    body.set(new Uint8Array(encrypted), header.length);

    // Send the push notification
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': vapidHeader,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'high',
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Push failed:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending push:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return new Response(JSON.stringify({ error: 'Push notifications not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Auth: require service-role bearer (internal callers) or any authenticated user
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.slice(7).trim();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    if (token !== supabaseServiceKey) {
      const { data: { user }, error: uErr } = await supabase.auth.getUser(token);
      if (uErr || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const body = await req.json();
    const { userId, userIds, title, message, data } = body;

    // Bound bulk targeting
    if (userIds && Array.isArray(userIds) && userIds.length > 500) {
      return new Response(JSON.stringify({ error: 'Too many recipients' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!title || !message) {
      return new Response(JSON.stringify({ error: 'Title and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build query for subscriptions
    let query = supabase.from('push_subscriptions').select('*');
    
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (userIds && Array.isArray(userIds)) {
      query = query.in('user_id', userIds);
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Note: we do NOT early-return when there are no Web Push subscriptions —
    // a user may be reachable only on a native device (device_tokens/FCM).
    const subs = subscriptions || [];
    console.log(`Sending Web Push to ${subs.length} subscriptions`);

    const payload = {
      title,
      body: message,
      icon: '/pwa-192x192.png',
      tag: data?.permitId || 'notification',
      data: data || {},
    };

    const results = subs.length
      ? await Promise.all(
          subs.map(sub =>
            sendPushNotification(
              { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
              payload,
              vapidPublicKey,
              vapidPrivateKey
            )
          )
        )
      : [];

    const webSuccessful = results.filter(r => r.success).length;
    const webFailed = results.filter(r => !r.success);

    // Remove failed Web Push subscriptions (likely expired)
    if (webFailed.length > 0) {
      const failedEndpoints = subs
        .filter((_, i) => !results[i].success)
        .map(sub => sub.endpoint);

      if (failedEndpoints.length > 0) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .in('endpoint', failedEndpoints);

        console.log(`Removed ${failedEndpoints.length} expired subscriptions`);
      }
    }

    // ---- Native mobile delivery via FCM (device_tokens) ----
    let mobileSent = 0;
    let mobileFailed = 0;
    const saRaw = Deno.env.get('FCM_SERVICE_ACCOUNT');
    if (saRaw) {
      try {
        let tokQuery = supabase.from('device_tokens').select('token');
        if (userId) tokQuery = tokQuery.eq('user_id', userId);
        else if (userIds && Array.isArray(userIds)) tokQuery = tokQuery.in('user_id', userIds);
        const { data: deviceRows, error: devErr } = await tokQuery;

        if (devErr) {
          console.error('device_tokens fetch failed:', devErr);
        } else if (deviceRows && deviceRows.length > 0) {
          const sa = JSON.parse(saRaw) as ServiceAccount;
          const accessToken = await getFcmAccessToken(sa);
          const fcmResults = await Promise.all(
            deviceRows.map((row: { token: string }) =>
              sendFcm(sa.project_id, accessToken, row.token, title, message, data || {})
            )
          );
          mobileSent = fcmResults.filter(r => r.ok).length;
          mobileFailed = fcmResults.filter(r => !r.ok).length;

          // Drop dead tokens (uninstalled app / rotated registration).
          const deadTokens = deviceRows
            .filter((_: unknown, i: number) => fcmResults[i].drop)
            .map((row: { token: string }) => row.token);
          if (deadTokens.length > 0) {
            await supabase.from('device_tokens').delete().in('token', deadTokens);
            console.log(`Removed ${deadTokens.length} dead device tokens`);
          }
        }
      } catch (e) {
        console.error('FCM delivery error:', e);
      }
    }

    console.log(
      `Push sent: web ${webSuccessful}/${subs.length}, mobile ${mobileSent} ` +
      `(failed web ${webFailed.length}, mobile ${mobileFailed})`
    );

    return new Response(JSON.stringify({
      success: true,
      sent: webSuccessful + mobileSent,
      failed: webFailed.length + mobileFailed,
      web: { sent: webSuccessful, failed: webFailed.length },
      mobile: { sent: mobileSent, failed: mobileFailed },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-push-notification:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
