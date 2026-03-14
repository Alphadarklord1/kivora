import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { isDatabaseConfigured } from '@/lib/db';
import {
  canPersistRagIndexesForUser,
  deletePersistedRagIndex,
  ensureOwnedFile,
  getPersistedRagIndex,
  upsertPersistedRagIndex,
} from '@/lib/rag/server-index-store';

function disabledResponse() {
  return NextResponse.json({ persisted: false });
}

async function resolvePersistableUser(request: NextRequest) {
  if (!isDatabaseConfigured) return null;
  const userId = await getUserId(request);
  if (!userId) return null;
  const canPersist = await canPersistRagIndexesForUser(userId);
  return canPersist ? userId : null;
}

export async function GET(request: NextRequest) {
  const userId = await resolvePersistableUser(request);
  if (!userId) return disabledResponse();

  const fileId = new URL(request.url).searchParams.get('fileId');
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  if (!(await ensureOwnedFile(userId, fileId))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const index = await getPersistedRagIndex(userId, fileId);
  return NextResponse.json({ persisted: Boolean(index), index: index ?? null });
}

export async function POST(request: NextRequest) {
  const userId = await resolvePersistableUser(request);
  if (!userId) return disabledResponse();

  const body = await request.json().catch(() => null) as {
    fileId?: string;
    text?: string;
  } | null;

  if (!body?.fileId || !body?.text?.trim()) {
    return NextResponse.json({ error: 'fileId and text are required' }, { status: 400 });
  }

  if (!(await ensureOwnedFile(userId, body.fileId))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const index = await upsertPersistedRagIndex(userId, body.fileId, body.text.trim());
  return NextResponse.json({ persisted: true, index });
}

export async function DELETE(request: NextRequest) {
  const userId = await resolvePersistableUser(request);
  if (!userId) return disabledResponse();

  const fileId = new URL(request.url).searchParams.get('fileId');
  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  if (!(await ensureOwnedFile(userId, fileId))) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  await deletePersistedRagIndex(userId, fileId);
  return NextResponse.json({ persisted: true, deleted: true });
}
