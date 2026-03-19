import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/session';
import { uploadFileToSupabaseStorage } from '@/lib/supabase/storage';

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

  if (!folderId) return NextResponse.json({ error: 'folderId is required.' }, { status: 400 });

  const conditions = [
    eq(files.userId, userId),
    eq(files.folderId, folderId),
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

  if (body.upload) {
    try {
      const stored = await uploadFileToSupabaseStorage({
        userId,
        fileId: body.id,
        fileName: body.upload.name || body.name,
        fileData: await body.upload.arrayBuffer(),
        mimeType: body.upload.type || body.mimeType || undefined,
      });
      storageBucket = stored?.bucket ?? null;
      storagePath = stored?.path ?? null;
    } catch (error) {
      console.error('[files] failed to upload to Supabase Storage', error);
    }
  }

  const [file] = await db.insert(files).values({
    id: body.id,
    userId,
    folderId: body.folderId,
    topicId: body.topicId,
    name: body.name.trim(),
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

  return NextResponse.json({ ...file, storageBacked: Boolean(storagePath) }, { status: 201 });
}
