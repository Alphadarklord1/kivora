'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVault } from '@/providers/VaultProvider';
import {
  encryptLibraryItem,
  decryptLibraryItem,
  decryptLibraryItems,
  createSearchIndex,
  SecureLibraryItem,
} from '@/lib/crypto/secure-storage';

export interface LibraryItem extends SecureLibraryItem {
  metadata?: Record<string, unknown>;
}

export function useLibrary() {
  const { isUnlocked } = useVault();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch and decrypt library items
  const fetchItems = useCallback(async () => {
    if (!isUnlocked) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error('Failed to fetch library');

      const data = await res.json();
      const decrypted = await decryptLibraryItems(data);

      setItems(decrypted as LibraryItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Save to library (encrypts before sending)
  const saveToLibrary = useCallback(
    async (mode: string, content: string, metadata?: Record<string, unknown>) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      const encrypted = await encryptLibraryItem({ mode, content });

      // Create search index for the content (for server-side searching)
      const contentIndex = await createSearchIndex(content.substring(0, 100));

      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...encrypted,
          contentIndex,
          metadata,
        }),
      });

      if (!res.ok) throw new Error('Failed to save to library');

      const newItem = await res.json();
      const decrypted = await decryptLibraryItem(newItem);

      setItems((prev) => [decrypted as LibraryItem, ...prev]);
      return decrypted;
    },
    [isUnlocked]
  );

  // Delete from library
  const deleteFromLibrary = useCallback(async (id: string) => {
    const res = await fetch(`/api/library/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete from library');

    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  // Clear all library items
  const clearLibrary = useCallback(async () => {
    const res = await fetch('/api/library', {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to clear library');

    setItems([]);
  }, []);

  // Search library (client-side search of decrypted content)
  const searchLibrary = useCallback(
    (query: string) => {
      if (!query.trim()) return items;

      const lowerQuery = query.toLowerCase();
      return items.filter(
        (item) =>
          item.content.toLowerCase().includes(lowerQuery) ||
          item.mode.toLowerCase().includes(lowerQuery)
      );
    },
    [items]
  );

  // Export library as JSON (decrypted)
  const exportLibrary = useCallback(() => {
    const exportData = items.map((item) => ({
      mode: item.mode,
      content: item.content,
      createdAt: item.createdAt,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studyharbor-library-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [items]);

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
    saveToLibrary,
    deleteFromLibrary,
    clearLibrary,
    searchLibrary,
    exportLibrary,
  };
}
