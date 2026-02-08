/**
 * Secure Storage Layer
 *
 * Wraps all data operations with encryption.
 * Data is encrypted before sending to server and decrypted after receiving.
 *
 * What gets encrypted:
 * - Folder names
 * - Topic names
 * - File names and content
 * - Library item content
 *
 * What remains visible (for database operations):
 * - User ID (but anonymized/hashed externally)
 * - Timestamps
 * - IDs (UUIDs - meaningless without context)
 * - Blind indexes (for searching)
 */

import {
  encryptData,
  decryptData,
  encryptFields,
  decryptFields,
  createBlindIndex,
  isVaultUnlocked,
  ENCRYPTION_DISABLED,
} from './vault';

// Field definitions for each entity type
const ENCRYPTED_FIELDS = {
  folder: ['name'] as (keyof SecureFolder)[],
  topic: ['name'] as (keyof SecureTopic)[],
  file: ['name', 'content'] as (keyof SecureFile)[],
  libraryItem: ['content'] as (keyof SecureLibraryItem)[],
  userSettings: [] as string[], // Settings are not sensitive
};

// Types for encrypted entities
export interface SecureFolder {
  id: string;
  name: string; // Encrypted
  nameIndex?: string; // Blind index for searching
  expanded: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SecureTopic {
  id: string;
  folderId: string;
  name: string; // Encrypted
  nameIndex?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SecureFile {
  id: string;
  folderId: string;
  topicId: string | null;
  name: string; // Encrypted
  nameIndex?: string;
  type: string;
  content: string | null; // Encrypted
  localBlobId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  liked: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SecureLibraryItem {
  id: string;
  mode: string;
  content: string; // Encrypted
  createdAt: string;
}

/**
 * Encrypt a folder before sending to server
 */
export async function encryptFolder(
  folder: Partial<SecureFolder>
): Promise<Partial<SecureFolder>> {
  if (ENCRYPTION_DISABLED) {
    return folder;
  }
  if (!isVaultUnlocked()) {
    console.warn('Vault locked, storing unencrypted');
    return folder;
  }

  const encrypted = await encryptFields(folder as Record<string, unknown>, ENCRYPTED_FIELDS.folder as string[]) as Partial<SecureFolder>;

  // Add blind index for name
  if (folder.name) {
    encrypted.nameIndex = await createBlindIndex(folder.name);
  }

  return encrypted;
}

/**
 * Decrypt a folder received from server
 */
export async function decryptFolder(
  folder: SecureFolder
): Promise<SecureFolder> {
  if (ENCRYPTION_DISABLED) {
    return folder;
  }
  if (!isVaultUnlocked()) {
    return folder;
  }

  const result = await decryptFields(folder as unknown as Record<string, unknown>, ENCRYPTED_FIELDS.folder as string[]);
  return result as unknown as SecureFolder;
}

/**
 * Decrypt multiple folders
 */
export async function decryptFolders(
  folders: SecureFolder[]
): Promise<SecureFolder[]> {
  if (ENCRYPTION_DISABLED) {
    return folders;
  }
  if (!isVaultUnlocked()) {
    return folders;
  }

  return Promise.all(folders.map(decryptFolder));
}

/**
 * Encrypt a topic before sending to server
 */
export async function encryptTopic(
  topic: Partial<SecureTopic>
): Promise<Partial<SecureTopic>> {
  if (ENCRYPTION_DISABLED) {
    return topic;
  }
  if (!isVaultUnlocked()) {
    return topic;
  }

  const encrypted = await encryptFields(topic as Record<string, unknown>, ENCRYPTED_FIELDS.topic as string[]) as Partial<SecureTopic>;

  if (topic.name) {
    encrypted.nameIndex = await createBlindIndex(topic.name);
  }

  return encrypted;
}

/**
 * Decrypt a topic received from server
 */
export async function decryptTopic(topic: SecureTopic): Promise<SecureTopic> {
  if (ENCRYPTION_DISABLED) {
    return topic;
  }
  if (!isVaultUnlocked()) {
    return topic;
  }

  const result = await decryptFields(topic as unknown as Record<string, unknown>, ENCRYPTED_FIELDS.topic as string[]);
  return result as unknown as SecureTopic;
}

/**
 * Decrypt multiple topics
 */
export async function decryptTopics(
  topics: SecureTopic[]
): Promise<SecureTopic[]> {
  if (ENCRYPTION_DISABLED) {
    return topics;
  }
  if (!isVaultUnlocked()) {
    return topics;
  }

  return Promise.all(topics.map(decryptTopic));
}

/**
 * Encrypt a file before sending to server
 */
export async function encryptFile(
  file: Partial<SecureFile>
): Promise<Partial<SecureFile>> {
  if (ENCRYPTION_DISABLED) {
    return file;
  }
  if (!isVaultUnlocked()) {
    return file;
  }

  const encrypted = await encryptFields(file as Record<string, unknown>, ENCRYPTED_FIELDS.file as string[]) as Partial<SecureFile>;

  if (file.name) {
    encrypted.nameIndex = await createBlindIndex(file.name);
  }

  return encrypted;
}

/**
 * Decrypt a file received from server
 */
export async function decryptFile(file: SecureFile): Promise<SecureFile> {
  if (ENCRYPTION_DISABLED) {
    return file;
  }
  if (!isVaultUnlocked()) {
    return file;
  }

  const result = await decryptFields(file as unknown as Record<string, unknown>, ENCRYPTED_FIELDS.file as string[]);
  return result as unknown as SecureFile;
}

/**
 * Decrypt multiple files
 */
export async function decryptFiles(files: SecureFile[]): Promise<SecureFile[]> {
  if (ENCRYPTION_DISABLED) {
    return files;
  }
  if (!isVaultUnlocked()) {
    return files;
  }

  return Promise.all(files.map(decryptFile));
}

/**
 * Encrypt a library item before sending to server
 */
export async function encryptLibraryItem(
  item: Partial<SecureLibraryItem>
): Promise<Partial<SecureLibraryItem>> {
  if (ENCRYPTION_DISABLED) {
    return item;
  }
  if (!isVaultUnlocked()) {
    return item;
  }

  return encryptFields(item as Record<string, unknown>, ENCRYPTED_FIELDS.libraryItem as string[]) as Partial<SecureLibraryItem>;
}

/**
 * Decrypt a library item received from server
 */
export async function decryptLibraryItem(
  item: SecureLibraryItem
): Promise<SecureLibraryItem> {
  if (ENCRYPTION_DISABLED) {
    return item;
  }
  if (!isVaultUnlocked()) {
    return item;
  }

  const result = await decryptFields(item as unknown as Record<string, unknown>, ENCRYPTED_FIELDS.libraryItem as string[]);
  return result as unknown as SecureLibraryItem;
}

/**
 * Decrypt multiple library items
 */
export async function decryptLibraryItems(
  items: SecureLibraryItem[]
): Promise<SecureLibraryItem[]> {
  if (ENCRYPTION_DISABLED) {
    return items;
  }
  if (!isVaultUnlocked()) {
    return items;
  }

  return Promise.all(items.map(decryptLibraryItem));
}

/**
 * Create a search index for a term
 * Used for server-side searching of encrypted data
 */
export async function createSearchIndex(term: string): Promise<string | null> {
  if (ENCRYPTION_DISABLED) {
    return term;
  }
  if (!isVaultUnlocked()) {
    return null;
  }

  return createBlindIndex(term);
}

/**
 * Encrypt arbitrary text (for notes, generated content, etc.)
 */
export async function encryptText(text: string): Promise<string> {
  if (ENCRYPTION_DISABLED) {
    return text;
  }
  if (!isVaultUnlocked()) {
    return text;
  }

  return encryptData(text);
}

/**
 * Decrypt arbitrary text
 */
export async function decryptText(encryptedText: string): Promise<string> {
  if (ENCRYPTION_DISABLED) {
    return encryptedText;
  }
  if (!isVaultUnlocked()) {
    return encryptedText;
  }

  try {
    return await decryptData(encryptedText);
  } catch {
    // Return original if decryption fails (might not be encrypted)
    return encryptedText;
  }
}

/**
 * Check if a string looks like it's encrypted
 * (Base64 encoded, starts with expected pattern)
 */
export function isEncrypted(text: string): boolean {
  if (!text || text.length < 50) return false;

  // Check if it's valid base64
  try {
    const decoded = atob(text);
    // Our encrypted data is at least salt(16) + iv(12) + data
    return decoded.length >= 28;
  } catch {
    return false;
  }
}
