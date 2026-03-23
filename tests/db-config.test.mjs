import test from 'node:test';
import assert from 'node:assert/strict';

const {
  resolveDatabaseUrl,
  isSupabaseUrl,
  isNeonUrl,
  isLocalPostgresUrl,
  getDatabaseProvider,
  getDatabaseSummary,
  DATABASE_URL_KEYS,
} = await import('../lib/db/config.ts');

// ── resolveDatabaseUrl ────────────────────────────────────────────────────────

test('resolveDatabaseUrl returns null when no env vars set', () => {
  assert.equal(resolveDatabaseUrl({}), null);
});

test('resolveDatabaseUrl picks SUPABASE_DATABASE_URL first', () => {
  const env = {
    SUPABASE_DATABASE_URL: 'postgres://supabase',
    DATABASE_URL: 'postgres://other',
  };
  assert.equal(resolveDatabaseUrl(env), 'postgres://supabase');
});

test('resolveDatabaseUrl falls through to DATABASE_URL', () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: 'postgres://db' }), 'postgres://db');
});

test('resolveDatabaseUrl falls through to DIRECT_URL', () => {
  assert.equal(resolveDatabaseUrl({ DIRECT_URL: 'postgres://direct' }), 'postgres://direct');
});

test('resolveDatabaseUrl falls through to POSTGRES_URL', () => {
  assert.equal(resolveDatabaseUrl({ POSTGRES_URL: 'postgres://pg' }), 'postgres://pg');
});

test('resolveDatabaseUrl falls through to POSTGRES_PRISMA_URL', () => {
  assert.equal(resolveDatabaseUrl({ POSTGRES_PRISMA_URL: 'postgres://prisma' }), 'postgres://prisma');
});

test('resolveDatabaseUrl trims whitespace', () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: '  postgres://trimmed  ' }), 'postgres://trimmed');
});

test('resolveDatabaseUrl skips empty strings', () => {
  assert.equal(resolveDatabaseUrl({ DATABASE_URL: '', POSTGRES_URL: 'postgres://pg' }), 'postgres://pg');
});

test('DATABASE_URL_KEYS has 5 entries in priority order', () => {
  assert.equal(DATABASE_URL_KEYS[0], 'SUPABASE_DATABASE_URL');
  assert.equal(DATABASE_URL_KEYS.length, 5);
});

// ── isSupabaseUrl ─────────────────────────────────────────────────────────────

test('isSupabaseUrl true for supabase.co', () => {
  assert.equal(isSupabaseUrl('postgresql://user:pass@db.abc123.supabase.co:5432/postgres'), true);
});

test('isSupabaseUrl true for supabase.com', () => {
  assert.equal(isSupabaseUrl('postgresql://user:pass@db.abc123.supabase.com:5432/postgres'), true);
});

test('isSupabaseUrl false for neon.tech', () => {
  assert.equal(isSupabaseUrl('postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/db'), false);
});

test('isSupabaseUrl false for localhost', () => {
  assert.equal(isSupabaseUrl('postgresql://user:pass@localhost:5432/db'), false);
});

test('isSupabaseUrl false for malformed string', () => {
  assert.equal(isSupabaseUrl('not-a-url'), false);
});

// ── isNeonUrl ─────────────────────────────────────────────────────────────────

test('isNeonUrl true for neon.tech', () => {
  assert.equal(isNeonUrl('postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/db'), true);
});

test('isNeonUrl false for supabase', () => {
  assert.equal(isNeonUrl('postgresql://user:pass@db.abc.supabase.co/postgres'), false);
});

test('isNeonUrl false for localhost', () => {
  assert.equal(isNeonUrl('postgresql://user:pass@localhost:5432/db'), false);
});

// ── isLocalPostgresUrl ────────────────────────────────────────────────────────

test('isLocalPostgresUrl true for localhost', () => {
  assert.equal(isLocalPostgresUrl('postgresql://user:pass@localhost:5432/db'), true);
});

test('isLocalPostgresUrl true for 127.0.0.1', () => {
  assert.equal(isLocalPostgresUrl('postgresql://user:pass@127.0.0.1:5432/db'), true);
});

test('isLocalPostgresUrl true for docker "db" hostname', () => {
  assert.equal(isLocalPostgresUrl('postgresql://user:pass@db:5432/db'), true);
});

test('isLocalPostgresUrl false for remote url', () => {
  assert.equal(isLocalPostgresUrl('postgresql://user:pass@db.abc.supabase.co/db'), false);
});

// ── getDatabaseProvider ───────────────────────────────────────────────────────

test('getDatabaseProvider returns "supabase" for supabase urls', () => {
  assert.equal(getDatabaseProvider('postgresql://user:pass@db.abc.supabase.co/postgres'), 'supabase');
});

test('getDatabaseProvider returns "neon" for neon urls', () => {
  assert.equal(getDatabaseProvider('postgresql://user:pass@ep-xxx.neon.tech/db'), 'neon');
});

test('getDatabaseProvider returns "local-postgres" for localhost', () => {
  assert.equal(getDatabaseProvider('postgresql://user:pass@localhost:5432/db'), 'local-postgres');
});

test('getDatabaseProvider returns "postgres" for generic remote url', () => {
  assert.equal(getDatabaseProvider('postgresql://user:pass@mydb.example.com:5432/db'), 'postgres');
});

// ── getDatabaseSummary ────────────────────────────────────────────────────────

test('getDatabaseSummary returns configured:false for null url', () => {
  const s = getDatabaseSummary(null);
  assert.equal(s.configured, false);
  assert.equal(s.provider, null);
  assert.equal(s.hostname, null);
});

test('getDatabaseSummary returns configured:true with provider for valid url', () => {
  const s = getDatabaseSummary('postgresql://user:pass@localhost:5432/db');
  assert.equal(s.configured, true);
  assert.equal(s.provider, 'local-postgres');
  assert.equal(s.hostname, 'localhost');
});
