#!/usr/bin/env node
/**
 * Manual migration runner for environments where `drizzle-kit push` fails
 * (notably Supabase + drizzle-kit 0.31.x, which crashes on introspection
 * of CHECK constraints).
 *
 * Usage:
 *   node scripts/apply-migration.mjs drizzle/0012_coach_sessions.sql
 *   node scripts/apply-migration.mjs drizzle/0012_coach_sessions.sql --dry-run
 *
 * Reads the connection URL from the same env-var resolution order the app
 * uses (SUPABASE_DATABASE_URL → DATABASE_URL → DIRECT_URL → POSTGRES_URL).
 * The migration SQL is executed in a single transaction so partial failures
 * roll back cleanly. Idempotent SQL (CREATE TABLE IF NOT EXISTS) makes
 * re-runs safe.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });
loadEnv();

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!file) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql-file> [--dry-run]');
  process.exit(1);
}

const url = process.env.SUPABASE_DATABASE_URL
  || process.env.DATABASE_URL
  || process.env.DIRECT_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL;

if (!url) {
  console.error('No database URL found. Set SUPABASE_DATABASE_URL or DATABASE_URL.');
  process.exit(1);
}

const sql = readFileSync(resolve(file), 'utf8');
console.log(`[migration] file: ${file}`);
console.log(`[migration] target: ${new URL(url).hostname}`);
console.log(`[migration] mode: ${dryRun ? 'dry-run (rollback)' : 'apply'}`);
console.log('---');
console.log(sql);
console.log('---');

const client = postgres(url, {
  prepare: false,
  max: 1,
  ssl: url.includes('localhost') ? false : 'require',
});

try {
  await client.begin(async (tx) => {
    await tx.unsafe(sql);
    if (dryRun) {
      throw new Error('DRY_RUN_ROLLBACK');
    }
  });
  console.log(dryRun ? '[migration] dry-run completed (rolled back)' : '[migration] applied successfully');
  process.exit(0);
} catch (err) {
  if (err instanceof Error && err.message === 'DRY_RUN_ROLLBACK') {
    console.log('[migration] dry-run completed (rolled back as requested)');
    process.exit(0);
  }
  console.error('[migration] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await client.end();
}
