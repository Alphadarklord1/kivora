/**
 * POST /api/auth/reset-password
 * Body: { token: string; password: string }
 *
 * Validates the reset token, hashes the new password, updates the user,
 * and deletes the token (one-time use).
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, verificationTokens } from '@/lib/db/schema';
import { and, eq, gt } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const token    = typeof body.token    === 'string' ? body.token.trim()    : '';
  const password = typeof body.password === 'string' ? body.password        : '';

  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid or missing token.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const now = new Date();

  const [record] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, token),
        gt(verificationTokens.expires, now),
      ),
    )
    .limit(1);

  if (!record || !record.identifier.startsWith('reset:')) {
    return NextResponse.json({ error: 'Reset link is invalid or has expired.' }, { status: 400 });
  }

  const email = record.identifier.slice('reset:'.length);
  const passwordHash = await bcrypt.hash(password, 12);

  await db
    .update(users)
    .set({ passwordHash, updatedAt: now })
    .where(eq(users.email, email));

  // Consume token
  await db.delete(verificationTokens).where(eq(verificationTokens.token, token));

  return NextResponse.json({ ok: true });
}
