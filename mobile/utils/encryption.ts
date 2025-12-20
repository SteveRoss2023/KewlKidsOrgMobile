/**
 * Encryption utilities for end-to-end encryption using Web Crypto API.
 * Uses expo-standard-web-crypto polyfill for native platforms and browser crypto for web.
 */
import { secureStorage } from './storage';
import { Platform } from 'react-native';

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

// Get crypto API - expo-standard-web-crypto polyfills global.crypto
const getCrypto = () => {
  // expo-standard-web-crypto polyfills global.crypto for all platforms
  const webCrypto = global.crypto || (global as any).window?.crypto;
  if (!webCrypto || !webCrypto.subtle) {
    console.error('Web Crypto API not available. Platform:', Platform.OS);
    console.error('Make sure expo-standard-web-crypto is imported in _layout.tsx');
    return null;
  }
  return webCrypto;
};

// Global cache for derived room keys - persists across component instances
// This prevents re-derivation when navigating between rooms or remounting components
const globalRoomKeyCache: Map<string, CryptoKey> = new Map();

class EncryptionManager {
  // Use the global cache instead of instance-level cache
  private get roomKeyCache(): Map<string, CryptoKey> {
    return globalRoomKeyCache;
  }

  /**
   * Get the crypto API to use.
   */
  private getCryptoAPI() {
    const cryptoAPI = getCrypto();
    if (!cryptoAPI) {
      console.error('Crypto API is null. Platform:', Platform.OS);
      throw new Error('Web Crypto API not available - crypto API is null');
    }
    if (!cryptoAPI.subtle) {
      console.error('Crypto API does not have subtle property. Available keys:', Object.keys(cryptoAPI));
      throw new Error('Web Crypto API not available - subtle API not found');
    }
    return cryptoAPI;
  }

  /**
   * Generate a new encryption key.
   */
  async generateKey(): Promise<CryptoKey> {
    const cryptoAPI = this.getCryptoAPI();
    return await cryptoAPI.subtle.generateKey(
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generate a random IV (initialization vector).
   */
  generateIV(): Uint8Array {
    const cryptoAPI = getCrypto();
    if (!cryptoAPI) {
      throw new Error('Crypto API not available');
    }
    if (!cryptoAPI.getRandomValues) {
      throw new Error('getRandomValues not available on crypto API');
    }
    return cryptoAPI.getRandomValues(new Uint8Array(12));
  }

  /**
   * Encrypt a message using AES-GCM.
   */
  async encryptMessage(message: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
    const cryptoAPI = this.getCryptoAPI();
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = this.generateIV();

    const ciphertext = await cryptoAPI.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      data
    );

    return {
      ciphertext: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv),
    };
  }

  /**
   * Decrypt a message using AES-GCM.
   */
  async decryptMessage(encryptedData: { ciphertext: string; iv: string }, key: CryptoKey): Promise<string> {
    const cryptoAPI = this.getCryptoAPI();
    const { ciphertext, iv } = encryptedData;
    const ciphertextBuffer = this.base64ToArrayBuffer(ciphertext);
    const ivBuffer = this.base64ToArrayBuffer(iv);

    const decrypted = await cryptoAPI.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: ivBuffer,
      },
      key,
      ciphertextBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /**
   * Convert ArrayBuffer to Base64 string.
   */
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Use btoa for base64 encoding (available in React Native via polyfill)
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer.
   */
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      // Handle URL-safe base64 (replace - with + and _ with /)
      let base64Str = base64.replace(/-/g, '+').replace(/_/g, '/');

      // Add padding if needed
      while (base64Str.length % 4) {
        base64Str += '=';
      }

