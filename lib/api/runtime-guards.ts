import { NextRequest, NextResponse } from 'next/server';
import { apiError, createRequestId } from '@/lib/api/error-response';

export function betaReadFallback<T>(payload: T, headers?: HeadersInit) {
  return NextResponse.json(payload, headers ? { headers } : undefined);
}

export function databaseUnavailable(
  request: NextRequest,
  reason: string,
  details?: string,
  requestId?: string
) {
  return apiError(503, {
    errorCode: 'DATABASE_NOT_CONFIGURED',
    reason,
    details,
    requestId: requestId ?? createRequestId(request),
  });
}

export function unauthorized(request: NextRequest, requestId?: string) {
  return apiError(401, {
    errorCode: 'UNAUTHORIZED',
    reason: 'Authentication required',
    requestId: requestId ?? createRequestId(request),
  });
}
