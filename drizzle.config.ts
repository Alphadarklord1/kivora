import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './lib/db/config';

loadEnv({ path: '.env.local' });
loadEnv();

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  throw new Error('No database URL is configured. Set SUPABASE_DATABASE_URL or DATABASE_URL before running Drizzle.');
}

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
