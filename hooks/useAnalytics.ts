import { useState, useEffect, useCallback } from 'react';

export interface QuizStats {
  totalAttempts: number;
  totalQuestions: number;
  totalCorrect: number;
  averageScore: number;
  totalTimeTaken: number;
  byMode: Record<string, { attempts: number; avgScore: number; totalQuestions: number }>;
  recentScores: { date: string; score: number; mode: string }[];
  scoreDistribution: { excellent: number; good: number; fair: number; needsWork: number };
}

export interface PlanStats {
  totalPlans: number;
  activePlans: number;
  completedPlans: number;
  averageProgress: number;
  totalStudyDays: number;
  completedDays: number;
}

export interface WeakArea {
  topic: string;
  accuracy: number;
  totalQuestions: number;
  suggestion: string;
}

export interface Activity {
  currentStreak: number;
  totalActiveDays: number;
  weeklyActivity: { week: string; quizzes: number; avgScore: number }[];
  dailyActivity: { date: string; quizzes: number; avgScore: number }[];
}

export interface UsageStats {
  totalFiles: number;
  uploadedFiles: number;
  generatedFiles: number;
  libraryItems: number;
  toolUsage: Record<string, number>;
  periodGenerated: number;
  periodUploads: number;
  periodLibraryItems: number;
}

export interface AnalyticsData {
  period: number;
  quizStats: QuizStats;
  planStats: PlanStats;
  weakAreas: WeakArea[];
  activity: Activity;
  insights: string[];
  usage: UsageStats;
}

interface UseAnalyticsReturn {
  data: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setPeriod: (days: number) => void;
  period: number;
}

export function useAnalytics(initialPeriod: number = 30): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriodState] = useState(initialPeriod);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/analytics?period=${period}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const analyticsData = await res.json();
      setData(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const setPeriod = useCallback((days: number) => {
    setPeriodState(days);
  }, []);

  return {
    data,
    loading,
    error,
    refresh: fetchAnalytics,
    setPeriod,
    period,
  };
}
