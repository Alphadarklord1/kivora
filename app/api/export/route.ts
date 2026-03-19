/**
 * GET /api/export
 * Returns a full JSON dump of all the authenticated user's data.
 * File blobs live in browser IndexedDB and are intentionally excluded.
 */

import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { folders, files, libraryItems, quizAttempts, studyPlans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDatabaseConfigured) {
    // Return minimal offline export
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      userId,
      note: 'Database not configured — only minimal metadata available.',
      folders: [],
      files: [],
      libraryItems: [],
      quizAttempts: [],
      studyPlans: [],
    };
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kivora-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  // Fetch all user data in parallel
  const [
    userFolders,
    userFiles,
    userLibraryItems,
    userQuizAttempts,
    userStudyPlans,
  ] = await Promise.all([
    db.query.folders.findMany({ where: eq(folders.userId, userId) }),
    db.query.files.findMany({ where: eq(files.userId, userId) }),
    db.query.libraryItems.findMany({ where: eq(libraryItems.userId, userId) }),
    db.query.quizAttempts.findMany({ where: eq(quizAttempts.userId, userId) }),
    db.query.studyPlans.findMany({ where: eq(studyPlans.userId, userId) }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    version: '1.0',
    userId,
    note: 'File blobs are stored locally in your browser (IndexedDB) and are not included here. Everything else is included.',
    folders: userFolders,
    files: userFiles.map(f => ({
      ...f,
      // Omit localBlobId — the blob itself is in the user's browser
      localBlobId: '[stored in browser IndexedDB]',
    })),
    libraryItems: userLibraryItems,
    quizAttempts: userQuizAttempts,
    studyPlans: userStudyPlans,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="kivora-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
