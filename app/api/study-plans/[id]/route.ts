import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { studyPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const plan = await db.query.studyPlans.findFirst({
    where: and(eq(studyPlans.id, id), eq(studyPlans.userId, userId)),
  });

  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  return NextResponse.json(plan);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();

  // Only allow updating specific fields
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
  }
  if (body.progress !== undefined) {
    updates.progress = body.progress;
  }
  if (body.schedule !== undefined) {
    updates.schedule = body.schedule;
  }
  if (body.topics !== undefined) {
    updates.topics = body.topics;
  }
  if (body.folderId !== undefined) {
    updates.folderId = body.folderId;
  }

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(studyPlans)
    .set(updates)
    .where(and(eq(studyPlans.id, id), eq(studyPlans.userId, userId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const [deleted] = await db
    .delete(studyPlans)
    .where(and(eq(studyPlans.id, id), eq(studyPlans.userId, userId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
