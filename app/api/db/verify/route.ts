import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { getDatabaseSummary, resolveDatabaseUrl } from '@/lib/db/config';
import { users, folders, files, libraryItems, studyPlans } from '@/lib/db/schema';

export async function GET() {
  const dbSummary = getDatabaseSummary(resolveDatabaseUrl());

  if (!isDatabaseConfigured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reason: 'Set SUPABASE_DATABASE_URL or DATABASE_URL to connect a database',
      database: dbSummary,
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
      database: dbSummary,
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
      database: dbSummary,
    }, { status: 500 });
  }
}
