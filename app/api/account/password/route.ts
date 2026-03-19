import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { syncSupabaseAuthUser } from '@/lib/supabase/auth-admin';

// PUT change password
export async function PUT(request: NextRequest) {
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

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      return apiError(400, {
        errorCode: 'INVALID_PASSWORD',
        reason: 'New password must be at least 6 characters',
        requestId,
      });
    }

    // Get user with password hash
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return apiError(404, {
        errorCode: 'ACCOUNT_NOT_FOUND',
        reason: 'User not found',
        requestId,
      });
    }

    if (isDemoGuestEmail(user[0].email)) {
      return apiError(403, {
        errorCode: 'GUEST_PASSWORD_FORBIDDEN',
        reason: 'Guest sessions cannot set or change a login password',
        requestId,
      });
    }

    // If user has a password, verify current password
    if (user[0].passwordHash) {
      if (!currentPassword) {
        return apiError(400, {
          errorCode: 'CURRENT_PASSWORD_REQUIRED',
          reason: 'Current password is required',
          requestId,
        });
      }

      const isValid = await bcrypt.compare(currentPassword, user[0].passwordHash);
      if (!isValid) {
        return apiError(400, {
          errorCode: 'INVALID_CURRENT_PASSWORD',
          reason: 'Current password is incorrect',
          requestId,
        });
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db
      .update(users)
      .set({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const syncedAuthId = await syncSupabaseAuthUser({
      supabaseAuthId: user[0].supabaseAuthId,
      email: user[0].email,
      password: newPassword,
      name: user[0].name,
      image: user[0].image,
      bio: user[0].bio,
      emailConfirmed: true,
    });

    if (syncedAuthId && syncedAuthId !== user[0].supabaseAuthId) {
      await db
        .update(users)
        .set({
          supabaseAuthId: syncedAuthId,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return NextResponse.json({ success: true, message: 'Password updated' });
  } catch (error) {
    console.error(`[AccountPassword][${requestId}] PUT failed`, error);
    return apiError(500, {
      errorCode: 'PASSWORD_UPDATE_FAILED',
      reason: 'Failed to change password',
      requestId,
    });
  }
}
