import { NextRequest, NextResponse } from 'next/server';
import { deleteGuestSessionData, GUEST_SESSION_HEADER, isGuestSessionId } from '@/lib/auth/guest-session';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { isDatabaseConfigured } from '@/lib/db';

/**
 * GET /api/guest/session
 *
 * Reports the current guest session's persistence state. The client uses
 * this on app load to decide whether to show a "your session won't persist"
 * banner — true when the DB is unreachable and we're falling back to a
 * synthetic `guest:{sessionId}` user.
 */
export async function GET(request: NextRequest) {
  const guestModeEnabled = isGuestModeEnabled();
  const sessionId = request.headers.get(GUEST_SESSION_HEADER)?.trim() || null;
  const sessionIdValid = isGuestSessionId(sessionId);
  const persistent = guestModeEnabled && isDatabaseConfigured && sessionIdValid;

  return NextResponse.json({
    guestModeEnabled,
    databaseConfigured: isDatabaseConfigured,
    sessionIdProvided: Boolean(sessionId),
    sessionIdValid,
    persistent,
    mode: persistent ? 'persistent' : 'ephemeral',
    warning: !persistent && guestModeEnabled
      ? 'Working in temporary mode — your session will not persist across reloads. Sign in to save your work.'
      : undefined,
  });
}

export async function POST(request: NextRequest) {
  if (!isGuestModeEnabled()) {
    return NextResponse.json({ ok: false, reason: 'Guest mode is disabled' }, { status: 403 });
  }

  let guestSessionId = request.headers.get(GUEST_SESSION_HEADER)?.trim() || null;

  if (!guestSessionId) {
    try {
      const body = await request.json();
      if (body && typeof body.guestSessionId === 'string') {
        guestSessionId = body.guestSessionId.trim();
      }
    } catch {
      // Ignore invalid cleanup payloads.
    }
  }

  if (!isGuestSessionId(guestSessionId)) {
    return NextResponse.json({ ok: false, reason: 'Invalid guest session' }, { status: 400 });
  }

  try {
    await deleteGuestSessionData(guestSessionId);
  } catch {
    // Local guest cleanup should still succeed even if the remote DB is unavailable.
  }
  return NextResponse.json({ ok: true });
}
