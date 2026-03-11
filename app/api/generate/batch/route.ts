import { NextRequest, NextResponse } from 'next/server';
import { offlineGenerate, type ToolMode } from '@/lib/offline/generate';

const VALID_MODES: ToolMode[] = ['summarize', 'rephrase', 'notes', 'quiz', 'mcq', 'flashcards', 'assignment'];

/** POST /api/generate/batch — generate multiple modes at once */
export async function POST(req: NextRequest) {
  let body: { modes?: string[]; text?: string; options?: Record<string, unknown> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const { modes, text, options } = body;
  if (!modes?.length || !text?.trim()) {
    return NextResponse.json({ error: 'modes array and text are required.' }, { status: 400 });
  }

  const validModes = modes.filter(m => VALID_MODES.includes(m as ToolMode)) as ToolMode[];
  const results = Object.fromEntries(
    validModes.map(mode => [mode, offlineGenerate(mode, text.trim(), options)])
  );

  return NextResponse.json({ results });
}
