import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { hasValidTwoFactorSession, TWO_FACTOR_COOKIE_NAME } from '@/lib/auth/two-factor';

export const DEMO_USER_EMAIL = 'demo@local.studyharbor';
export const LEGACY_DEMO_USER_EMAIL = 'demo@local.studypilot';
export const DEMO_USER_NAME = 'Local Demo';

export function isDemoGuestEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  return normalized === DEMO_USER_EMAIL || normalized === LEGACY_DEMO_USER_EMAIL;
}

/**
 * Extract userId from JWT token, with guest-mode bootstrap support.
 * Shared across all API routes for consistent auth behavior.
 */
export async function getUserId(
  request: NextRequest,
  options?: { allowUnverifiedTwoFactor?: boolean }
): Promise<string | null> {
  // Try JWT token first
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    const tokenUserId = (token?.id || token?.sub) as string | undefined;
    if (tokenUserId) {
      if (!isDatabaseConfigured) {
        return tokenUserId;
      }

      if (options?.allowUnverifiedTwoFactor) {
        return tokenUserId;
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, tokenUserId),
      });

      if (!user?.twoFactorEnabled) {
        return tokenUserId;
      }

      const twoFactorCookie = request.cookies.get(TWO_FACTOR_COOKIE_NAME)?.value;
      const hasVerifiedSecondStep = await hasValidTwoFactorSession(tokenUserId, twoFactorCookie);
      return hasVerifiedSecondStep ? tokenUserId : null;
    }
  } catch {
    // Ignore token extraction errors and continue to guest-mode resolution.
  }

  // Local demo mode: bootstrap a deterministic demo user for API-backed flows.
  if (isGuestModeEnabled()) {
    if (!isDatabaseConfigured) {
      return 'local-demo-user';
    }

    try {
      const existingDemoUser =
        (await db.query.users.findFirst({
          where: eq(users.email, DEMO_USER_EMAIL),
        })) ??
        (await db.query.users.findFirst({
          where: eq(users.email, LEGACY_DEMO_USER_EMAIL),
        }));

      if (existingDemoUser) return existingDemoUser.id;

      const demoUserId = uuidv4();
      await db.insert(users).values({
        id: demoUserId,
        email: DEMO_USER_EMAIL,
        name: DEMO_USER_NAME,
        image: null,
      });
      return demoUserId;
    } catch {
      try {
        // Concurrent guest bootstrap may create the same demo user.
        const retryDemoUser =
          (await db.query.users.findFirst({
            where: eq(users.email, DEMO_USER_EMAIL),
          })) ??
          (await db.query.users.findFirst({
            where: eq(users.email, LEGACY_DEMO_USER_EMAIL),
          }));
        return retryDemoUser?.id ?? 'local-demo-user';
      } catch {
        return 'local-demo-user';
      }
    }
  }

  return null;
}
