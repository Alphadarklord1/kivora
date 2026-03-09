import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const configuredDb = process.env.DATABASE_URL
  ? drizzle(neon(process.env.DATABASE_URL), { schema })
  : null;

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

type ConfiguredDb = NonNullable<typeof configuredDb>;

const missingDb = new Proxy({} as ConfiguredDb, {
  get() {
    throw new Error('DATABASE_URL is not configured. Add it to your environment variables.');
  },
});

export const db: ConfiguredDb = configuredDb ?? missingDb;

export type Database = typeof db;
