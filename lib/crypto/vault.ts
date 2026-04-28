/**
 * Secure Vault Service
 *
 * Manages encryption keys and provides a high-level API for
 * encrypting/decrypting user data.
 *
 * Architecture:
 * 1. Master key is derived from user's password
 * 2. Master key encrypts a randomly generated Data Encryption Key (DEK)
 * 3. DEK is used to encrypt actual data
 * 4. This allows password changes without re-encrypting all data
 */

import {
  encrypt,
  decrypt,
  blindIndex,
  generateSecureToken,
  generateSalt,
} from './encryption';
import { readCompatStorage, removeCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

// Encryption is OFF by default. To enable in production, set
// NEXT_PUBLIC_ENCRYPTION_DISABLED=0 in Vercel env vars and redeploy.
// (NEXT_PUBLIC_ vars are baked into the client bundle at build time, so a
// redeploy is required for the change to take effect.)
//
// Before enabling globally, ship vault-setup onboarding UX and fix the
// indexKey restore-from-session bug (see restoreVaultFromSession below) —
// otherwise users hit "Vault is locked or index key not available" on any
// search after a tab restart.
const _envFlag = (typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_ENCRYPTION_DISABLED : undefined) ?? '1';
export const ENCRYPTION_DISABLED = _envFlag !== '0';

interface VaultData {
  // Encrypted Data Encryption Key (encrypted with master key)
  encryptedDEK: string;
  // Salt used for master key derivation
  masterSalt: string;
  // Salt used for blind indexing
  indexSalt: string;
  // Version for future migrations
  version: number;
  // Checksum to verify correct password
  checksum: string;
}

interface UnlockedVault {
  dek: string; // Data Encryption Key (plaintext, only in memory)
  indexKey: string; // Key for blind indexing
}

// In-memory storage for unlocked vault (never persisted)
let unlockedVault: UnlockedVault | null = null;

/**
 * Check if vault exists for this user
 */
export function hasVault(): boolean {
  if (typeof window === 'undefined') return false;
  if (ENCRYPTION_DISABLED) return false;
  return readCompatStorage(localStorage, storageKeys.vault) !== null;
}

/**
 * Check if vault is currently unlocked
 */
export function isVaultUnlocked(): boolean {
  if (ENCRYPTION_DISABLED) return false;
  return unlockedVault !== null;
}

/**
 * Create a new vault for a user
 * Called during registration or first encryption setup
 */
export async function createVault(password: string): Promise<void> {
  if (ENCRYPTION_DISABLED) return;
  // Generate random salts
  const masterSalt = generateSalt();
  const indexSalt = generateSalt();

  // Generate a random Data Encryption Key
  const dek = generateSecureToken(32);

  // Generate index key from password
  const indexKey = await blindIndex(password, arrayToBase64(indexSalt));

  // Derive master key and encrypt the DEK
  const encryptedDEK = await encrypt(dek, password);

  // Create checksum to verify password later
  const checksum = await blindIndex('vault_check', dek);

  // Store vault data
  const vaultData: VaultData = {
    encryptedDEK,
    masterSalt: arrayToBase64(masterSalt),
    indexSalt: arrayToBase64(indexSalt),
    version: 1,
    checksum,
  };

  writeCompatStorage(localStorage, storageKeys.vault, JSON.stringify(vaultData));

  // Unlock the vault
  unlockedVault = { dek, indexKey };

  // Store session keys in sessionStorage (cleared on browser close).
  // The indexKey is persisted too so blind-index search keeps working after
  // a tab restart — without this, restoreVaultFromSession() ends up with
  // indexKey='' and createBlindIndex throws.
  writeCompatStorage(sessionStorage, storageKeys.vaultSession, dek);
  writeCompatStorage(sessionStorage, storageKeys.vaultIndexSession, indexKey);
}

/**
 * Unlock an existing vault with password
 */
export async function unlockVault(password: string): Promise<boolean> {
  if (ENCRYPTION_DISABLED) return true;
  const vaultJson = readCompatStorage(localStorage, storageKeys.vault);
  if (!vaultJson) {
    throw new Error('No vault found');
  }

  const vaultData: VaultData = JSON.parse(vaultJson);

  try {
    // Decrypt the DEK
    const dek = await decrypt(vaultData.encryptedDEK, password);

    // Verify checksum
    const checksum = await blindIndex('vault_check', dek);
    if (checksum !== vaultData.checksum) {
      throw new Error('Invalid password');
    }

    // Generate index key
    const indexKey = await blindIndex(password, vaultData.indexSalt);

    // Unlock vault
    unlockedVault = { dek, indexKey };

    // Store session keys
    writeCompatStorage(sessionStorage, storageKeys.vaultSession, dek);
    writeCompatStorage(sessionStorage, storageKeys.vaultIndexSession, indexKey);

    return true;
  } catch (error) {
    console.error('Failed to unlock vault:', error);
    return false;
  }
}

/**
 * Lock the vault (clear from memory)
 */
export function lockVault(): void {
  if (ENCRYPTION_DISABLED) return;
  unlockedVault = null;
  removeCompatStorage(sessionStorage, storageKeys.vaultSession);
  removeCompatStorage(sessionStorage, storageKeys.vaultIndexSession);
}

/**
 * Try to restore vault from session
 */
export async function restoreVaultFromSession(): Promise<boolean> {
  if (ENCRYPTION_DISABLED) return true;
  const sessionDek = readCompatStorage(sessionStorage, storageKeys.vaultSession);
  if (!sessionDek) return false;

  const vaultJson = readCompatStorage(localStorage, storageKeys.vault);
  if (!vaultJson) return false;

  const vaultData: VaultData = JSON.parse(vaultJson);

  try {
    // Verify the DEK is correct
    const checksum = await blindIndex('vault_check', sessionDek);
    if (checksum !== vaultData.checksum) {
      removeCompatStorage(sessionStorage, storageKeys.vaultSession);
      removeCompatStorage(sessionStorage, storageKeys.vaultIndexSession);
      return false;
    }

    // Restore indexKey from sessionStorage too (written at unlock/create).
    // Falls back to '' for sessions created before this fix; in that case
    // search will require a re-unlock — the vault still decrypts data.
    const sessionIndexKey = readCompatStorage(sessionStorage, storageKeys.vaultIndexSession) ?? '';

    unlockedVault = {
      dek: sessionDek,
      indexKey: sessionIndexKey,
    };

    return true;
  } catch {
    removeCompatStorage(sessionStorage, storageKeys.vaultSession);
    removeCompatStorage(sessionStorage, storageKeys.vaultIndexSession);
    return false;
  }
}

/**
 * Change vault password
 * Re-encrypts the DEK with new password, data stays encrypted with same DEK
 */
export async function changeVaultPassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  if (ENCRYPTION_DISABLED) return true;
  // First unlock with current password
  const unlocked = await unlockVault(currentPassword);
  if (!unlocked || !unlockedVault) {
    throw new Error('Current password is incorrect');
  }

  const vaultJson = readCompatStorage(localStorage, storageKeys.vault);
  if (!vaultJson) throw new Error('No vault found');

  const vaultData: VaultData = JSON.parse(vaultJson);

  // Re-encrypt DEK with new password
  const newEncryptedDEK = await encrypt(unlockedVault.dek, newPassword);

  // Generate new index key
  const newIndexKey = await blindIndex(newPassword, vaultData.indexSalt);

  // Update vault
  vaultData.encryptedDEK = newEncryptedDEK;
  writeCompatStorage(localStorage, storageKeys.vault, JSON.stringify(vaultData));

  // Update unlocked vault and refresh sessionStorage so a tab restart picks
  // up the new indexKey instead of the stale one written at unlockVault().
  unlockedVault.indexKey = newIndexKey;
  writeCompatStorage(sessionStorage, storageKeys.vaultIndexSession, newIndexKey);

  return true;
}

