import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { resolveAiDataMode } from '@/lib/privacy/ai-data';
import { parseManualUrls, researchTopic, type ResearchMode, type ResearchRanking } from '@/lib/coach/research';

export async function POST(req: NextRequest) {
  const guardResult = await requireAppAccess(req);
  if (guardResult) return guardResult;
  const rateLimitResponse = enforceAiRateLimit(req);
  if (rateLimitResponse) return rateLimitResponse;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const mode = body.mode === 'manual' || body.mode === 'hybrid' ? body.mode : 'automatic';
  const ranking =
    body.ranking === 'academic-first' || body.ranking === 'broad-web'
      ? body.ranking
      : 'balanced';
  const includeWeb = body.includeWeb !== false;
  const manualUrlsRaw = typeof body.manualUrls === 'string' ? body.manualUrls : '';
  const ai = body.ai && typeof body.ai === 'object' ? body.ai as Record<string, unknown> : {};
  const privacyMode = resolveAiDataMode(body);

  if (!topic) {
    return NextResponse.json({ error: 'Enter a topic to research.' }, { status: 400 });
  }

  try {
    const result = await researchTopic({
      topic,
      mode: mode as ResearchMode,
      ranking: ranking as ResearchRanking,
      includeWeb,
      manualUrls: parseManualUrls(manualUrlsRaw),
      aiPrefs: ai,
      privacyMode,
      braveKey: process.env.BRAVE_SEARCH_API_KEY ?? '',
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not research this topic.' },
      { status: 400 },
    );
  }
}
