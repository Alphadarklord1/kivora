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

export interface OfflineSyncResult {
  attempted: number;
  synced: number;
  failed: number;
}

/**
 * Promote every locally-stored library item to the cloud, then drop the
 * successful ones from localStorage. Safe to call at any time — POSTs that
 * come back 503 (no-DB / guest mode) leave the offline copy in place so
 * the UX doesn't change for guests, and any 4xx on a single item doesn't
 * abort the whole batch.
 *
 * Returns a summary so the caller can decide whether to surface a toast.
 * No-ops in SSR.
 */
export async function syncOfflineLibraryToCloud(): Promise<OfflineSyncResult> {
  if (typeof window === 'undefined') return { attempted: 0, synced: 0, failed: 0 };
  const items = read();
  if (items.length === 0) return { attempted: 0, synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const stillOffline: OfflineLibraryItem[] = [];

  for (const item of items) {
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: item.mode,
          content: item.content,
          title:
            (item.metadata && typeof (item.metadata as { title?: unknown }).title === 'string'
              ? (item.metadata as { title: string }).title
              : undefined),
          metadata: item.metadata ?? undefined,
        }),
      });
      if (res.ok) {
        synced += 1;
      } else if (res.status === 503 || res.status === 401) {
        // No DB or unauthenticated — keep the local copy verbatim.
        stillOffline.push(item);
      } else {
        // 4xx that wasn't a quota / auth issue — count as failed but
        // keep the local copy so the user doesn't lose work.
        failed += 1;
        stillOffline.push(item);
      }
    } catch {
      // Network / abort — keep the local copy.
      failed += 1;
      stillOffline.push(item);
    }
  }
  write(stillOffline);
  return { attempted: items.length, synced, failed };
}
