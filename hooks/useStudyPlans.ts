import { useState, useEffect, useCallback } from 'react';
import { GeneratedSchedule } from '@/lib/planner/generate';
import {
  CreatePlanData,
  StudyPlan,
  UpdatePlanData,
} from '@/lib/planner/study-plan-types';
import {
  createLocalStudyPlan,
  deleteLocalStudyPlan,
  loadLocalStudyPlans,
  updateLocalStudyPlan,
} from '@/lib/planner/local-plans';

export type { StudyPlan } from '@/lib/planner/study-plan-types';

interface UseStudyPlansReturn {
  plans: StudyPlan[];
  loading: boolean;
  error: string | null;
  fetchPlans: (status?: string) => Promise<void>;
  createPlan: (data: CreatePlanData) => Promise<StudyPlan | null>;
  updatePlan: (id: string, data: UpdatePlanData) => Promise<StudyPlan | null>;
  deletePlan: (id: string) => Promise<boolean>;
  updateProgress: (id: string, schedule: GeneratedSchedule) => Promise<StudyPlan | null>;
}

function getApiErrorReason(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const candidate = payload as Record<string, unknown>;
    if (typeof candidate.reason === 'string') return candidate.reason;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return fallback;
}

export function useStudyPlans(): UseStudyPlansReturn {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async (status?: string) => {
    setLoading(true);
    setError(null);

    try {
      const url = status && status !== 'all'
        ? `/api/study-plans?status=${encodeURIComponent(status)}`
        : '/api/study-plans';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(getApiErrorReason(payload, 'Failed to fetch study plans'));
      }

      const data = await res.json();
      const fallbackHeader = res.headers.get('x-kivora-fallback') || res.headers.get('x-studypilot-fallback');
      const isLocalFallback = fallbackHeader === 'study-plans-no-db';
      setPlans(isLocalFallback ? loadLocalStudyPlans() : Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPlans(loadLocalStudyPlans());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const createPlan = useCallback(async (data: CreatePlanData): Promise<StudyPlan | null> => {
    try {
      const res = await fetch('/api/study-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errorCode = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).errorCode : null;
        if (errorCode === 'DATABASE_NOT_CONFIGURED') {
          const localPlan = createLocalStudyPlan(data);
          setPlans((prev) => [localPlan, ...prev.filter((plan) => plan.id !== localPlan.id)]);
          setError(null);
          return localPlan;
        }
        throw new Error(getApiErrorReason(payload, 'Failed to create plan'));
      }

      const newPlan = await res.json();
      setPlans((prev) => [newPlan, ...prev]);
      return newPlan;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const updatePlan = useCallback(async (id: string, data: UpdatePlanData): Promise<StudyPlan | null> => {
    try {
      const res = await fetch(`/api/study-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        const errorCode = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).errorCode : null;
        if (errorCode === 'DATABASE_NOT_CONFIGURED') {
          const localPlan = updateLocalStudyPlan(id, data);
          if (localPlan) {
            setPlans((prev) => prev.map((plan) => (plan.id === id ? localPlan : plan)));
            setError(null);
            return localPlan;
          }
        }
        throw new Error(getApiErrorReason(payload, 'Failed to update plan'));
      }

      const updated = await res.json();
      setPlans((prev) => prev.map((plan) => (plan.id === id ? updated : plan)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  const deletePlan = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/study-plans/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const errorCode = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).errorCode : null;
        if (errorCode === 'DATABASE_NOT_CONFIGURED') {
          const deleted = deleteLocalStudyPlan(id);
          if (deleted) {
            setPlans((prev) => prev.filter((plan) => plan.id !== id));
            setError(null);
            return true;
          }
        }
        throw new Error(getApiErrorReason(payload, 'Failed to delete plan'));
      }

      if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).localOnly) {
        deleteLocalStudyPlan(id);
      }

      setPlans((prev) => prev.filter((plan) => plan.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, []);

  const updateProgress = useCallback(async (id: string, schedule: GeneratedSchedule): Promise<StudyPlan | null> => {
    const totalDays = Math.max(1, schedule.totalDays || schedule.days.length || 1);
    const completedDays = schedule.days.filter((day) => day.completed).length;
    const progress = Math.round((completedDays / totalDays) * 100);
    const status = progress === 100 ? 'completed' : 'active';

    return updatePlan(id, { schedule, progress, status });
  }, [updatePlan]);

  return {
    plans,
    loading,
    error,
    fetchPlans,
    createPlan,
    updatePlan,
    deletePlan,
    updateProgress,
  };
}
