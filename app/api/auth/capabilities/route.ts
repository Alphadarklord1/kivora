import { NextResponse } from 'next/server';
import { getAuthCapabilities } from '@/lib/auth/capabilities';
import { isDatabaseConfigured } from '@/lib/db';
import { getSupabaseCapabilitySummary } from '@/lib/supabase/config';

export async function GET() {
  const capabilities = getAuthCapabilities();
  const supabase = getSupabaseCapabilitySummary();

  return NextResponse.json({
    googleConfigured: capabilities.googleConfigured,
    githubConfigured: capabilities.githubConfigured,
    microsoftConfigured: capabilities.microsoftConfigured,
    guestModeEnabled: capabilities.guestModeEnabled,
    authSecretConfigured: capabilities.authSecretConfigured,
    authDisabled: capabilities.authDisabled,
    authDisabledReason: capabilities.authDisabledReason,
    desktopAuthPort: capabilities.desktopAuthPort,
    oauthDisabled: capabilities.oauthDisabled,
    oauthDisabledReason: capabilities.oauthDisabledReason,
    dbConfigured: isDatabaseConfigured,
    supabaseUrlConfigured: supabase.urlConfigured,
    supabaseAnonKeyConfigured: supabase.anonKeyConfigured,
    supabaseServiceRoleConfigured: supabase.serviceRoleConfigured,
    supabaseBrowserConfigured: supabase.browserClientConfigured,
    supabaseAdminConfigured: supabase.adminConfigured,
    supabaseAuthConfigured: supabase.authConfigured,
    supabaseStorageConfigured: supabase.storageConfigured,
    supabaseStorageBucket: supabase.storageBucket,
  });
}
