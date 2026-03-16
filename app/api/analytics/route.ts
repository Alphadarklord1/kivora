import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { quizAttempts, files, libraryItems, srsDecks, srsPreferences, srsReviewHistory, studyPlans } from '@/lib/db/schema';
import { eq, count, avg, desc, gte, and } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';
import type { SRSDeck } from '@/lib/srs/sm2';

// ── Empty analytics scaffold (returned for guests + when DB is not configured) ──

function emptyAnalytics(period: number): Record<string, unknown> {
  return {
    period,
    fallback: true,
    warning: 'Sign in to sync analytics across devices.',
    quizStats: {
      totalAttempts: 0, totalQuestions: 0, totalCorrect: 0,
      averageScore: 0, totalTimeTaken: 0,
      byMode: {}, recentScores: [],
      scoreDistribution: { excellent: 0, good: 0, fair: 0, needsWork: 0 },
    },
    planStats: {
      totalPlans: 0, activePlans: 0, completedPlans: 0,
      averageProgress: 0, totalStudyDays: 0, completedDays: 0,
    },
    weakAreas: [],
    coachActions: [],
    activity: {
      currentStreak: 0, totalActiveDays: 0,
      weeklyActivity: [], dailyActivity: [],
    },
    insights: [],
    usage: {
      totalFiles: 0, uploadedFiles: 0, generatedFiles: 0,
      libraryItems: 0, toolUsage: {}, periodGenerated: 0,
      periodUploads: 0, periodLibraryItems: 0,
    },
    deckStats: {
      totalDecks: 0,
      totalCards: 0,
      dailyGoal: 20,
      reviewedToday: 0,
      topDecks: [],
    },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = Math.min(Math.max(parseInt(searchParams.get('period') ?? '30', 10), 7), 365);

  // No DB → return empty fallback so the client-side local plan builder can enrich it
  if (!isDatabaseConfigured) {
    return NextResponse.json(emptyAnalytics(period));
  }

  const userId = await getUserId();

  // Guest / unauthenticated → return empty fallback (not an error)
  if (!userId) {
    return NextResponse.json(emptyAnalytics(period));
  }

  try {
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000);

    // ── File & library counts ─────────────────────────────────────────────
    const [fileCount] = await db.select({ value: count() })
      .from(files).where(eq(files.userId, userId));
    const [libCount] = await db.select({ value: count() })
      .from(libraryItems).where(eq(libraryItems.userId, userId));

    // ── Quiz attempts ─────────────────────────────────────────────────────
    const attempts = await db.select()
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, userId))
      .orderBy(desc(quizAttempts.createdAt))
      .limit(200);

    const periodAttempts = attempts.filter(a =>
      a.createdAt && new Date(a.createdAt) >= since,
    );

    // Score distribution
    const dist = { excellent: 0, good: 0, fair: 0, needsWork: 0 };
    const byMode: Record<string, { attempts: number; totalScore: number; totalQuestions: number }> = {};
    let totalTimeTaken = 0;
    let totalCorrect = 0;
    let totalQuestions = 0;

    for (const a of periodAttempts) {
      const score = a.score ?? 0;
      if (score >= 90) dist.excellent++;
      else if (score >= 70) dist.good++;
      else if (score >= 50) dist.fair++;
      else dist.needsWork++;

      const mode = a.mode ?? 'unknown';
      if (!byMode[mode]) byMode[mode] = { attempts: 0, totalScore: 0, totalQuestions: 0 };
      byMode[mode].attempts++;
      byMode[mode].totalScore += score;
      byMode[mode].totalQuestions += a.totalQuestions ?? 0;

      totalTimeTaken += a.timeTaken ?? 0;
      totalCorrect += a.score ? Math.round((a.score / 100) * (a.totalQuestions ?? 0)) : 0;
      totalQuestions += a.totalQuestions ?? 0;
    }

    const byModeFormatted: Record<string, { attempts: number; avgScore: number; totalQuestions: number }> = {};
    for (const [mode, stats] of Object.entries(byMode)) {
      byModeFormatted[mode] = {
        attempts: stats.attempts,
        avgScore: stats.attempts > 0 ? Math.round(stats.totalScore / stats.attempts) : 0,
        totalQuestions: stats.totalQuestions,
      };
    }

    const avgScoreResult = await db.select({ value: avg(quizAttempts.score) })
      .from(quizAttempts).where(eq(quizAttempts.userId, userId));
    const avgScore = avgScoreResult[0]?.value ? Math.round(Number(avgScoreResult[0].value)) : 0;

    const recentScores = periodAttempts.slice(0, 20).map(a => ({
      date: a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '',
      score: a.score ?? 0,
      mode: a.mode ?? 'unknown',
    }));

    // Fetch review history early so activity streak can include deck review dates.
    const reviewRowsEarly = await db.select({ reviewedAt: srsReviewHistory.reviewedAt })
      .from(srsReviewHistory).where(eq(srsReviewHistory.userId, userId));

    // ── Activity / streak ─────────────────────────────────────────────────
    // Include both quiz attempt dates AND deck review dates for a true activity signal.
    const reviewDateSet = new Set(reviewRowsEarly
      .map(r => r.reviewedAt?.toISOString?.().slice(0, 10) ?? '')
      .filter(Boolean),
    );
    const quizDateSet = new Set(periodAttempts.map(a =>
      a.createdAt ? new Date(a.createdAt).toISOString().slice(0, 10) : '',
    ).filter(Boolean));
    const dateSet = new Set([...quizDateSet, ...reviewDateSet]);
    const totalActiveDays = dateSet.size;

    // Current streak (consecutive days ending today)
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (dateSet.has(ds)) currentStreak++;
      else if (i > 0) break;
    }

    // Daily activity (last `period` days)
    const dailyActivity: { date: string; quizzes: number; avgScore: number }[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const dayAttempts = periodAttempts.filter(a =>
        a.createdAt && new Date(a.createdAt).toISOString().slice(0, 10) === ds,
      );
      const dayAvg = dayAttempts.length > 0
        ? Math.round(dayAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / dayAttempts.length)
        : 0;
      dailyActivity.push({ date: ds, quizzes: dayAttempts.length, avgScore: dayAvg });
    }

    // Weekly activity (last 12 weeks)
    const weeklyActivity: { week: string; quizzes: number; avgScore: number }[] = [];
    for (let w = 11; w >= 0; w--) {
      const wStart = new Date(); wStart.setDate(wStart.getDate() - (w + 1) * 7);
      const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - w * 7);
      const wAttempts = attempts.filter(a => {
        if (!a.createdAt) return false;
        const d = new Date(a.createdAt);
        return d >= wStart && d < wEnd;
      });
      const wAvg = wAttempts.length > 0
        ? Math.round(wAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / wAttempts.length)
        : 0;
      weeklyActivity.push({
        week: wStart.toISOString().slice(0, 10),
        quizzes: wAttempts.length,
        avgScore: wAvg,
      });
    }

    // ── Weak areas (modes with lowest avg score) ──────────────────────────
    const weakAreas = Object.entries(byModeFormatted)
      .filter(([, s]) => s.attempts >= 1)
      .sort((a, b) => a[1].avgScore - b[1].avgScore)
      .slice(0, 5)
      .map(([mode, s]) => ({
        topic: mode,
        accuracy: s.avgScore,
        attempts: s.attempts,
        totalQuestions: s.totalQuestions,
        suggestion: s.avgScore < 50
          ? `Focus on ${mode} — your score is below 50%. Review key concepts.`
          : s.avgScore < 70
            ? `You're making progress on ${mode}. A few more practice sessions should help.`
            : `Good work on ${mode}! Challenge yourself with harder questions.`,
        estimatedMinutes: Math.max(15, Math.round((100 - s.avgScore) / 5) * 5),
      }));

    // ── Tool usage from recent library items ──────────────────────────────
    const recentLib = await db.select({ mode: libraryItems.mode, metadata: libraryItems.metadata })
      .from(libraryItems)
      .where(eq(libraryItems.userId, userId))
      .orderBy(desc(libraryItems.createdAt))
      .limit(100);

    const toolUsage: Record<string, number> = {};
    for (const item of recentLib) {
      if (item.mode) toolUsage[item.mode] = (toolUsage[item.mode] ?? 0) + 1;
    }

    // ── Study plan stats ──────────────────────────────────────────────────
    const planRows = await db.select().from(studyPlans).where(eq(studyPlans.userId, userId));
    const activePlanRows = planRows.filter(p => p.status === 'active');
    const completedPlanRows = planRows.filter(p => p.status === 'completed');
    const avgProgress = planRows.length > 0
      ? Math.round(planRows.reduce((s, p) => s + (p.progress ?? 0), 0) / planRows.length)
      : 0;
    // Count total scheduled days and completed days across all plans
    interface ScheduleDayLike { completed?: boolean }
    const totalStudyDays = planRows.reduce((s, p) => {
      const sched = Array.isArray((p.schedule as { days?: ScheduleDayLike[] })?.days)
        ? (p.schedule as { days: ScheduleDayLike[] }).days
        : [];
      return s + sched.length;
    }, 0);
    const completedDays = planRows.reduce((s, p) => {
      const sched = Array.isArray((p.schedule as { days?: ScheduleDayLike[] })?.days)
        ? (p.schedule as { days: ScheduleDayLike[] }).days
        : [];
      return s + sched.filter((d) => d.completed).length;
    }, 0);

    const planStats = {
      totalPlans: planRows.length,
      activePlans: activePlanRows.length,
      completedPlans: completedPlanRows.length,
      averageProgress: avgProgress,
      totalStudyDays,
      completedDays,
    };

    // ── Deck analytics ─────────────────────────────────────────────────────
    const [deckRows, prefRows, reviewRows] = await Promise.all([
      db.select().from(srsDecks).where(eq(srsDecks.userId, userId)),
      db.select().from(srsPreferences).where(eq(srsPreferences.userId, userId)).limit(1),
      db.select().from(srsReviewHistory).where(eq(srsReviewHistory.userId, userId)),
    ]);

    const dailyGoal = prefRows[0]?.dailyGoal ?? 20;
    const todayStr = new Date().toISOString().slice(0, 10);
    const periodReviewRows = reviewRows.filter((row) => row.reviewedAt && new Date(row.reviewedAt) >= since);

    // SRS aggregate metrics
    const allCards = deckRows.flatMap(row => (row.deckData as SRSDeck)?.cards ?? []);
    const cardsMastered = allCards.filter(c => (c.interval ?? 0) >= 21).length;
    const dueCardsTotal = allCards.filter(c => c.nextReview && c.nextReview <= todayStr).length;
    const totalReviewsAll = allCards.reduce((s, c) => s + c.totalReviews, 0);
    const totalCorrectAll = allCards.reduce((s, c) => s + c.correctReviews, 0);
    const overallRetention = totalReviewsAll > 0 ? Math.round((totalCorrectAll / totalReviewsAll) * 100) : 0;

    const deckStats = {
      totalDecks: deckRows.length,
      totalCards: allCards.length,
      dailyGoal,
      reviewedToday: periodReviewRows.filter((row) => row.reviewedAt?.toISOString?.().slice(0, 10) === todayStr).length,
      cardsMastered,
      dueCardsTotal,
      overallRetention,
      topDecks: deckRows
        .map((row) => {
          const deck = row.deckData as SRSDeck;
          const cards = Array.isArray(deck.cards) ? deck.cards : [];
          const deckReviews = periodReviewRows.filter((review) => review.deckId === deck.id);
          const deckQuizAttempts = periodAttempts.filter((attempt) => attempt.deckId === deck.id);
          const reviewedToday = deckReviews.filter((review) => review.reviewedAt?.toISOString?.().slice(0, 10) === todayStr).length;
          const deckStudyDays = new Set(
            deckReviews
              .map((review) => review.reviewedAt?.toISOString?.().slice(0, 10))
              .filter((value): value is string => Boolean(value)),
          ).size;
          const dueCards = cards.filter((card) => card.nextReview <= todayStr).length;
          const totalReviewsForDeck = cards.reduce((sum, card) => sum + card.totalReviews, 0);
          const totalCorrectForDeck = cards.reduce((sum, card) => sum + card.correctReviews, 0);
          const accuracy = totalReviewsForDeck > 0
            ? Math.round((totalCorrectForDeck / totalReviewsForDeck) * 100)
            : deckReviews.length > 0
              ? Math.round((deckReviews.filter((review) => review.correct).length / deckReviews.length) * 100)
              : 0;
          const weakConcepts = [...cards]
            .filter((card) => card.totalReviews > 0)
            .sort((left, right) => {
              const leftAccuracy = left.totalReviews > 0 ? left.correctReviews / left.totalReviews : 1;
              const rightAccuracy = right.totalReviews > 0 ? right.correctReviews / right.totalReviews : 1;
              return leftAccuracy - rightAccuracy;
            })
            .slice(0, 3)
            .map((card) => card.front);
          const generatedOutputs = recentLib.filter((item) => {
            const metadata = (item.metadata ?? {}) as Record<string, unknown>;
            return metadata.sourceDeckId === deck.id;
          }).length;

          return {
            deckId: deck.id,
            name: deck.name,
            totalCards: cards.length,
            dueCards,
            reviewedToday,
            goalProgress: dailyGoal > 0 ? Math.min(100, Math.round((reviewedToday / dailyGoal) * 100)) : 0,
            accuracy,
            quizAttempts: deckQuizAttempts.length,
            avgQuizScore: deckQuizAttempts.length > 0
              ? Math.round(deckQuizAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / deckQuizAttempts.length)
              : 0,
            studyDays: deckStudyDays,
            generatedOutputs,
            weakConcepts,
            lastStudied: deck.lastStudied,
            sourceLabel: deck.sourceLabel,
          };
        })
        .sort((left, right) => {
          const rightValue = right.reviewedToday + right.quizAttempts + right.generatedOutputs;
          const leftValue = left.reviewedToday + left.quizAttempts + left.generatedOutputs;
          if (rightValue !== leftValue) return rightValue - leftValue;
          const rightDate = new Date(right.lastStudied ?? 0).getTime();
          const leftDate = new Date(left.lastStudied ?? 0).getTime();
          return rightDate - leftDate;
        })
        .slice(0, 6),
    };

    // ── Week-over-week comparison ──────────────────────────────────────────
    const thisWeekStart = new Date(); thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    const lastWeekStart = new Date(); lastWeekStart.setDate(lastWeekStart.getDate() - 14);
    const thisWeekAttempts = attempts.filter(a => a.createdAt && new Date(a.createdAt) >= thisWeekStart);
    const lastWeekAttempts = attempts.filter(a => {
      if (!a.createdAt) return false;
      const d = new Date(a.createdAt);
      return d >= lastWeekStart && d < thisWeekStart;
    });
    const thisWeekAvg = thisWeekAttempts.length > 0
      ? Math.round(thisWeekAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / thisWeekAttempts.length) : 0;
    const lastWeekAvg = lastWeekAttempts.length > 0
      ? Math.round(lastWeekAttempts.reduce((s, a) => s + (a.score ?? 0), 0) / lastWeekAttempts.length) : 0;
    const weekDelta = thisWeekAttempts.length > 0 && lastWeekAttempts.length > 0 ? thisWeekAvg - lastWeekAvg : null;

    // ── Insights ──────────────────────────────────────────────────────────
    const insights: string[] = [];
    if (periodAttempts.length === 0) {
      insights.push("No quizzes taken yet. Upload a file and use Generate → MCQ to start practicing!");
    } else {
      if (avgScore >= 80) insights.push(`Outstanding! Your average score of ${avgScore}% shows strong mastery.`);
      else if (avgScore >= 60) insights.push(`Good progress! Your average score is ${avgScore}%. Keep practicing to reach 80%.`);
      else insights.push(`Your average score is ${avgScore}%. Focus on your weak areas to improve.`);

      if (weekDelta !== null) {
        if (weekDelta > 5) insights.push(`📈 Up ${weekDelta}% from last week (${lastWeekAvg}% → ${thisWeekAvg}%). Great improvement!`);
        else if (weekDelta < -5) insights.push(`📉 Down ${Math.abs(weekDelta)}% from last week (${lastWeekAvg}% → ${thisWeekAvg}%). Try reviewing weaker topics.`);
        else insights.push(`↔ Consistent performance: ${thisWeekAvg}% this week vs ${lastWeekAvg}% last week.`);
      }

      if (currentStreak >= 7) insights.push(`🔥 ${currentStreak}-day study streak! Consistency is key to long-term retention.`);
      else if (currentStreak > 0) insights.push(`${currentStreak}-day streak. Try to study daily to build a habit.`);

      if (weakAreas.length > 0 && weakAreas[0].accuracy < 60) {
        insights.push(`Your weakest area is "${weakAreas[0].topic}" at ${Math.round(weakAreas[0].accuracy)}%. Consider reviewing those materials.`);
      }
    }

    if (deckStats.totalDecks > 0) {
      if (dueCardsTotal > 0) {
        insights.push(`📋 ${dueCardsTotal} card${dueCardsTotal !== 1 ? 's' : ''} due for review today. Keep your retention rate strong!`);
      }
      const topDeck = deckStats.topDecks[0];
      if (topDeck) {
        insights.push(`Deck focus: "${topDeck.name}" — ${topDeck.dueCards} due, ${topDeck.accuracy}% accuracy.`);
      }
    }

    if (planStats.activePlans > 0) {
      insights.push(`📅 ${planStats.activePlans} active study plan${planStats.activePlans !== 1 ? 's' : ''}. ${planStats.averageProgress}% average progress — keep it up!`);
    }

    return NextResponse.json({
      period,
      quizStats: {
        totalAttempts: periodAttempts.length,
        totalQuestions,
        totalCorrect,
        averageScore: avgScore,
        totalTimeTaken,
        byMode: byModeFormatted,
        recentScores,
        scoreDistribution: dist,
      },
      planStats,
      weakAreas,
      coachActions: [],
      activity: {
        currentStreak, totalActiveDays, weeklyActivity, dailyActivity,
      },
      weekOverWeek: { thisWeekAvg, lastWeekAvg, weekDelta },
      insights,
      usage: {
        totalFiles: fileCount?.value ?? 0,
        uploadedFiles: fileCount?.value ?? 0,
        generatedFiles: 0,
        libraryItems: libCount?.value ?? 0,
        toolUsage,
        periodGenerated: 0,
        periodUploads: 0,
        periodLibraryItems: 0,
      },
      deckStats,
    });
  } catch (err) {
    console.error('[Analytics] GET failed:', err);
    return NextResponse.json(emptyAnalytics(period));
  }
}
