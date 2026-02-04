'use client';

import { useState, useEffect, useCallback } from 'react';
import { useVault } from '@/providers/VaultProvider';
import {
  encryptFolder,
  decryptFolder,
  decryptFolders,
  encryptTopic,
  decryptTopics,
  SecureFolder,
  SecureTopic,
} from '@/lib/crypto/secure-storage';

export interface Folder extends SecureFolder {
  topics: Topic[];
}

export type Topic = SecureTopic;

export function useFolders() {
  const { isUnlocked } = useVault();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch and decrypt folders
  const fetchFolders = useCallback(async () => {
    if (!isUnlocked) {
      setFolders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/folders');
      if (!res.ok) throw new Error('Failed to fetch folders');

      const data = await res.json();

      // Decrypt all folders and their topics
      const decryptedFolders = await Promise.all(
        data.map(async (folder: Folder) => {
          const decryptedFolder = await decryptFolder(folder);
          const decryptedTopics = folder.topics
            ? await decryptTopics(folder.topics)
            : [];
          return { ...decryptedFolder, topics: decryptedTopics };
        })
      );

      setFolders(decryptedFolders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load folders');
    } finally {
      setLoading(false);
    }
  }, [isUnlocked]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Create folder (encrypts before sending)
  const createFolder = useCallback(
    async (name: string) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      const encrypted = await encryptFolder({ name });

      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      });

      if (!res.ok) throw new Error('Failed to create folder');

      const newFolder = await res.json();
      const decrypted = await decryptFolder(newFolder);

      setFolders((prev) => [...prev, { ...decrypted, topics: [] }]);
      return decrypted;
    },
    [isUnlocked]
  );

  // Update folder
  const updateFolder = useCallback(
    async (id: string, updates: Partial<Folder>) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      const encrypted = await encryptFolder(updates);

      const res = await fetch(`/api/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      });

      if (!res.ok) throw new Error('Failed to update folder');

      const updatedFolder = await res.json();
      const decrypted = await decryptFolder(updatedFolder);

      setFolders((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, ...decrypted } : f
        )
      );
      return decrypted;
    },
    [isUnlocked]
  );

  // Delete folder
  const deleteFolder = useCallback(async (id: string) => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete folder');

    setFolders((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // Toggle folder expanded state
  const toggleFolder = useCallback(
    async (id: string) => {
      const folder = folders.find((f) => f.id === id);
      if (!folder) return;

      await updateFolder(id, { expanded: !folder.expanded });
    },
    [folders, updateFolder]
  );

  // Create topic (encrypts before sending)
  const createTopic = useCallback(
    async (folderId: string, name: string) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      const encrypted = await encryptTopic({ name });

      const res = await fetch(`/api/folders/${folderId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      });

      if (!res.ok) throw new Error('Failed to create topic');

      const newTopic = await res.json();
      const decryptedTopics = await decryptTopics([newTopic]);
      const decrypted = decryptedTopics[0];

      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? { ...f, topics: [...f.topics, decrypted] }
            : f
        )
      );
      return decrypted;
    },
    [isUnlocked]
  );

  // Update topic
  const updateTopic = useCallback(
    async (folderId: string, topicId: string, updates: Partial<Topic>) => {
      if (!isUnlocked) throw new Error('Vault is locked');

      const encrypted = await encryptTopic(updates);

      const res = await fetch(`/api/folders/${folderId}/topics/${topicId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encrypted),
      });

      if (!res.ok) throw new Error('Failed to update topic');

      const updatedTopic = await res.json();
      const decryptedTopics = await decryptTopics([updatedTopic]);
      const decrypted = decryptedTopics[0];

      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? {
                ...f,
                topics: f.topics.map((t) =>
                  t.id === topicId ? decrypted : t
                ),
              }
            : f
        )
      );
      return decrypted;
    },
    [isUnlocked]
  );

  // Delete topic
  const deleteTopic = useCallback(
    async (folderId: string, topicId: string) => {
      const res = await fetch(`/api/folders/${folderId}/topics/${topicId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete topic');

      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? { ...f, topics: f.topics.filter((t) => t.id !== topicId) }
            : f
        )
      );
    },
    []
  );

  return {
    folders,
    loading,
    error,
    refetch: fetchFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolder,
    createTopic,
    updateTopic,
    deleteTopic,
  };
}
