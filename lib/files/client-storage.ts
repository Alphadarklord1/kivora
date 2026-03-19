import { idbStore } from '@/lib/idb';

export async function fetchStoredFileBlob(fileId: string): Promise<Blob | null> {
  const response = await fetch(`/api/files/${fileId}/blob`);
  if (!response.ok) return null;
  return response.blob();
}

export async function resolveStoredFileBlob(file: {
  id: string;
  localBlobId?: string | null;
}): Promise<Blob | null> {
  if (file.localBlobId) {
    const payload = await idbStore.get(file.localBlobId).catch(() => undefined);
    if (payload?.blob) return payload.blob;
  }

  return fetchStoredFileBlob(file.id);
}

export async function createFileUploadRequest(params: {
  id: string;
  folderId: string;
  topicId?: string | null;
  name: string;
  type: string;
  localBlobId?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  file?: File | null;
  content?: string | null;
}) {
  const formData = new FormData();
  formData.set('id', params.id);
  formData.set('folderId', params.folderId);
  if (params.topicId) formData.set('topicId', params.topicId);
  formData.set('name', params.name);
  formData.set('type', params.type);
  if (params.localBlobId) formData.set('localBlobId', params.localBlobId);
  if (params.mimeType) formData.set('mimeType', params.mimeType);
  if (typeof params.fileSize === 'number') formData.set('fileSize', String(params.fileSize));
  if (typeof params.content === 'string') formData.set('content', params.content);
  if (params.file) formData.set('file', params.file, params.file.name);

  return fetch('/api/files', {
    method: 'POST',
    body: formData,
  });
}

export async function createFileReplaceRequest(params: {
  fileId: string;
  localBlobId?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  file?: File | null;
}) {
  const formData = new FormData();
  if (params.localBlobId) formData.set('localBlobId', params.localBlobId);
  if (typeof params.fileSize === 'number') formData.set('fileSize', String(params.fileSize));
  if (params.mimeType) formData.set('mimeType', params.mimeType);
  if (params.file) formData.set('file', params.file, params.file.name);

  return fetch(`/api/files/${params.fileId}`, {
    method: 'PATCH',
    body: formData,
  });
}
