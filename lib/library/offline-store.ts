/**
 * Offline library store.
 *
 * /api/library returns 503 in guest / no-DATABASE_URL mode, so saves silently
 * failed. This module persists items to localStorage so the Save button is
 * useful for guests. The Library page merges remote + offline items so guest
 * work shows up alongside any cloud-synced items the user has from a prior
 * session.
 *
 * Items match the on-server `libraryItems` row shape closely enough that the
 * UI can render them without branching.
 */

export interface OfflineLibraryItem {
  id: string;
  userId: string | null;
  mode: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  /** True for items that exist only on this device. */
  offline: true;
}

const STORAGE_KEY = 'kivora-offline-library';

function read(): OfflineLibraryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function write(items: OfflineLibraryItem[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* quota / privacy mode */ }
}

export function loadOfflineItems(): OfflineLibraryItem[] {
  return read().sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
}

export function saveOfflineItem(input: { mode: string; content: string; metadata?: Record<string, unknown> | null; title?: string }): OfflineLibraryItem {
  const items = read();
  const id = `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const item: OfflineLibraryItem = {
    id,
    userId: null,
    mode: input.mode,
    content: input.content,
    metadata: input.metadata ?? (input.title ? { title: input.title } : null),
    createdAt: new Date().toISOString(),
    offline: true,
  };
  items.unshift(item);
  // Keep a sane cap to avoid unbounded localStorage growth.
  if (items.length > 200) items.length = 200;
  write(items);
  return item;
}

export function deleteOfflineItem(id: string): void {
  write(read().filter((i) => i.id !== id));
}
