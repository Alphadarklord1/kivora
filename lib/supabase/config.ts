import { resolveDatabaseUrl } from '@/lib/db/config';

function deriveSupabaseUrlFromDatabaseUrl(): string | null {
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) return null;

  try {
    const parsed = new URL(databaseUrl);
    const host = parsed.hostname;
    const match = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (!match) return null;
    return `https://${match[1]}.supabase.co`;
  } catch {
    return null;
  }
}

export function getSupabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? deriveSupabaseUrlFromDatabaseUrl();
}

export function getSupabaseAnonKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null;
}

export function getSupabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export function getSupabaseStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'kivora-files';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseServiceRoleKey());
}

export function isSupabaseStorageConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(getSupabaseStorageBucket());
}

export function isSupabaseAuthConfigured(): boolean {
  return isSupabaseConfigured();
}
