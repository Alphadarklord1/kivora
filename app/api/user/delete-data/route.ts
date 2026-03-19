/**
 * DELETE /api/user/delete-data
 * Permanently deletes ALL data for the authenticated user:
 *   folders, files, library items, quiz attempts, study plans.
 *   The user record itself is also deleted, which cascades to sessions/accounts.
 *
 * File blobs in browser IndexedDB must be cleared client-side (handled by the UI).
 */

import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import {
  folders,
  files,
  libraryItems,
  quizAttempts,
  studyPlans,
  users,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

export async function DELETE() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured) {
    return NextResponse.json({ ok: true, note: 'No database configured — nothing to delete server-side.' });
  }

  // Delete in dependency order (children first, then parent)
  await Promise.all([
    db.delete(quizAttempts).where(eq(quizAttempts.userId, userId)),
    db.delete(studyPlans).where(eq(studyPlans.userId, userId)),
    db.delete(libraryItems).where(eq(libraryItems.userId, userId)),
  ]);

  // Files and folders (files reference folders)
  await db.delete(files).where(eq(files.userId, userId));
  await db.delete(folders).where(eq(folders.userId, userId));

  // Finally delete the user — cascades to sessions, accounts, userSettings
  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
