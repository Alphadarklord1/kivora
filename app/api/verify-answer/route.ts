import { NextRequest, NextResponse } from 'next/server';

// Answer verification API
// Checks user answers against source text and optionally web search

interface VerifyRequest {
  questionId: string;
  questionType: 'mcq' | 'short-answer' | 'true-false' | 'explanation' | 'definition';
  question: string;
  userAnswer: string;
  correctAnswer: string;
  sourceSentence: string;
  sourceText: string;
  keywords: string[];
  useWebSearch?: boolean;
}

interface VerifyResponse {
  isCorrect: boolean;
  confidence: 'high' | 'medium' | 'low';
  feedback: string;
  explanation: string;
  relevantSource: string;
  webVerification?: {
    searched: boolean;
    confirmed: boolean;
    snippet?: string;
  };
}

// Normalize text for comparison
function normalizeForComparison(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate word overlap similarity
function calculateWordOverlap(text1: string, text2: string): number {
  const words1 = new Set(normalizeForComparison(text1).split(' ').filter(w => w.length > 2));
  const words2 = new Set(normalizeForComparison(text2).split(' ').filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) overlap++;
  }

  return overlap / Math.max(words1.size, words2.size);
}

// Check if answer contains key concepts from source
function containsKeyConcepts(answer: string, keywords: string[]): { found: string[]; missing: string[] } {
  const normalizedAnswer = normalizeForComparison(answer);
  const found: string[] = [];
  const missing: string[] = [];

  for (const keyword of keywords) {
    if (normalizedAnswer.includes(keyword.toLowerCase())) {
      found.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  return { found, missing };
}

// Verify MCQ answer
function verifyMCQ(userAnswer: string, correctAnswer: string): VerifyResponse {
  const normalized = normalizeForComparison(userAnswer);
  const correct = normalizeForComparison(correctAnswer);

  const isCorrect = normalized === correct ||
    normalized.includes(correct) ||
    correct.includes(normalized);

  return {
    isCorrect,
    confidence: 'high',
    feedback: isCorrect ? 'Correct!' : `Incorrect. The correct answer is: ${correctAnswer}`,
    explanation: isCorrect
      ? 'You selected the right option.'
      : `The correct answer is "${correctAnswer}". Review the source material for this concept.`,
    relevantSource: '',
  };
}

// Verify True/False answer
function verifyTrueFalse(userAnswer: string, correctAnswer: string): VerifyResponse {
  const normalizedUser = normalizeForComparison(userAnswer);
  const normalizedCorrect = normalizeForComparison(correctAnswer);

  const isCorrect = normalizedUser === normalizedCorrect ||
    (normalizedUser.includes('true') && normalizedCorrect === 'true') ||
    (normalizedUser.includes('false') && normalizedCorrect === 'false');

  return {
    isCorrect,
    confidence: 'high',
    feedback: isCorrect ? 'Correct!' : `Incorrect. The statement is ${correctAnswer}.`,
    explanation: isCorrect
      ? 'You correctly identified the truth value of this statement.'
      : `This statement is ${correctAnswer}. Review the source to understand why.`,
    relevantSource: '',
  };
}

// Verify short answer / explanation
function verifyShortAnswer(
  userAnswer: string,
  correctAnswer: string,
  sourceSentence: string,
  keywords: string[]
): VerifyResponse {
  // Check word overlap with source
  const overlapWithSource = calculateWordOverlap(userAnswer, sourceSentence);
  const overlapWithCorrect = calculateWordOverlap(userAnswer, correctAnswer);

  // Check key concepts
  const { found, missing } = containsKeyConcepts(userAnswer, keywords);
  const keywordCoverage = keywords.length > 0 ? found.length / keywords.length : 0;

  // Calculate overall score
  const score = (overlapWithSource * 0.3) + (overlapWithCorrect * 0.3) + (keywordCoverage * 0.4);

  // Determine if correct based on score
  let isCorrect = false;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let feedback = '';

  if (score >= 0.6) {
    isCorrect = true;
    confidence = 'high';
    feedback = 'Excellent! Your answer demonstrates good understanding.';
  } else if (score >= 0.4) {
    isCorrect = true;
    confidence = 'medium';
    feedback = 'Good answer! You covered the main points.';
  } else if (score >= 0.25) {
    isCorrect = false;
    confidence = 'medium';
    feedback = 'Partially correct. You missed some key concepts.';
  } else {
    isCorrect = false;
    confidence = 'low';
    feedback = 'Your answer needs improvement. Review the source material.';
  }

  // Build explanation
  let explanation = '';
  if (found.length > 0) {
    explanation += `Key concepts you mentioned: ${found.join(', ')}. `;
  }
  if (missing.length > 0 && !isCorrect) {
    explanation += `Missing concepts: ${missing.join(', ')}. `;
  }
  if (!isCorrect) {
    explanation += `\n\nExpected answer should include: "${sourceSentence.slice(0, 200)}${sourceSentence.length > 200 ? '...' : ''}"`;
  }

  return {
    isCorrect,
    confidence,
    feedback,
    explanation: explanation.trim(),
    relevantSource: sourceSentence,
  };
}

// Simple web search verification (using a public API or scraping)
async function verifyWithWebSearch(
  question: string,
  userAnswer: string,
  keywords: string[]
): Promise<{ confirmed: boolean; snippet?: string }> {
  try {
    // Build search query from keywords and question
    const searchQuery = keywords.slice(0, 3).join(' ') + ' ' + question.slice(0, 50);

    // Use DuckDuckGo Instant Answer API (free, no key required)
    const encodedQuery = encodeURIComponent(searchQuery);
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`,
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!response.ok) {
      return { confirmed: false };
    }

    const data = await response.json();

    // Check if we got relevant results
    const abstract = data.AbstractText || '';
    const relatedTopics = data.RelatedTopics || [];

    // Check if user's answer aligns with web results
    if (abstract) {
      const overlap = calculateWordOverlap(userAnswer, abstract);
      if (overlap > 0.2) {
        return {
          confirmed: true,
          snippet: abstract.slice(0, 200) + (abstract.length > 200 ? '...' : ''),
        };
      }
    }

    // Check related topics
    for (const topic of relatedTopics.slice(0, 3)) {
      if (topic.Text) {
        const overlap = calculateWordOverlap(userAnswer, topic.Text);
        if (overlap > 0.2) {
          return {
            confirmed: true,
            snippet: topic.Text.slice(0, 200),
          };
        }
      }
    }

    return { confirmed: false };
  } catch (error) {
    console.error('Web search verification failed:', error);
    return { confirmed: false };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: VerifyRequest = await request.json();

    const {
      questionType,
      question,
      userAnswer,
      correctAnswer,
      sourceSentence = '',
      keywords = [],
      useWebSearch = false,
    } = body;

    if (!userAnswer || userAnswer.trim().length === 0) {
      return NextResponse.json({
        isCorrect: false,
        confidence: 'high',
        feedback: 'Please provide an answer.',
        explanation: 'No answer was submitted.',
        relevantSource: sourceSentence,
      } as VerifyResponse);
    }

    let result: VerifyResponse;

    // Verify based on question type
    switch (questionType) {
      case 'mcq':
        result = verifyMCQ(userAnswer, correctAnswer);
        break;

      case 'true-false':
        result = verifyTrueFalse(userAnswer, correctAnswer);
        break;

      case 'short-answer':
      case 'explanation':
      case 'definition':
      default:
        result = verifyShortAnswer(userAnswer, correctAnswer, sourceSentence, keywords);
        break;
    }

    // Add source reference
    result.relevantSource = sourceSentence;

    // Optional web search verification
    if (useWebSearch && (questionType === 'short-answer' || questionType === 'explanation')) {
      const webResult = await verifyWithWebSearch(question, userAnswer, keywords);
      result.webVerification = {
        searched: true,
        confirmed: webResult.confirmed,
        snippet: webResult.snippet,
      };

      // Adjust confidence based on web verification
      if (webResult.confirmed && !result.isCorrect) {
        result.confidence = 'medium';
        result.feedback += ' (Web search found supporting information)';
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify answer' },
      { status: 500 }
    );
  }
}
