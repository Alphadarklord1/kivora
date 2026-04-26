'use client';

import { useState, useEffect, useCallback } from 'react';
import { broadcastInvalidate, listenForInvalidate, FOLDERS_CHANNEL } from '@/lib/sync/broadcast';
import { loadLocalFolders } from '@/lib/folders/local-folders';
import { listLocalFiles } from '@/lib/files/local-files';
import { idbStore } from '@/lib/idb';

interface Folder {
  id: string;
  name: string;
  createdAt: string;
}

interface Topic {
  id: string;
  name: string;
  folderId: string;
  createdAt: string;
}

interface FileItem {
  id: string;
  name: string;
  type: string;
  folderId: string;
  topicId: string;
  localBlobId: string | null;
  createdAt: string;
}

export function useFoldersStore() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch('/api/folders', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/topics',  { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/files?all=true',   { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ])
      .then(([f, t, fi]) => {
        const localFolders = loadLocalFolders();
        const localTopics = localFolders.flatMap(folder => folder.topics.map(topic => ({ ...topic, folderId: folder.id, createdAt: folder.createdAt })));
        const localFiles = listLocalFiles();
        const mergedFolders = [...localFolders.filter(local => !(Array.isArray(f) ? f : []).some((remote: Folder) => remote.id === local.id)), ...(Array.isArray(f) ? f : [])];
        const mergedTopics = [...localTopics.filter(local => !(Array.isArray(t) ? t : []).some((remote: Topic) => remote.id === local.id)), ...(Array.isArray(t) ? t : [])];
        const mergedFiles = [...localFiles.filter(local => !(Array.isArray(fi) ? fi : []).some((remote: FileItem) => remote.id === local.id)), ...(Array.isArray(fi) ? fi : [])];
        setFolders(mergedFolders);
        setTopics(mergedTopics as Topic[]);
        setFiles(mergedFiles as FileItem[]);
      })
      .catch(() => {
        const localFolders = loadLocalFolders();
        setFolders(localFolders);
        setTopics(localFolders.flatMap(folder => folder.topics.map(topic => ({ ...topic, folderId: folder.id, createdAt: folder.createdAt }))) as Topic[]);
        setFiles(listLocalFiles() as FileItem[]);
      });
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Automatically refresh when another tab mutates folder/topic/file data
  useEffect(() => {
    return listenForInvalidate(FOLDERS_CHANNEL, fetchAll);
  }, [fetchAll]);

  // ── Mutation helpers that broadcast after success ──────────────────────

  const createFolder = useCallback(async (name: string): Promise<Folder> => {
    const res = await fetch('/api/folders', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to create folder');
    const folder: Folder = await res.json();
    setFolders(prev => [...prev, folder]);
    broadcastInvalidate(FOLDERS_CHANNEL);
    return folder;
  }, []);

  const updateFolder = useCallback(async (id: string, name: string): Promise<void> => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to update folder');
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    broadcastInvalidate(FOLDERS_CHANNEL);
  }, []);

  const deleteFolder = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/folders/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete folder');

    // Sweep IndexedDB blobs that the server told us were attached to
    // files in this folder. The Postgres FK cascades the metadata rows,
    // but the blobs themselves live only in the browser — without this
    // step they pile up and consume IndexedDB quota silently.
    try {
      const data = await res.clone().json().catch(() => ({})) as { localBlobIds?: string[] };
      const blobIds = Array.isArray(data.localBlobIds) ? data.localBlobIds : [];
      if (blobIds.length > 0) {
        await Promise.all(
          blobIds.map((blobId) => idbStore.delete(blobId).catch(() => {})),
        );
      }
    } catch {
      // Worst case the blobs survive — never fail the folder delete on cleanup.
    }

    setFolders(prev => prev.filter(f => f.id !== id));
    broadcastInvalidate(FOLDERS_CHANNEL);
  }, []);

  const createTopic = useCallback(async (folderId: string, name: string): Promise<Topic> => {
    const res = await fetch('/api/topics', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId, name }),
    });
    if (!res.ok) throw new Error('Failed to create topic');
    const topic: Topic = await res.json();
    setTopics(prev => [...prev, topic]);
    broadcastInvalidate(FOLDERS_CHANNEL);
    return topic;
  }, []);

  const updateTopic = useCallback(async (id: string, name: string): Promise<void> => {
    const res = await fetch(`/api/topics/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error('Failed to update topic');
    setTopics(prev => prev.map(t => t.id === id ? { ...t, name } : t));
    broadcastInvalidate(FOLDERS_CHANNEL);
  }, []);

  const deleteTopic = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/topics/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete topic');
    setTopics(prev => prev.filter(t => t.id !== id));
    broadcastInvalidate(FOLDERS_CHANNEL);
  }, []);

  const createFile = useCallback(
    async (payload: Omit<FileItem, 'id' | 'createdAt'>): Promise<FileItem> => {
      const res = await fetch('/api/files', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to create file');
      const file: FileItem = await res.json();
      setFiles(prev => [...prev, file]);
      broadcastInvalidate(FOLDERS_CHANNEL);
      return file;
    },
    [],
  );

  const deleteFile = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/files/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) throw new Error('Failed to delete file');
    setFiles(prev => prev.filter(f => f.id !== id));
    broadcastInvalidate(FOLDERS_CHANNEL);
  }, []);

  return {
    folders,
    topics,
    files,
    fetchAll,
    createFolder,
    updateFolder,
    deleteFolder,
    createTopic,
    updateTopic,
    deleteTopic,
    createFile,
    deleteFile,
  };
}

/**
 * Subscribe to cross-tab folder invalidation signals.
 * Call this once at the app shell level; pass `fetchAll` from `useFoldersStore`.
 * Returns a cleanup function.
 */
export function subscribeToFoldersSync(fetchAll: () => void): () => void {
  return listenForInvalidate(FOLDERS_CHANNEL, fetchAll);
}
