// Study Schedule Generation Logic

export interface StudyTopic {
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedHours: number;
  completed?: boolean;
}

export interface StudySession {
  duration: number; // seconds
  completedAt: string; // ISO datetime string
}

export interface ScheduleDay {
  date: string; // ISO date string
  dayNumber: number;
  topics: {
    name: string;
    duration: number; // minutes
    tasks: ('learn' | 'practice' | 'review')[];
  }[];
  totalMinutes: number;
  isRevision: boolean;
  completed?: boolean;
  notes?: string;
  sessions?: StudySession[];
}

export interface GeneratedSchedule {
  startDate: string;
  endDate: string;
  totalDays: number;
  days: ScheduleDay[];
  summary: {
    totalStudyHours: number;
    topicsCount: number;
    revisionDays: number;
  };
}

/**
 * Generates a study schedule based on exam date, topics, and daily study time.
 *
 * Algorithm:
 * 1. Calculate days until exam
 * 2. Sort topics by difficulty (hardest first)
 * 3. Reserve last 20% of days for revision
 * 4. Distribute topic hours across learning days
 * 5. Each topic gets: learn -> practice -> review phases
 */
export function generateStudySchedule(
  examDate: Date,
  topics: StudyTopic[],
  dailyMinutes: number
): GeneratedSchedule {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const exam = new Date(examDate);
  exam.setHours(0, 0, 0, 0);

  // Calculate total days available
  const totalDays = Math.max(1, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // Sort topics by difficulty (hardest first - they need more time and early start)
  const sortedTopics = [...topics].sort((a, b) => b.difficulty - a.difficulty);

  // Calculate total estimated hours
  const _totalEstimatedHours = sortedTopics.reduce((sum, t) => sum + t.estimatedHours, 0);

  // Reserve last 20% of days for revision (minimum 1 day if > 5 days)
  const revisionDays = totalDays > 5 ? Math.max(1, Math.floor(totalDays * 0.2)) : 0;
  const learningDays = totalDays - revisionDays;

  // Calculate daily learning capacity in hours
  const dailyHours = dailyMinutes / 60;
  const _totalLearningHours = learningDays * dailyHours;

  // Generate schedule
  const days: ScheduleDay[] = [];

  // Track remaining hours per topic
  const topicRemaining = new Map<string, number>();
  const topicPhase = new Map<string, 'learn' | 'practice' | 'review'>();

  for (const topic of sortedTopics) {
    topicRemaining.set(topic.name, topic.estimatedHours * 60); // in minutes
    topicPhase.set(topic.name, 'learn');
  }

  // Allocate time for learning days
  for (let dayNum = 1; dayNum <= learningDays; dayNum++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayNum - 1);

    const dayTopics: ScheduleDay['topics'] = [];
    let remainingMinutes = dailyMinutes;

    // Find topics that still need time
    for (const topic of sortedTopics) {
      if (remainingMinutes <= 0) break;

      const remaining = topicRemaining.get(topic.name) || 0;
      if (remaining <= 0) continue;

      // Allocate time to this topic
      const allocate = Math.min(remainingMinutes, remaining, dailyMinutes * 0.6); // Max 60% of day per topic

      if (allocate > 0) {
        const _phase = topicPhase.get(topic.name) || 'learn';
        const tasks: ('learn' | 'practice' | 'review')[] = [];

        // Determine tasks based on how much of the topic is done
        const totalForTopic = topics.find(t => t.name === topic.name)?.estimatedHours || 1;
        const completedRatio = 1 - (remaining / (totalForTopic * 60));

        if (completedRatio < 0.4) {
          tasks.push('learn');
          topicPhase.set(topic.name, 'learn');
        } else if (completedRatio < 0.7) {
          tasks.push('practice');
          topicPhase.set(topic.name, 'practice');
        } else {
          tasks.push('review');
          topicPhase.set(topic.name, 'review');
        }

        dayTopics.push({
          name: topic.name,
          duration: Math.round(allocate),
          tasks,
        });

        remainingMinutes -= allocate;
        topicRemaining.set(topic.name, remaining - allocate);
      }
    }

    // If we have time left and topics still need work, add more
    if (remainingMinutes > 10) {
      for (const topic of sortedTopics) {
        if (remainingMinutes <= 0) break;

        const remaining = topicRemaining.get(topic.name) || 0;
        if (remaining <= 0) continue;

        const existingEntry = dayTopics.find(d => d.name === topic.name);
        if (existingEntry) {
          const addMinutes = Math.min(remainingMinutes, remaining);
          existingEntry.duration += Math.round(addMinutes);
          remainingMinutes -= addMinutes;
          topicRemaining.set(topic.name, remaining - addMinutes);
        }
      }
    }

    days.push({
      date: date.toISOString().split('T')[0],
      dayNumber: dayNum,
      topics: dayTopics,
      totalMinutes: dailyMinutes - Math.round(remainingMinutes),
      isRevision: false,
      completed: false,
    });
  }

  // Generate revision days
  for (let dayNum = learningDays + 1; dayNum <= totalDays; dayNum++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayNum - 1);

    // Distribute revision across all topics
    const minutesPerTopic = Math.floor(dailyMinutes / sortedTopics.length);
    const dayTopics: ScheduleDay['topics'] = sortedTopics.map(topic => ({
      name: topic.name,
      duration: minutesPerTopic,
      tasks: ['review'] as ('learn' | 'practice' | 'review')[],
    }));

    days.push({
      date: date.toISOString().split('T')[0],
      dayNumber: dayNum,
      topics: dayTopics,
      totalMinutes: dailyMinutes,
      isRevision: true,
      completed: false,
    });
  }

  return {
    startDate: today.toISOString().split('T')[0],
    endDate: exam.toISOString().split('T')[0],
    totalDays,
    days,
    summary: {
      totalStudyHours: Math.round((totalDays * dailyMinutes) / 60),
      topicsCount: topics.length,
      revisionDays,
    },
  };
}

/**
 * Calculate progress percentage based on completed days
 */
export function calculateProgress(schedule: GeneratedSchedule): number {
  const completedDays = schedule.days.filter(d => d.completed).length;
  return Math.round((completedDays / schedule.totalDays) * 100);
}

/**
 * Format a date for display
 */
export function formatScheduleDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get week number from day number
 */
export function getWeekNumber(dayNumber: number): number {
  return Math.ceil(dayNumber / 7);
}

/**
 * Group schedule days by week
 */
export function groupByWeek(days: ScheduleDay[]): Map<number, ScheduleDay[]> {
  const weeks = new Map<number, ScheduleDay[]>();

  for (const day of days) {
    const week = getWeekNumber(day.dayNumber);
    if (!weeks.has(week)) {
      weeks.set(week, []);
    }
    weeks.get(week)!.push(day);
  }

  return weeks;
}
