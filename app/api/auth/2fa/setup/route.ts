import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { apiError } from '@/lib/api/error-response';
import { buildOtpAuthUri, formatTwoFactorSecret, generateTwoFactorSecret } from '@/lib/auth/two-factor';
import { isDemoGuestEmail } from '@/lib/auth/get-user-id';

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return apiError(401, {
      errorCode: 'UNAUTHORIZED',
      reason: 'Authentication required',
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
