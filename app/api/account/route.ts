import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts, folders, files, libraryItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId, isDemoGuestEmail } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { deleteSupabaseAuthUser, syncSupabaseAuthUser } from '@/lib/supabase/auth-admin';
import { deleteFileFromSupabaseStorage } from '@/lib/supabase/storage';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import {
  deleteLocalAuthUser,
  findLocalAuthUserById,
  isLocalAuthUserId,
  updateLocalAuthUser,
} from '@/lib/auth/local-auth-store';

function isEphemeralGuest(userId: string) {
  return userId === 'guest' || userId === 'local-demo-user' || userId.startsWith('guest:');
}

function buildLocalAccountResponse(user: {
  id: string;
  email: string;
  name: string;
  image: string | null;
  bio: string | null;
  studyInterests: string | null;
  createdAt: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    bio: user.bio,
    studyInterests: user.studyInterests,
    createdAt: user.createdAt,
    hasPassword: true,
    twoFactorEnabled: false,
    supabaseLinked: false,
    isGuest: false,
    localOnly: true,
    connectedAccounts: [],
    stats: {
      folders: 0,
      files: 0,
      libraryItems: 0,
    },
  };
}

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

    if (isGuestModeEnabled() && isEphemeralGuest(userId)) {
      return NextResponse.json({
        id: userId,
        email: 'demo@local.kivora',
        name: 'Guest Session',
        image: null,
        bio: '',
        studyInterests: '',
        createdAt: null,
        hasPassword: false,
        twoFactorEnabled: false,
        supabaseLinked: false,
        isGuest: true,
        connectedAccounts: [],
        stats: {
          folders: 0,
          files: 0,
          libraryItems: 0,
        },
      });
    }

    if (isLocalAuthUserId(userId)) {
      const localUser = await findLocalAuthUserById(userId);
      if (!localUser) {
        return apiError(404, {
          errorCode: 'ACCOUNT_NOT_FOUND',
          reason: 'Local account not found on this device',
          requestId,
        });
      }

      return NextResponse.json(buildLocalAccountResponse(localUser));
    }

    // Get user data
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        bio: users.bio,
        studyInterests: users.studyInterests,
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
      studyInterests: user[0].studyInterests,
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
    if (isGuestModeEnabled()) {
      return NextResponse.json({
        id: 'local-demo-user',
        email: 'demo@local.kivora',
        name: 'Guest Session',
        image: null,
        bio: '',
        studyInterests: '',
        createdAt: null,
        hasPassword: false,
        twoFactorEnabled: false,
        supabaseLinked: false,
        isGuest: true,
        connectedAccounts: [],
        stats: {
          folders: 0,
          files: 0,
          libraryItems: 0,
        },
      });
    }
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
    const { name, email, image, bio, studyInterests } = body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : email;

    // Validate
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return apiError(400, {
        errorCode: 'INVALID_EMAIL',
        reason: 'Invalid email format',
        requestId,
      });
    }

    // Check if email is already taken by another user
    if (normalizedEmail && !isLocalAuthUserId(userId)) {
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

    if (studyInterests !== undefined && studyInterests !== null && typeof studyInterests !== 'string') {
      return apiError(400, {
        errorCode: 'INVALID_STUDY_INTERESTS',
        reason: 'Study interests must be text',
        requestId,
      });
    }

    if (typeof studyInterests === 'string' && studyInterests.trim().length > 180) {
      return apiError(400, {
        errorCode: 'INVALID_STUDY_INTERESTS',
        reason: 'Study interests must be 180 characters or fewer',
        requestId,
      });
    }

    if (isLocalAuthUserId(userId)) {
      const existingLocal = await findLocalAuthUserById(userId);
      if (!existingLocal) {
        return apiError(404, {
          errorCode: 'ACCOUNT_NOT_FOUND',
          reason: 'Local account not found on this device',
          requestId,
        });
      }

      const updatedLocal = await updateLocalAuthUser(userId, {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(normalizedEmail ? { email: normalizedEmail } : {}),
        ...(image !== undefined ? { image: typeof image === 'string' && image.trim() ? image.trim() : null } : {}),
        ...(bio !== undefined ? { bio: typeof bio === 'string' && bio.trim() ? bio.trim() : null } : {}),
        ...(studyInterests !== undefined ? { studyInterests: typeof studyInterests === 'string' && studyInterests.trim() ? studyInterests.trim() : null } : {}),
      }).catch((error) => {
        if (error instanceof Error && error.message === 'LOCAL_AUTH_EMAIL_IN_USE') {
          return 'EMAIL_IN_USE';
        }
        throw error;
      });

      if (updatedLocal === 'EMAIL_IN_USE') {
        return apiError(400, {
          errorCode: 'EMAIL_IN_USE',
          reason: 'Email already in use',
          requestId,
        });
      }

      if (!updatedLocal || typeof updatedLocal === 'string') {
        return apiError(404, {
          errorCode: 'ACCOUNT_NOT_FOUND',
          reason: 'Local account not found on this device',
          requestId,
        });
      }

      return NextResponse.json({
        id: updatedLocal.id,
        email: updatedLocal.email,
        name: updatedLocal.name,
        image: updatedLocal.image,
        bio: updatedLocal.bio,
        studyInterests: updatedLocal.studyInterests,
        supabaseLinked: false,
        localOnly: true,
      });
    }

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

    // Update user
    const emailChanging = Boolean(normalizedEmail && normalizedEmail !== currentUser?.email);
    const updateData: Record<string, string | Date | null> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name.trim();
    if (normalizedEmail) updateData.email = normalizedEmail;
    if (emailChanging) updateData.emailVerified = null; // new address is unverified
    if (image !== undefined) updateData.image = typeof image === 'string' && image.trim() ? image.trim() : null;
    if (bio !== undefined) updateData.bio = typeof bio === 'string' && bio.trim() ? bio.trim() : null;
    if (studyInterests !== undefined) updateData.studyInterests = typeof studyInterests === 'string' && studyInterests.trim() ? studyInterests.trim() : null;

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
        studyInterests: users.studyInterests,
        supabaseAuthId: users.supabaseAuthId,
      });

    const syncedAuthId = await syncSupabaseAuthUser({
      supabaseAuthId: updated[0].supabaseAuthId,
      email: updated[0].email,
      name: updated[0].name,
      image: updated[0].image,
      bio: updated[0].bio,
      emailConfirmed: !emailChanging, // don't confirm an address that hasn't been verified
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
      studyInterests: updated[0].studyInterests,
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

    if (isLocalAuthUserId(userId)) {
      if (confirmation !== 'DELETE MY ACCOUNT') {
        return apiError(400, {
          errorCode: 'DELETE_CONFIRMATION_REQUIRED',
          reason: 'Please type "DELETE MY ACCOUNT" to confirm',
          requestId,
        });
      }

      const deleted = await deleteLocalAuthUser(userId);
      if (!deleted) {
        return apiError(404, {
          errorCode: 'ACCOUNT_NOT_FOUND',
          reason: 'Local account not found on this device',
          requestId,
        });
      }

      return NextResponse.json({ success: true, message: 'Local account deleted from this device' });
    }

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

    // Delete the DB record first so the account is gone regardless of whether
    // external cleanup succeeds. The cascade handles all related rows.
    await db.delete(users).where(eq(users.id, userId));

    // Best-effort cleanup of external resources — failures are logged but do
    // not block the response; the account is already deleted.
    const supabaseAuthId = currentUser?.supabaseAuthId;
    void Promise.allSettled([
      deleteSupabaseAuthUser(supabaseAuthId),
      ...ownedFiles
        .filter((file) => file.storageBucket && file.storagePath)
        .map((file) => deleteFileFromSupabaseStorage(file.storageBucket!, file.storagePath!)),
    ]).then((results) => {
      results.forEach((r) => {
        if (r.status === 'rejected') {
          console.error(`[Account][${requestId}] External cleanup failed`, r.reason);
        }
      });
    });

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
