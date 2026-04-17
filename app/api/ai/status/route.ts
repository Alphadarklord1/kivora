import { NextResponse } from 'next/server';
import { DEFAULT_CLOUD_MODEL } from '@/lib/ai/runtime';
import { isGrokConfigured } from '@/lib/ai/grok';

export async function GET() {
  const grokConfigured   = isGrokConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const defaultCloudModel =
    process.env.GROK_MODEL_DEFAULT ??
    process.env.OPENAI_MODEL_DEFAULT ??
    DEFAULT_CLOUD_MODEL;

  return NextResponse.json({
    grokConfigured,
    openaiConfigured,
    cloudConfigured: grokConfigured || openaiConfigured,
    activeCloudProvider: grokConfigured ? 'grok' : openaiConfigured ? 'openai' : null,
    defaultCloudModel,
    // Local offline feature
    localRuntimeUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  });
}
