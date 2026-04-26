import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { callAi } from '@/lib/ai/call';

// POST /api/podcast
// Body: { text: string; title?: string; style?: 'summary' | 'deep-dive' | 'qa' }
// Returns: { script: string; title: string }
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.text || typeof body.text !== 'string' || body.text.trim().length < 20) {
    return NextResponse.json({ error: 'Provide study notes to convert.' }, { status: 400 });
  }

  const text = body.text.slice(0, 8000);
  const style: string = body.style ?? 'summary';
  const topicTitle: string = body.title ?? 'Study Notes';

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
}
