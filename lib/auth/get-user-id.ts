import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

/**
 * Extract userId from JWT token, with guest-mode bootstrap support.
 * Shared across all API routes for consistent auth behavior.
 */
export async function getUserId(request: NextRequest): Promise<string | null> {
  // Try JWT token first
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    if (token?.id) return token.id as string;
    if (token?.sub) return token.sub as string;
  } catch {
    // Ignore token extraction errors and continue to guest-mode resolution.
  }

  // Local demo mode: bootstrap a deterministic demo user for API-backed flows.
  if (isGuestModeEnabled()) {
    const demoEmail = 'demo@local.studypilot';
    const existingDemoUser = await db.query.users.findFirst({
      where: eq(users.email, demoEmail),
    });

    if (existingDemoUser) return existingDemoUser.id;

    const demoUserId = uuidv4();
    await db.insert(users).values({
      id: demoUserId,
      email: demoEmail,
      name: 'Local Demo',
      image: null,
    });
    return demoUserId;
  }

  return null;
}
