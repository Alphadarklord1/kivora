import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { getDatabaseSummary, resolveDatabaseUrl } from '@/lib/db/config';
import { users, folders, files, libraryItems, studyPlans } from '@/lib/db/schema';

/**
 * The most recently introduced table in the schema. When this exists in
 * the live database, the schema is considered current; when it's missing,
 * we surface a clear warning telling the operator to apply migrations.
 *
 * Update this whenever a new migration adds a table — it's the single
 * source of truth for "is the schema up to date" without needing the
 * drizzle migrations metadata table (which only exists when using
 * `db:migrate`, not `db:push` — and Kivora's documented workflow uses
 * `db:push`).
 */
const LATEST_EXPECTED_TABLE = 'coach_sessions';

/**
 * Probe whether a given table exists in the public schema. Used to
 * detect schema drift without depending on Drizzle's migration tracking
 * (which is only populated by `db:migrate`).
 */
async function tableExists(name: string): Promise<boolean> {
  try {
    const rows = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${name}
      ) AS "exists"
    `);
    const row = Array.isArray(rows) ? rows[0] : (rows as { rows?: unknown[] }).rows?.[0];
    if (!row || typeof row !== 'object') return false;
    return Boolean((row as { exists?: boolean }).exists);
  } catch {
    return false;
  }
}

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
    const [userCount, folderCount, fileCount, libraryCount, planCount, latestTablePresent] = await Promise.all([
      db.$count(users),
      db.$count(folders),
      db.$count(files),
      db.$count(libraryItems),
      db.$count(studyPlans),
      tableExists(LATEST_EXPECTED_TABLE),
    ]);

    const schemaWarning = latestTablePresent
      ? null
      : `Schema appears stale: expected table "${LATEST_EXPECTED_TABLE}" is missing. Run \`npm run db:push\` (or apply the latest SQL in /drizzle) to bring the schema up to date.`;

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
      schema: {
        latestExpectedTable: LATEST_EXPECTED_TABLE,
        latestTablePresent,
      },
      schemaWarning,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[db/verify] failed', error);
    return NextResponse.json({
      ok: false,
      configured: true,
      reason: 'Database connection failed — check that the host is reachable and that migrations have been applied (npm run db:push).',
      details: error instanceof Error ? error.message : String(error),
      database: dbSummary,
    }, { status: 500 });
  }
}
