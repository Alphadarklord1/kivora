import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api/error-response';
import { applyTwoFactorCookie, issueTwoFactorSession, normalizeTwoFactorCode, verifyTwoFactorCode } from '@/lib/auth/two-factor';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { isLocalAuthUserId } from '@/lib/auth/local-auth-store';

export async function POST(request: NextRequest) {
  // JWT-based getUserId — see /api/auth/2fa/setup for context.
  const userId = await getUserId(request);

  if (!userId) {
    return apiError(401, {
      errorCode: 'UNAUTHORIZED',
      reason: 'Authentication required',
    });
  }

  if (isLocalAuthUserId(userId)) {
    return apiError(503, {
      errorCode: 'LOCAL_ACCOUNT_2FA_UNAVAILABLE',
      reason: 'Two-step verification is not available for local-only accounts yet.',
    });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return apiError(404, {
      errorCode: 'ACCOUNT_NOT_FOUND',
      reason: 'User not found',
    });
  }

  if (isDemoGuestEmail(user.email)) {
    return apiError(403, {
      errorCode: 'GUEST_2FA_FORBIDDEN',
      reason: 'Guest sessions cannot enable two-step verification',
    });
  }

  const body = await request.json().catch(() => null);
  const secret = typeof body?.secret === 'string' ? body.secret : '';
  const code = normalizeTwoFactorCode(body?.code);

  if (!secret || code.length !== 6) {
    return apiError(400, {
      errorCode: 'INVALID_2FA_SETUP',
      reason: 'Secret and 6-digit code are required',
    });
  }

  if (!verifyTwoFactorCode(secret, code)) {
    return apiError(400, {
      errorCode: 'INVALID_2FA_CODE',
      reason: 'The verification code is incorrect or expired',
    });
  }

  await db.update(users).set({
    twoFactorEnabled: true,
    twoFactorSecret: secret,
    twoFactorConfirmedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));

  const { token, expires } = await issueTwoFactorSession(userId);
  const response = NextResponse.json({ success: true, twoFactorEnabled: true });
  applyTwoFactorCookie(response, token, expires);
  return response;
}
