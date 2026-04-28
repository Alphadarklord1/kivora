import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2-vision';

// 5 MB base64 ≈ 3.7 MB image. Plenty for handwritten math, while keeping
// outbound requests to the Ollama vision model bounded.
const MAX_IMAGE_BASE64_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // Previous version had no auth and no rate limit, so any caller could
    // tunnel arbitrary base64 data through Ollama. Lock both down.
    const userId = await getUserId(req);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimited = enforceAiRateLimit(req);
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const { imageBase64 } = body as { imageBase64?: string };
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_BYTES) {
      return NextResponse.json({ error: 'Image too large (max ~3.7MB)' }, { status: 413 });
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    // Try Ollama vision model
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: 'Extract the mathematical expression from this image. Return ONLY the math expression in plain text suitable for a math solver (use ^ for powers, * for multiplication, / for division). No explanation, just the expression.',
        images: [base64Data],
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      const expression = (data.response as string)?.trim();
      if (expression) {
        return NextResponse.json({ expression });
      }
    }

    // Try OpenAI-compatible vision
    const chatRes = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the mathematical expression from this image. Return ONLY the math expression in plain text (use ^ for powers, * for multiplication). No explanation.' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
          ],
        }],
        max_tokens: 200,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (chatRes.ok) {
      const data = await chatRes.json();
      const expression = data.choices?.[0]?.message?.content?.trim();
      if (expression) {
        return NextResponse.json({ expression });
      }
    }

    return NextResponse.json(
      { error: 'OCR requires a local vision model (Ollama). For now, type your problem manually.' },
      { status: 503 },
    );
  } catch (err) {
    // Log the raw error, but don't leak it to the client. The previous
    // `detail: message` field could surface stack traces or internal URLs.
    console.error('[math-ocr] failed', err);
    return NextResponse.json(
      { error: 'OCR requires a local vision model (Ollama). For now, type your problem manually.' },
      { status: 500 },
    );
  }
}
