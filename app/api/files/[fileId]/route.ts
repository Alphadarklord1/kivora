import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/session';
import { deleteFileFromSupabaseStorage, uploadFileToSupabaseStorage } from '@/lib/supabase/storage';

async function parsePatchBody(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const upload = formData.get('file');
    return {
      name: typeof formData.get('name') === 'string' ? String(formData.get('name')) : undefined,
      content: typeof formData.get('content') === 'string' ? String(formData.get('content')) : undefined,
      liked: typeof formData.get('liked') === 'string' ? formData.get('liked') === 'true' : undefined,
      pinned: typeof formData.get('pinned') === 'string' ? formData.get('pinned') === 'true' : undefined,
      localBlobId: typeof formData.get('localBlobId') === 'string' ? String(formData.get('localBlobId')) : undefined,
      mimeType: typeof formData.get('mimeType') === 'string' ? String(formData.get('mimeType')) : undefined,
      fileSize: typeof formData.get('fileSize') === 'string' ? Number(formData.get('fileSize')) : undefined,
      upload: upload instanceof File ? upload : null,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    name: typeof body.name === 'string' ? body.name : undefined,
    content: typeof body.content === 'string' ? body.content : undefined,
    liked: typeof body.liked === 'boolean' ? body.liked : undefined,
    pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
    localBlobId: typeof body.localBlobId === 'string' ? body.localBlobId : undefined,
    mimeType: typeof body.mimeType === 'string' ? body.mimeType : undefined,
    fileSize: typeof body.fileSize === 'number' ? body.fileSize : undefined,
    upload: null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { fileId } = await params;
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });
  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  return NextResponse.json(file);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { fileId } = await params;
  const existing = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });
  if (!existing) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

  const body = await parsePatchBody(req);
  const updates: Partial<typeof files.$inferInsert> = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.content === 'string') updates.content = body.content;
  if (typeof body.liked === 'boolean') updates.liked = body.liked;
  if (typeof body.pinned === 'boolean') updates.pinned = body.pinned;
  if (typeof body.localBlobId === 'string') updates.localBlobId = body.localBlobId;
  if (typeof body.fileSize === 'number') updates.fileSize = body.fileSize;
  if (typeof body.mimeType === 'string') updates.mimeType = body.mimeType;

  if (body.upload) {
    try {
      const stored = await uploadFileToSupabaseStorage({
        userId,
        fileId,
        fileName: body.upload.name || existing.name,
        fileData: await body.upload.arrayBuffer(),
        mimeType: body.upload.type || body.mimeType || existing.mimeType || undefined,
      });
      updates.storageProvider = stored ? 'supabase' : existing.storageProvider;
      updates.storageBucket = stored?.bucket ?? existing.storageBucket;
      updates.storagePath = stored?.path ?? existing.storagePath;
      updates.storageUploadedAt = stored ? new Date() : existing.storageUploadedAt;
      updates.mimeType = body.upload.type || body.mimeType || existing.mimeType;
      updates.fileSize = body.upload.size || body.fileSize || existing.fileSize;
    } catch (error) {
      console.error('[files] failed to replace Supabase storage object', error);
    }
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(files)
    .set(updates)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { fileId } = await params;
  const existing = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });

  if (existing?.storageBucket && existing.storagePath) {
    try {
      await deleteFileFromSupabaseStorage(existing.storageBucket, existing.storagePath);
    } catch (error) {
      console.error('[files] failed to delete Supabase storage object', error);
    }
  }

  await db.delete(files).where(and(eq(files.id, fileId), eq(files.userId, userId)));
  return NextResponse.json({ ok: true });
}
