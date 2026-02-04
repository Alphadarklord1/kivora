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
  deriveKey,
  generateSalt,
} from './encryption';

const VAULT_KEY = 'studypilot_vault';
const SESSION_KEY = 'studypilot_session_key';

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
  return localStorage.getItem(VAULT_KEY) !== null;
}

/**
 * Check if vault is currently unlocked
 */
export function isVaultUnlocked(): boolean {
  return unlockedVault !== null;
}

/**
 * Create a new vault for a user
 * Called during registration or first encryption setup
 */
export async function createVault(password: string): Promise<void> {
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

  localStorage.setItem(VAULT_KEY, JSON.stringify(vaultData));

  // Unlock the vault
  unlockedVault = { dek, indexKey };

  // Store session key in sessionStorage (cleared on browser close)
  sessionStorage.setItem(SESSION_KEY, dek);
}

/**
 * Unlock an existing vault with password
 */
export async function unlockVault(password: string): Promise<boolean> {
  const vaultJson = localStorage.getItem(VAULT_KEY);
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

    // Store session key
    sessionStorage.setItem(SESSION_KEY, dek);

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
  unlockedVault = null;
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Try to restore vault from session
 */
export async function restoreVaultFromSession(): Promise<boolean> {
  const sessionDek = sessionStorage.getItem(SESSION_KEY);
  if (!sessionDek) return false;

  const vaultJson = localStorage.getItem(VAULT_KEY);
  if (!vaultJson) return false;

  const vaultData: VaultData = JSON.parse(vaultJson);

  try {
    // Verify the DEK is correct
    const checksum = await blindIndex('vault_check', sessionDek);
    if (checksum !== vaultData.checksum) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }

    // We can't regenerate indexKey without password, but we can still decrypt
    unlockedVault = {
      dek: sessionDek,
      indexKey: '', // Will need password for searching
    };

    return true;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
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
  // First unlock with current password
  const unlocked = await unlockVault(currentPassword);
  if (!unlocked || !unlockedVault) {
    throw new Error('Current password is incorrect');
  }

  const vaultJson = localStorage.getItem(VAULT_KEY);
  if (!vaultJson) throw new Error('No vault found');

  const vaultData: VaultData = JSON.parse(vaultJson);

  // Re-encrypt DEK with new password
  const newEncryptedDEK = await encrypt(unlockedVault.dek, newPassword);

  // Generate new index key
  const newIndexKey = await blindIndex(newPassword, vaultData.indexSalt);

  // Update vault
  vaultData.encryptedDEK = newEncryptedDEK;
  localStorage.setItem(VAULT_KEY, JSON.stringify(vaultData));

  // Update unlocked vault
  unlockedVault.indexKey = newIndexKey;

  return true;
}

/**
 * Encrypt sensitive data using the vault's DEK
 */
export async function encryptData(plaintext: string): Promise<string> {
  if (!unlockedVault) {
    throw new Error('Vault is locked');
  }
  return encrypt(plaintext, unlockedVault.dek);
}

/**
 * Decrypt data that was encrypted with encryptData
 */
export async function decryptData(ciphertext: string): Promise<string> {
  if (!unlockedVault) {
    throw new Error('Vault is locked');
  }
  return decrypt(ciphertext, unlockedVault.dek);
}

/**
 * Create a blind index for searching encrypted data
 */
export async function createBlindIndex(value: string): Promise<string> {
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
  localStorage.removeItem(VAULT_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  unlockedVault = null;
}

// Helper functions
function arrayToBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}
