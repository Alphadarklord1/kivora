import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { files } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/session';
import { downloadFileFromSupabaseStorage } from '@/lib/supabase/storage';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { fileId } = await params;
  const file = await db.query.files.findFirst({
    where: and(eq(files.id, fileId), eq(files.userId, userId)),
  });

  if (!file) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  if (!file.storageBucket || !file.storagePath) {
    return NextResponse.json({ error: 'Remote file storage not available.' }, { status: 404 });
  }

  const blob = await downloadFileFromSupabaseStorage(file.storageBucket, file.storagePath);
  if (!blob) {
    return NextResponse.json({ error: 'Could not download the file from storage.' }, { status: 404 });
  }

  return new NextResponse(await blob.arrayBuffer(), {
    headers: {
      'Content-Type': file.mimeType || blob.type || 'application/octet-stream',
      'Content-Length': String(blob.size),
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.name)}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
}
