'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVault } from '@/providers/VaultProvider';
import {
  encryptFile,
  decryptFile,
  decryptFiles,
  SecureFile,
} from '@/lib/crypto/secure-storage';

export type File = SecureFile;

interface UseFilesOptions {
  folderId?: string;
  topicId?: string;
  liked?: boolean;
  pinned?: boolean;
}

export function useFiles(options: UseFilesOptions = {}) {
  const { isUnlocked } = useVault();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build query string from options
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.topicId) params.set('topicId', options.topicId);
    if (options.liked) params.set('liked', 'true');
    if (options.pinned) params.set('pinned', 'true');
    return params.toString();
  }, [options.folderId, options.topicId, options.liked, options.pinned]);

  // Fetch and decrypt files
  const fetchFiles = useCallback(async () => {
    if (!isUnlocked) {
      setFiles([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = buildQuery();
      const url = `/api/files${query ? `?${query}` : ''}`;
      const res = await fetch(url);

      if (!res.ok) throw new Error('Failed to fetch files');

      const data = await res.json();
      const decrypted = await decryptFiles(data);

      setFiles(decrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked, buildQuery]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Create file (encrypts before sending)
  const createFile = useCallback(
    async (fileData: {
      name: string;
      type: string;
      content?: string;
      folderId: string;
      topicId?: string;
      localBlobId?: string;
      mimeType?: string;
      fileSize?: number;
    }) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      const encrypted = await encryptFile(fileData);

      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      });

      if (!res.ok) throw new Error('Failed to create file');

      const newFile = await res.json();
      const decrypted = await decryptFile(newFile);

      setFiles((prev) => [decrypted, ...prev]);
      return decrypted;
    },
    [isUnlocked]
  );

  // Update file
  const updateFile = useCallback(
    async (id: string, updates: Partial<File>) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      // Only encrypt sensitive fields
      const encrypted = await encryptFile(updates);

      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      });

      if (!res.ok) throw new Error('Failed to update file');

      const updatedFile = await res.json();
      const decrypted = await decryptFile(updatedFile);

      setFiles((prev) =>
        prev.map((f) => (f.id === id ? decrypted : f))
      );
      return decrypted;
    },
    [isUnlocked]
  );

  // Delete file
  const deleteFile = useCallback(async (id: string) => {
    const res = await fetch(`/api/files/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete file');

    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Toggle like
  const toggleLike = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;

      // Like/pin don't need encryption
      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: !file.liked }),
      });

      if (!res.ok) throw new Error('Failed to toggle like');

      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, liked: !f.liked } : f))
      );
    },
    [files]
  );

  // Toggle pin
  const togglePin = useCallback(
    async (id: string) => {
      const file = files.find((f) => f.id === id);
      if (!file) return;

      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !file.pinned }),
      });

      if (!res.ok) throw new Error('Failed to toggle pin');

      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, pinned: !f.pinned } : f))
      );
    },
    [files]
  );

  return {
    files,
    loading,
    error,
    refetch: fetchFiles,
    createFile,
    updateFile,
    deleteFile,
    toggleLike,
    togglePin,
  };
}

// Hook for getting recent files
export function useRecentFiles(limit: number = 10) {
  const { isUnlocked } = useVault();
  const [recentFiles, setRecentFiles] = useState<Array<{ file: File; accessedAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecent = useCallback(async () => {
    if (!isUnlocked) {
      setRecentFiles([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/recent?limit=${limit}`);
      if (!res.ok) return;

      const data = await res.json();

      // Decrypt each file's data
      const decrypted = await Promise.all(
        data.map(async (entry: { file: Record<string, unknown>; accessedAt: string }) => ({
          file: await decryptFile(entry.file as unknown as SecureFile),
          accessedAt: entry.accessedAt,
        }))
      );

      setRecentFiles(decrypted);
    } catch (err) {
      console.error('Failed to fetch recent files:', err);
    } finally {
      setLoading(false);
    }
  }, [isUnlocked, limit]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  // Record file access
  const recordAccess = useCallback(async (fileId: string) => {
    try {
      await fetch('/api/recent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      // Refresh the list
      fetchRecent();
    } catch (err) {
      console.error('Failed to record file access:', err);
    }
  }, [fetchRecent]);

  // Clear recent history
  const clearHistory = useCallback(async () => {
    try {
      await fetch('/api/recent', { method: 'DELETE' });
      setRecentFiles([]);
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  }, []);

  return {
    recentFiles,
    files: recentFiles.map(r => r.file), // backwards compatible
    loading,
    refetch: fetchRecent,
    recordAccess,
    clearHistory,
  };
}

// Hook for getting liked files
export function useLikedFiles() {
  return useFiles({ liked: true });
}

// Hook for getting pinned files
export function usePinnedFiles() {
  return useFiles({ pinned: true });
}
