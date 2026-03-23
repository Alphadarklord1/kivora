'use client';
import { useEffect } from 'react';
import { scheduleExamReminders, scheduleStreakAlert } from '@/lib/notifications/scheduler';

const LS_KEY = 'kivora-calendar-events'; // same key used by planner

export function useNotificationScheduler() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const examPref = localStorage.getItem('kivora-notif-exams') !== 'false';
    const streakPref = localStorage.getItem('kivora-notif-streak') !== 'false';

    if (examPref) {
      try {
        const events = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
        const examEvents = events
          .filter((e: { type: string; title: string; date: string }) => e.type === 'exam')
          .map((e: { title: string; date: string }) => ({ title: e.title, date: e.date }));
        scheduleExamReminders(examEvents);
      } catch {}
    }

    if (streakPref) {
      scheduleStreakAlert();
    }
  }, []);
}
