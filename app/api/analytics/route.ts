import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { quizAttempts, studyPlans, files, libraryItems } from '@/lib/db/schema';
import { eq, desc, and, gte } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';

interface QuizAnswer {
  questionId: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  topic?: string;
}

type CoachAction = {
  id: string;
  label: string;
  type: 'practice' | 'review' | 'plan';
  payload: Record<string, string>;
};

function buildAnalyticsFallback(periodDays: number) {
  return {
    period: periodDays,
    quizStats: {
      totalAttempts: 0,
      totalQuestions: 0,
      totalCorrect: 0,
      averageScore: 0,
      totalTimeTaken: 0,
      byMode: {},
      recentScores: [],
      scoreDistribution: { excellent: 0, good: 0, fair: 0, needsWork: 0 },
    },
    planStats: {
      totalPlans: 0,
      activePlans: 0,
      completedPlans: 0,
      averageProgress: 0,
      totalStudyDays: 0,
      completedDays: 0,
    },
    weakAreas: [],
    coachActions: [
      {
        id: 'plan-onboarding',
        label: 'Generate your first 20-min plan',
        type: 'plan',
        payload: { topic: 'General', minutes: '20', difficulty: 'easy' },
      },
    ] as CoachAction[],
    activity: {
      currentStreak: 0,
      totalActiveDays: 0,
      weeklyActivity: [],
      dailyActivity: [],
    },
    insights: ['Analytics will appear after your first study actions.'],
    usage: {
      totalFiles: 0,
      uploadedFiles: 0,
      generatedFiles: 0,
      libraryItems: 0,
      toolUsage: {},
      periodGenerated: 0,
      periodUploads: 0,
      periodLibraryItems: 0,
    },
    fallback: true,
  };
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || '30'; // days
  const parsedPeriod = parseInt(period, 10);
  const periodDays = Number.isFinite(parsedPeriod) && parsedPeriod > 0 ? parsedPeriod : 30;

  if (!isDatabaseConfigured) {
    return NextResponse.json(buildAnalyticsFallback(periodDays), {
      headers: { 'x-studypilot-fallback': 'analytics-no-db' },
    });
  }

  const userId = await getUserId(request);
  if (!userId) {
    return apiError(401, {
      errorCode: 'UNAUTHORIZED',
      reason: 'Authentication required',
      requestId,
    });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);

  try {
    let attempts: Array<{
      id: string;
      mode: string;
      totalQuestions: number;
      correctAnswers: number;
      score: number;
      timeTaken: number | null;
      answers: unknown;
      createdAt: Date;
      fileId: string | null;
      fileName: string | null;
    }> = [];

    let plans: Array<{
      id: string;
      status: string;
      progress: number;
      schedule: unknown;
      createdAt: Date;
    }> = [];

    // Fetch quiz attempts (guarded to avoid breaking analytics if table is missing)
    try {
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
        .where(
          and(
            eq(quizAttempts.userId, userId),
            gte(quizAttempts.createdAt, startDate)
          )
        )
        .orderBy(desc(quizAttempts.createdAt));
    } catch (error) {
      console.error('Analytics error: failed to fetch quiz attempts', error);
    }

    // Fetch study plans (guarded)
    try {
      plans = await db.query.studyPlans.findMany({
        where: eq(studyPlans.userId, userId),
        orderBy: [desc(studyPlans.createdAt)],
      });
    } catch (error) {
      console.error('Analytics error: failed to fetch study plans', error);
    }

    // Fetch files and library items (usage stats)
    let userFiles: Array<{ type: string; createdAt: Date }> = [];
    let userLibrary: Array<{ mode: string; createdAt: Date }> = [];

    try {
      userFiles = await db
        .select({ type: files.type, createdAt: files.createdAt })
        .from(files)
        .where(eq(files.userId, userId));
    } catch (error) {
      console.error('Analytics error: failed to fetch files', error);
    }

    try {
      userLibrary = await db
        .select({ mode: libraryItems.mode, createdAt: libraryItems.createdAt })
        .from(libraryItems)
        .where(eq(libraryItems.userId, userId));
    } catch (error) {
      console.error('Analytics error: failed to fetch library items', error);
    }

    // Calculate quiz statistics
    const quizStats = {
      totalAttempts: attempts.length,
      totalQuestions: attempts.reduce((sum, a) => sum + a.totalQuestions, 0),
      totalCorrect: attempts.reduce((sum, a) => sum + a.correctAnswers, 0),
      averageScore: attempts.length > 0
        ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length)
        : 0,
      totalTimeTaken: attempts.reduce((sum, a) => sum + (a.timeTaken || 0), 0),
      byMode: {} as Record<string, { attempts: number; avgScore: number; totalQuestions: number }>,
      recentScores: [] as { date: string; score: number; mode: string }[],
      scoreDistribution: { excellent: 0, good: 0, fair: 0, needsWork: 0 },
    };

    // Calculate by mode
    const modeGroups = new Map<string, { scores: number[]; totalQuestions: number }>();
    for (const attempt of attempts) {
      if (!modeGroups.has(attempt.mode)) {
        modeGroups.set(attempt.mode, { scores: [], totalQuestions: 0 });
      }
      const group = modeGroups.get(attempt.mode)!;
      group.scores.push(attempt.score);
      group.totalQuestions += attempt.totalQuestions;
    }

    for (const [mode, data] of modeGroups) {
      quizStats.byMode[mode] = {
        attempts: data.scores.length,
        avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        totalQuestions: data.totalQuestions,
      };
    }

    // Recent scores (last 10)
    quizStats.recentScores = attempts.slice(0, 10).map(a => {
      const createdAt = new Date(a.createdAt);
      return {
        date: Number.isNaN(createdAt.getTime())
          ? new Date().toISOString().split('T')[0]
          : createdAt.toISOString().split('T')[0],
        score: a.score,
        mode: a.mode,
      };
    });

    // Score distribution
    for (const attempt of attempts) {
      if (attempt.score >= 90) quizStats.scoreDistribution.excellent++;
      else if (attempt.score >= 70) quizStats.scoreDistribution.good++;
      else if (attempt.score >= 50) quizStats.scoreDistribution.fair++;
      else quizStats.scoreDistribution.needsWork++;
    }

    // Identify weak areas (topics frequently missed)
    const topicPerformance = new Map<string, { correct: number; total: number }>();

    for (const attempt of attempts) {
      if (attempt.answers && Array.isArray(attempt.answers)) {
        for (const answer of attempt.answers as QuizAnswer[]) {
          // Try to extract topic from question or use file name
          const topic = answer.topic || attempt.fileName || 'General';

          if (!topicPerformance.has(topic)) {
            topicPerformance.set(topic, { correct: 0, total: 0 });
          }

          const perf = topicPerformance.get(topic)!;
          perf.total++;
          if (answer.isCorrect) perf.correct++;
        }
      }
    }

    // Convert to weak areas list
    const weakAreas: { topic: string; accuracy: number; attempts: number; totalQuestions: number; suggestion: string; estimatedMinutes: number }[] = [];

    for (const [topic, perf] of topicPerformance) {
      const accuracy = Math.round((perf.correct / perf.total) * 100);
      if (accuracy < 70 && perf.total >= 3) { // Only flag if they've attempted enough questions
        let suggestion = '';
        if (accuracy < 40) {
          suggestion = `You got ${accuracy}% of questions about "${topic}" correct. Consider reviewing this topic thoroughly.`;
        } else if (accuracy < 60) {
          suggestion = `You scored ${accuracy}% on "${topic}". Try practicing more questions on this topic.`;
        } else {
          suggestion = `${topic} needs some improvement (${accuracy}% accuracy). A quick review should help.`;
        }

        weakAreas.push({
          topic,
          accuracy,
          attempts: perf.total,
          totalQuestions: perf.total,
          suggestion,
          estimatedMinutes: accuracy < 40 ? 30 : accuracy < 60 ? 20 : 15,
        });
      }
    }

    // Sort by accuracy (lowest first)
    weakAreas.sort((a, b) => a.accuracy - b.accuracy);

    // Study plan statistics
    const planStats = {
      totalPlans: plans.length,
      activePlans: plans.filter(p => p.status === 'active').length,
      completedPlans: plans.filter(p => p.status === 'completed').length,
      averageProgress: plans.length > 0
        ? Math.round(plans.reduce((sum, p) => sum + p.progress, 0) / plans.length)
        : 0,
      totalStudyDays: plans.reduce((sum, p) => {
        const schedule = p.schedule as { totalDays?: number } | null;
        return sum + (schedule?.totalDays || 0);
      }, 0),
      completedDays: plans.reduce((sum, p) => {
        const schedule = p.schedule as { days?: { completed?: boolean }[] } | null;
        return sum + (schedule?.days?.filter(d => d.completed).length || 0);
      }, 0),
    };

    // Activity streaks and trends
    const activityByDate = new Map<string, { count: number; totalScore: number }>();
    for (const attempt of attempts) {
      const createdAt = new Date(attempt.createdAt);
      if (Number.isNaN(createdAt.getTime())) continue;
      const date = createdAt.toISOString().split('T')[0];
      const day = activityByDate.get(date) || { count: 0, totalScore: 0 };
      day.count += 1;
      day.totalScore += attempt.score;
      activityByDate.set(date, day);
    }

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < periodDays; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = checkDate.toISOString().split('T')[0];

      if (activityByDate.has(dateStr)) {
        currentStreak++;
      } else if (i > 0) { // Allow today to be missed
        break;
      }
    }

    // Daily activity series (includes zero-activity days for charts/heatmaps)
    const dailyActivity: { date: string; quizzes: number; avgScore: number }[] = [];
    for (let i = periodDays - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const day = activityByDate.get(dateStr);
      dailyActivity.push({
        date: dateStr,
        quizzes: day?.count || 0,
        avgScore: day && day.count > 0 ? Math.round(day.totalScore / day.count) : 0,
      });
    }

    // Weekly activity summary
    const weeklyActivity: { week: string; quizzes: number; avgScore: number }[] = [];
    const weekGroups = new Map<string, { count: number; totalScore: number }>();

    for (const attempt of attempts) {
      const date = new Date(attempt.createdAt);
      if (Number.isNaN(date.getTime())) continue;
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weekGroups.has(weekKey)) {
        weekGroups.set(weekKey, { count: 0, totalScore: 0 });
      }
      const group = weekGroups.get(weekKey)!;
      group.count++;
      group.totalScore += attempt.score;
    }

    for (const [week, data] of weekGroups) {
      weeklyActivity.push({
        week,
        quizzes: data.count,
        avgScore: Math.round(data.totalScore / data.count),
      });
    }
    weeklyActivity.sort((a, b) => a.week.localeCompare(b.week));

    const toolUsage = new Map<string, number>();
    for (const attempt of attempts) {
      toolUsage.set(attempt.mode, (toolUsage.get(attempt.mode) || 0) + 1);
    }
    for (const file of userFiles) {
      if (file.type !== 'upload') {
        toolUsage.set(file.type, (toolUsage.get(file.type) || 0) + 1);
      }
    }
    for (const libItem of userLibrary) {
      toolUsage.set(libItem.mode, (toolUsage.get(libItem.mode) || 0) + 1);
    }

    const periodUploads = userFiles.filter(f => f.type === 'upload' && f.createdAt >= startDate).length;
    const periodGenerated = userFiles.filter(f => f.type !== 'upload' && f.createdAt >= startDate).length;
    const periodLibraryItems = userLibrary.filter(l => l.createdAt >= startDate).length;

    const coachActions: CoachAction[] = [];
    if (weakAreas.length > 0) {
      const weakest = weakAreas[0];
      coachActions.push({
        id: `plan-${weakest.topic}`,
        label: `Generate 20-min plan for ${weakest.topic}`,
        type: 'plan',
        payload: {
          topic: weakest.topic,
          minutes: '20',
          difficulty: weakest.accuracy < 40 ? 'hard' : weakest.accuracy < 60 ? 'medium' : 'easy',
        },
      });
      coachActions.push({
        id: `practice-${weakest.topic}`,
        label: `Retry weakest topic: ${weakest.topic}`,
        type: 'practice',
        payload: {
          topic: weakest.topic,
          tool: 'quiz',
        },
      });
      coachActions.push({
        id: `review-${weakest.topic}`,
        label: `Review weak area notes: ${weakest.topic}`,
        type: 'review',
        payload: {
          topic: weakest.topic,
          tool: 'notes',
        },
      });
    } else {
      coachActions.push({
        id: 'plan-onboarding',
        label: 'Generate your first 20-min plan',
        type: 'plan',
        payload: {
          topic: 'General',
          minutes: '20',
          difficulty: 'easy',
        },
      });
    }

    return NextResponse.json({
      period: periodDays,
      quizStats,
      planStats,
      weakAreas: weakAreas.slice(0, 5), // Top 5 weak areas
      coachActions,
      activity: {
        currentStreak,
        totalActiveDays: activityByDate.size,
        weeklyActivity: weeklyActivity.slice(-4), // Last 4 weeks
        dailyActivity,
      },
      insights: generateInsights(quizStats, planStats, weakAreas, currentStreak),
      usage: {
        totalFiles: userFiles.length,
        uploadedFiles: userFiles.filter(f => f.type === 'upload').length,
        generatedFiles: userFiles.filter(f => f.type !== 'upload').length,
        libraryItems: userLibrary.length,
        toolUsage: Object.fromEntries([...toolUsage.entries()].sort((a, b) => b[1] - a[1])),
        periodGenerated,
        periodUploads,
        periodLibraryItems,
      },
      fallback: false,
    });
  } catch (error) {
    console.error(`[Analytics][${requestId}] failed`, error);
    return NextResponse.json(
      {
        ...buildAnalyticsFallback(periodDays),
        requestId,
        warning: 'FALLBACK_ANALYTICS_USED',
      },
      {
        status: 200,
        headers: { 'x-studypilot-fallback': 'analytics' },
      }
    );
  }
}

