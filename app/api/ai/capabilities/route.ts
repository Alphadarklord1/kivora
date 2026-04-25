import { NextResponse } from 'next/server';
import { isDesktopOnlyModeEnabled } from '@/lib/runtime/mode';
import { DEFAULT_CLOUD_MODEL } from '@/lib/ai/runtime';
import { isGrokConfigured } from '@/lib/ai/grok';

const DEFAULT_MODEL =
  process.env.GROK_MODEL_DEFAULT ||
  process.env.OPENAI_MODEL_DEFAULT ||
  DEFAULT_CLOUD_MODEL;

export async function GET() {
  const desktopOnlyMode = isDesktopOnlyModeEnabled();
  const grokConfigured = isGrokConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const cloudConfigured = grokConfigured || openaiConfigured;

  return NextResponse.json({
    webAiEnabled: !desktopOnlyMode && cloudConfigured,
    grokConfigured,
    openaiConfigured,
    defaultModel: DEFAULT_MODEL,
    desktopOnlyMode,
  });
}
