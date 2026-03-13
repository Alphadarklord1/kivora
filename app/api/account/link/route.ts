import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { accounts, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

// DELETE - Unlink a connected account
export async function DELETE(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider || !['google', 'github', 'microsoft-entra-id'].includes(provider)) {
      return apiError(400, {
        errorCode: 'INVALID_PROVIDER',
        reason: 'Invalid provider',
        requestId,
      });
    }

    // Check if this is the only sign-in method
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Get user to check if they have a password
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (isDemoGuestEmail(user?.email)) {
      return apiError(403, {
        errorCode: 'GUEST_ACCOUNT_LINK_FORBIDDEN',
        reason: 'Guest sessions cannot change linked sign-in providers',
        requestId,
      });
    }

    const hasPassword = !!user?.passwordHash;
    const accountCount = userAccounts.length;

    // Prevent unlinking if it's the only sign-in method
    if (!hasPassword && accountCount <= 1) {
      return apiError(400, {
        errorCode: 'LAST_SIGNIN_METHOD',
        reason: 'Cannot unlink - this is your only sign-in method. Set a password first.',
        requestId,
      });
    }

    // Delete the account link
    const deleted = await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.provider, provider)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return apiError(404, {
        errorCode: 'ACCOUNT_LINK_NOT_FOUND',
        reason: 'Account not found',
        requestId,
      });
    }

    return NextResponse.json({ success: true, message: `${provider} account unlinked` });
  } catch (error) {
    console.error(`[AccountLink][${requestId}] DELETE failed`, error);
    return apiError(500, {
      errorCode: 'ACCOUNT_UNLINK_FAILED',
      reason: 'Failed to unlink account',
      requestId,
    });
  }
}