function generateInsights(
  quizStats: { averageScore: number; totalAttempts: number; scoreDistribution: { needsWork: number } },
  planStats: { activePlans: number; averageProgress: number },
  weakAreas: { topic: string; accuracy: number }[],
  streak: number
): string[] {
  const insights: string[] = [];

  // Score-based insights
  if (quizStats.averageScore >= 80) {
    insights.push("Great job! Your average score is above 80%. Keep up the excellent work!");
  } else if (quizStats.averageScore >= 60) {
    insights.push("You're doing well with a solid average. Focus on your weak areas to push above 80%.");
  } else if (quizStats.totalAttempts > 0) {
    insights.push("There's room for improvement. Try reviewing the material before taking quizzes.");
  }

  // Weak areas insight
  if (weakAreas.length > 0) {
    const worstTopic = weakAreas[0];
    insights.push(`Focus on "${worstTopic.topic}" - it's your weakest area at ${worstTopic.accuracy}% accuracy.`);
  }

  // Study plan insight
  if (planStats.activePlans > 0 && planStats.averageProgress < 50) {
    insights.push("You have active study plans. Try to complete at least one study session today!");
  } else if (planStats.activePlans === 0) {
    insights.push("Create a study plan to organize your exam preparation and track progress.");
  }

  // Streak insight
  if (streak >= 7) {
    insights.push(`Amazing! You're on a ${streak}-day study streak! 🔥`);
  } else if (streak >= 3) {
    insights.push(`Good momentum! You've studied ${streak} days in a row.`);
  } else if (streak === 0) {
    insights.push("Start a study streak today! Consistent practice leads to better results.");
  }

  // Activity insight
  if (quizStats.scoreDistribution.needsWork > quizStats.totalAttempts * 0.3) {
    insights.push("Consider reviewing material before quizzes to reduce low scores.");
  }

  return insights.slice(0, 4); // Return top 4 insights
}
