import { randomBytes, createHash } from 'crypto';
import type { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { verificationTokens } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  buildOtpAuthUri,
  formatTwoFactorSecret,
  generateTwoFactorSecret,
  getCurrentTwoFactorCode,
  normalizeTwoFactorCode,
  verifyTwoFactorCode,
} from '@/lib/auth/two-factor-core';
export const TWO_FACTOR_COOKIE_NAME = 'kivora_2fa_session';
export const LEGACY_TWO_FACTOR_COOKIE_NAME = 'studypilot_2fa_session';
const TWO_FACTOR_SESSION_HOURS = 12;

export {
  buildOtpAuthUri,
  formatTwoFactorSecret,
  generateTwoFactorSecret,
  getCurrentTwoFactorCode,
  normalizeTwoFactorCode,
  verifyTwoFactorCode,
};

function buildSessionIdentifier(userId: string) {
  return `2fa-session:${userId}`;
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueTwoFactorSession(userId: string) {
  if (!isDatabaseConfigured) {
    throw new Error('Two-factor sessions require DATABASE_URL to be configured.');
  }

  const identifier = buildSessionIdentifier(userId);
  const rawToken = randomBytes(24).toString('hex');
  const hashedToken = hashSessionToken(rawToken);
  const expires = new Date(Date.now() + TWO_FACTOR_SESSION_HOURS * 60 * 60 * 1000);

  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
  await db.insert(verificationTokens).values({
    identifier,
    token: hashedToken,
    expires,
  });

  return {
    token: rawToken,
    expires,
  };
}

export async function hasValidTwoFactorSession(userId: string, rawToken: string | null | undefined) {
  if (!isDatabaseConfigured) return false;
  if (!rawToken) return false;
  const identifier = buildSessionIdentifier(userId);
  const hashedToken = hashSessionToken(rawToken);

  const row = await db.query.verificationTokens.findFirst({
    where: and(
      eq(verificationTokens.identifier, identifier),
      eq(verificationTokens.token, hashedToken)
    ),
  });

  if (!row) return false;
  if (row.expires < new Date()) {
    await db.delete(verificationTokens).where(and(
      eq(verificationTokens.identifier, identifier),
      eq(verificationTokens.token, hashedToken)
    ));
    return false;
  }

  return true;
}

export async function revokeTwoFactorSessions(userId: string) {
  if (!isDatabaseConfigured) return;
  await db.delete(verificationTokens).where(eq(verificationTokens.identifier, buildSessionIdentifier(userId)));
}

export function applyTwoFactorCookie(response: NextResponse, token: string, expires: Date) {
  response.cookies.set(TWO_FACTOR_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires,
    path: '/',
  });
}

export function clearTwoFactorCookie(response: NextResponse) {
  response.cookies.set(TWO_FACTOR_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(0),
    path: '/',
  });
}
