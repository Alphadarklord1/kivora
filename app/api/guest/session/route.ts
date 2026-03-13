import { NextRequest, NextResponse } from 'next/server';
import { deleteGuestSessionData, GUEST_SESSION_HEADER, isGuestSessionId } from '@/lib/auth/guest-session';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

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

  await deleteGuestSessionData(guestSessionId);
  return NextResponse.json({ ok: true });
}
