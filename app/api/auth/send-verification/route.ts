/**
 * POST /api/auth/send-verification
 *
 * Generates a 24-hour email-verification token and sends a link to the
 * authenticated user's address.
 *
 * If RESEND_API_KEY is set, sends via Resend.
 * Otherwise logs the link to the server console (dev fallback).
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, verificationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { requireAppAccess } from '@/lib/api/guard';

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;

  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const [user] = await db
    .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  if (user.emailVerified) {
    return NextResponse.json({ error: 'Email is already verified.' }, { status: 400 });
  }

  // Generate a secure random token (64 hex chars = 32 bytes)
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h

  // Replace any existing token for this identifier
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, user.email));
  await db.insert(verificationTokens).values({ identifier: user.email, token, expires });

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  if (process.env.RESEND_API_KEY) {
    const from = process.env.EMAIL_FROM || 'Kivora <noreply@kivora.app>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: user.email,
        subject: 'Verify your Kivora email address',
        html: [
          '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">',
          '<h2 style="margin:0 0 16px">Verify your email</h2>',
          '<p style="margin:0 0 24px;color:#475569">Click the button below to confirm your email address.',
          ' This link expires in 24&nbsp;hours.</p>',
          `<a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;`,
          'color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a>',
          `<p style="margin:24px 0 0;font-size:13px;color:#94a3b8">Or copy this link: ${verifyUrl}</p>`,
          '</div>',
        ].join(''),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[send-verification] Resend error', res.status, body);
      return NextResponse.json({ error: 'Failed to send verification email.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  }

  // Dev fallback — print to server log
  console.log(`[send-verification] Email verification link for ${user.email}:\n  ${verifyUrl}`);
  return NextResponse.json({ ok: true, dev: true, devLink: verifyUrl });
}
