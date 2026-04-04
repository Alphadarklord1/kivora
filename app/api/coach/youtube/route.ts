import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { extractYouTubeVideoId, fetchYouTubeTranscript } from '@/lib/coach/youtube';

/**
 * POST /api/coach/youtube
 * Body: { url: string }
 * Returns: { videoId, title, channelName, transcript, wordCount, durationSeconds }
 *
 * Fetches the auto-generated or manual captions for a public YouTube video.
 * No API key required.
 */
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

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: 'Provide a YouTube video URL.' }, { status: 400 });
  }

  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    return NextResponse.json({ error: 'Not a valid YouTube video URL.' }, { status: 400 });
  }

  try {
    const result = await fetchYouTubeTranscript(videoId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not fetch transcript for this video.' },
      { status: 400 },
    );
  }
}
