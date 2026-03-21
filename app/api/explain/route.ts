import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { callAi } from '@/lib/ai/call';
import { offlineGenerate } from '@/lib/offline/generate';
import { redactForAi, resolveAiDataMode } from '@/lib/privacy/ai-data';

function buildConceptPrompt(concept: string, context?: string) {
  return `You are a clear, encouraging study tutor.

Explain this concept briefly in a way that helps a student revise it for an exam.
Keep the answer to 4-6 concise sentences.
Include 1 intuitive explanation and 1 practical takeaway.
Do not add fluff.

Concept: ${concept}
${context ? `Context from the student's material:\n${context}` : ''}`;
}

function buildAnswerFeedbackPrompt(question: string, userAnswer: string, correctAnswer: string, context?: string) {
  return `You are a helpful tutor. A student answered a question incorrectly.

Question: ${question}
Student's answer: ${userAnswer}
Correct answer: ${correctAnswer}
${context ? `Context: ${context}` : ''}

Explain in 2-3 sentences WHY the correct answer is right and where the student's thinking likely went wrong. Be encouraging and educational. Keep it concise.`;
}

export async function POST(req: NextRequest) {
  const guardResult = await requireAppAccess(req);
  if (guardResult) return guardResult;

  try {
    const body = await req.json() as Record<string, unknown>;
    const privacyMode = resolveAiDataMode(body);
    const concept = typeof body.concept === 'string' ? body.concept.trim() : '';
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const userAnswer = typeof body.userAnswer === 'string' ? body.userAnswer.trim() : '';
    const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : '';
    const context = typeof body.context === 'string' ? body.context.trim() : '';
    const safeContext = redactForAi(privacyMode, context, concept || question || 'study context');

    if (concept) {
      const { result } = await callAi({
        messages: [
          { role: 'user', content: buildConceptPrompt(concept, safeContext) },
        ],
        maxTokens: 260,
        temperature: 0.4,
        aiPrefs: body.ai,
        privacyMode,
        offlineFallback: () => offlineGenerate('explain', `${concept}\n\n${context || ''}`.trim()),
      });
      return NextResponse.json({ explanation: result });
    }

    if (!question || !userAnswer || !correctAnswer) {
      return NextResponse.json({ explanation: null });
    }

    const { result } = await callAi({
      messages: [
        { role: 'user', content: buildAnswerFeedbackPrompt(question, userAnswer, correctAnswer, safeContext) },
      ],
      maxTokens: 220,
      temperature: 0.4,
      aiPrefs: body.ai,
      privacyMode,
      offlineFallback: () => offlineGenerate('explain', `${question}\n${correctAnswer}\n${context}`.trim()),
    });

    return NextResponse.json({ explanation: result });
  } catch {
    return NextResponse.json({ explanation: null });
  }
}
