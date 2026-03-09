import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { studyPlans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { betaReadFallback, databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return betaReadFallback([], { 'x-studypilot-fallback': 'study-plans-no-db' });
    }

    const userId = await getUserId(request);
    if (!userId) {
      return unauthorized(request, requestId);
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let plans = await db.query.studyPlans.findMany({
      where: eq(studyPlans.userId, userId),
      orderBy: [desc(studyPlans.createdAt)],
    });

    if (status) {
      plans = plans.filter(plan => plan.status === status);
    }

    return NextResponse.json(plans);
  } catch (error) {
    console.error(`[StudyPlans][${requestId}] GET failed`, error);
    if (isGuestModeEnabled()) {
      return betaReadFallback([], { 'x-studypilot-fallback': 'study-plans-db-error' });
    }
    return apiError(500, {
      errorCode: 'STUDY_PLANS_FETCH_FAILED',
      reason: 'Failed to fetch study plans',
      requestId,
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    if (!isDatabaseConfigured) {
      return databaseUnavailable(request, 'Study plan creation requires DATABASE_URL to be configured', undefined, requestId);
    }

    const userId = await getUserId(request);
    if (!userId) {
      return unauthorized(request, requestId);
    }

    const body = await request.json();
    const { title, examDate, dailyMinutes, topics, schedule, folderId, source, coachContext } = body;

    if (!title || !examDate || !topics || !schedule) {
      return apiError(400, {
        errorCode: 'INVALID_STUDY_PLAN',
        reason: 'Title, exam date, topics, and schedule are required',
        requestId,
      });
    }

    const scheduleWithMeta =
      source || coachContext
        ? {
            ...schedule,
            _meta: {
              source: source || 'manual',
              coachContext: coachContext || null,
            },
          }
        : schedule;

    const [newPlan] = await db.insert(studyPlans).values({
      userId,
      title,
      examDate: new Date(examDate),
      dailyMinutes: dailyMinutes || 60,
      folderId: folderId || null,
      topics,
      schedule: scheduleWithMeta,
      status: 'active',
      progress: 0,
    }).returning();

    return NextResponse.json(newPlan, { status: 201 });
  } catch (error) {
    console.error(`[StudyPlans][${requestId}] POST failed`, error);
    return databaseUnavailable(request, 'Study plan creation is temporarily unavailable because the database is not reachable', undefined, requestId);
  }
}
