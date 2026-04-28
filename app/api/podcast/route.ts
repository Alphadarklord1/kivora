import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { callAi } from '@/lib/ai/call';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';

// Allowlist of style strings — anything else is treated as 'summary' so an
// attacker can't smuggle prompt-injection text into the system message.
const ALLOWED_STYLES = new Set(['summary', 'deep-dive', 'qa']);

// Title goes straight into the system prompt; sanitise so it can't break
// the surrounding quoting or inject new instructions.
function sanitizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') return 'Study Notes';
  return raw.replace(/[\r\n`]/g, ' ').trim().slice(0, 120) || 'Study Notes';
}

// POST /api/podcast
// Body: { text: string; title?: string; style?: 'summary' | 'deep-dive' | 'qa' }
// Returns: { script: string; title: string }
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimited = enforceAiRateLimit(req);
  if (rateLimited) return rateLimited;

  const body = await req.json().catch(() => null);
  if (!body?.text || typeof body.text !== 'string' || body.text.trim().length < 20) {
    return NextResponse.json({ error: 'Provide study notes to convert.' }, { status: 400 });
  }

  const text = body.text.slice(0, 8000);
  const rawStyle = typeof body.style === 'string' ? body.style : 'summary';
  const style: string = ALLOWED_STYLES.has(rawStyle) ? rawStyle : 'summary';
  const topicTitle: string = sanitizeTitle(body.title);

  const styleGuide =
    style === 'qa'
      ? 'Format it as a Q&A between a host and a student. The host asks questions, the student answers clearly.'
      : style === 'deep-dive'
      ? 'Go into depth on each concept. Explain the why behind each idea, give analogies, and connect ideas together.'
      : 'Give a clear, engaging summary. Cover the key points conversationally, as if explaining to a friend before an exam.';

  const systemPrompt = `You are a podcast script writer for students. Convert study notes into a spoken podcast episode.
${styleGuide}

Rules:
- Write in natural spoken language — no bullet points, no headers, no markdown
- Keep it between 300-600 words
- Start with: "Welcome to Kivora Learning. Today we're covering: ${topicTitle}."
- End with: "That's a wrap on ${topicTitle}. Good luck with your studies!"
- Be accurate to the source material — don't invent facts`;

  try {
    const { result } = await callAi({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Convert these notes into a podcast script:\n\n${text}` },
      ],
      maxTokens: 1200,
      temperature: 0.5,
      offlineFallback: () =>
        `Welcome to Kivora Learning. Today we're covering: ${topicTitle}.\n\n${text.slice(0, 800)}\n\nThat's a wrap on ${topicTitle}. Good luck with your studies!`,
    });

    return NextResponse.json({ script: result.trim(), title: topicTitle });
  } catch (err) {
    console.error('[podcast] generation failed', err);
    return NextResponse.json(
      { error: 'Could not generate the podcast script. Try again.' },
      { status: 502 },
    );
  }
}
