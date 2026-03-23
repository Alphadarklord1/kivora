'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RateLimitedError } from '@/lib/utils/fetchWithRateLimit';
export { emitRateLimitEvent } from '@/lib/utils/fetchWithRateLimit';

/**
 * Listen for rate-limit errors dispatched via the custom DOM event
 * `kivora:rate-limited` (fired by emitRateLimitEvent) and surface a
 * countdown toast.  Mount this once in AppShell.
 */

export function useRateLimitToast() {
  const [toast, setToast] = useState<{ retryAfter: number; reason: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [remaining, setRemaining] = useState(0);

  const show = useCallback((retryAfter: number, reason: string) => {
    setToast({ retryAfter, reason });
    setRemaining(retryAfter);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(timerRef.current!);
          setToast(null);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const ev = e as CustomEvent<{ retryAfterSeconds: number; reason: string }>;
      show(ev.detail.retryAfterSeconds, ev.detail.reason);
    }
    window.addEventListener('kivora:rate-limited', handler);
    return () => window.removeEventListener('kivora:rate-limited', handler);
  }, [show]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const toastJsx = toast ? (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: 'var(--bg-elevated, #1e293b)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: 12,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        maxWidth: 'calc(100vw - 48px)',
        color: 'var(--text-primary, #f1f5f9)',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      <span style={{ fontSize: 20 }}>⏳</span>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Slow down — AI rate limit reached</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #94a3b8)' }}>
          {toast.reason} Retry in <strong>{remaining}s</strong>.
        </div>
      </div>
      <button
        onClick={() => setToast(null)}
        style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 4 }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  ) : null;

  return { toastJsx };
}
