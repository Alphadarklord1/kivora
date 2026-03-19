import { NextResponse } from 'next/server';
import { getAuthCapabilities } from '@/lib/auth/capabilities';
import { isDatabaseConfigured } from '@/lib/db';

export async function GET() {
  const capabilities = getAuthCapabilities();

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
  });
}
