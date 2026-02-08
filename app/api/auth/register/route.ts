import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, name } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  // TEMP: password enforcement disabled (accept any length)

  // Check if user exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (existingUser) {
    return NextResponse.json({ error: 'User already exists' }, { status: 409 });
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user
  const [newUser] = await db.insert(users).values({
    email: email.toLowerCase(),
    name: name || null,
    passwordHash,
  }).returning();

  // Create default settings
  await db.insert(userSettings).values({
    userId: newUser.id,
  });

  return NextResponse.json({
    id: newUser.id,
    email: newUser.email,
    name: newUser.name,
  }, { status: 201 });
}
