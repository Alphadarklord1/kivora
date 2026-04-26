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
  // Only introspect the `public` schema. Supabase ships several reserved
  // schemas (auth, storage, realtime, vault, extensions, graphql) whose
  // CHECK constraints trip a drizzle-kit 0.31.x bug during `db:push`. We
  // never want to manage those tables anyway.
  schemaFilter: ['public'],
});
