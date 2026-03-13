import { db, isDatabaseConfigured } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, or } from 'drizzle-orm';
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';

export const GUEST_SESSION_HEADER = 'x-kivora-guest-session';
export const GUEST_SESSION_STORAGE_KEY = 'kivora_guest_session_id';
export const GUEST_EMAIL_PREFIX = 'guest+';
export const GUEST_EMAIL_DOMAIN = '@local.kivora';
export const LEGACY_SHARED_GUEST_EMAILS = [
  'demo@local.kivora',
  'demo@local.studyharbor',
  'demo@local.studypilot',
];

export function isGuestSessionId(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return uuidValidate(trimmed) || /^[a-z0-9-]{16,128}$/i.test(trimmed);
}

export function guestEmailForSession(sessionId: string): string {
  return `${GUEST_EMAIL_PREFIX}${sessionId.toLowerCase()}${GUEST_EMAIL_DOMAIN}`;
}

export function isGuestEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  return normalized.startsWith(GUEST_EMAIL_PREFIX) && normalized.endsWith(GUEST_EMAIL_DOMAIN)
    || LEGACY_SHARED_GUEST_EMAILS.includes(normalized);
}

export async function resolveGuestUserId(sessionId: string): Promise<string | null> {
  if (!isGuestSessionId(sessionId)) return null;
  if (!isDatabaseConfigured) return `guest:${sessionId}`;

  const guestEmail = guestEmailForSession(sessionId);

  const existing = await db.query.users.findFirst({
    where: eq(users.email, guestEmail),
  });
  if (existing) return existing.id;

  try {
    const guestUserId = uuidv4();
    await db.insert(users).values({
      id: guestUserId,
      email: guestEmail,
      name: 'Guest Session',
      image: null,
    });
    return guestUserId;
  } catch {
    const retry = await db.query.users.findFirst({ where: eq(users.email, guestEmail) });
    return retry?.id ?? null;
  }
}

export async function deleteGuestSessionData(sessionId: string): Promise<boolean> {
  if (!isGuestSessionId(sessionId) || !isDatabaseConfigured) return false;
  const guestEmail = guestEmailForSession(sessionId);
  await db.delete(users).where(eq(users.email, guestEmail));
  return true;
}
