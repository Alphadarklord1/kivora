import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type DatabaseInstance = ReturnType<typeof drizzleNeon<typeof schema>>;

const databaseUrl = process.env.DATABASE_URL;

function parseDatabaseUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isNeonUrl(url: string) {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) return false;
  return parsed.hostname.includes('neon.tech');
}

function isLocalPostgresUrl(url: string) {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) return false;
  return ['localhost', '127.0.0.1', '::1', 'db'].includes(parsed.hostname);
}

type GlobalDb = typeof globalThis & {
  __kivoraDb?: DatabaseInstance;
  __kivoraSql?: ReturnType<typeof postgres>;
};

const globalForDb = globalThis as GlobalDb;

function createDatabase(url: string): DatabaseInstance {
  if (isNeonUrl(url)) {
    return drizzleNeon(neon(url), { schema }) as unknown as DatabaseInstance;
  }

  const sql = globalForDb.__kivoraSql ?? postgres(url, {
    prepare: false,
    max: 5,
    ssl: isLocalPostgresUrl(url) ? false : 'require',
  });

  globalForDb.__kivoraSql = sql;
  return drizzlePostgres(sql, { schema }) as unknown as DatabaseInstance;
}

const configuredDb = databaseUrl
  ? (globalForDb.__kivoraDb ?? createDatabase(databaseUrl))
  : null;

if (configuredDb) {
  globalForDb.__kivoraDb = configuredDb;
}

export const isDatabaseConfigured = Boolean(databaseUrl);

type ConfiguredDb = NonNullable<typeof configuredDb>;

const missingDb = new Proxy({} as ConfiguredDb, {
  get() {
    throw new Error('DATABASE_URL is not configured. Add it to your environment variables.');
  },
});

export const db: ConfiguredDb = configuredDb ?? missingDb;

export type Database = typeof db;
