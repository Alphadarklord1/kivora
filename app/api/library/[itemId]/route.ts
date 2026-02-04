import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { libraryItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    return (token?.id as string) || (token?.sub as string) || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await params;

  const item = await db.query.libraryItems.findFirst({
    where: and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)),
  });

  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { itemId } = await params;

  const [deleted] = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.userId, userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
