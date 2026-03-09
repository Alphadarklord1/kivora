import { GeneratedSchedule, StudyTopic } from '@/lib/planner/generate';

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

export interface CreatePlanData {
  title: string;
  examDate: string;
  dailyMinutes: number;
  topics: StudyTopic[];
  schedule: GeneratedSchedule;
  folderId?: string | null;
}

export interface UpdatePlanData {
  status?: 'active' | 'completed' | 'paused';
  progress?: number;
  schedule?: GeneratedSchedule;
  topics?: StudyTopic[];
  folderId?: string | null;
}
