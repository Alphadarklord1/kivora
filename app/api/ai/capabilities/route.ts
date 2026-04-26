import { NextResponse } from 'next/server';
import { isDesktopOnlyModeEnabled } from '@/lib/runtime/mode';
import { DEFAULT_CLOUD_MODEL } from '@/lib/ai/runtime';
import { isGrokConfigured } from '@/lib/ai/grok';
import { isGroqConfigured } from '@/lib/ai/groq';

const DEFAULT_MODEL =
  process.env.GROQ_MODEL_DEFAULT ||
  process.env.GROK_MODEL_DEFAULT ||
  process.env.OPENAI_MODEL_DEFAULT ||
  DEFAULT_CLOUD_MODEL;

export async function GET() {
  const desktopOnlyMode = isDesktopOnlyModeEnabled();
  const groqConfigured = isGroqConfigured();
  const grokConfigured = isGrokConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const cloudConfigured = groqConfigured || grokConfigured || openaiConfigured;

  return NextResponse.json({
    webAiEnabled: !desktopOnlyMode && cloudConfigured,
    groqConfigured,
    grokConfigured,
    openaiConfigured,
    defaultModel: DEFAULT_MODEL,
    desktopOnlyMode,
  });
}
