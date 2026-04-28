import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { isGuestModeEnabled } from '@/lib/runtime/mode';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { resolveAiDataMode } from '@/lib/privacy/ai-data';

type AnalysisMode = 'describe' | 'explain' | 'extract-text' | 'solve-math' | 'scan-questions';

const VALID_MODES: AnalysisMode[] = ['describe', 'explain', 'extract-text', 'solve-math', 'scan-questions'];

const MODE_PROMPTS: Record<AnalysisMode, string> = {
  describe:
    'Describe this image in detail. Identify all visual elements, labels, text, shapes, and layout. Be thorough and precise.',

  explain:
    'This image is from educational/study material. Explain the concept, diagram, or chart shown. Break down what it represents, how to read it, and what the key takeaways are. Use clear language suitable for a university student.',

  'extract-text':
    'Extract ALL text visible in this image. Preserve the original formatting, layout, and structure as much as possible. Include labels, captions, annotations, and any handwritten text. Output the extracted text only, no commentary.',

  'solve-math':
    'This image contains a math problem, equation, or mathematical expression. Identify the mathematical content and solve it step by step. Show your work clearly with each step explained. Use LaTeX-style notation for expressions (e.g., x^2 for x squared, sqrt() for square root). Format your response as:\n\nPROBLEM: [state the problem]\n\nSOLUTION:\nStep 1: ...\nStep 2: ...\n\nFINAL ANSWER: [answer]',

  'scan-questions':
    'Extract all study questions, math problems, exercises, and tasks visible in this image. Format your response as a numbered list where each item is one complete question or problem, exactly as written. Preserve mathematical notation. Output ONLY the numbered list, nothing else. Example format:\n1. Find the derivative of f(x) = x^2 + 3x\n2. Solve for x: 2x + 5 = 11\n3. What is the area of a circle with radius 7?',
};

// Max image size: 4MB (base64 data URLs can be large)
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

async function callVisionAI(imageDataUrl: string, mode: AnalysisMode): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('AI API key not configured. Add OPENAI_API_KEY to your .env.local file.');
  }

  const systemPrompt =
    mode === 'scan-questions'
      ? 'You are an expert at reading educational materials and extracting study questions. Extract questions clearly and completely.'
      : mode === 'solve-math'
        ? 'You are a mathematics expert and tutor. Analyze images of math problems and solve them with detailed step-by-step explanations.'
        : 'You are a helpful study assistant that analyzes images from educational materials. Be accurate, thorough, and educational in your responses.';

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: MODE_PROMPTS[mode] },
            {
              type: 'image_url',
              image_url: {
                url: imageDataUrl,
                detail: mode === 'extract-text' ? 'high' : 'auto',
              },
            },
          ],
        },
      ],
      temperature: mode === 'extract-text' ? 0 : 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Vision API error:', errorText);
    throw new Error('AI vision analysis failed. Please try again.');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Unexpected response from vision API.');
  }
  return content;
}

export async function POST(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    // JWT-based extraction — auth() cookie path was returning null on
    // valid Google sessions, blocking image analysis with 401.
    const userId = await getUserId(request);
    if (!userId && !isGuestModeEnabled()) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const body = await request.json();
    const { imageDataUrl, mode } = body;

    // Honour privacy/offline mode — never send images to cloud AI in offline mode
    const privacyMode = resolveAiDataMode(body);
    if (privacyMode === 'offline') {
      return apiError(403, {
        errorCode: 'OFFLINE_MODE',
        reason: 'Vision analysis is unavailable in offline/privacy-only mode.',
        requestId,
      });
    }

    if (!mode || !VALID_MODES.includes(mode)) {
      return apiError(400, {
        errorCode: 'INVALID_VISION_MODE',
        reason: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`,
        requestId,
      });
    }

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return apiError(400, {
        errorCode: 'MISSING_IMAGE',
        reason: 'imageDataUrl is required',
        requestId,
      });
    }

    if (!imageDataUrl.startsWith('data:image/')) {
      return apiError(400, {
        errorCode: 'INVALID_IMAGE_FORMAT',
        reason: 'Invalid image format. Expected a data URL starting with data:image/',
        requestId,
      });
    }

    if (imageDataUrl.length > MAX_IMAGE_SIZE) {
      return apiError(400, {
        errorCode: 'IMAGE_TOO_LARGE',
        reason: 'Image is too large. Maximum size is 4MB.',
        requestId,
      });
    }

    const result = await callVisionAI(imageDataUrl, mode);

    return NextResponse.json({ result });
  } catch (error) {
    console.error(`[Vision][${requestId}] analyze failed`, error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return apiError(500, {
      errorCode: 'VISION_ANALYZE_FAILED',
      reason: message,
      requestId,
    });
  }
}
