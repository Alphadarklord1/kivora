import { NextResponse } from 'next/server';
import { getAuthCapabilities } from '@/lib/auth/capabilities';

export async function GET() {
  const capabilities = getAuthCapabilities();

  return NextResponse.json({
    googleConfigured: capabilities.googleConfigured,
    githubConfigured: capabilities.githubConfigured,
    guestModeEnabled: capabilities.guestModeEnabled,
    authSecretConfigured: capabilities.authSecretConfigured,
    authDisabled: capabilities.authDisabled,
    authDisabledReason: capabilities.authDisabledReason,
    desktopAuthPort: capabilities.desktopAuthPort,
    oauthDisabled: capabilities.oauthDisabled,
    oauthDisabledReason: capabilities.oauthDisabledReason,
  });
}
