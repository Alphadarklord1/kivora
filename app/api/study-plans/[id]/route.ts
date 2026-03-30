import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyPlans } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { betaReadFallback, databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isEphemeralGuest(userId: string | null | undefined) {
  return userId === 'guest' || userId === 'local-demo-user' || Boolean(userId?.startsWith('guest:'));
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Study plan lookup requires a configured Supabase or PostgreSQL database', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
  }
  if (isGuestModeEnabled() && isEphemeralGuest(userId)) {
    return betaReadFallback(null, { 'x-kivora-fallback': 'study-plan-guest' });
  }

  const { id } = await params;

  const plan = await db.query.studyPlans.findFirst({
    where: and(eq(studyPlans.id, id), eq(studyPlans.userId, userId)),
  });

  if (!plan) {
    return apiError(404, {
      errorCode: 'PLAN_NOT_FOUND',
      reason: 'Plan not found',
      requestId,
    });
  }

  return NextResponse.json(plan);
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Study plan updates require a configured Supabase or PostgreSQL database', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
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
    return apiError(404, {
      errorCode: 'PLAN_NOT_FOUND',
      reason: 'Plan not found',
      requestId,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Study plan deletion requires a configured Supabase or PostgreSQL database', undefined, requestId);
  }

  const userId = await getUserId(request);
  if (!userId) {
    return unauthorized(request, requestId);
  }

  const { id } = await params;

  const [deleted] = await db
    .delete(studyPlans)
    .where(and(eq(studyPlans.id, id), eq(studyPlans.userId, userId)))
    .returning();

  if (!deleted) {
    return apiError(404, {
      errorCode: 'PLAN_NOT_FOUND',
      reason: 'Plan not found',
      requestId,
    });
  }

  return NextResponse.json({ success: true });
}
