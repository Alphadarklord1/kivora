import { headers } from 'next/headers';
import { auth } from '@/auth';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { GUEST_SESSION_HEADER, isGuestSessionId } from '@/lib/auth/guest-session';

const GUEST_USER_ID = 'guest';

/** Returns the authenticated user ID, or 'guest' if in guest mode. */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  if (isGuestModeEnabled()) {
    try {
      const headerStore = await headers();
      const guestSessionId = headerStore.get(GUEST_SESSION_HEADER)?.trim();
      if (isGuestSessionId(guestSessionId)) {
        return `guest:${guestSessionId}`;
      }
    } catch {
      // Ignore header lookup failures and fall back to the legacy guest ID.
    }
    return GUEST_USER_ID;
  }
  return null;
}

export { GUEST_USER_ID };
