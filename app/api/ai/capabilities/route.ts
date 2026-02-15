import { NextResponse } from 'next/server';
import { isDesktopOnlyModeEnabled } from '@/lib/runtime/mode';

const DEFAULT_MODEL = process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o-mini';

export async function GET() {
  const desktopOnlyMode = isDesktopOnlyModeEnabled();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

  return NextResponse.json({
    webAiEnabled: !desktopOnlyMode && openaiConfigured,
    openaiConfigured,
    defaultModel: DEFAULT_MODEL,
    desktopOnlyMode,
  });
}
