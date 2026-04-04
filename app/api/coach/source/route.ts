import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { isYouTubeUrl, fetchYouTubeTranscript, extractYouTubeVideoId } from '@/lib/coach/youtube';
import { offlineGenerate } from '@/lib/offline/generate';
import { callGrokChat, isGrokConfigured } from '@/lib/ai/grok';
import { callGroqChat, isGroqConfigured } from '@/lib/ai/groq';
import { callOpenAIChat } from '@/lib/ai/openai';
import { resolveAiRuntimeRequest, shouldTryCloud, shouldTryLocal } from '@/lib/ai/server-routing';
import { cloudProviderForModel } from '@/lib/ai/runtime';
import {
  buildFallbackSourceBrief,
  extractSourceMetaFromText,
  extractSourceMetaFromHtml,
  normalizeSourceBriefUrl,
  type SourceBrief,
} from '@/lib/coach/source-brief';
import { resolveAiDataMode } from '@/lib/privacy/ai-data';

const SYSTEM_PROMPT = 'You are a study assistant. Explain what a source is about clearly for students. Return concise plain text.';

function parseKeyPoints(content: string, summary?: string) {
  const summaryNorm = summary?.toLowerCase().trim() ?? '';
  return Array.from(new Set(
    content
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((line) => {
        if (line.length < 20) return false;
        // Skip header lines and the summary line
        if (/^(summary|key\s*points?)[:\s]/i.test(line)) return false;
        // Skip lines that substantially overlap with the summary
        if (summaryNorm && line.toLowerCase().startsWith(summaryNorm.slice(0, 40))) return false;
        return true;
      }),
  )).slice(0, 4);
}

function parseSummary(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^key points[:]?$/i.test(line)) ?? content.trim();
}

/**
 * Blocks requests targeting private/loopback address ranges to prevent SSRF.
 * Throws with a user-friendly message when the URL is disallowed.
 */
function assertNotPrivateUrl(url: URL): void {
  // Only allow http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Block loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    throw new Error('This URL points to a local address and cannot be analyzed.');
  }

  // Block IPv4 private/link-local ranges
  const ipv4Private = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.)/;
  if (ipv4Private.test(host)) {
    throw new Error('This URL points to a private network address and cannot be analyzed.');
  }

  // Block cloud metadata services
  if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === 'metadata.internal') {
    throw new Error('This URL points to a cloud metadata service and cannot be analyzed.');
  }

  // Block IPv6 private/link-local ranges (fc00::/7 = fc** or fd**; fe80::/10 link-local)
  if (/^f[cd]/i.test(host) || /^fe[89ab]/i.test(host)) {
    throw new Error('This URL points to a private network address and cannot be analyzed.');
  }
}

