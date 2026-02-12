import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, accounts, folders, files, libraryItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

// GET user account info
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user data
    const user = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        createdAt: users.createdAt,
        hasPassword: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get connected accounts
    const connectedAccounts = await db
      .select({
        provider: accounts.provider,
        createdAt: accounts.id, // Using id as proxy since no createdAt
      })
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Get stats
    const folderCount = await db
      .select()
      .from(folders)
      .where(eq(folders.userId, userId));

    const fileCount = await db
      .select()
      .from(files)
      .where(eq(files.userId, userId));

    const libraryCount = await db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.userId, userId));

    return NextResponse.json({
      ...user[0],
      hasPassword: !!user[0].hasPassword,
      connectedAccounts: connectedAccounts.map(a => a.provider),
      stats: {
        folders: folderCount.length,
        files: fileCount.length,
        libraryItems: libraryCount.length,
      },
    });
  } catch (error) {
    console.error('Get account error:', error);
    return NextResponse.json({ error: 'Failed to get account' }, { status: 500 });
  }
}

// PUT update user profile
export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email } = body;

    // Validate
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser.length > 0 && existingUser[0].id !== userId) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
      }
    }

    // Update user
    const updateData: Record<string, string | Date> = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (email) updateData.email = email;

    const updated = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
      });

    return NextResponse.json(updated[0]);
  } catch (error) {
    console.error('Update account error:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

// DELETE user account
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { confirmation } = body;

    if (confirmation !== 'DELETE MY ACCOUNT') {
      return NextResponse.json(
        { error: 'Please type "DELETE MY ACCOUNT" to confirm' },
        { status: 400 }
      );
    }

    // Delete user (cascades to all related data)
    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true, message: 'Account deleted' });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
