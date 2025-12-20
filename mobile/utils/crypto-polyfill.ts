/**
 * Minimal Web Crypto API polyfill for React Native using expo-crypto.
 * Provides crypto.subtle for AES-GCM encryption operations.
 */
import * as ExpoCrypto from 'expo-crypto';
import { Platform } from 'react-native';

// TextEncoder/TextDecoder are available natively in React Native
// No need to import - they're global

/**
 * Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Minimal CryptoKey implementation
 */
class CryptoKeyImpl implements CryptoKey {
  algorithm: KeyAlgorithm;
  extractable: boolean;
  type: KeyType;
  usages: KeyUsage[];
  private keyData: Uint8Array;

  constructor(keyData: Uint8Array, algorithm: KeyAlgorithm, extractable: boolean, usages: KeyUsage[]) {
    this.keyData = keyData;
    this.algorithm = algorithm;
    this.extractable = extractable;
    this.usages = usages;
    this.type = 'secret';
  }

  getKeyData(): Uint8Array {
    return this.keyData;
  }
}

/**
 * Minimal SubtleCrypto implementation using expo-crypto
 * Note: This is a simplified implementation. For production, consider using a native module.
 */
class SubtleCryptoImpl {
  /**
   * Generate random values using expo-crypto
   */
  private getRandomValues(array: Uint8Array): Uint8Array {
    try {
      ExpoCrypto.getRandomValues(array);
      return array;
    } catch (e) {
      // Fallback to insecure random (shouldn't happen with expo-crypto)
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  }

  /**
   * Generate a key
   */
  async generateKey(
    algorithm: AesKeyGenParams,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    if (algorithm.name !== 'AES-GCM') {
      throw new Error(`Unsupported algorithm: ${algorithm.name}`);
    }

    const keyLength = algorithm.length / 8; // Convert bits to bytes
    const keyData = new Uint8Array(keyLength);
    this.getRandomValues(keyData);

    return new CryptoKeyImpl(keyData, algorithm, extractable, keyUsages);
  }

  /**
   * Import a key
   */
  async importKey(
    format: KeyFormat,
    keyData: ArrayBuffer | Uint8Array,
    algorithm: AlgorithmIdentifier,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    if (format !== 'raw') {
      throw new Error(`Unsupported key format: ${format}`);
    }

    const keyBytes = keyData instanceof ArrayBuffer ? new Uint8Array(keyData) : keyData;

    const algo = typeof algorithm === 'string'
      ? { name: algorithm, length: keyBytes.length * 8 }
      : algorithm as AesKeyGenParams;

    if (algo.name !== 'AES-GCM' && algo.name !== 'PBKDF2') {
      throw new Error(`Unsupported algorithm: ${algo.name}`);
    }

    return new CryptoKeyImpl(keyBytes, algo, extractable, keyUsages);
  }

  /**
   * Export a key
   */
  async exportKey(format: KeyFormat, key: CryptoKey): Promise<ArrayBuffer> {
    if (format !== 'raw') {
      throw new Error(`Unsupported key format: ${format}`);
    }

    const keyImpl = key as CryptoKeyImpl;
    return keyImpl.getKeyData().buffer.slice(
      keyImpl.getKeyData().byteOffset,
      keyImpl.getKeyData().byteOffset + keyImpl.getKeyData().byteLength
    );
  }

  /**
   * Encrypt using AES-GCM with @noble/ciphers
   */
  async encrypt(
    algorithm: AesGcmParams,
    key: CryptoKey,
    data: ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer> {
    // Dynamic import for ES module compatibility
    const { gcm } = await import('@noble/ciphers/aes.js');
    const keyImpl = key as CryptoKeyImpl;
    const keyData = keyImpl.getKeyData();
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const iv = algorithm.iv instanceof ArrayBuffer ? new Uint8Array(algorithm.iv) : algorithm.iv;

    // Create AES-GCM cipher (nonce is the IV in GCM)
    const cipher = gcm(keyData, iv);

    // Encrypt the data (includes authentication tag automatically)
    const encrypted = cipher.encrypt(dataBytes);

    return encrypted.buffer;
  }

  /**
   * Decrypt using AES-GCM with @noble/ciphers
   */
  async decrypt(
    algorithm: AesGcmParams,
    key: CryptoKey,
    data: ArrayBuffer | Uint8Array
  ): Promise<ArrayBuffer> {
    // Dynamic import for ES module compatibility
    const { gcm } = await import('@noble/ciphers/aes.js');
    const keyImpl = key as CryptoKeyImpl;
    const keyData = keyImpl.getKeyData();
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const iv = algorithm.iv instanceof ArrayBuffer ? new Uint8Array(algorithm.iv) : algorithm.iv;

    // Create AES-GCM cipher (nonce is the IV in GCM)
    const cipher = gcm(keyData, iv);

    // Decrypt the data (expects ciphertext + tag)
    const decrypted = cipher.decrypt(dataBytes);

    return decrypted.buffer;
  }

  /**
   * Derive key using PBKDF2 with @noble/hashes (proper implementation)
   */
  async deriveKey(
    algorithm: Pbkdf2Params,
    baseKey: CryptoKey,
    derivedKeyType: AesKeyGenParams,
    extractable: boolean,
    keyUsages: KeyUsage[]
  ): Promise<CryptoKey> {
    const { pbkdf2 } = await import('@noble/hashes/pbkdf2');
    const { sha256 } = await import('@noble/hashes/sha2.js');

    const baseKeyImpl = baseKey as CryptoKeyImpl;
    const baseKeyData = baseKeyImpl.getKeyData();

    const saltBytes = algorithm.salt instanceof ArrayBuffer
      ? new Uint8Array(algorithm.salt)
      : algorithm.salt;

    // Determine hash algorithm
    let hashFn: any;
    if (typeof algorithm.hash === 'string') {
      if (algorithm.hash === 'SHA-256') {
        hashFn = sha256;
      } else {
        throw new Error(`Unsupported hash algorithm: ${algorithm.hash}`);
      }
    } else {
      throw new Error('Hash algorithm object not supported');
    }

    // Derive key using proper PBKDF2
    const keyLength = derivedKeyType.length / 8; // Convert bits to bytes
    const derivedKey = pbkdf2(hashFn, baseKeyData, saltBytes, {
      c: algorithm.iterations,
      dkLen: keyLength
    });

    return new CryptoKeyImpl(derivedKey, derivedKeyType, extractable, keyUsages);
  }

  /**
   * Digest (hash) data using @noble/hashes (consistent across platforms)
   * This ensures we hash raw bytes directly, not base64 strings, matching web behavior
   */
  async digest(algorithm: AlgorithmIdentifier, data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

    // Use @noble/hashes for SHA-256 to ensure consistency with web
    // This hashes raw bytes directly, not base64 strings
    const { sha256 } = await import('@noble/hashes/sha2.js');

    let hashFn: any;
    if (typeof algorithm === 'string') {
      if (algorithm === 'SHA-256') {
        hashFn = sha256;
      } else {
        throw new Error(`Unsupported digest algorithm: ${algorithm}`);
      }
    } else {
      throw new Error('Algorithm object not supported for digest');
    }

    // Hash the raw bytes directly (same as web)
    // sha256 returns Uint8Array, convert to ArrayBuffer
    const hashBytes = hashFn(dataBytes);

    // Return as ArrayBuffer
    return hashBytes.buffer;
  }
}

/**
 * Minimal Crypto implementation
 */
class CryptoImpl {
  subtle: SubtleCrypto;

  constructor() {
    this.subtle = new SubtleCryptoImpl() as any;
  }

  getRandomValues<T extends ArrayBufferView | null>(array: T): T {
    if (!array) {
      throw new Error('Array must be provided');
    }
    try {
      ExpoCrypto.getRandomValues(array);
      return array;
    } catch (e) {
      // Fallback
      const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.floor(Math.random() * 256);
      }
      return array;
    }
  }
}

/**
 * Set up the crypto polyfill globally
 */
export function setupCryptoPolyfill() {
  if (Platform.OS !== 'web' && typeof global !== 'undefined' && !global.crypto) {
    global.crypto = new CryptoImpl() as any;
  }
}

