import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { accounts, users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

// DELETE - Unlink a connected account
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (!provider || !['google', 'github'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Check if this is the only sign-in method
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId));

    // Get user to check if they have a password
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    const hasPassword = !!user?.passwordHash;
    const accountCount = userAccounts.length;

    // Prevent unlinking if it's the only sign-in method
    if (!hasPassword && accountCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot unlink - this is your only sign-in method. Set a password first.' },
        { status: 400 }
      );
    }

    // Delete the account link
    const deleted = await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.provider, provider)
        )
      )
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: `${provider} account unlinked` });
  } catch (error) {
    console.error('Unlink account error:', error);
    return NextResponse.json({ error: 'Failed to unlink account' }, { status: 500 });
  }
}
