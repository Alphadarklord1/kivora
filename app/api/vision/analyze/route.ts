import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

type AnalysisMode = 'describe' | 'explain' | 'extract-text' | 'solve-math';

const VALID_MODES: AnalysisMode[] = ['describe', 'explain', 'extract-text', 'solve-math'];

const MODE_PROMPTS: Record<AnalysisMode, string> = {
  describe:
    'Describe this image in detail. Identify all visual elements, labels, text, shapes, and layout. Be thorough and precise.',

  explain:
    'This image is from educational/study material. Explain the concept, diagram, or chart shown. Break down what it represents, how to read it, and what the key takeaways are. Use clear language suitable for a university student.',

  'extract-text':
    'Extract ALL text visible in this image. Preserve the original formatting, layout, and structure as much as possible. Include labels, captions, annotations, and any handwritten text. Output the extracted text only, no commentary.',

  'solve-math':
    'This image contains a math problem, equation, or mathematical expression. Identify the mathematical content and solve it step by step. Show your work clearly with each step explained. Use LaTeX-style notation for expressions (e.g., x^2 for x squared, sqrt() for square root). Format your response as:\n\nPROBLEM: [state the problem]\n\nSOLUTION:\nStep 1: ...\nStep 2: ...\n\nFINAL ANSWER: [answer]',
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
    mode === 'solve-math'
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
  return data.choices[0].message.content;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { imageDataUrl, mode } = body;

    if (!mode || !VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Must be one of: ${VALID_MODES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      return NextResponse.json(
        { error: 'imageDataUrl is required' },
        { status: 400 }
      );
    }

    if (!imageDataUrl.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'Invalid image format. Expected a data URL starting with data:image/' },
        { status: 400 }
      );
    }

    if (imageDataUrl.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: 'Image is too large. Maximum size is 4MB.' },
        { status: 400 }
      );
    }

    const result = await callVisionAI(imageDataUrl, mode);

    return NextResponse.json({ result });
  } catch (error) {
    console.error('Vision analyze error:', error);
    const message =
      error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
