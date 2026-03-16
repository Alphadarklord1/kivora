'use client';

import { useEffect, useState } from 'react';

export type OllamaStatus = 'checking' | 'ready' | 'missing';

// Module-level singleton: one in-flight fetch shared by all hook instances.
// Result is cached for TTL_MS so repeated mounts don't spam the server.
const TTL_MS = 30_000; // 30 seconds

let cachedStatus: OllamaStatus | null = null;
let cacheExpiry = 0;
let inflightPromise: Promise<OllamaStatus> | null = null;
const listeners = new Set<(s: OllamaStatus) => void>();

function broadcast(status: OllamaStatus) {
  cachedStatus = status;
  cacheExpiry = Date.now() + TTL_MS;
  inflightPromise = null;
  listeners.forEach(fn => fn(status));
}

async function fetchStatus(): Promise<OllamaStatus> {
  if (cachedStatus && Date.now() < cacheExpiry) return cachedStatus;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    try {
      const base = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
      const res = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2500) });
      const status: OllamaStatus = res.ok ? 'ready' : 'missing';
      broadcast(status);
      return status;
    } catch {
      broadcast('missing');
      return 'missing';
    }
  })();

  return inflightPromise;
}

/**
 * Returns the Ollama runtime status shared across all consumers.
 * Only one network request is made per TTL window regardless of how many
 * components call this hook simultaneously.
 */
export function useOllamaStatus(): OllamaStatus {
  const [status, setStatus] = useState<OllamaStatus>(() => cachedStatus ?? 'checking');

  useEffect(() => {
    let alive = true;
    const listener = (s: OllamaStatus) => { if (alive) setStatus(s); };
    listeners.add(listener);

    // If already cached, set immediately; otherwise trigger fetch.
    if (cachedStatus && Date.now() < cacheExpiry) {
      setStatus(cachedStatus);
    } else {
      void fetchStatus().then(s => { if (alive) setStatus(s); });
    }

    return () => { alive = false; listeners.delete(listener); };
  }, []);

  return status;
}

/** Invalidate the cache so the next call triggers a fresh check. */
export function invalidateOllamaStatus() {
  cachedStatus = null;
  cacheExpiry = 0;
  inflightPromise = null;
}
