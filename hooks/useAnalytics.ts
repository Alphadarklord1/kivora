import { useState, useEffect, useCallback } from 'react';
import { buildAnalyticsFromLocalPlans } from '@/lib/planner/local-plans';

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
  attempts: number;
  totalQuestions: number;
  suggestion: string;
  estimatedMinutes: number;
}

export interface CoachAction {
  id: string;
  label: string;
  type: 'practice' | 'review' | 'plan';
  payload: Record<string, string>;
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
  coachActions: CoachAction[];
  activity: Activity;
  insights: string[];
  usage: UsageStats;
  fallback?: boolean;
  warning?: string;
  requestId?: string;
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
        const payload = await res.json().catch(() => ({}));
        const reason =
          typeof payload.reason === 'string'
            ? payload.reason
            : typeof payload.error === 'string'
              ? payload.error
              : 'Failed to fetch analytics';
        throw new Error(reason);
      }

      const raw = await res.json();
      const analyticsData: AnalyticsData = raw?.fallback ? buildAnalyticsFromLocalPlans(raw) : raw;
      setData(analyticsData);
      // Persist streak to localStorage so other components can read it without re-fetching
      try {
        const streak = analyticsData?.activity?.currentStreak ?? 0;
        if (streak > 0) localStorage.setItem('kivora_study_streak', String(streak));
      } catch { /* ignore */ }
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
