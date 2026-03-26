'use client';

import { recordCrashSummary } from '@/lib/privacy/preferences';

let installed = false;

function sendToServer(payload: {
  message: string;
  stack?: string;
  page: string;
  kind: string;
}) {
  // Best-effort — never throws, never blocks the user
  try {
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true, // survives page unload
    });
  } catch { /* noop */ }
}

/**
 * Install global window.onerror and unhandledrejection handlers.
 * Safe to call multiple times — only installs once per session.
 */
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const page = () => window.location.pathname;

  // Uncaught synchronous script errors
  window.onerror = (message, _source, _line, _col, error) => {
    const msg = error?.message ?? String(message);
    recordCrashSummary({ message: msg, page: page() });
    sendToServer({ message: msg, stack: error?.stack, page: page(), kind: 'script' });
    return false; // don't suppress default browser logging
  };

  // Unhandled promise rejections (async errors)
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error
      ? reason.message
      : String(reason ?? 'Unhandled promise rejection');
    const stack = reason instanceof Error ? reason.stack : undefined;
    recordCrashSummary({ message: msg, page: page() });
    sendToServer({ message: msg, stack, page: page(), kind: 'unhandled-rejection' });
  });
}
