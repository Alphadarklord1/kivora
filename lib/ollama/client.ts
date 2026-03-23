const OLLAMA_BASE = 'http://localhost:11434';

export type OllamaStatus = 'not-running' | 'running';

/**
 * Ping Ollama. Returns 'running' if the API responds, 'not-running' on any
 * network / connection error.
 */
export async function checkOllamaStatus(): Promise<OllamaStatus> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) return 'running';
    return 'not-running';
  } catch {
    return 'not-running';
  }
}

/** Returns the bare model name strings from /api/tags, e.g. ["qwen2.5:latest"]. */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      models?: Array<{ name: string }>;
    };
    return (data.models ?? []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Pull a model from Ollama, streaming NDJSON progress back via `onProgress`.
 * Resolves when the pull is complete.
 */
export async function pullOllamaModel(
  name: string,
  onProgress: (pct: number, status: string) => void,
): Promise<void> {
  const response = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`Ollama pull failed with status ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body from Ollama pull');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last (possibly partial) line in the buffer
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const chunk = JSON.parse(trimmed) as {
          status?: string;
          completed?: number;
          total?: number;
          error?: string;
        };
        if (chunk.error) throw new Error(chunk.error);
        const status = chunk.status ?? '';
        const pct =
          chunk.total && chunk.total > 0
            ? Math.round((chunk.completed ?? 0) / chunk.total * 100)
            : 0;
        onProgress(pct, status);
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) continue; // incomplete JSON line — skip
        throw parseErr;
      }
    }
  }
}
