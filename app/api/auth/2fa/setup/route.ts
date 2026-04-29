import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api/error-response';
import { buildOtpAuthUri, formatTwoFactorSecret, generateTwoFactorSecret } from '@/lib/auth/two-factor';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { isLocalAuthUserId } from '@/lib/auth/local-auth-store';

export async function POST(request: NextRequest) {
  // JWT-based extraction. The previous auth() cookie path intermittently
  // returned null for valid Google sessions, so the user got
  // "Authentication required" even when properly signed in.
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

  // Without a DB the user lookup below crashes with "db is null". Surface
  // a 503 so the settings panel can show a real "DB unavailable" message
  // instead of a generic toast.
  if (!isDatabaseConfigured) {
    return apiError(503, {
      errorCode: 'DB_UNAVAILABLE',
      reason: 'Database not configured — 2FA setup unavailable in this environment.',
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

  const secret = generateTwoFactorSecret();
  return NextResponse.json({
    secret,
    manualEntryKey: formatTwoFactorSecret(secret),
    otpAuthUri: buildOtpAuthUri(user.email, secret),
    alreadyEnabled: Boolean(user.twoFactorEnabled),
  });
}
