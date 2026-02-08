/**
 * Client-Side Encryption Library
 *
 * Zero-knowledge architecture: All sensitive data is encrypted on the client
 * before being sent to the server. The server never sees plaintext data.
 *
 * Even if the database is breached, attackers only get meaningless encrypted blobs.
 */

// Encryption constants
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000; // High iteration count for security

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Generate a random IV for encryption
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Derive an encryption key from a password using PBKDF2
 * This ensures the same password + salt always produces the same key
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Convert password to key material
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive the actual encryption key
  // Create a new Uint8Array from the salt to ensure proper ArrayBuffer
  const saltCopy = new Uint8Array(salt);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // Not extractable for security
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-256-GCM
 * Returns: base64(salt + iv + ciphertext + authTag)
 */
export async function encrypt(
  plaintext: string,
  password: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate random salt and IV
  const salt = generateSalt();
  const iv = generateIV();

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt the data - create a copy of iv to ensure proper ArrayBuffer
  const ivCopy = new Uint8Array(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: ivCopy },
    key,
    data
  );

  // Combine: salt (16) + iv (12) + ciphertext (includes auth tag)
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  // Return as base64 for easy storage
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt data that was encrypted with encrypt()
 */
export async function decrypt(
  encryptedData: string,
  password: string
): Promise<string> {
  try {
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract salt, iv, and ciphertext
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    // Derive the same key
    const key = await deriveKey(password, salt);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch {
    throw new Error('Decryption failed - wrong password or corrupted data');
  }
}

/**
 * Hash data for blind indexing (searching encrypted data)
 * Uses HMAC-SHA256 so the same input always produces the same hash
 * but the hash can't be reversed to get the original data
 */
export async function blindIndex(
  data: string,
  key: string
): Promise<string> {
  const encoder = new TextEncoder();

  // Import the key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Generate HMAC
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data.toLowerCase().trim())
  );

  // Return as hex string (shorter than base64 for indexing)
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a secure random token (for sharing, sessions, etc.)
 */
export function generateSecureToken(length: number = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash a password for storage (one-way)
 * Note: For actual password storage, use bcrypt on the server
 * This is for client-side verification before sending
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypt an object (encrypts all string values)
 */
export async function encryptObject<T extends Record<string, unknown>>(
  obj: T,
  password: string,
  fieldsToEncrypt: (keyof T)[]
): Promise<T> {
  const result = { ...obj };

  for (const field of fieldsToEncrypt) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      (result as Record<string, unknown>)[field as string] = await encrypt(value, password);
    }
  }

  return result;
}

/**
 * Decrypt an object (decrypts specified fields)
 */
export async function decryptObject<T extends Record<string, unknown>>(
  obj: T,
  password: string,
  fieldsToDecrypt: (keyof T)[]
): Promise<T> {
  const result = { ...obj };

  for (const field of fieldsToDecrypt) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      try {
        (result as Record<string, unknown>)[field as string] = await decrypt(value, password);
      } catch {
        // Field might not be encrypted or wrong password
        console.warn(`Failed to decrypt field: ${String(field)}`);
      }
    }
  }

  return result;
}