async function generateSourceBrief(meta: Omit<SourceBrief, 'summary' | 'keyPoints'>, aiPrefs: Record<string, unknown>) {
  const prompt = [
    'Explain what this source is about for a student.',
    'Return plain text in exactly this shape:',
    'Summary: <2-3 sentence summary>',
    'Key points:',
    '- <point 1>',
    '- <point 2>',
    '- <point 3>',
    '',
    `Title: ${meta.title}`,
    `Site: ${meta.siteName ?? 'Unknown source'}`,
    meta.description ? `Description: ${meta.description}` : '',
    '',
    meta.extractedText.slice(0, 12_000),
  ].filter(Boolean).join('\n');

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: prompt },
  ];

  const { mode, localModel, cloudModel } = resolveAiRuntimeRequest({ ai: aiPrefs });
  const provider = cloudProviderForModel(cloudModel);

  if (shouldTryCloud(mode) && (provider === 'groq' || isGroqConfigured())) {
    const groqModel = provider === 'groq' ? cloudModel : 'openai/gpt-oss-20b';
    const result = await callGroqChat({ model: groqModel, messages, maxTokens: 900, temperature: 0.3 });
    if (result.ok && result.content.trim()) {
      return result.content.trim();
    }
  }

  if (shouldTryCloud(mode) && (provider === 'grok' || isGrokConfigured())) {
    const grokModel = provider === 'grok' ? cloudModel : 'grok-3-fast';
    const result = await callGrokChat({ model: grokModel, messages, maxTokens: 900, temperature: 0.3 });
    if (result.ok && result.content.trim()) {
      return result.content.trim();
    }
  }

  if (shouldTryLocal(mode)) {
    const ollamaBase = process.env.OLLAMA_URL ?? 'http://localhost:11434';
    try {
      const res = await fetch(`${ollamaBase}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: localModel, messages, max_tokens: 900, temperature: 0.3, stream: false }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.ok) {
        const data = await res.json();
        const content = data?.choices?.[0]?.message?.content ?? '';
        if (content.trim()) return content.trim();
      }
    } catch {
      // fall through to cloud/offline
    }
  }

  if (shouldTryCloud(mode)) {
    const openaiModel = provider === 'openai' ? cloudModel : 'gpt-4o-mini';
    const result = await callOpenAIChat({ model: openaiModel, messages, maxTokens: 900, temperature: 0.3 });
    if (result.ok && result.content.trim()) {
      return result.content.trim();
    }
  }

  const summary = offlineGenerate('summarize', meta.extractedText);
  const notes = offlineGenerate('notes', meta.extractedText);
  return `Summary: ${summary}\n\nKey points:\n${notes
    .split('\n')
    .map((line) => line.replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => `- ${line}`)
    .join('\n')}`;
}

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

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const rawText = typeof body.text === 'string' ? body.text : '';
  const rawTitle = typeof body.title === 'string' ? body.title : '';
  const rawSourceLabel = typeof body.sourceLabel === 'string' ? body.sourceLabel.trim() : '';
  const requestedSourceType = body.sourceType === 'file' ? 'file' : 'manual-text';
  const ai = body.ai && typeof body.ai === 'object' ? body.ai as Record<string, unknown> : {};
  const privacyMode = resolveAiDataMode(body);

  if (!rawText.trim() && !rawUrl.trim()) {
    return NextResponse.json({ error: 'Provide either a source URL or pasted text.' }, { status: 400 });
  }

  let brief: SourceBrief;

  // ── YouTube transcript path ───────────────────────────────────────────────
  if (rawUrl.trim() && isYouTubeUrl(rawUrl.trim())) {
    const videoId = extractYouTubeVideoId(rawUrl.trim())!;
    try {
      const yt = await fetchYouTubeTranscript(videoId);
      const durationLabel = yt.durationSeconds
        ? `${Math.floor(yt.durationSeconds / 60)}m ${yt.durationSeconds % 60}s`
        : null;
      const metaText = [
        yt.transcript,
        yt.channelName ? `Channel: ${yt.channelName}` : '',
        durationLabel ? `Duration: ${durationLabel}` : '',
      ].filter(Boolean).join('\n\n');

      const meta = extractSourceMetaFromText(metaText, yt.title);
      brief = buildFallbackSourceBrief(
        { ...meta, wordCount: yt.wordCount },
        rawUrl.trim(),
        'url',
        `YouTube — ${yt.channelName || 'video'}`,
      );
      // Enrich with AI if allowed
      if (privacyMode === 'full') {
        try {
          const generated = await generateSourceBrief({ ...brief, extractedText: yt.transcript.slice(0, 12_000) }, ai);
          const summary = parseSummary(generated).replace(/^summary:\s*/i, '').trim();
          const keyPoints = parseKeyPoints(generated, summary);
          brief = {
            ...brief,
            summary: summary || brief.summary,
            keyPoints: keyPoints.length ? keyPoints : brief.keyPoints,
          };
        } catch { /* use fallback */ }
      }
      return NextResponse.json(brief);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not fetch transcript for this YouTube video.' },
        { status: 400 },
      );
    }
  }

  if (rawText.trim()) {
    try {
      const meta = extractSourceMetaFromText(rawText, rawTitle);
      brief = buildFallbackSourceBrief(
        meta,
        requestedSourceType === 'file' ? `file:///${encodeURIComponent(rawSourceLabel || rawTitle || 'upload')}` : 'manual://text',
        requestedSourceType,
        rawSourceLabel || undefined,
      );
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'This text could not be summarized.' },
        { status: 400 },
      );
    }
  } else {
    let url: URL;
    try {
      url = normalizeSourceBriefUrl(rawUrl);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid URL.' }, { status: 400 });
    }

    try {
      assertNotPrivateUrl(url);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'This URL is not allowed.' }, { status: 400 });
    }

    let html = '';
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KivoraBot/1.0; +https://kivora.app)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      });

      // Reject redirects rather than following them — prevents DNS rebinding attacks
      if (response.status >= 300 && response.status < 400) {
        return NextResponse.json({ error: 'This URL redirects and cannot be analyzed.' }, { status: 400 });
      }

      if (!response.ok) {
        return NextResponse.json({ error: `Could not fetch this source (${response.status}).` }, { status: 400 });
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        return NextResponse.json({ error: 'This URL is not a readable web page.' }, { status: 400 });
      }

      html = await response.text();
    } catch {
      return NextResponse.json({ error: 'Could not fetch this source right now.' }, { status: 502 });
    }

    try {
      brief = buildFallbackSourceBrief(extractSourceMetaFromHtml(html, url), url.toString(), 'url');
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'This source could not be summarized.' },
        { status: 400 },
      );
    }
  }

  if (privacyMode === 'full') {
    try {
      const generated = await generateSourceBrief(brief, ai);
      const summary = parseSummary(generated).replace(/^summary:\s*/i, '').trim();
      const keyPoints = parseKeyPoints(generated, summary);
      brief = {
        ...brief,
        summary: summary || brief.summary,
        keyPoints: keyPoints.length ? keyPoints : brief.keyPoints,
      };
    } catch {
      // Fallback brief is already populated.
    }
  }

  return NextResponse.json(brief);
}
