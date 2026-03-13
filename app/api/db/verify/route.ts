import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, folders, files, libraryItems, studyPlans } from '@/lib/db/schema';

export async function GET() {
  if (!isDatabaseConfigured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reason: 'DATABASE_URL is not configured',
    }, { status: 503 });
  }

  try {
    const [userCount, folderCount, fileCount, libraryCount, planCount] = await Promise.all([
      db.$count(users),
      db.$count(folders),
      db.$count(files),
      db.$count(libraryItems),
      db.$count(studyPlans),
    ]);

    return NextResponse.json({
      ok: true,
      configured: true,
      counts: {
        users: userCount,
        folders: folderCount,
        files: fileCount,
        libraryItems: libraryCount,
        studyPlans: planCount,
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[db/verify] failed', error);
    return NextResponse.json({
      ok: false,
      configured: true,
      reason: 'Database connection failed',
    }, { status: 500 });
  }
}
