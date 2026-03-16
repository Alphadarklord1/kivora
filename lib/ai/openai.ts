export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callOpenAIChat(args: {
  model: string;
  messages: OpenAIMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<{ ok: true; content: string } | { ok: false; message: string; status?: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, message: 'OPENAI_API_KEY is not configured.', status: 503 };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxTokens ?? 1600,
        temperature: args.temperature ?? 0.7,
        stream: false,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return {
        ok: false,
        message: details || 'OpenAI request failed.',
        status: response.status,
      };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      return { ok: false, message: 'OpenAI returned an empty response.', status: 502 };
    }

    return { ok: true, content: content.trim() };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'OpenAI request failed.',
      status: 502,
    };
  }
}
