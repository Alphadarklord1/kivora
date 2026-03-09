import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

// GET public user profile by ID
// Only returns public info (name, email) for authenticated users
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const requestId = createRequestId(request);
  try {
    const requesterId = await getUserId(request);
    if (!requesterId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const { userId } = await params;

    if (!userId) {
      return apiError(400, {
        errorCode: 'USER_ID_REQUIRED',
        reason: 'User ID required',
        requestId,
      });
    }

    // Get the requested user's public info
    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return apiError(404, {
        errorCode: 'USER_NOT_FOUND',
        reason: 'User not found',
        requestId,
      });
    }

    // Return public profile info
    return NextResponse.json({
      id: user[0].id,
      name: user[0].name,
      email: user[0].email,
      image: user[0].image,
    });
  } catch (error) {
    console.error(`[UserProfile][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'USER_PROFILE_FETCH_FAILED',
      reason: 'Failed to get user profile',
      requestId,
    });
  }
}
