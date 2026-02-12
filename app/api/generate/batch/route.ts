import { NextRequest, NextResponse } from 'next/server';
import {
  getGeneratedContent,
  type ToolMode,
  type GeneratedContent,
} from '@/lib/offline/generate';
import { getUserId } from '@/lib/auth/get-user-id';

const VALID_MODES: ToolMode[] = [
  'assignment',
  'summarize',
  'mcq',
  'quiz',
  'pop',
  'notes',
  'math',
  'flashcards',
  'essay',
  'planner',
  'rephrase',
];

// Rate limiting for batch operations (stricter limits)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // batch requests per minute
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetIn: RATE_WINDOW };
  }

  if (userLimit.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetIn: userLimit.resetTime - now };
  }

  userLimit.count++;
  return { allowed: true, remaining: RATE_LIMIT - userLimit.count, resetIn: userLimit.resetTime - now };
}

// POST - Generate multiple content types at once
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check rate limit
    const rateLimit = checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(rateLimit.resetIn / 1000),
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { modes, text } = body;

    // Validate modes
    if (!modes || !Array.isArray(modes) || modes.length === 0) {
      return NextResponse.json(
        {
          error: 'Invalid modes',
          message: 'Modes must be a non-empty array',
          validModes: VALID_MODES,
        },
        { status: 400 }
      );
    }

    if (modes.length > 5) {
      return NextResponse.json(
        {
          error: 'Too many modes',
          message: 'Maximum 5 modes per batch request',
          maxModes: 5,
        },
        { status: 400 }
      );
    }

    const invalidModes = modes.filter((m: string) => !VALID_MODES.includes(m as ToolMode));
    if (invalidModes.length > 0) {
      return NextResponse.json(
        {
          error: 'Invalid modes',
          invalidModes,
          validModes: VALID_MODES,
        },
        { status: 400 }
      );
    }

    // Validate text
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Invalid text', message: 'Text content is required' },
        { status: 400 }
      );
    }

    const trimmedText = text.trim();
    if (trimmedText.length < 10) {
      return NextResponse.json(
        { error: 'Text too short', minLength: 10 },
        { status: 400 }
      );
    }

    if (trimmedText.length > 100000) {
      return NextResponse.json(
        { error: 'Text too long', maxLength: 100000 },
        { status: 400 }
      );
    }

    // Generate content for each mode
    const results: Record<string, {
      success: boolean;
      content?: GeneratedContent;
      error?: string;
    }> = {};

    for (const mode of modes as ToolMode[]) {
      try {
        const content = getGeneratedContent(mode, trimmedText);
        results[mode] = { success: true, content };
      } catch (error) {
        results[mode] = { success: false, error: String(error) };
      }
    }

    // Get common metadata from first successful result
    const firstSuccess = Object.values(results).find(r => r.success && r.content);
    const metadata = firstSuccess?.content ? {
      textLength: trimmedText.length,
      subjectArea: firstSuccess.content.subjectArea,
      keyTopics: firstSuccess.content.keyTopics,
      learningObjectives: firstSuccess.content.learningObjectives,
    } : { textLength: trimmedText.length };

    return NextResponse.json({
      success: true,
      modes: modes,
      results,
      metadata,
      summary: {
        requested: modes.length,
        succeeded: Object.values(results).filter(r => r.success).length,
        failed: Object.values(results).filter(r => !r.success).length,
      },
    });
  } catch (error) {
    console.error('Batch generate error:', error);
    return NextResponse.json(
      { error: 'Generation failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET - Return batch API info
export async function GET() {
  return NextResponse.json({
    name: 'Batch Content Generation API',
    description: 'Generate multiple content types from a single text input',
    endpoint: 'POST /api/generate/batch',
    body: {
      modes: {
        type: 'string[]',
        required: true,
        maxItems: 5,
        enum: VALID_MODES,
        description: 'Array of content types to generate',
      },
      text: {
        type: 'string',
        required: true,
        minLength: 10,
        maxLength: 100000,
      },
    },
    example: {
      request: {
        modes: ['mcq', 'flashcards', 'summarize'],
        text: 'Your study content here...',
      },
      response: {
        success: true,
        modes: ['mcq', 'flashcards', 'summarize'],
        results: {
          mcq: { success: true, content: '...' },
          flashcards: { success: true, content: '...' },
          summarize: { success: true, content: '...' },
        },
        summary: { requested: 3, succeeded: 3, failed: 0 },
      },
    },
    rateLimit: {
      requests: RATE_LIMIT,
      window: '1 minute',
    },
    recommendedCombinations: [
      {
        name: 'Study Session',
        modes: ['summarize', 'flashcards', 'mcq'],
        description: 'Summary for overview, flashcards for memorization, MCQs for testing',
      },
      {
        name: 'Exam Prep',
        modes: ['mcq', 'quiz', 'essay'],
        description: 'Multiple choice, short answer, and essay practice',
      },
      {
        name: 'Lecture Review',
        modes: ['notes', 'summarize', 'flashcards'],
        description: 'Cornell notes, summary, and flashcards from lecture content',
      },
      {
        name: 'Assignment Help',
        modes: ['assignment', 'summarize', 'notes'],
        description: 'Assignment breakdown with supporting summary and notes',
      },
    ],
  });
}
