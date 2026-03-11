import { CreatePlanData, StudyPlan, UpdatePlanData } from '@/lib/planner/study-plan-types';
import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

const LOCAL_USER_ID = 'local-demo-user';

function sortPlans(plans: StudyPlan[]) {
  return [...plans].sort((a, b) => {
    const left = new Date(b.updatedAt).getTime();
    const right = new Date(a.updatedAt).getTime();
    return left - right;
  });
}

export function loadLocalStudyPlans(): StudyPlan[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = readCompatStorage(localStorage, storageKeys.localStudyPlans);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sortPlans(parsed) : [];
  } catch {
    return [];
  }
}

function persistLocalStudyPlans(plans: StudyPlan[]) {
  if (typeof window === 'undefined') return;
  writeCompatStorage(localStorage, storageKeys.localStudyPlans, JSON.stringify(sortPlans(plans)));
}

export function createLocalStudyPlan(data: CreatePlanData): StudyPlan {
  const now = new Date().toISOString();
  const plan: StudyPlan = {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `local-plan-${Date.now()}`,
    userId: LOCAL_USER_ID,
    title: data.title,
    examDate: data.examDate,
    dailyMinutes: data.dailyMinutes,
    folderId: data.folderId ?? null,
    status: 'active',
    topics: data.topics,
    schedule: data.schedule,
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };

  const next = [plan, ...loadLocalStudyPlans()];
  persistLocalStudyPlans(next);
  return plan;
}

export function updateLocalStudyPlan(id: string, updates: UpdatePlanData): StudyPlan | null {
  const plans = loadLocalStudyPlans();
  const index = plans.findIndex((plan) => plan.id === id);
  if (index === -1) return null;

  const updated: StudyPlan = {
    ...plans[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  plans[index] = updated;
  persistLocalStudyPlans(plans);
  return updated;
}

export function deleteLocalStudyPlan(id: string): boolean {
  const plans = loadLocalStudyPlans();
  const next = plans.filter((plan) => plan.id !== id);
  if (next.length === plans.length) return false;
  persistLocalStudyPlans(next);
  return true;
}

export function getLocalStudyPlan(id: string): StudyPlan | null {
  return loadLocalStudyPlans().find((plan) => plan.id === id) ?? null;
}

interface AnalyticsDataLike {
  planStats: {
    totalPlans: number;
    activePlans: number;
    completedPlans: number;
    averageProgress: number;
    totalStudyDays: number;
    completedDays: number;
  };
  usage: {
    totalFiles: number;
    uploadedFiles: number;
    generatedFiles: number;
    libraryItems: number;
    toolUsage: Record<string, number>;
    periodGenerated: number;
    periodUploads: number;
    periodLibraryItems: number;
  };
  insights: string[];
}

export function buildAnalyticsFromLocalPlans<T extends AnalyticsDataLike>(base: T): T {
  const plans = loadLocalStudyPlans();
  if (plans.length === 0) return base;

  const totalStudyDays = plans.reduce((sum, plan) => sum + (plan.schedule?.days?.length ?? 0), 0);
  const completedDays = plans.reduce(
    (sum, plan) => sum + (plan.schedule?.days?.filter((day) => day.completed).length ?? 0),
    0
  );
  const averageProgress = plans.length > 0
    ? Math.round(plans.reduce((sum, plan) => sum + (plan.progress ?? 0), 0) / plans.length)
    : 0;

  const planStats = {
    totalPlans: plans.length,
    activePlans: plans.filter((plan) => plan.status === 'active').length,
    completedPlans: plans.filter((plan) => plan.status === 'completed').length,
    averageProgress,
    totalStudyDays,
    completedDays,
  };

  const usage = {
    ...base.usage,
    toolUsage: {
      ...base.usage.toolUsage,
      planner: plans.length,
    },
  };

  const localInsight = plans.length > 0
    ? `Planner data is using local beta storage on this device.`
    : '';

  return {
    ...base,
    planStats,
    usage,
    insights: localInsight && !base.insights.includes(localInsight)
      ? [localInsight, ...base.insights]
      : base.insights,
  } as T;
}
