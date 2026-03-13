import { and, eq, lt } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users } from '@/lib/db/schema';

const DEFAULT_STALE_GUEST_HOURS = 24;

export function getGuestCleanupCutoff(hours = DEFAULT_STALE_GUEST_HOURS) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export async function cleanupStaleGuestUsers(hours = DEFAULT_STALE_GUEST_HOURS) {
  if (!isDatabaseConfigured) {
    return { ok: false, deleted: 0, cutoff: getGuestCleanupCutoff(hours), reason: 'DATABASE_NOT_CONFIGURED' as const };
  }

  const cutoff = getGuestCleanupCutoff(hours);
  const deleted = await db
    .delete(users)
    .where(and(eq(users.isGuest, true), lt(users.updatedAt, cutoff)))
    .returning({ id: users.id });

  return {
    ok: true,
    deleted: deleted.length,
    cutoff,
    reason: null as null,
  };
}
