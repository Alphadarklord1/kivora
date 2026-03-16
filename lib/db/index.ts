import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { isLocalPostgresUrl, isNeonUrl, resolveDatabaseUrl } from './config';

type DatabaseInstance = ReturnType<typeof drizzleNeon<typeof schema>>;

const databaseUrl = resolveDatabaseUrl();

type GlobalDb = typeof globalThis & {
  __kivoraDb?: DatabaseInstance;
  __kivoraSql?: ReturnType<typeof postgres>;
  __kivoraDbUrl?: string;
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
  ? (globalForDb.__kivoraDbUrl === databaseUrl && globalForDb.__kivoraDb
      ? globalForDb.__kivoraDb
      : createDatabase(databaseUrl))
  : null;

if (configuredDb && databaseUrl) {
  globalForDb.__kivoraDb = configuredDb;
  globalForDb.__kivoraDbUrl = databaseUrl;
}

export const isDatabaseConfigured = Boolean(databaseUrl);

type ConfiguredDb = NonNullable<typeof configuredDb>;

const missingDb = new Proxy({} as ConfiguredDb, {
  get() {
    throw new Error('No database URL is configured. Set SUPABASE_DATABASE_URL or DATABASE_URL in your environment.');
  },
});

export const db: ConfiguredDb = configuredDb ?? missingDb;

export type Database = typeof db;
