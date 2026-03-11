import { auth } from '@/auth';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

const GUEST_USER_ID = 'guest';

/** Returns the authenticated user ID, or 'guest' if in guest mode. */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  if (isGuestModeEnabled()) return GUEST_USER_ID;
  return null;
}

export { GUEST_USER_ID };