      const binary = atob(base64Str);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      console.error('Error decoding base64:', error);
      console.error('Base64 string:', base64);
      throw new Error(`Failed to decode base64: ${error}`);
    }
  }

  /**
   * Export a key to a string format for storage.
   */
  async exportKey(key: CryptoKey): Promise<string> {
    const cryptoAPI = this.getCryptoAPI();
    const exported = await cryptoAPI.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(exported);
  }

  /**
   * Import a key from a string format.
   */
  async importKey(keyString: string): Promise<CryptoKey> {
    const cryptoAPI = this.getCryptoAPI();
    const keyBuffer = this.base64ToArrayBuffer(keyString);
    return await cryptoAPI.subtle.importKey(
      'raw',
      keyBuffer,
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Derive a deterministic encryption key for a room.
   * All users in the same room will derive the same key.
   *
   * @param roomId - The chat room ID
   * @param familyId - The family ID
   * @param familySecret - A shared secret for the family (stored in SecureStore)
   * @returns The derived encryption key
   */
  async deriveRoomKey(roomId: number, familyId: number, familySecret: string): Promise<CryptoKey> {
    // Check cache first - room keys are deterministic, so caching is safe
    const cacheKey = `room_${roomId}_family_${familyId}`;
    const cached = this.roomKeyCache.get(cacheKey);
    if (cached) {
      console.log(`[Encryption] Using cached room key for room ${roomId}`);
      return cached;
    }

    console.log(`[Encryption] Deriving room key for room ${roomId} (this may take a few seconds on mobile)...`);
    const derivationStartTime = Date.now();

    const cryptoAPI = this.getCryptoAPI();
    // Create a unique salt from room and family IDs
    const saltData = `room_${roomId}_family_${familyId}`;
    const encoder = new TextEncoder();
    const salt = encoder.encode(saltData);

    // Import the family secret as a key for PBKDF2
    // Note: familySecret is base64, so we need to decode it first
    const secretBytes = this.base64ToArrayBuffer(familySecret);

    const secretKey = await cryptoAPI.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    // Derive the room key using PBKDF2
    // Using 20,000 iterations for better mobile performance while maintaining security
    // This is for key derivation (not password hashing), so fewer iterations are acceptable
    // All platforms use the same iteration count to ensure consistent key derivation
    const derivedKey = await cryptoAPI.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 20000,
        hash: 'SHA-256',
      },
      secretKey,
      {
        name: ALGORITHM,
        length: KEY_LENGTH,
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Cache the derived key for future use
    this.roomKeyCache.set(cacheKey, derivedKey);
    console.log(`[Encryption] Room key derived and cached in ${Date.now() - derivationStartTime}ms`);

    return derivedKey;
  }

  /**
   * Get or generate a family secret for key derivation.
   * This secret is shared across all users in the family.
   *
   * @param familyId - The family ID
   * @returns The family secret (base64 encoded)
   */
  private familySecretPromises: Map<number, Promise<string>> = new Map();

  async getOrCreateFamilySecret(familyId: number, forceRegenerate: boolean = false): Promise<string> {
    const storageKey = `family_secret_${familyId}`;

    // Always check storage first to validate, even if there's a cached promise
    // This ensures we catch invalid secrets even if they were cached
    if (!forceRegenerate && !this.familySecretPromises.has(familyId)) {
      const existingSecret = await secureStorage.getItem(storageKey);
      if (existingSecret && existingSecret.length !== 44) {
        console.log(`[Encryption] Found invalid cached secret (length: ${existingSecret.length}), will regenerate...`);
        forceRegenerate = true; // Force regeneration if invalid
      }
    }

    // If there's already a regeneration in progress, wait for it (unless forcing)
    if (this.familySecretPromises.has(familyId) && !forceRegenerate) {
      const cachedSecret = await this.familySecretPromises.get(familyId)!;
      // Double-check the cached result is valid
      if (cachedSecret && cachedSecret.length === 44) {
        return cachedSecret;
      } else {
        // Cached result is invalid, clear it and regenerate
        console.log(`[Encryption] Cached secret is invalid, clearing cache and regenerating...`);
        this.familySecretPromises.delete(familyId);
        forceRegenerate = true;
      }
    }

    const secretPromise = (async () => {
      if (forceRegenerate) {
        // Clear existing secret to force regeneration
        await secureStorage.removeItem(storageKey);
        console.log(`[Encryption] Clearing family secret for family ${familyId} to force regeneration`);
      }

      let familySecret = await secureStorage.getItem(storageKey);
      console.log(`[Encryption] Retrieved family secret for family ${familyId}, length: ${familySecret?.length || 0}`);

      // Validate family secret format - SHA-256 produces 32 bytes = 44 base64 characters
      // If the stored secret has wrong length, it's from an old version and should be regenerated
      if (familySecret && familySecret.length !== 44) {
        console.log(`[Encryption] Family secret for family ${familyId} has incorrect length (${familySecret.length}, expected 44), regenerating...`);
        await secureStorage.removeItem(storageKey);
        const removed = await secureStorage.getItem(storageKey);
        console.log(`[Encryption] After removal, secret exists: ${!!removed}`);
        familySecret = null;
      }

      if (!familySecret) {
        // Generate a new family secret
        // In a real implementation, this might be shared via a secure channel
        // For now, we generate it deterministically from family ID + a master secret
        // This ensures all users get the same secret for the same family
        const masterSecret = 'KewlKidsOrganizer_Master_Secret_v1'; // In production, this could be user-specific
        const secretData = `${masterSecret}_family_${familyId}`;
        const encoder = new TextEncoder();
        const secretBytes = encoder.encode(secretData);

        // Hash it to get a consistent secret
        const cryptoAPI = this.getCryptoAPI();
        const hashBuffer = await cryptoAPI.subtle.digest('SHA-256', secretBytes);

        console.log(`[Encryption] Hash buffer byteLength: ${hashBuffer.byteLength} (expected 32 for SHA-256)`);

        // If the hash buffer is not 32 bytes, take only the first 32 bytes
        let hashToUse = hashBuffer;
        if (hashBuffer.byteLength !== 32) {
          console.warn(`[Encryption] Hash buffer is ${hashBuffer.byteLength} bytes, expected 32. Taking first 32 bytes.`);
          const hashBytes = new Uint8Array(hashBuffer);
          const first32Bytes = hashBytes.slice(0, 32);
          hashToUse = first32Bytes.buffer;
          console.log(`[Encryption] Using first 32 bytes, new buffer length: ${hashToUse.byteLength}`);
        }

        // Convert to base64
        familySecret = this.arrayBufferToBase64(hashToUse);

        console.log(`[Encryption] Base64 result length: ${familySecret.length} (expected 44), first 20 chars: ${familySecret.substring(0, 20)}`);

        // Validate the generated secret length (SHA-256 = 32 bytes = 44 base64 chars)
        if (familySecret.length !== 44) {
          console.error(`[Encryption] ERROR: Generated secret has wrong length: ${familySecret.length}, expected 44!`);
          console.error(`[Encryption] Hash buffer length: ${hashToUse.byteLength}, Base64 result preview: ${familySecret.substring(0, 30)}...`);

          // If it's still wrong, try manual base64 encoding
          if (hashToUse.byteLength === 32 && familySecret.length !== 44) {
            const bytes = new Uint8Array(hashToUse);
            // Use a more reliable base64 encoding
            let base64 = '';
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            for (let i = 0; i < bytes.length; i += 3) {
              const b1 = bytes[i];
              const b2 = bytes[i + 1] || 0;
              const b3 = bytes[i + 2] || 0;
              const bitmap = (b1 << 16) | (b2 << 8) | b3;
              base64 += chars.charAt((bitmap >> 18) & 63);
              base64 += chars.charAt((bitmap >> 12) & 63);
              base64 += i + 1 < bytes.length ? chars.charAt((bitmap >> 6) & 63) : '=';
              base64 += i + 2 < bytes.length ? chars.charAt(bitmap & 63) : '=';
            }
            familySecret = base64;
            console.log(`[Encryption] Re-encoded using manual base64, new length: ${familySecret.length}`);
          }
        }

        // Store it for future use (uses SecureStore on native, AsyncStorage on web)
        await secureStorage.setItem(storageKey, familySecret);
        console.log(`Generated and stored new family secret for family ${familyId} (length: ${familySecret.length})`);
      }

      // Remove from promises map once done
      this.familySecretPromises.delete(familyId);
      return familySecret;
    })();

    // Store the promise to prevent concurrent regenerations
    if (!forceRegenerate) {
      this.familySecretPromises.set(familyId, secretPromise);
    }

    return secretPromise;
  }
}

export { EncryptionManager };

