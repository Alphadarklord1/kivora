import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getSupabaseStorageBucket, isSupabaseStorageConfigured } from '@/lib/supabase/config';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'file';
}

export function buildSupabaseStoragePath(userId: string, fileId: string, fileName: string): string {
  const extension = sanitizeFileName(fileName).split('.').pop();
  return extension && extension !== 'file'
    ? `${userId}/${fileId}.${extension}`
    : `${userId}/${fileId}`;
}

export async function uploadFileToSupabaseStorage(params: {
  userId: string;
  fileId: string;
  fileName: string;
  fileData: ArrayBuffer;
  mimeType?: string | null;
}): Promise<{ bucket: string; path: string } | null> {
  if (!isSupabaseStorageConfigured()) return null;

  const client = createSupabaseAdminClient();
  if (!client) return null;

  const bucket = getSupabaseStorageBucket();
  const path = buildSupabaseStoragePath(params.userId, params.fileId, params.fileName);
  const contentType = params.mimeType || 'application/octet-stream';

  const { error } = await client.storage
    .from(bucket)
    .upload(path, params.fileData, { upsert: true, contentType });

  if (error) {
    throw new Error(error.message || 'Failed to upload file to Supabase Storage');
  }

  return { bucket, path };
}

export async function downloadFileFromSupabaseStorage(bucket: string, path: string): Promise<Blob | null> {
  if (!isSupabaseStorageConfigured()) return null;

  const client = createSupabaseAdminClient();
  if (!client) return null;

  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    return null;
  }

  return data;
}

export async function deleteFileFromSupabaseStorage(bucket: string, path: string): Promise<void> {
  if (!isSupabaseStorageConfigured()) return;

  const client = createSupabaseAdminClient();
  if (!client) return;

  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(error.message || 'Failed to delete file from Supabase Storage');
  }
}
