import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, files } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import { deleteFileFromSupabaseStorage } from '@/lib/supabase/storage';

// PATCH /api/folders/[folderId] — rename or update a folder
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId } = await params;
  const { name, expanded } = await req.json().catch(() => ({}));
  const updates: Partial<typeof folders.$inferInsert> = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof expanded === 'boolean') updates.expanded = expanded;
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

  const [updated] = await db
    .update(folders)
    .set(updates)
    .where(and(eq(folders.id, folderId), eq(folders.userId, userId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 });
  return NextResponse.json(updated);
}

// DELETE /api/folders/[folderId]
//
// The Postgres FK on files.folderId cascades the metadata rows when the
// folder is dropped, but the file blobs live in two places that the DB
// can't reach: the user's IndexedDB store, and (optionally) Supabase
// Storage. This handler now:
//   1. Reads the localBlobId + storage path of every file in the folder
//      BEFORE the cascade fires.
//   2. Best-effort deletes any Supabase blobs server-side.
//   3. Returns the list of localBlobIds so the client can sweep
//      IndexedDB after the DELETE completes.
//
// Returning the list (rather than trying to clean IndexedDB ourselves —
// we can't, it lives in the browser) is the only way to keep the two
// stores in sync without leaking blobs.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ folderId: string }> }) {
  if (!isDatabaseConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const { folderId } = await params;

  // Snapshot the contained files before the cascade fires.
  const containedFiles = await db
    .select({
      localBlobId: files.localBlobId,
      storageBucket: files.storageBucket,
      storagePath: files.storagePath,
    })
    .from(files)
    .where(and(eq(files.folderId, folderId), eq(files.userId, userId)));

  // Best-effort Supabase cleanup. Failures here shouldn't block the
  // folder delete — orphaned objects in Storage are recoverable but
  // hanging onto them isn't ideal.
  await Promise.all(
    containedFiles
      .filter((f) => f.storageBucket && f.storagePath)
      .map((f) =>
        deleteFileFromSupabaseStorage(f.storageBucket as string, f.storagePath as string).catch(
          (err) => {
            console.warn('[folders/delete] Supabase cleanup failed', {
              bucket: f.storageBucket,
              path: f.storagePath,
              error: err instanceof Error ? err.message : String(err),
            });
          },
        ),
      ),
  );

  await db.delete(folders).where(and(eq(folders.id, folderId), eq(folders.userId, userId)));

  // Hand the client the localBlobIds so it can sweep IndexedDB. The
  // existing DELETE /api/files/[id] handler returns nothing, so callers
  // that delete files individually use the file record they already
  // hold. For folder cascade we have to surface this list.
  const localBlobIds = containedFiles
    .map((f) => f.localBlobId)
    .filter((id): id is string => Boolean(id));

  return NextResponse.json({ ok: true, localBlobIds, fileCount: containedFiles.length });
}
