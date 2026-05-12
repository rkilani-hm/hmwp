import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No push subscriptions found');
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Sending push to ${subscriptions.length} subscriptions`);

    const payload = {
      title,
      body: message,
      icon: '/pwa-192x192.png',
      tag: data?.permitId || 'notification',
      data: data || {},
    };

    const results = await Promise.all(
      subscriptions.map(sub =>
        sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapidPublicKey,
          vapidPrivateKey
        )
      )
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    // Remove failed subscriptions (likely expired)
    if (failed.length > 0) {
      const failedEndpoints = subscriptions
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

    console.log(`Push sent: ${successful} success, ${failed.length} failed`);

    return new Response(JSON.stringify({
      success: true,
      sent: successful,
      failed: failed.length,
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
