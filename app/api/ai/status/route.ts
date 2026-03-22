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

  return NextResponse.json({
    groqConfigured,
    // Primary cloud provider
    grokConfigured,
    // Secondary cloud fallback
    openaiConfigured,
    // Legacy alias — true if any cloud provider is available
    cloudConfigured: groqConfigured || grokConfigured || openaiConfigured,
    // Which provider is active
    activeCloudProvider: groqConfigured ? 'groq' : grokConfigured ? 'grok' : openaiConfigured ? 'openai' : null,
    defaultCloudModel,
    // Local offline feature
    localRuntimeUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  });
}
