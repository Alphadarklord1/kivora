import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export interface LocalTopic {
  id: string;
  name: string;
}

export interface LocalFolder {
  id: string;
  name: string;
  expanded: boolean;
  topics: LocalTopic[];
  createdAt: string;
  updatedAt: string;
}

function createId(prefix: 'folder' | 'topic') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `local-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortFolders(folders: LocalFolder[]) {
  return [...folders].sort((a, b) => {
    const left = new Date(b.updatedAt).getTime();
    const right = new Date(a.updatedAt).getTime();
    return left - right;
  });
}

function persistLocalFolders(folders: LocalFolder[]) {
  if (typeof window === 'undefined') return;
  writeCompatStorage(localStorage, storageKeys.localFolders, JSON.stringify(sortFolders(folders)));
}

export function loadLocalFolders(): LocalFolder[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readCompatStorage(localStorage, storageKeys.localFolders);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortFolders(parsed) : [];
  } catch {
    return [];
  }
}

export function createLocalFolder(name: string): LocalFolder {
  const now = new Date().toISOString();
  const folder: LocalFolder = {
    id: createId('folder'),
    name: name.trim(),
    expanded: true,
    topics: [],
    createdAt: now,
    updatedAt: now,
  };

  const next = [folder, ...loadLocalFolders()];
  persistLocalFolders(next);
  return folder;
}

export function createLocalTopic(folderId: string, name: string): LocalTopic | null {
  const folders = loadLocalFolders();
  const index = folders.findIndex((folder) => folder.id === folderId);
  if (index === -1) return null;

  const topic: LocalTopic = {
    id: createId('topic'),
    name: name.trim(),
  };

  folders[index] = {
    ...folders[index],
    expanded: true,
    topics: [...folders[index].topics, topic],
    updatedAt: new Date().toISOString(),
  };

  persistLocalFolders(folders);
  return topic;
}

export function toggleLocalFolderExpanded(folderId: string): LocalFolder | null {
  const folders = loadLocalFolders();
  const index = folders.findIndex((folder) => folder.id === folderId);
  if (index === -1) return null;

  folders[index] = {
    ...folders[index],
    expanded: !folders[index].expanded,
    updatedAt: new Date().toISOString(),
  };

  persistLocalFolders(folders);
  return folders[index];
}

export function deleteLocalFolder(folderId: string): boolean {
  const folders = loadLocalFolders();
  const next = folders.filter((folder) => folder.id !== folderId);
  if (next.length === folders.length) return false;
  persistLocalFolders(next);
  return true;
}

export function deleteLocalTopic(folderId: string, topicId: string): boolean {
  const folders = loadLocalFolders();
  const index = folders.findIndex((folder) => folder.id === folderId);
  if (index === -1) return false;

  const nextTopics = folders[index].topics.filter((topic) => topic.id !== topicId);
  if (nextTopics.length === folders[index].topics.length) return false;

  folders[index] = {
    ...folders[index],
    topics: nextTopics,
    updatedAt: new Date().toISOString(),
  };

  persistLocalFolders(folders);
  return true;
}
