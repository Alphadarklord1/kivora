type DatabaseProvider = 'supabase' | 'neon' | 'local-postgres' | 'postgres';

const DATABASE_URL_KEYS = [
  'SUPABASE_DATABASE_URL',
  'DATABASE_URL',
  'DIRECT_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
] as const;

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  for (const key of DATABASE_URL_KEYS) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function parseDatabaseUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isSupabaseUrl(url: string) {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) return false;
  return parsed.hostname.includes('supabase.co') || parsed.hostname.includes('supabase.com');
}

export function isNeonUrl(url: string) {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) return false;
  return parsed.hostname.includes('neon.tech');
}

export function isLocalPostgresUrl(url: string) {
  const parsed = parseDatabaseUrl(url);
  if (!parsed) return false;
  return ['localhost', '127.0.0.1', '::1', 'db'].includes(parsed.hostname);
}

export function getDatabaseProvider(url: string): DatabaseProvider {
  if (isSupabaseUrl(url)) return 'supabase';
  if (isNeonUrl(url)) return 'neon';
  if (isLocalPostgresUrl(url)) return 'local-postgres';
  return 'postgres';
}

export function getDatabaseSummary(url: string | null) {
  if (!url) {
    return {
      configured: false,
      provider: null,
      hostname: null,
      sourceEnv: null,
    };
  }

  const parsed = parseDatabaseUrl(url);
  return {
    configured: true,
    provider: getDatabaseProvider(url),
    hostname: parsed?.hostname ?? null,
  };
}

export { DATABASE_URL_KEYS };
