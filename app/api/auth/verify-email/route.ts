/**
 * GET /api/auth/verify-email?token=<hex>
 *
 * Validates the one-time verification token, marks the user's email as
 * verified, deletes the token, and redirects to /settings.
 *
 * Success: redirects to /settings?verified=1
 * Failure: redirects to /settings?verified=error
 */
import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, verificationTokens } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const baseUrl = req.nextUrl.origin;
  const successUrl = `${baseUrl}/settings?verified=1`;
  const errorUrl   = `${baseUrl}/settings?verified=error`;

  if (!isDatabaseConfigured) return NextResponse.redirect(errorUrl);

  const token = req.nextUrl.searchParams.get('token');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.redirect(errorUrl);
  }

  const now = new Date();

  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.token, token), gt(verificationTokens.expires, now)))
    .limit(1);

  if (!record) return NextResponse.redirect(errorUrl);

  // Mark email verified
  await db
    .update(users)
    .set({ emailVerified: now, updatedAt: now })
    .where(eq(users.email, record.identifier));

  // Consume token — one-time use
  await db.delete(verificationTokens).where(eq(verificationTokens.token, token));

  return NextResponse.redirect(successUrl);
}
