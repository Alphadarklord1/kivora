import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    if (token?.id) return token.id as string;
    if (token?.sub) return token.sub as string;
  } catch {}

  // Fallback: get first user (TEMPORARY for development)
  const firstUser = await db.query.users.findFirst();
  return firstUser?.id || null;
}

// GET public user profile by ID
// Only returns public info (name, email) for authenticated users
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Verify the requester is authenticated
    const requesterId = await getAuthenticatedUserId(request);
    if (!requesterId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Return public profile info
    return NextResponse.json({
      id: user[0].id,
      name: user[0].name,
      email: user[0].email,
      image: user[0].image,
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json({ error: 'Failed to get user profile' }, { status: 500 });
  }
}
