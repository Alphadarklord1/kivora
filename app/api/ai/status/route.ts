import { NextResponse } from 'next/server';
import { DEFAULT_CLOUD_MODEL } from '@/lib/ai/runtime';

export async function GET() {
  return NextResponse.json({
    cloudConfigured: Boolean(process.env.OPENAI_API_KEY),
    defaultCloudModel: process.env.OPENAI_MODEL_DEFAULT || DEFAULT_CLOUD_MODEL,
    localRuntimeUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  });
}
