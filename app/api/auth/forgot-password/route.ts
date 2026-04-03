/**
 * POST /api/auth/forgot-password
 * Body: { email: string }
 *
 * Generates a 1-hour password-reset token stored in verificationTokens
 * (identifier = "reset:<email>") and sends the reset link via Resend.
 * Falls back to console.log in dev when RESEND_API_KEY is absent.
 *
 * Always returns 200 to prevent email enumeration.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, verificationTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const OK = NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) return OK;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return OK; }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return OK;

  // Check user exists and has a password hash (credentials user)
  const [user] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Always return OK — don't reveal whether the email exists
  if (!user?.passwordHash) return OK;

  const token    = crypto.randomBytes(32).toString('hex');
  const expires  = new Date(Date.now() + 60 * 60 * 1000); // 1 h
  const identifier = `reset:${email}`;

  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
  await db.insert(verificationTokens).values({ identifier, token, expires });

  const baseUrl  = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  if (process.env.RESEND_API_KEY) {
    const from = process.env.EMAIL_FROM || 'Kivora <noreply@kivora.app>';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Reset your Kivora password',
        html: [
          '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">',
          '<h2 style="margin:0 0 16px">Reset your password</h2>',
          '<p style="margin:0 0 24px;color:#475569">Click the button below to choose a new password.',
          ' This link expires in 1&nbsp;hour.</p>',
          `<a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;`,
          'color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a>',
          `<p style="margin:24px 0 0;font-size:13px;color:#94a3b8">Or copy: ${resetUrl}</p>`,
          '<p style="margin:16px 0 0;font-size:12px;color:#94a3b8">If you did not request this, ignore this email.</p>',
          '</div>',
        ].join(''),
      }),
    }).catch(err => console.error('[forgot-password] Resend error', err));
  } else {
    console.log(`[forgot-password] Reset link for ${email}:\n  ${resetUrl}`);
  }

  return OK;
}
