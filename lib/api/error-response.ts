import { NextRequest, NextResponse } from 'next/server';

export interface ApiErrorPayload {
  errorCode: string;
  reason: string;
  details?: string;
  requestId?: string;
}

export function createRequestId(request: NextRequest): string {
  const forwarded = request.headers.get('x-request-id');
  if (forwarded && forwarded.trim()) return forwarded.trim();
  return crypto.randomUUID();
}

export function apiError(
  status: number,
  payload: ApiErrorPayload
): NextResponse<ApiErrorPayload> {
  return NextResponse.json(payload, { status });
}
