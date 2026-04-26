import { NextResponse } from 'next/server';
import { DEFAULT_CLOUD_MODEL } from '@/lib/ai/runtime';
import { isGrokConfigured } from '@/lib/ai/grok';
import { isGroqConfigured } from '@/lib/ai/groq';

export async function GET() {
  const groqConfigured   = isGroqConfigured();
  const grokConfigured   = isGrokConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const defaultCloudModel =
    process.env.GROQ_MODEL_DEFAULT ??
    process.env.GROK_MODEL_DEFAULT ??
    process.env.OPENAI_MODEL_DEFAULT ??
    DEFAULT_CLOUD_MODEL;

  const activeCloudProvider = groqConfigured
    ? 'groq'
    : grokConfigured
      ? 'grok'
      : openaiConfigured
        ? 'openai'
        : null;

  return NextResponse.json({
    groqConfigured,
    grokConfigured,
    openaiConfigured,
    cloudConfigured: groqConfigured || grokConfigured || openaiConfigured,
    activeCloudProvider,
    defaultCloudModel,
    // Local offline feature
    localRuntimeUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  });
}
