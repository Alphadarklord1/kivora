import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/session';
import { uploadFileToSupabaseStorage } from '@/lib/supabase/storage';

// Allowed mime types for uploaded study materials
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/** Strip path traversal and null bytes from a filename */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\]/g, '_')   // no path separators
    .replace(/\.\./g, '_')    // no parent-dir traversal
    .replace(/\0/g, '')       // no null bytes
    .trim()
    .slice(0, 255);           // max 255 chars
}

async function parseCreateBody(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const upload = formData.get('file');

    return {
      id: typeof formData.get('id') === 'string' ? String(formData.get('id')) : uuidv4(),
      folderId: typeof formData.get('folderId') === 'string' ? String(formData.get('folderId')) : null,
      topicId: typeof formData.get('topicId') === 'string' ? String(formData.get('topicId')) : null,
      name: typeof formData.get('name') === 'string' ? String(formData.get('name')) : null,
      type: typeof formData.get('type') === 'string' ? String(formData.get('type')) : null,
      content: typeof formData.get('content') === 'string' ? String(formData.get('content')) : null,
      localBlobId: typeof formData.get('localBlobId') === 'string' ? String(formData.get('localBlobId')) : null,
      mimeType: typeof formData.get('mimeType') === 'string' ? String(formData.get('mimeType')) : null,
      fileSize: typeof formData.get('fileSize') === 'string' ? Number(formData.get('fileSize')) : null,
      upload: upload instanceof File ? upload : null,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    id: typeof body.id === 'string' ? body.id : uuidv4(),
    folderId: typeof body.folderId === 'string' ? body.folderId : null,
    topicId: typeof body.topicId === 'string' ? body.topicId : null,
    name: typeof body.name === 'string' ? body.name : null,
    type: typeof body.type === 'string' ? body.type : null,
    content: typeof body.content === 'string' ? body.content : null,
    localBlobId: typeof body.localBlobId === 'string' ? body.localBlobId : null,
    mimeType: typeof body.mimeType === 'string' ? body.mimeType : null,
    fileSize: typeof body.fileSize === 'number' ? body.fileSize : null,
    upload: null,
  };
}

export async function GET(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  const topicId = searchParams.get('topicId');
  const all = searchParams.get('all') === 'true';

  if (!all && !folderId) return NextResponse.json({ error: 'folderId is required.' }, { status: 400 });

  const conditions = all
    ? [eq(files.userId, userId)]
    : [
        eq(files.userId, userId),
        eq(files.folderId, folderId!),
        ...(topicId ? [eq(files.topicId, topicId)] : []),
      ];

  const rows = await db.query.files.findMany({
    where: and(...conditions),
    orderBy: [desc(files.createdAt)],
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const body = await parseCreateBody(req);
  if (!body.folderId || !body.name || !body.type) {
    return NextResponse.json({ error: 'folderId, name, and type are required.' }, { status: 400 });
  }

  let storageBucket: string | null = null;
  let storagePath: string | null = null;
  let storageWarning = false;

  if (body.upload) {
    // Validate file size
    if (body.upload.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum allowed size is 100 MB.' }, { status: 413 });
    }
    // Validate mime type
    const mimeType = body.upload.type || body.mimeType || '';
    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: `File type "${mimeType}" is not supported.` }, { status: 415 });
    }
    // Sanitize filename
    const safeFileName = sanitizeFilename(body.upload.name || body.name || 'upload');

    let storageError = false;
    try {
      const stored = await uploadFileToSupabaseStorage({
        userId,
        fileId: body.id,
        fileName: safeFileName,
        fileData: await body.upload.arrayBuffer(),
        mimeType: mimeType || undefined,
      });
      storageBucket = stored?.bucket ?? null;
      storagePath = stored?.path ?? null;
    } catch (error) {
      console.error('[files] failed to upload to Supabase Storage', error);
      storageWarning = true;
    }
  }

  const [file] = await db.insert(files).values({
    id: body.id,
    userId,
    folderId: body.folderId,
    topicId: body.topicId,
    name: sanitizeFilename(body.name.trim()),
    type: body.type,
    content: body.content,
    localBlobId: body.localBlobId,
    mimeType: body.upload?.type || body.mimeType,
    fileSize: body.upload?.size || body.fileSize,
    storageProvider: storagePath ? 'supabase' : null,
    storageBucket,
    storagePath,
    storageUploadedAt: storagePath ? new Date() : null,
  }).returning();

  return NextResponse.json({
    ...file,
    storageBacked: Boolean(storagePath),
    storageWarning: storageWarning ? 'File saved locally but cloud sync failed. It will sync when connection is restored.' : undefined,
  }, { status: 201 });
}
