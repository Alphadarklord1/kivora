/**
 * lib/api/guard.ts
 *
 * Shared access guard for server-side API routes that consume AI API keys or
 * perform heavy server-side work. Returns a 403/400 NextResponse if the caller
 * is not allowed, or null if the request should proceed.
 *
 * Access is allowed when ANY of these are true:
 *   - The application is in guest mode (AUTH_GUEST_MODE=1 or AUTH_REQUIRED=0)
 *   - The request carries a valid NextAuth session cookie (authenticated user)
 *   - The request carries the internal desktop auth token header
 *
 * Additionally enforces:
 *   - Origin check — rejects cross-origin requests from unknown domains
 *   - Request body size cap — rejects payloads over MAX_BODY_BYTES
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { auth } from '@/auth';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

const DESKTOP_TOKEN_HEADER = 'x-kivora-desktop-token';

/** Max request body allowed for AI routes (100 KB). Prevents token-burning via huge payloads. */
const MAX_BODY_BYTES = 100 * 1024;

/** Allowed origins. Requests from other origins are rejected. */
const ALLOWED_ORIGINS: string[] = [
  process.env.NEXT_PUBLIC_APP_URL ?? '',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'app://kivora', // Electron renderer
].filter(Boolean);

function getRequestOrigin(req: NextRequest): string | null {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  if (!host) return null;
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(/:$/, '');
  return `${proto}://${host}`;
}

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  // Non-browser requests (server-to-server, Electron, CLI) have no origin — allow
  if (!origin) return true;
  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin && origin === requestOrigin) return true;
  return ALLOWED_ORIGINS.some(allowed => origin === allowed);
}

function isBodyTooLarge(req: NextRequest): boolean {
  const contentLength = req.headers.get('content-length');
  if (!contentLength) return false;
  return parseInt(contentLength, 10) > MAX_BODY_BYTES;
}

/**
 * Call at the top of any POST/GET handler that uses external AI APIs.
 * Returns a response to send, or null if the caller is allowed.
 */
export async function requireAppAccess(req: NextRequest): Promise<NextResponse | null> {
  // Reject oversized bodies before doing any auth work
  if (isBodyTooLarge(req)) {
    return NextResponse.json(
      { error: 'Request body too large.' },
      { status: 413 },
    );
  }

  // Reject unknown origins (CSRF / external script protection)
  if (!isOriginAllowed(req)) {
    return NextResponse.json(
      { error: 'Origin not allowed.' },
      { status: 403 },
    );
  }

  // Guest / local / desktop mode — always allow
  if (isGuestModeEnabled()) return null;

  // Desktop app internal token — timing-safe comparison to prevent oracle attacks
  const desktopToken = req.headers.get(DESKTOP_TOKEN_HEADER);
  const envToken = process.env.KIVORA_DESKTOP_AUTH_TOKEN || process.env.STUDYPILOT_DESKTOP_AUTH_TOKEN;
  if (desktopToken && envToken) {
    try {
      const a = Buffer.from(desktopToken);
      const b = Buffer.from(envToken);
      if (a.length === b.length && timingSafeEqual(a, b)) return null;
    } catch { /* length mismatch — fall through */ }
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
