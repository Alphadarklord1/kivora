import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { syncSupabaseAuthUser } from '@/lib/supabase/auth-admin';
import { checkRegisterLimit } from '@/lib/api/auth-rate-limit';
import { enforceBodyCap } from '@/lib/api/guard';
import { validatePasswordPolicy } from '@/lib/auth/password-policy';
import {
  canUseLocalAuthFallback,
  createLocalAuthUser,
  findLocalAuthUserByEmail,
  isDatabaseUnreachableError,
} from '@/lib/auth/local-auth-store';

export async function POST(req: NextRequest) {
  const bodyCapRes = enforceBodyCap(req);
  if (bodyCapRes) return bodyCapRes;

  const rateLimitRes = checkRegisterLimit(req);
  if (rateLimitRes) return rateLimitRes;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const { email, password, name } = body as { email?: string; password?: string; name?: string };

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const passwordError = validatePasswordPolicy(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  if (name && name.trim().length > 80) {
    return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();
  const allowLocalFallback = canUseLocalAuthFallback();

  if (!isDatabaseConfigured) {
    return NextResponse.json(
      { error: 'Account creation needs the database connection configured first.' },
      { status: 503 }
    );
  }

  try {
    if (allowLocalFallback) {
      const existingLocal = await findLocalAuthUserByEmail(normalised);
      if (existingLocal) {
        return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
      }
    }

    const existing = await db.query.users.findFirst({ where: eq(users.email, normalised) });
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const trimmedName = name?.trim() || normalised.split('@')[0];
    const supabaseAuthId = await syncSupabaseAuthUser({
      email: normalised,
      password,
      name: trimmedName,
      emailConfirmed: true,
    });

    const [newUser] = await db.insert(users).values({
      id: userId,
      email: normalised,
      name: trimmedName,
      supabaseAuthId,
      passwordHash,
      isGuest: false,
      guestSessionId: null,
    }).returning({ id: users.id, email: users.email, name: users.name });

    // Default settings should not make registration fail if they already exist or insert late.
    await db.insert(userSettings).values({ userId }).onConflictDoNothing();

    return NextResponse.json({ id: newUser.id, email: newUser.email, name: newUser.name }, { status: 201 });
  } catch (error) {
    console.error('[auth/register] registration failed', error);

    if (allowLocalFallback && isDatabaseUnreachableError(error)) {
      try {
        const existingLocal = await findLocalAuthUserByEmail(normalised);
        if (existingLocal) {
          return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
        }

        const localUser = await createLocalAuthUser({
          email: normalised,
          password,
          name,
        });

        return NextResponse.json({
          id: localUser.id,
          email: localUser.email,
          name: localUser.name,
          localOnly: true,
          message: 'Kivora could not reach the account database, so this account was created locally on this device.',
        }, { status: 201 });
      } catch (localError) {
        console.error('[auth/register] local fallback failed', localError);
        return NextResponse.json({
          error: 'Kivora cannot reach the account database right now. Please keep using Guest mode locally, or try again once the database connection is back.',
        }, { status: 503 });
      }
    }

    if (isDatabaseUnreachableError(error)) {
      return NextResponse.json({
        error: 'Kivora cannot reach the account database right now. Please keep using Guest mode locally, or try again once the database connection is back.',
      }, { status: 503 });
    }

    return NextResponse.json({ error: 'Could not create the account right now. Please try again.' }, { status: 500 });
  }
}
