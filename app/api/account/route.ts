import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts, folders, files, libraryItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { deleteSupabaseAuthUser, syncSupabaseAuthUser } from '@/lib/supabase/auth-admin';
import { deleteFileFromSupabaseStorage } from '@/lib/supabase/storage';

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
        bio: users.bio,
        supabaseAuthId: users.supabaseAuthId,
        createdAt: users.createdAt,
        hasPassword: users.passwordHash,
        twoFactorEnabled: users.twoFactorEnabled,
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
      id: user[0].id,
      email: user[0].email,
      name: user[0].name,
      image: user[0].image,
      bio: user[0].bio,
      createdAt: user[0].createdAt,
      hasPassword: !!user[0].hasPassword,
      twoFactorEnabled: !!user[0].twoFactorEnabled,
      supabaseLinked: !!user[0].supabaseAuthId,
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
    const { name, email, image, bio } = body;
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

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return apiError(400, {
          errorCode: 'INVALID_NAME',
          reason: 'Name cannot be empty',
          requestId,
        });
      }
      if (name.trim().length > 80) {
        return apiError(400, {
          errorCode: 'INVALID_NAME',
          reason: 'Name must be 80 characters or fewer',
          requestId,
        });
      }
    }

    if (image !== undefined && image !== null && image !== '') {
      if (typeof image !== 'string') {
        return apiError(400, {
          errorCode: 'INVALID_IMAGE',
          reason: 'Image must be a URL string',
          requestId,
        });
      }
      try {
        new URL(image);
      } catch {
        return apiError(400, {
          errorCode: 'INVALID_IMAGE',
          reason: 'Profile picture must be a valid URL',
          requestId,
        });
      }
      if (image.length > 500) {
        return apiError(400, {
          errorCode: 'INVALID_IMAGE',
          reason: 'Profile picture URL is too long',
          requestId,
        });
      }
    }

    if (bio !== undefined && bio !== null && typeof bio !== 'string') {
      return apiError(400, {
        errorCode: 'INVALID_BIO',
        reason: 'Bio must be text',
        requestId,
      });
    }

    if (typeof bio === 'string' && bio.trim().length > 240) {
      return apiError(400, {
        errorCode: 'INVALID_BIO',
        reason: 'Bio must be 240 characters or fewer',
        requestId,
      });
    }

    // Update user
    const updateData: Record<string, string | Date | null> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name.trim();
    if (normalizedEmail) updateData.email = normalizedEmail;
    if (image !== undefined) updateData.image = typeof image === 'string' && image.trim() ? image.trim() : null;
    if (bio !== undefined) updateData.bio = typeof bio === 'string' && bio.trim() ? bio.trim() : null;

    const updated = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        bio: users.bio,
        supabaseAuthId: users.supabaseAuthId,
      });

    const syncedAuthId = await syncSupabaseAuthUser({
      supabaseAuthId: updated[0].supabaseAuthId,
      email: updated[0].email,
      name: updated[0].name,
      image: updated[0].image,
      bio: updated[0].bio,
      emailConfirmed: true,
    });

    if (syncedAuthId && syncedAuthId !== updated[0].supabaseAuthId) {
      await db
        .update(users)
        .set({ supabaseAuthId: syncedAuthId, updatedAt: new Date() })
        .where(eq(users.id, userId));
      updated[0].supabaseAuthId = syncedAuthId;
    }

    return NextResponse.json({
      id: updated[0].id,
      email: updated[0].email,
      name: updated[0].name,
      image: updated[0].image,
      bio: updated[0].bio,
      supabaseLinked: !!updated[0].supabaseAuthId,
    });
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

    const ownedFiles = await db.query.files.findMany({
      where: eq(files.userId, userId),
      columns: {
        storageBucket: true,
        storagePath: true,
      },
    });

    await Promise.all(
      ownedFiles
        .filter((file) => file.storageBucket && file.storagePath)
        .map((file) => deleteFileFromSupabaseStorage(file.storageBucket!, file.storagePath!).catch(() => undefined)),
    );

    await deleteSupabaseAuthUser(currentUser?.supabaseAuthId);

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
