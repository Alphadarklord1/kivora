import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/errors
 * Lightweight client-side error sink. Logs errors server-side so they appear
 * in Vercel / server logs even when users don't file GitHub issues.
 * No external service required — extend with Sentry/Logtail/etc when needed.
 */

const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN   = 2000;
const MAX_PAGE_LEN    = 200;

interface ErrorPayload {
  message?: unknown;
  stack?: unknown;
  page?: unknown;
  kind?: unknown;   // 'render' | 'unhandled-rejection' | 'script'
}

export async function POST(req: NextRequest) {
  // Only accept requests from the app's own origin
  const origin = req.headers.get('origin');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const isLocalhost = origin?.startsWith('http://localhost') ?? false;
  if (origin && !isLocalhost && appUrl && !origin.startsWith(appUrl)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let payload: ErrorPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const message = String(payload.message ?? '').slice(0, MAX_MESSAGE_LEN);
  const stack   = String(payload.stack   ?? '').slice(0, MAX_STACK_LEN);
  const page    = String(payload.page    ?? '').slice(0, MAX_PAGE_LEN);
  const kind    = String(payload.kind    ?? 'unknown');

  if (!message) return NextResponse.json({ ok: false }, { status: 400 });

  // Server log — visible in Vercel Functions logs, local terminal, etc.
  console.error(`[client-error] kind=${kind} page=${page}\n  message: ${message}${stack ? `\n  stack: ${stack.split('\n').slice(0, 5).join(' | ')}` : ''}`);

  return NextResponse.json({ ok: true });
}
