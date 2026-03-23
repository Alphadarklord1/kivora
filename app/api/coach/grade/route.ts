/**
 * POST /api/coach/grade
 * Grades a finished report against a 5-criterion academic rubric.
 * Body: { report: string, topic: string, type: string, targetWordCount: number, sourceCount: number, ai?, privacyMode? }
 * Returns: GradeResult
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { enforceAiRateLimit } from '@/lib/api/ai-rate-limit';
import { callAi } from '@/lib/ai/call';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

export interface GradeCriterion {
  name:      string;
  score:     number; // 0–10
  maxScore:  10;
  feedback:  string;
}

export interface GradeResult {
  overall:      string; // e.g. 'A', 'B+', 'C'
  percentage:   number; // 0–100
  criteria:     GradeCriterion[];
  strengths:    string[];
  improvements: string[];
}

const GRADE_SYSTEM = `You are an experienced academic teacher who grades student essays and reports. Grade the submitted work honestly and constructively. Return ONLY a valid JSON object with no surrounding text or markdown fences.`;

function buildGradePrompt(
  report: string,
  topic: string,
  type: string,
  targetWordCount: number,
  actualWordCount: number,
  sourceCount: number,
): string {
  const typeLabel = type === 'literature_review' ? 'literature review' : type;
  return (
    `Grade this student ${typeLabel} on the topic: "${topic}"\n` +
    `Target word count: ${targetWordCount}. Actual word count: ~${actualWordCount}. Sources cited: ${sourceCount}.\n\n` +
    `REPORT:\n${report.slice(0, 6000)}\n\n` +
    `Return a JSON object with exactly this structure:\n` +
    `{\n` +
    `  "overall": "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "D",\n` +
    `  "percentage": <number 0-100>,\n` +
    `  "criteria": [\n` +
    `    { "name": "Structure & Organisation", "score": <0-10>, "maxScore": 10, "feedback": "<1-2 sentences>" },\n` +
    `    { "name": "Argument & Analysis",      "score": <0-10>, "maxScore": 10, "feedback": "<1-2 sentences>" },\n` +
    `    { "name": "Source Use",               "score": <0-10>, "maxScore": 10, "feedback": "<1-2 sentences>" },\n` +
    `    { "name": "Language & Clarity",       "score": <0-10>, "maxScore": 10, "feedback": "<1-2 sentences>" },\n` +
    `    { "name": "Word Count & Scope",       "score": <0-10>, "maxScore": 10, "feedback": "<1-2 sentences>" }\n` +
    `  ],\n` +
    `  "strengths": ["<strength 1>", "<strength 2>"],\n` +
    `  "improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"]\n` +
    `}`
  );
}

function parseGradeResult(raw: string): GradeResult | null {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<GradeResult>;
    if (!parsed.overall || !Array.isArray(parsed.criteria)) return null;
    return {
      overall:      String(parsed.overall),
      percentage:   typeof parsed.percentage === 'number' ? parsed.percentage : 0,
      criteria:     parsed.criteria.filter(c => c.name && typeof c.score === 'number'),
      strengths:    Array.isArray(parsed.strengths)    ? parsed.strengths.filter(s => typeof s === 'string')    : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.filter(s => typeof s === 'string') : [],
    };
  } catch {
    return null;
  }
}

function offlineGrade(topic: string, actualWordCount: number, targetWordCount: number, sourceCount: number): string {
  const pct = Math.min(100, Math.round(
    (actualWordCount / targetWordCount) * 40 + (sourceCount > 0 ? 30 : 10) + 20
  ));
  const overall = pct >= 85 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'D';
  return JSON.stringify({
    overall,
    percentage: pct,
    criteria: [
      { name: 'Structure & Organisation', score: 7, maxScore: 10, feedback: 'Report has a recognisable structure with introduction, body, and conclusion.' },
      { name: 'Argument & Analysis',      score: 6, maxScore: 10, feedback: 'Arguments present but could be developed further with more evidence.' },
      { name: 'Source Use',               score: sourceCount > 0 ? 8 : 4, maxScore: 10, feedback: sourceCount > 0 ? 'Sources are cited and referenced.' : 'Add academic sources to strengthen the report.' },
      { name: 'Language & Clarity',       score: 7, maxScore: 10, feedback: 'Language is clear and generally appropriate for academic writing.' },
      { name: 'Word Count & Scope',       score: actualWordCount >= targetWordCount * 0.85 ? 8 : 5, maxScore: 10, feedback: `${actualWordCount} words written vs ${targetWordCount} target.` },
    ],
    strengths:    ['Addresses the topic directly', 'Shows understanding of the subject matter'],
    improvements: ['Add more in-text citations', 'Develop arguments with additional evidence', 'Ensure word count meets the target'],
  });
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export async function POST(req: NextRequest) {
  const guard = await requireAppAccess(req);
  if (guard) return guard;
  const rl = enforceAiRateLimit(req);
  if (rl) return rl;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

  const report = typeof body.report === 'string' ? body.report.trim() : '';
  if (!report) return NextResponse.json({ error: 'No report text provided.' }, { status: 400 });

  const topic           = typeof body.topic          === 'string' ? body.topic : 'Unknown topic';
  const type            = typeof body.type           === 'string' ? body.type  : 'essay';
  const targetWordCount = typeof body.targetWordCount === 'number' ? body.targetWordCount : 1000;
  const sourceCount     = typeof body.sourceCount    === 'number' ? body.sourceCount     : 0;
  const actualWordCount = countWords(report);

  const privacyMode = resolveAiDataMode(body);
  const safeReport  = redactForAi(privacyMode, report, 'report text');
  const safeTopic   = redactForAi(privacyMode, topic,  'report topic');

  const messages = [
    { role: 'system' as const, content: GRADE_SYSTEM },
    { role: 'user'   as const, content: buildGradePrompt(safeReport, safeTopic, type, targetWordCount, actualWordCount, sourceCount) },
  ];

  const { result: raw } = await callAi({
    messages,
    maxTokens:   800,
    temperature: 0.3,
    aiPrefs:     body.ai,
    privacyMode,
    offlineFallback: () => offlineGrade(topic, actualWordCount, targetWordCount, sourceCount),
  });

  const gradeResult = parseGradeResult(raw);
  if (!gradeResult) {
    return NextResponse.json({ error: 'Could not parse grading result.' }, { status: 500 });
  }

  return NextResponse.json(gradeResult);
}
