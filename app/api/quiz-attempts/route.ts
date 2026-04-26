import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quizAttempts, files } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

interface QuizAnswer {
  questionId: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

// GET quiz attempts history
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));
    const rawOffset = parseInt(searchParams.get('offset') ?? '0', 10);
    const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);
    const fileId = searchParams.get('fileId');
    const deckId = searchParams.get('deckId');

    // Build query
    let attempts;
    if (fileId || deckId) {
      const filters = [eq(quizAttempts.userId, userId)];
      if (fileId) filters.push(eq(quizAttempts.fileId, fileId));
      if (deckId) filters.push(eq(quizAttempts.deckId, deckId));
      attempts = await db
        .select({
          id: quizAttempts.id,
          mode: quizAttempts.mode,
          totalQuestions: quizAttempts.totalQuestions,
          correctAnswers: quizAttempts.correctAnswers,
          score: quizAttempts.score,
          timeTaken: quizAttempts.timeTaken,
          answers: quizAttempts.answers,
          createdAt: quizAttempts.createdAt,
          fileId: quizAttempts.fileId,
          deckId: quizAttempts.deckId,
          fileName: files.name,
        })
        .from(quizAttempts)
        .leftJoin(files, eq(quizAttempts.fileId, files.id))
        .where(and(...filters))
        .orderBy(desc(quizAttempts.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      attempts = await db
        .select({
          id: quizAttempts.id,
          mode: quizAttempts.mode,
          totalQuestions: quizAttempts.totalQuestions,
          correctAnswers: quizAttempts.correctAnswers,
          score: quizAttempts.score,
          timeTaken: quizAttempts.timeTaken,
          answers: quizAttempts.answers,
          createdAt: quizAttempts.createdAt,
          fileId: quizAttempts.fileId,
          deckId: quizAttempts.deckId,
          fileName: files.name,
        })
        .from(quizAttempts)
        .leftJoin(files, eq(quizAttempts.fileId, files.id))
        .where(eq(quizAttempts.userId, userId))
        .orderBy(desc(quizAttempts.createdAt))
        .limit(limit)
        .offset(offset);
    }

    // Calculate stats (always unfiltered — global summary for the user)
    const allAttempts = await db
      .select({
        score: quizAttempts.score,
        mode: quizAttempts.mode,
      })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId));

    const stats = {
      totalAttempts: allAttempts.length,
      averageScore: allAttempts.length > 0
        ? Math.round(allAttempts.reduce((sum, a) => sum + a.score, 0) / allAttempts.length)
        : 0,
      byMode: allAttempts.reduce((acc, a) => {
        acc[a.mode] = (acc[a.mode] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    // Count matching the applied filter so clients can paginate correctly
    let filteredTotal: number;
    if (fileId || deckId) {
      const countFilters = [eq(quizAttempts.userId, userId)];
      if (fileId) countFilters.push(eq(quizAttempts.fileId, fileId));
      if (deckId) countFilters.push(eq(quizAttempts.deckId, deckId));
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(quizAttempts)
        .where(and(...countFilters));
      filteredTotal = row?.count ?? 0;
    } else {
      filteredTotal = allAttempts.length;
    }

    return NextResponse.json({ attempts, stats, total: filteredTotal });
  } catch (error) {
    console.error('Get quiz attempts error:', error);
    return NextResponse.json({ error: 'Failed to get quiz attempts' }, { status: 500 });
  }
}

// POST save a new quiz attempt
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { fileId, deckId, mode, totalQuestions, correctAnswers, timeTaken, answers } = body;

    // Validate required fields
    if (!mode || totalQuestions === undefined || correctAnswers === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (
      !Number.isInteger(totalQuestions) || totalQuestions < 1 ||
      !Number.isInteger(correctAnswers) || correctAnswers < 0 || correctAnswers > totalQuestions
    ) {
      return NextResponse.json({ error: 'Invalid question counts' }, { status: 400 });
    }

    // Calculate score
    const score = Math.round((correctAnswers / totalQuestions) * 100);

    // Save the attempt
    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        userId,
        fileId: fileId || null,
        deckId: deckId || null,
        mode,
        totalQuestions,
        correctAnswers,
        score,
        timeTaken: timeTaken || null,
        answers: Array.isArray(answers) ? (answers as QuizAnswer[]) : null,
      })
      .returning();

    return NextResponse.json(attempt, { status: 201 });
  } catch (error) {
    console.error('Save quiz attempt error:', error);
    return NextResponse.json({ error: 'Failed to save quiz attempt' }, { status: 500 });
  }
}
