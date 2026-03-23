'use client';

import { useEffect } from 'react';
import { listenForInvalidate, FOLDERS_CHANNEL, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

/**
 * Mount this hook once at the AppShell level.
 *
 * It opens a BroadcastChannel listener for both folders and library channels.
 * When another tab mutates data and broadcasts an invalidation, the callbacks
 * fire so each registered consumer can re-fetch.
 *
 * The `onFoldersInvalidate` and `onLibraryInvalidate` callbacks are optional;
 * pass them when you have a refetch function available at the shell level.
 * For per-page refetches, use `listenForInvalidate` directly inside the page.
 */
export function useSyncSubscription(options?: {
  onFoldersInvalidate?: () => void;
  onLibraryInvalidate?: () => void;
}): void {
  const { onFoldersInvalidate, onLibraryInvalidate } = options ?? {};

  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (onFoldersInvalidate) {
      cleanups.push(listenForInvalidate(FOLDERS_CHANNEL, onFoldersInvalidate));
    }
    if (onLibraryInvalidate) {
      cleanups.push(listenForInvalidate(LIBRARY_CHANNEL, onLibraryInvalidate));
    }

    return () => cleanups.forEach(fn => fn());
  }, [onFoldersInvalidate, onLibraryInvalidate]);
}
