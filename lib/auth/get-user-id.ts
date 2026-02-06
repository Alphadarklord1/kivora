import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';

/**
 * Extract userId from JWT token with fallback for development.
 * Shared across all API routes for consistent auth behavior.
 */
export async function getUserId(request: NextRequest): Promise<string | null> {
  // Try JWT token first
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    if (token?.id) return token.id as string;
    if (token?.sub) return token.sub as string;
  } catch (e) {
    console.log('Token extraction error:', e);
  }

  // Fallback: get first user (TEMPORARY for development)
  const firstUser = await db.query.users.findFirst();
  if (firstUser) {
    console.log('Using fallback user:', firstUser.email);
    return firstUser.id;
  }

  return null;
}
