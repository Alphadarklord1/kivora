/**
 * Scholar Hub session list + create.
 *
 *   GET  /api/coach/sessions?kind=research|report|grade&limit=20
 *        → { sessions: Array<{ id, kind, title, createdAt, updatedAt }> }
 *
 *   POST /api/coach/sessions
 *        body: { kind, title, payload }
 *        → { id, kind, title, createdAt, updatedAt }
 *
 * Falls back to a 503 with a clear error when the database isn't
 * configured — the client is expected to fall back to localStorage in
 * that case (mirrors the existing /api/files local-only fallback pattern).
 */

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, isDatabaseConfigured } from '@/lib/db';
import { coachSessions } from '@/lib/db/schema';
import { getUserId } from '@/lib/auth/session';
import { databaseUnavailable, unauthorized } from '@/lib/api/runtime-guards';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { checkCoachWriteLimit } from '@/lib/api/auth-rate-limit';

const VALID_KINDS = new Set(['research', 'report', 'grade']);

/**
 * Maximum payload size accepted by POST/PATCH on coach sessions.
 * Postgres jsonb max is 1GB but allowing arbitrary client payloads is a
 * footgun — a malicious client could exhaust storage. 256KB comfortably
 * fits realistic research sessions (sources + key ideas + overview) and
 * graded reports while bounding the worst case.
 */
export const MAX_COACH_PAYLOAD_BYTES = 256 * 1024;

export function payloadTooLarge(payload: unknown): boolean {
  // JSON.stringify is O(n) but called once per write — acceptable cost
  // to avoid storing an unbounded blob. Failure to serialize (e.g.
  // circular references) also signals "don't accept this".
  try {
    return JSON.stringify(payload).length > MAX_COACH_PAYLOAD_BYTES;
  } catch {
    return true;
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Coach sessions require a database connection.', undefined, requestId);
  }
  const userId = await getUserId(request);
  if (!userId) return unauthorized(request, requestId);

  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? '20') || 20));

  try {
    const where = kindParam && VALID_KINDS.has(kindParam)
      ? and(eq(coachSessions.userId, userId), eq(coachSessions.kind, kindParam))
      : eq(coachSessions.userId, userId);

    const rows = await db
      .select({
        id: coachSessions.id,
        kind: coachSessions.kind,
        title: coachSessions.title,
        createdAt: coachSessions.createdAt,
        updatedAt: coachSessions.updatedAt,
      })
      .from(coachSessions)
      .where(where)
      .orderBy(desc(coachSessions.updatedAt))
      .limit(limit);

    return NextResponse.json({ sessions: rows });
  } catch (error) {
    console.error(`[coach/sessions GET][${requestId}]`, error);
    return apiError(500, {
      errorCode: 'COACH_SESSIONS_LIST_FAILED',
      reason: 'Failed to load coach sessions',
      requestId,
    });
  }
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  // Per-IP rate limit prevents a single user from spamming creates and
  // exhausting storage quota. 50 writes per 10 min comfortably covers
  // realistic save-from-UI usage and stops scripted abuse.
  const rateLimited = checkCoachWriteLimit(request);
  if (rateLimited) return rateLimited;
  if (!isDatabaseConfigured) {
    return databaseUnavailable(request, 'Coach sessions require a database connection.', undefined, requestId);
  }
  const userId = await getUserId(request);
  if (!userId) return unauthorized(request, requestId);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return apiError(400, { errorCode: 'INVALID_JSON', reason: 'Request body must be valid JSON.', requestId });
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const payload = body.payload;

  if (!VALID_KINDS.has(kind)) {
    return apiError(400, {
      errorCode: 'INVALID_KIND',
      reason: `kind must be one of: ${Array.from(VALID_KINDS).join(', ')}`,
      requestId,
    });
  }
  if (!title) {
    return apiError(400, { errorCode: 'MISSING_TITLE', reason: 'title is required', requestId });
  }
  if (!payload || typeof payload !== 'object') {
    return apiError(400, { errorCode: 'MISSING_PAYLOAD', reason: 'payload object is required', requestId });
  }
  if (payloadTooLarge(payload)) {
    return apiError(413, {
      errorCode: 'PAYLOAD_TOO_LARGE',
      reason: `payload exceeds the ${MAX_COACH_PAYLOAD_BYTES / 1024} KB maximum.`,
      requestId,
    });
  }

  try {
    const [row] = await db
      .insert(coachSessions)
      .values({
        userId,
        kind,
        title: title.slice(0, 200),
        payload,
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error(`[coach/sessions POST][${requestId}]`, error);
    return apiError(500, {
      errorCode: 'COACH_SESSIONS_CREATE_FAILED',
      reason: 'Failed to save coach session',
      requestId,
    });
  }
}
