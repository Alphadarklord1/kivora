import { NextRequest, NextResponse } from 'next/server';
import { offlineGenerate } from '@/lib/offline/generate';
import { callGrokChat, isGrokConfigured } from '@/lib/ai/grok';
import { callOpenAIChat } from '@/lib/ai/openai';
import { resolveAiRuntimeRequest, shouldTryCloud, shouldTryLocal } from '@/lib/ai/server-routing';
import { cloudProviderForModel } from '@/lib/ai/runtime';
import {
  buildFallbackSourceBrief,
  extractSourceMetaFromHtml,
  normalizeSourceBriefUrl,
  type SourceBrief,
} from '@/lib/coach/source-brief';

const SYSTEM_PROMPT = 'You are a study assistant. Explain what a source is about clearly for students. Return concise plain text.';

function parseKeyPoints(content: string) {
  return Array.from(new Set(
    content
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((line) => line.length >= 20),
  )).slice(0, 4);
}

function parseSummary(content: string) {
  return content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^key points[:]?$/i.test(line)) ?? content.trim();
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

  if (shouldTryCloud(mode) && isGrokConfigured()) {
    const grokModel = cloudProviderForModel(cloudModel) === 'grok' ? cloudModel : 'grok-3-fast';
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
    const openaiModel = cloudProviderForModel(cloudModel) === 'openai' ? cloudModel : 'gpt-4o-mini';
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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const rawUrl = typeof body.url === 'string' ? body.url : '';
  const ai = body.ai && typeof body.ai === 'object' ? body.ai as Record<string, unknown> : {};

  let url: URL;
  try {
    url = normalizeSourceBriefUrl(rawUrl);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid URL.' }, { status: 400 });
  }

  let html = '';
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; KivoraBot/1.0; +https://kivora.app)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });

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

  let brief: SourceBrief;
  try {
    brief = buildFallbackSourceBrief(extractSourceMetaFromHtml(html, url), url.toString());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'This source could not be summarized.' },
      { status: 400 },
    );
  }
  try {
    const generated = await generateSourceBrief(brief, ai);
    const keyPoints = parseKeyPoints(generated);
    const summary = parseSummary(generated).replace(/^summary:\s*/i, '').trim();
    brief = {
      ...brief,
      summary: summary || brief.summary,
      keyPoints: keyPoints.length ? keyPoints : brief.keyPoints,
    };
  } catch {
    // Fallback brief is already populated.
  }

  return NextResponse.json(brief);
}
