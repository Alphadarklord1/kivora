import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api/error-response';
import { clearTwoFactorCookie, normalizeTwoFactorCode, revokeTwoFactorSessions, verifyTwoFactorCode } from '@/lib/auth/two-factor';
import { isLocalAuthUserId } from '@/lib/auth/local-auth-store';

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;

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

  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    return apiError(400, {
      errorCode: 'TWO_FACTOR_NOT_ENABLED',
      reason: 'Two-step verification is not enabled for this account',
    });
  }

  const body = await request.json().catch(() => null);
  const code = normalizeTwoFactorCode(body?.code);

  if (code.length !== 6) {
    return apiError(400, {
      errorCode: 'INVALID_2FA_CODE',
      reason: 'Enter the 6-digit code from your authenticator app',
    });
  }

  if (!verifyTwoFactorCode(user.twoFactorSecret, code)) {
    return apiError(400, {
      errorCode: 'INVALID_2FA_CODE',
      reason: 'The verification code is incorrect or expired',
    });
  }

  await db.update(users).set({
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorConfirmedAt: null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  await revokeTwoFactorSessions(userId);

  const response = NextResponse.json({ success: true, twoFactorEnabled: false });
  clearTwoFactorCookie(response);
  return response;
}
