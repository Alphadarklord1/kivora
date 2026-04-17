import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_OCR_MODEL ?? process.env.OLLAMA_MODEL ?? 'llava';
const OCR_PROMPT = 'Extract the mathematical expression from this image. Return ONLY the math expression in plain text suitable for a math solver (use ^ for powers, * for multiplication, / for division). No explanation, just the expression.';

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
        prompt: OCR_PROMPT,
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
            { type: 'text', text: OCR_PROMPT },
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

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_OCR_MODEL ?? process.env.OPENAI_MODEL_DEFAULT ?? 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: OCR_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } },
            ],
          }],
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (openaiRes.ok) {
        const data = await openaiRes.json();
        const expression = data.choices?.[0]?.message?.content?.trim();
        if (expression) {
          return NextResponse.json({ expression });
        }
      }
    }


    return NextResponse.json(
      { error: 'Could not extract math from the image. Try typing the problem manually.' },
      { status: 503 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: 'Could not extract math from the image. Try typing the problem manually.', detail: message },
      { status: 500 },
    );
  }
}
