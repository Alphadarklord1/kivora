import { useState, useEffect, useCallback } from 'react';
import { StudyTopic, GeneratedSchedule } from '@/lib/planner/generate';

export interface StudyPlan {
  id: string;
  userId: string;
  title: string;
  examDate: string;
  dailyMinutes: number;
  folderId: string | null;
  status: 'active' | 'completed' | 'paused';
  topics: StudyTopic[];
  schedule: GeneratedSchedule;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

interface UseStudyPlansReturn {
  plans: StudyPlan[];
  loading: boolean;
  error: string | null;
  fetchPlans: () => Promise<void>;
  createPlan: (data: CreatePlanData) => Promise<StudyPlan | null>;
  updatePlan: (id: string, data: UpdatePlanData) => Promise<StudyPlan | null>;
  deletePlan: (id: string) => Promise<boolean>;
  updateProgress: (id: string, schedule: GeneratedSchedule) => Promise<StudyPlan | null>;
}

interface CreatePlanData {
  title: string;
  examDate: string;
  dailyMinutes: number;
  topics: StudyTopic[];
  schedule: GeneratedSchedule;
  folderId?: string | null;
}

interface UpdatePlanData {
  status?: 'active' | 'completed' | 'paused';
  progress?: number;
  schedule?: GeneratedSchedule;
  topics?: StudyTopic[];
  folderId?: string | null;
}

export function useStudyPlans(): UseStudyPlansReturn {
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/study-plans', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to fetch study plans');
      }
      const data = await res.json();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPlans([]);
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
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create plan');
      }

      const newPlan = await res.json();
      setPlans(prev => [newPlan, ...prev]);
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
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update plan');
      }

      const updated = await res.json();
      setPlans(prev => prev.map(p => p.id === id ? updated : p));
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

      if (!res.ok) {
        throw new Error('Failed to delete plan');
      }

      setPlans(prev => prev.filter(p => p.id !== id));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, []);

  const updateProgress = useCallback(async (id: string, schedule: GeneratedSchedule): Promise<StudyPlan | null> => {
    const completedDays = schedule.days.filter(d => d.completed).length;
    const progress = Math.round((completedDays / schedule.totalDays) * 100);
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
