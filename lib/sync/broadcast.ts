// Channel names for cross-tab broadcast sync
export const FOLDERS_CHANNEL = 'kivora-folders-sync';
export const LIBRARY_CHANNEL = 'kivora-library-sync';
export const SRS_CHANNEL     = 'kivora-srs-sync';

export type SyncMessage = { type: 'invalidate'; source: string };

/**
 * Broadcast an invalidation signal to all other tabs listening on `channel`.
 * Safe to call in SSR — no-ops when `window` is not available.
 */
export function broadcastInvalidate(channel: string): void {
  if (typeof window === 'undefined') return;
  try {
    const bc = new BroadcastChannel(channel);
    bc.postMessage({ type: 'invalidate', source: 'self' } satisfies SyncMessage);
    // Close immediately — we only need a one-shot send
    bc.close();
  } catch {
    /* BroadcastChannel not supported in this environment */
  }
}

/**
 * Listen for invalidation messages on `channel` and call `onInvalidate`
 * whenever one arrives from another tab.
 *
 * Returns a cleanup function that closes the channel.
 * Safe to call in SSR — returns a no-op cleanup when `window` is not available.
 */
export function listenForInvalidate(
  channel: string,
  onInvalidate: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  try {
    const bc = new BroadcastChannel(channel);
    bc.onmessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data?.type === 'invalidate') onInvalidate();
    };
    return () => bc.close();
  } catch {
    return () => {};
  }
}
