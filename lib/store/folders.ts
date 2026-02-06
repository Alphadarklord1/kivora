'use client';

import { useState, useEffect } from 'react';

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

  useEffect(() => {
    Promise.all([
      fetch('/api/folders', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/topics', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/files', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ])
      .then(([f, t, fi]) => {
        setFolders(Array.isArray(f) ? f : []);
        setTopics(Array.isArray(t) ? t : []);
        setFiles(Array.isArray(fi) ? fi : []);
      })
      .catch(() => {});
  }, []);

  return { folders, topics, files };
}
