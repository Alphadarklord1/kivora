import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db, isDatabaseConfigured } from '@/lib/db';
import { users, accounts, sessions as dbSessions, userSettings, folders, libraryItems, shares, quizAttempts, recentFiles } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

// ── GET /api/users/me ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return err(401, 'Not authenticated');
  if (!isDatabaseConfigured) return err(503, 'Database not configured');

  const row = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image, createdAt: users.createdAt, hasPassword: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row.length) return err(404, 'User not found');

  const { hasPassword, ...rest } = row[0];
  return NextResponse.json({ ...rest, hasPassword: !!hasPassword });
}

// ── PATCH /api/users/me ────────────────────────────────────────────────────
// Body (all optional):
//   { name?, image?, currentPassword?, newPassword? }
export async function PATCH(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return err(401, 'Not authenticated');
  if (!isDatabaseConfigured) return err(503, 'Database not configured');

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return err(400, 'Invalid JSON'); }

  const { name, image, currentPassword, newPassword } = body as {
    name?: string;
    image?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  // Fetch current user row for password verification
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return err(404, 'User not found');

  const updates: Partial<{ name: string; image: string | null; passwordHash: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  };

  // Profile fields
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (!trimmed) return err(400, 'Name cannot be empty');
    if (trimmed.length > 80) return err(400, 'Name too long (max 80 chars)');
    updates.name = trimmed;
  }

  if (image !== undefined) {
    // Allow null/empty to clear avatar, or validate URL
    if (image && image.length > 0) {
      try { new URL(image); } catch { return err(400, 'Invalid image URL'); }
      if (image.length > 500) return err(400, 'Image URL too long');
      updates.image = image;
    } else {
      updates.image = null;
    }
  }

  // Password change
  if (newPassword !== undefined) {
    if (newPassword.length < 8) return err(400, 'New password must be at least 8 characters');
    if (newPassword.length > 128) return err(400, 'Password too long');

    // If the account has a password, current password is required
    if (user.passwordHash) {
      if (!currentPassword) return err(400, 'Current password is required to change password');
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return err(403, 'Current password is incorrect');
    }

    updates.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({ id: users.id, name: users.name, email: users.email, image: users.image });

  return NextResponse.json(updated);
}

// ── DELETE /api/users/me ───────────────────────────────────────────────────
// Deletes the authenticated user's account and all associated data.
export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return err(401, 'Not authenticated');
  if (!isDatabaseConfigured) return err(503, 'Database not configured');

  // Cascade delete is handled by DB foreign key constraints (onDelete: cascade)
  // but we do it explicitly for clarity and to ensure all sessions are invalidated
  try {
    // Delete all user data in dependency order
    await db.delete(recentFiles).where(eq(recentFiles.userId, userId)).catch(() => {});
    await db.delete(quizAttempts).where(eq(quizAttempts.userId, userId)).catch(() => {});
    await db.delete(shares).where(eq(shares.ownerId, userId)).catch(() => {});
    await db.delete(libraryItems).where(eq(libraryItems.userId, userId)).catch(() => {});
    await db.delete(userSettings).where(eq(userSettings.userId, userId)).catch(() => {});
    await db.delete(accounts).where(eq(accounts.userId, userId)).catch(() => {});
    await db.delete(dbSessions).where(eq(dbSessions.userId, userId)).catch(() => {});
    // Folders + files cascade from userId FK in schema
    await db.delete(folders).where(eq(folders.userId, userId)).catch(() => {});
    // Finally remove the user
    await db.delete(users).where(eq(users.id, userId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[DELETE /api/users/me]', e);
    return err(500, 'Failed to delete account');
  }
}
