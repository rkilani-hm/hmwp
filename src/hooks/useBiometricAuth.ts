import { useState, useEffect, useCallback } from 'react';

interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export function useBiometricAuth() {
  const [isSupported, setIsSupported] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkSupport = async () => {
      try {
        // Check if WebAuthn is available
        if (!window.PublicKeyCredential) {
          setIsSupported(false);
          setIsChecking(false);
          return;
        }

        // Check if platform authenticator (fingerprint/Face ID) is available
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        setIsSupported(available);
      } catch (error) {
        console.error('Error checking biometric support:', error);
        setIsSupported(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkSupport();
  }, []);

  const authenticate = useCallback(async (userId: string): Promise<BiometricAuthResult> => {
    if (!isSupported) {
      return { success: false, error: 'Biometric authentication not supported' };
    }

    try {
      // Create a challenge for authentication
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Convert userId to Uint8Array
      const userIdBuffer = new TextEncoder().encode(userId);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: 'Work Permit System',
          id: window.location.hostname,
        },
        user: {
          id: userIdBuffer,
          name: userId,
          displayName: 'Approver',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      };

      // Try to authenticate using platform authenticator
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      });

      if (credential) {
        return { success: true };
      }

      return { success: false, error: 'Authentication failed' };
    } catch (error: any) {
      // Handle user cancellation
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'Authentication cancelled' };
      }
      
      // Handle other errors
      console.error('Biometric auth error:', error);
      return { success: false, error: error.message || 'Authentication failed' };
    }
  }, [isSupported]);

  // Simple verification using platform authenticator without registration
  const verifyIdentity = useCallback(async (): Promise<BiometricAuthResult> => {
    if (!isSupported) {
      return { success: false, error: 'Biometric authentication not supported' };
    }

    try {
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);

      // Use a simpler approach - just verify the user is present
      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
      };

      // This will prompt for fingerprint/Face ID
      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      });

      if (assertion) {
        return { success: true };
      }

      return { success: false, error: 'Verification failed' };
    } catch (error: any) {
      // If no credentials exist, try the alternative method
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'Authentication cancelled by user' };
      }
      
      // Try alternative verification using credential creation as fallback
      // This works on devices that support biometrics but don't have stored credentials
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        
        const options: PublicKeyCredentialCreationOptions = {
          challenge,
          rp: {
            name: 'Work Permit Verification',
            id: window.location.hostname,
          },
          user: {
            id: new Uint8Array(16),
            name: 'verification',
            displayName: 'Identity Verification',
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        };

        const cred = await navigator.credentials.create({ publicKey: options });
        if (cred) {
          return { success: true };
        }
        return { success: false, error: 'Verification failed' };
      } catch (fallbackError: any) {
        if (fallbackError.name === 'NotAllowedError') {
          return { success: false, error: 'Authentication cancelled by user' };
        }
        return { success: false, error: fallbackError.message || 'Verification failed' };
      }
    }
  }, [isSupported]);

  return {
    isSupported,
    isChecking,
    authenticate,
    verifyIdentity,
  };
}
