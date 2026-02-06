import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quizAttempts, files } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
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
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const fileId = searchParams.get('fileId');

    // Build query
    let attempts;
    if (fileId) {
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
          fileName: files.name,
        })
        .from(quizAttempts)
        .leftJoin(files, eq(quizAttempts.fileId, files.id))
        .where(eq(quizAttempts.fileId, fileId))
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
          fileName: files.name,
        })
        .from(quizAttempts)
        .leftJoin(files, eq(quizAttempts.fileId, files.id))
        .where(eq(quizAttempts.userId, userId))
        .orderBy(desc(quizAttempts.createdAt))
        .limit(limit)
        .offset(offset);
    }

    // Calculate stats
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

    return NextResponse.json({ attempts, stats });
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
    const { fileId, mode, totalQuestions, correctAnswers, timeTaken, answers } = body;

    // Validate required fields
    if (!mode || totalQuestions === undefined || correctAnswers === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Calculate score
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    // Save the attempt
    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        userId,
        fileId: fileId || null,
        mode,
        totalQuestions,
        correctAnswers,
        score,
        timeTaken: timeTaken || null,
        answers: answers as QuizAnswer[] || null,
      })
      .returning();

    return NextResponse.json(attempt, { status: 201 });
  } catch (error) {
    console.error('Save quiz attempt error:', error);
    return NextResponse.json({ error: 'Failed to save quiz attempt' }, { status: 500 });
  }
}
