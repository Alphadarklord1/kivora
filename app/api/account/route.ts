import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts, folders, files, libraryItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

// GET user account info
export async function GET(request: NextRequest) {
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

    // Get user data
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        createdAt: users.createdAt,
        hasPassword: users.passwordHash,
      })
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

    // Get connected accounts
    const connectedAccounts = await db
      .select({
        provider: accounts.provider,
        createdAt: accounts.id, // Using id as proxy since no createdAt
      })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Get stats
    const folderCount = await db
      .select()
      .from(folders)
      .where(eq(folders.userId, userId));

    const fileCount = await db
      .select()
      .from(files)
      .where(eq(files.userId, userId));

    const libraryCount = await db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.userId, userId));

    return NextResponse.json({
      ...user[0],
      hasPassword: !!user[0].hasPassword,
      isGuest: isDemoGuestEmail(user[0].email),
      connectedAccounts: connectedAccounts.map(a => a.provider),
      stats: {
        folders: folderCount.length,
        files: fileCount.length,
        libraryItems: libraryCount.length,
      },
    });
  } catch (error) {
    console.error(`[Account][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'ACCOUNT_FETCH_FAILED',
      reason: 'Failed to get account',
      requestId,
    });
  }
}

// PUT update user profile
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
    const { name, email } = body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (isDemoGuestEmail(currentUser?.email)) {
      return apiError(403, {
        errorCode: 'GUEST_ACCOUNT_READ_ONLY',
        reason: 'Guest profile changes are disabled until you sign in with a real account',
        requestId,
      });
    }

    // Validate
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return apiError(400, {
        errorCode: 'INVALID_EMAIL',
        reason: 'Invalid email format',
        requestId,
      });
    }

    // Check if email is already taken by another user
    if (normalizedEmail) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingUser.length > 0 && existingUser[0].id !== userId) {
        return apiError(400, {
          errorCode: 'EMAIL_IN_USE',
          reason: 'Email already in use',
          requestId,
        });
      }
    }

    // Update user
    const updateData: Record<string, string | Date> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (normalizedEmail) updateData.email = normalizedEmail;

    const updated = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
      });

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error(`[Account][${requestId}] PUT failed`, error);
    return apiError(500, {
      errorCode: 'ACCOUNT_UPDATE_FAILED',
      reason: 'Failed to update account',
      requestId,
    });
  }
}

// DELETE user account
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

    const body = await request.json();
    const { confirmation } = body;
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (isDemoGuestEmail(currentUser?.email)) {
      return apiError(403, {
        errorCode: 'GUEST_ACCOUNT_DELETE_FORBIDDEN',
        reason: 'Guest sessions cannot delete the demo account',
        requestId,
      });
    }

    if (confirmation !== 'DELETE MY ACCOUNT') {
      return apiError(400, {
        errorCode: 'DELETE_CONFIRMATION_REQUIRED',
        reason: 'Please type "DELETE MY ACCOUNT" to confirm',
        requestId,
      });
    }

    // Delete user (cascades to all related data)
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error(`[Account][${requestId}] DELETE failed`, error);
    return apiError(500, {
      errorCode: 'ACCOUNT_DELETE_FAILED',
      reason: 'Failed to delete account',
      requestId,
    });
  }
}
