import { NextResponse } from 'next/server';
import { DEFAULT_CLOUD_MODEL } from '@/lib/ai/runtime';
import { isGrokConfigured } from '@/lib/ai/grok';

export async function GET() {
  const grokConfigured   = isGrokConfigured();
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY);

  return NextResponse.json({
    // Primary cloud provider
    grokConfigured,
    // Secondary cloud fallback
    openaiConfigured,
    // Legacy alias — true if any cloud provider is available
    cloudConfigured: grokConfigured || openaiConfigured,
    // Which provider is active
    activeCloudProvider: grokConfigured ? 'grok' : openaiConfigured ? 'openai' : null,
    defaultCloudModel: process.env.GROK_MODEL_DEFAULT ?? process.env.OPENAI_MODEL_DEFAULT ?? DEFAULT_CLOUD_MODEL,
    // Local offline feature
    localRuntimeUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
  });
}
