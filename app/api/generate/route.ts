import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import {
  getGeneratedContent,
  offlineGenerate,
  type ToolMode,
  type GeneratedContent,
} from '@/lib/offline/generate';

// Valid tool modes
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
];

// Rate limiting map (in-memory, resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 30; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute in ms

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    if (token?.id) return token.id as string;
    if (token?.sub) return token.sub as string;
  } catch {}

  // Fallback: get first user (TEMPORARY)
  const firstUser = await db.query.users.findFirst();
  return firstUser?.id || null;
}

function checkRateLimit(userId: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // Reset or initialize
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetIn: RATE_WINDOW };
  }

  if (userLimit.count >= RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: userLimit.resetTime - now,
    };
  }

  userLimit.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT - userLimit.count,
    resetIn: userLimit.resetTime - now,
  };
}

// POST - Generate content
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
          message: `Too many requests. Please try again in ${Math.ceil(rateLimit.resetIn / 1000)} seconds.`,
          retryAfter: Math.ceil(rateLimit.resetIn / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimit.resetIn / 1000)),
            'X-RateLimit-Limit': String(RATE_LIMIT),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetIn / 1000)),
          },
        }
      );
    }

    const body = await request.json();
    const { mode, text, format = 'full' } = body;

    // Validate mode
    if (!mode || !VALID_MODES.includes(mode as ToolMode)) {
      return NextResponse.json(
        {
          error: 'Invalid mode',
          message: `Mode must be one of: ${VALID_MODES.join(', ')}`,
          validModes: VALID_MODES,
        },
        { status: 400 }
      );
    }

    // Validate text
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        {
          error: 'Invalid text',
          message: 'Text content is required and must be a string',
        },
        { status: 400 }
      );
    }

    // Check text length limits
    const trimmedText = text.trim();
    if (trimmedText.length < 10) {
      return NextResponse.json(
        {
          error: 'Text too short',
          message: 'Please provide at least 10 characters of content',
          minLength: 10,
        },
        { status: 400 }
      );
    }

    if (trimmedText.length > 100000) {
      return NextResponse.json(
        {
          error: 'Text too long',
          message: 'Text content exceeds maximum length of 100,000 characters',
          maxLength: 100000,
          currentLength: trimmedText.length,
        },
        { status: 400 }
      );
    }

    // Generate content based on format requested
    let response: {
      success: boolean;
      mode: ToolMode;
      content?: GeneratedContent;
      displayText?: string;
      metadata?: {
        textLength: number;
        subjectArea?: string;
        keyTopics?: string[];
        learningObjectives?: string[];
        questionCount?: number;
        flashcardCount?: number;
      };
    };

    if (format === 'text') {
      // Return only the display text (legacy format)
      const displayText = offlineGenerate(mode as ToolMode, trimmedText);
      response = {
        success: true,
        mode: mode as ToolMode,
        displayText,
        metadata: {
          textLength: trimmedText.length,
        },
      };
    } else {
      // Return full structured content
      const content = getGeneratedContent(mode as ToolMode, trimmedText);
      response = {
        success: true,
        mode: mode as ToolMode,
        content,
        displayText: content.displayText,
        metadata: {
          textLength: trimmedText.length,
          subjectArea: content.subjectArea,
          keyTopics: content.keyTopics,
          learningObjectives: content.learningObjectives,
          questionCount: content.questions?.length || 0,
          flashcardCount: content.flashcards?.length || 0,
        },
      };
    }

    return NextResponse.json(response, {
      headers: {
        'X-RateLimit-Limit': String(RATE_LIMIT),
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json(
      {
        error: 'Generation failed',
        message: 'An error occurred while generating content',
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}

// GET - Return API info and available modes
export async function GET() {
  return NextResponse.json({
    name: 'StudyPilot Content Generation API',
    version: '2.0',
    description: 'Generate university-level study materials from text content',
    endpoints: {
      'POST /api/generate': {
        description: 'Generate study content from text',
        body: {
          mode: {
            type: 'string',
            required: true,
            enum: VALID_MODES,
            description: 'Type of content to generate',
          },
          text: {
            type: 'string',
            required: true,
            minLength: 10,
            maxLength: 100000,
            description: 'Source text content',
          },
          format: {
            type: 'string',
            enum: ['full', 'text'],
            default: 'full',
            description: 'Response format - "full" returns structured data, "text" returns display text only',
          },
        },
        response: {
          success: 'boolean',
          mode: 'string',
          content: 'GeneratedContent (when format=full)',
          displayText: 'string',
          metadata: {
            textLength: 'number',
            subjectArea: 'string',
            keyTopics: 'string[]',
            learningObjectives: 'string[]',
            questionCount: 'number',
            flashcardCount: 'number',
          },
        },
      },
    },
    modes: {
      mcq: {
        name: 'Multiple Choice Questions',
        description: 'Generate MCQs with Bloom\'s taxonomy levels and difficulty ratings',
        output: 'questions with options, correct answers, and explanations',
      },
      quiz: {
        name: 'Short Answer Quiz',
        description: 'Generate short-answer questions across cognitive levels',
        output: 'questions with point values and reference answers',
      },
      pop: {
        name: 'Pop Quiz',
        description: 'Quick 5-minute assessment with true/false and MCQs',
        output: 'mixed questions with answer key',
      },
      essay: {
        name: 'Essay Questions',
        description: 'Generate essay prompts with rubrics and case studies',
        output: 'essay questions with grading criteria',
      },
      flashcards: {
        name: 'Study Flashcards',
        description: 'Generate categorized flashcards for memorization',
        output: 'flashcards grouped by category (definitions, concepts, cause-effect)',
      },
      summarize: {
        name: 'Comprehensive Summary',
        description: 'Generate executive summary with learning objectives',
        output: 'summary with key concepts, relationships, and review questions',
      },
      notes: {
        name: 'Cornell Notes',
        description: 'Generate structured notes in Cornell format',
        output: 'notes with cues, content, and summary sections',
      },
      assignment: {
        name: 'Assignment Breakdown',
        description: 'Analyze assignment and provide structured approach',
        output: 'task breakdown, research guide, and revision checklist',
      },
      math: {
        name: 'Math Solver',
        description: 'Solve math problems with step-by-step solutions',
        output: 'solutions for arithmetic, algebra, calculus problems',
      },
    },
    rateLimit: {
      requests: RATE_LIMIT,
      window: '1 minute',
    },
    features: [
      'Bloom\'s Taxonomy question categorization',
      'Subject area detection (Science, Humanities, Business, Technical)',
      'Difficulty levels (Introductory to Expert)',
      'Learning objectives generation',
      'Concept relationship mapping',
      'Academic term detection',
      'N-gram keyword extraction',
      'Grading rubrics for essays',
      'Case study generation',
    ],
  });
}
