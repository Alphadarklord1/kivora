import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export interface LocalFileRecord {
  id: string;
  folderId: string;
  topicId: string | null;
  name: string;
  type: string;
  content?: string;
  localBlobId?: string;
  localFilePath?: string;
  mimeType?: string;
  fileSize?: number;
  createdAt: string;
}

function loadAll(): LocalFileRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readCompatStorage(localStorage, storageKeys.localFiles);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(records: LocalFileRecord[]) {
  if (typeof window === 'undefined') return;
  writeCompatStorage(localStorage, storageKeys.localFiles, JSON.stringify(records));
}

export function listLocalFiles(folderId?: string | null, topicId?: string | null) {
  const all = loadAll();
  return all
    .filter((file) => {
      if (folderId && file.folderId !== folderId) return false;
      if (topicId !== undefined && topicId !== null) return file.topicId === topicId;
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function upsertLocalFile(file: LocalFileRecord) {
  const all = loadAll();
  const next = [file, ...all.filter((entry) => entry.id !== file.id)];
  persist(next);
  return file;
}

export function deleteLocalFile(fileId: string) {
  const all = loadAll();
  const next = all.filter((entry) => entry.id !== fileId);
  persist(next);
}

export function deleteLocalFilesForFolder(folderId: string) {
  const all = loadAll();
  const next = all.filter((entry) => entry.folderId !== folderId);
  persist(next);
}

export function deleteLocalFilesForTopic(folderId: string, topicId: string) {
  const all = loadAll();
  const next = all.filter((entry) => !(entry.folderId === folderId && entry.topicId === topicId));
  persist(next);
}
