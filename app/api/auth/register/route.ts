import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { syncSupabaseAuthUser } from '@/lib/supabase/auth-admin';

export async function POST(req: NextRequest) {
  if (!isDatabaseConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

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
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (name && name.trim().length > 80) {
    return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();

  try {
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
    return NextResponse.json({ error: 'Could not create the account right now. Please try again.' }, { status: 500 });
  }
}
