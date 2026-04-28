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

/**
 * Reusable body-size guard for non-AI mutation routes that don't need full
 * origin/auth gating (e.g., register, password-change — these have their own
 * rate limiters and run before a session exists). Cap defaults to 32 KB
 * because the bodies they accept are tiny (email + password + name).
 *
 * Returns a 413 response if too large, or null to proceed.
 */
export function enforceBodyCap(req: NextRequest, maxBytes = 32 * 1024): NextResponse | null {
  const contentLength = req.headers.get('content-length');
  if (!contentLength) return null;
  if (parseInt(contentLength, 10) > maxBytes) {
    return NextResponse.json({ error: 'Request body too large.' }, { status: 413 });
  }
  return null;
}

/** Allowed origins. Requests from other origins are rejected. */
function buildAllowedOrigins(): string[] {
  const list: string[] = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'app://kivora', // Electron renderer
  ];
  if (process.env.NEXT_PUBLIC_APP_URL) {
    list.push(process.env.NEXT_PUBLIC_APP_URL);
  }
  // Vercel auto-injects these — covers prod + every preview deployment without
  // a per-env-var. Both are hostnames without protocol; the Origin header
  // always includes https://, so we prepend it.
  if (process.env.VERCEL_URL) {
    list.push(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    list.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return list;
}

const ALLOWED_ORIGINS = buildAllowedOrigins();

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  // Non-browser requests (server-to-server, Electron, CLI) have no origin — allow
  if (!origin) return true;
  // Exact match only. Earlier `startsWith` allowed e.g. "http://localhost:3000.evil.com"
  // to match an entry of "http://localhost:3000".
  return ALLOWED_ORIGINS.includes(origin);
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
  const envToken = process.env.KIVORA_DESKTOP_AUTH_TOKEN;
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
