/**
 * lib/api/guard.ts
 *
 * Shared access guard for server-side API routes that consume AI API keys or
 * perform heavy server-side work. Returns a 403 NextResponse if the caller is
 * not allowed, or null if the request should proceed.
 *
 * Access is allowed when ANY of these are true:
 *   - The application is in guest mode (AUTH_GUEST_MODE=1 or AUTH_REQUIRED=0)
 *   - The request carries a valid NextAuth session cookie (authenticated user)
 *   - The request carries the internal desktop auth token header
 *
 * This deliberately stays permissive for local/self-hosted deployments and only
 * locks down when AUTH_REQUIRED=1 is explicitly set in the environment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

const DESKTOP_TOKEN_HEADER = 'x-kivora-desktop-token';

/**
 * Call at the top of any POST/GET handler that uses external AI APIs.
 * Returns a 403 response to send, or null if the caller is allowed.
 */
export async function requireAppAccess(req: NextRequest): Promise<NextResponse | null> {
  // Guest / local / desktop mode — always allow
  if (isGuestModeEnabled()) return null;

  // Desktop app internal token
  const desktopToken = req.headers.get(DESKTOP_TOKEN_HEADER);
  if (desktopToken && desktopToken === process.env.STUDYPILOT_DESKTOP_AUTH_TOKEN) {
    return null;
  }

  // NextAuth session — check for authenticated user
  try {
    const session = await auth();
    if (session?.user) return null;
  } catch {
    // auth() can throw if the DB is not configured — treat as unauthenticated
  }

  return NextResponse.json(
    { error: 'Authentication required. Please sign in to use this feature.' },
    { status: 403 },
  );
}