/**
 * Encrypt sensitive data using the vault's DEK
 */
export async function encryptData(plaintext: string): Promise<string> {
  if (ENCRYPTION_DISABLED) return plaintext;
  if (!unlockedVault) {
    throw new Error('Vault is locked');
  }
  return encrypt(plaintext, unlockedVault.dek);
}

/**
 * Decrypt data that was encrypted with encryptData
 */
export async function decryptData(ciphertext: string): Promise<string> {
  if (ENCRYPTION_DISABLED) return ciphertext;
  if (!unlockedVault) {
    throw new Error('Vault is locked');
  }
  return decrypt(ciphertext, unlockedVault.dek);
}

/**
 * Create a blind index for searching encrypted data
 */
export async function createBlindIndex(value: string): Promise<string> {
  if (ENCRYPTION_DISABLED) return value;
  if (!unlockedVault?.indexKey) {
    throw new Error('Vault is locked or index key not available');
  }
  return blindIndex(value, unlockedVault.indexKey);
}

/**
 * Encrypt multiple fields in an object
 */
export async function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Promise<T> {
  if (ENCRYPTION_DISABLED) return obj;
  if (!unlockedVault) {
    throw new Error('Vault is locked');
  }

  const result = { ...obj };

  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      (result as Record<string, unknown>)[field as string] = await encrypt(
        value,
        unlockedVault.dek
      );
    }
  }

  return result;
}

/**
 * Decrypt multiple fields in an object
 */
export async function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): Promise<T> {
  if (ENCRYPTION_DISABLED) return obj;
  if (!unlockedVault) {
    throw new Error('Vault is locked');
  }

  const result = { ...obj };

  for (const field of fields) {
    const value = result[field];
    if (typeof value === 'string' && value.length > 0) {
      try {
        (result as Record<string, unknown>)[field as string] = await decrypt(
          value,
          unlockedVault.dek
        );
      } catch {
        // Keep original value if decryption fails
      }
    }
  }

  return result;
}

/**
 * Delete the vault (for account deletion)
 */
export function deleteVault(): void {
  if (ENCRYPTION_DISABLED) return;
  removeCompatStorage(localStorage, storageKeys.vault);
  removeCompatStorage(sessionStorage, storageKeys.vaultSession);
  removeCompatStorage(sessionStorage, storageKeys.vaultIndexSession);
  unlockedVault = null;
}

// Helper functions
function arrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}
