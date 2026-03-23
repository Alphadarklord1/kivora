import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2-vision';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64 } = body as { imageBase64?: string };
    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
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
    const message = err instanceof Error ? err.message : String(err);
    // Surface a friendly fallback rather than a raw error or silent crash
    return NextResponse.json(
      { error: 'OCR requires a local vision model (Ollama). For now, type your problem manually.', detail: message },
      { status: 500 },
    );
  }
}
