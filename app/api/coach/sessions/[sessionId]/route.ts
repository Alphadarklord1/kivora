/**
 * Scholar Hub single-session read, update, and delete.
 *
 *   GET    /api/coach/sessions/[sessionId] → full session record
 *   PATCH  /api/coach/sessions/[sessionId] → update title and/or payload
 *   DELETE /api/coach/sessions/[sessionId] → remove
 *
 * All operations require the session to belong to the authenticated user;
 * cross-user reads return 404 (not 403) to avoid leaking session existence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { coachSessions } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/session';
import { databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { checkCoachWriteLimit } from '@/lib/api/auth-rate-limit';
import { MAX_COACH_PAYLOAD_BYTES, payloadTooLarge } from '@/app/api/coach/sessions/route';

type RouteContext = { params: Promise<{ sessionId: string }> };

async function loadOwnedSession(userId: string, sessionId: string) {
  return db.query.coachSessions.findFirst({
    where: and(eq(coachSessions.id, sessionId), eq(coachSessions.userId, userId)),
  });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Coach sessions require a database connection.', undefined, requestId);
  }
  const userId = await getUserId(request);
  if (!userId) return unauthorized(request, requestId);

  const { sessionId } = await params;
  if (!sessionId) {
    return apiError(400, { errorCode: 'MISSING_SESSION_ID', reason: 'sessionId is required', requestId });
  }

  try {
    const session = await loadOwnedSession(userId, sessionId);
    if (!session) {
      return apiError(404, { errorCode: 'SESSION_NOT_FOUND', reason: 'Coach session not found', requestId });
    }
    return NextResponse.json(session);
  } catch (error) {
    console.error(`[coach/sessions GET][${requestId}]`, error);
    return apiError(500, { errorCode: 'COACH_SESSION_READ_FAILED', reason: 'Failed to load session', requestId });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId(request);
  // Same per-IP write limit as POST — PATCH is the other unbounded write
  // path, so we apply the same shared limiter rather than a separate one.
  const rateLimited = checkCoachWriteLimit(request);
  if (rateLimited) return rateLimited;
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Coach sessions require a database connection.', undefined, requestId);
  }
  const userId = await getUserId(request);
  if (!userId) return unauthorized(request, requestId);

  const { sessionId } = await params;
  if (!sessionId) {
    return apiError(400, { errorCode: 'MISSING_SESSION_ID', reason: 'sessionId is required', requestId });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(400, { errorCode: 'INVALID_JSON', reason: 'Request body must be valid JSON.', requestId });
  }

  const updates: { title?: string; payload?: unknown; updatedAt: Date } = { updatedAt: new Date() };
  if (typeof body.title === 'string' && body.title.trim()) {
    updates.title = body.title.trim().slice(0, 200);
  }
  if (body.payload && typeof body.payload === 'object') {
    if (payloadTooLarge(body.payload)) {
      return apiError(413, {
        errorCode: 'PAYLOAD_TOO_LARGE',
        reason: `payload exceeds the ${MAX_COACH_PAYLOAD_BYTES / 1024} KB maximum.`,
        requestId,
      });
    }
    updates.payload = body.payload;
  }
  if (!('title' in updates) && !('payload' in updates)) {
    return apiError(400, {
      errorCode: 'NO_UPDATES',
      reason: 'Provide title and/or payload to update.',
      requestId,
    });
  }

  try {
    const existing = await loadOwnedSession(userId, sessionId);
    if (!existing) {
      return apiError(404, { errorCode: 'SESSION_NOT_FOUND', reason: 'Coach session not found', requestId });
    }
    const [row] = await db
      .update(coachSessions)
      .set(updates)
      .where(eq(coachSessions.id, sessionId))
      .returning();
    return NextResponse.json(row);
  } catch (error) {
    console.error(`[coach/sessions PATCH][${requestId}]`, error);
    return apiError(500, { errorCode: 'COACH_SESSION_UPDATE_FAILED', reason: 'Failed to update session', requestId });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Coach sessions require a database connection.', undefined, requestId);
  }
  const userId = await getUserId(request);
  if (!userId) return unauthorized(request, requestId);

  const { sessionId } = await params;
  if (!sessionId) {
    return apiError(400, { errorCode: 'MISSING_SESSION_ID', reason: 'sessionId is required', requestId });
  }

  try {
    const existing = await loadOwnedSession(userId, sessionId);
    if (!existing) {
      return apiError(404, { errorCode: 'SESSION_NOT_FOUND', reason: 'Coach session not found', requestId });
    }
    await db.delete(coachSessions).where(eq(coachSessions.id, sessionId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[coach/sessions DELETE][${requestId}]`, error);
    return apiError(500, { errorCode: 'COACH_SESSION_DELETE_FAILED', reason: 'Failed to delete session', requestId });
  }
}
