'use client';

import { useEffect, useState } from 'react';
import { deriveDesktopLocalRuntimeStatus, type LocalRuntimeDescriptor } from '@/lib/ai/local-runtime';

const TTL_MS = 30_000;

let cachedStatus: LocalRuntimeDescriptor | null = null;
let cacheExpiry = 0;
let inflightPromise: Promise<LocalRuntimeDescriptor> | null = null;
const listeners = new Set<(status: LocalRuntimeDescriptor) => void>();

function broadcast(status: LocalRuntimeDescriptor) {
  cachedStatus = status;
  cacheExpiry = Date.now() + TTL_MS;
  inflightPromise = null;
  listeners.forEach((listener) => listener(status));
}

async function fetchOllamaStatus(): Promise<LocalRuntimeDescriptor> {
  try {
    const base = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
    const res = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      return {
        state: 'ready',
        source: 'ollama',
        label: 'Ollama detected',
        detail: 'Ollama is ready, so Kivora can use your local open-source model path on this device.',
        modelLabel: null,
      };
    }
  } catch {
    // fall through to missing state
  }

  return {
    state: 'missing',
    source: 'none',
    label: 'No local runtime detected',
    detail: 'Install Ollama or use the desktop app bundle to keep AI work on-device.',
    modelLabel: null,
  };
}

async function fetchStatus(): Promise<LocalRuntimeDescriptor> {
  if (cachedStatus && Date.now() < cacheExpiry) return cachedStatus;
  if (inflightPromise) return inflightPromise;

  inflightPromise = (async () => {
    if (typeof window !== 'undefined' && window.electronAPI?.desktopAI) {
      try {
        const info = await window.electronAPI.desktopAI.modelInfo();
        const desktopStatus = deriveDesktopLocalRuntimeStatus(info);
        broadcast(desktopStatus);
        return desktopStatus;
      } catch {
        // fall back to Ollama if the Electron bridge fails
      }
    }

    const ollamaStatus = await fetchOllamaStatus();
    broadcast(ollamaStatus);
    return ollamaStatus;
  })();

  return inflightPromise;
}

export function useLocalRuntimeStatus(): LocalRuntimeDescriptor {
  const [status, setStatus] = useState<LocalRuntimeDescriptor>(
    () =>
      cachedStatus ?? {
        state: 'checking',
        source: 'none',
        label: 'Checking local runtime…',
        detail: 'Looking for a bundled desktop model or an Ollama runtime.',
        modelLabel: null,
      },
  );

  useEffect(() => {
    let alive = true;
    const listener = (next: LocalRuntimeDescriptor) => {
      if (alive) setStatus(next);
    };
    listeners.add(listener);

    if (!(cachedStatus && Date.now() < cacheExpiry)) {
      void fetchStatus().then((next) => {
        if (alive) setStatus(next);
      });
    }

    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return status;
}

export function invalidateLocalRuntimeStatus() {
  cachedStatus = null;
  cacheExpiry = 0;
  inflightPromise = null;
}
