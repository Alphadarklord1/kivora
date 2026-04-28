'use client';

import { useCallback, useRef } from 'react';

/**
 * Wrap an async handler so it can only run once at a time.
 *
 * Why this exists: many submit / generate / save buttons in the app set a
 * `loading` state to drive `disabled={loading}`, but React doesn't flush
 * that disabled state before the next click event fires. An impatient
 * user double-clicking can trigger the handler twice before the DOM
 * actually catches up — duplicating sign-in attempts, generations, or
 * library saves.
 *
 * This hook keeps a `useRef` flag that flips synchronously the moment the
 * handler starts, so the second call is rejected immediately. The flag
 * resets in a `finally` block so a follow-up click works after the work
 * completes (or throws).
 *
 * Use it like:
 *
 *   const submit = useSingleFlight(async () => {
 *     setLoading(true);
 *     await doExpensiveThing();
 *     setLoading(false);
 *   });
 *   <button onClick={submit}>Generate</button>
 *
 * The original `setLoading` / `disabled` pattern is still useful for the
 * spinner UI — this just guarantees the work itself is single-flight.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSingleFlight<T extends (...args: any[]) => Promise<unknown>>(handler: T): T {
  const inFlight = useRef(false);
  return useCallback(async (...args: Parameters<T>) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await handler(...args);
    } finally {
      inFlight.current = false;
    }
  }, [handler]) as unknown as T;
}
