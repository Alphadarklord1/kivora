// Notification scheduler using Web Notifications API
// Schedules: exam reminders (1 day before + morning of) and streak alerts (8pm if no study today)

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

interface ExamEvent { title: string; date: string; } // date = YYYY-MM-DD

const NOTIF_KEY = 'kivora-scheduled-notifs'; // tracks which notifications have been sent

function getScheduled(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '[]')); } catch { return new Set(); }
}
function markScheduled(id: string) {
  const s = getScheduled(); s.add(id);
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify([...s])); } catch {}
}

export function scheduleExamReminders(events: ExamEvent[]): void {
  if (Notification.permission !== 'granted') return;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  for (const evt of events) {
    if (evt.date < todayStr) continue;

    // Day-before reminder at 8pm
    const dayBefore = new Date(evt.date);
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(20, 0, 0, 0);
    const dayBeforeId = `exam-before-${evt.title}-${evt.date}`;
    if (dayBefore > now && !getScheduled().has(dayBeforeId)) {
      const delay = dayBefore.getTime() - now.getTime();
      if (delay < 7 * 24 * 60 * 60 * 1000) { // only schedule if within 7 days
        setTimeout(() => {
          new Notification('Exam tomorrow: ' + evt.title, {
            body: 'Your exam is tomorrow. Review your flashcards and notes tonight!',
            icon: '/favicon.ico',
            tag: dayBeforeId,
          });
          markScheduled(dayBeforeId);
        }, delay);
      }
    }

    // Day-of reminder at 7am
    const dayOf = new Date(evt.date + 'T07:00:00');
    const dayOfId = `exam-day-${evt.title}-${evt.date}`;
    if (dayOf > now && !getScheduled().has(dayOfId)) {
      const delay = dayOf.getTime() - now.getTime();
      if (delay < 24 * 60 * 60 * 1000) { // only schedule if today
        setTimeout(() => {
          new Notification('Exam today: ' + evt.title, {
            body: "Good luck on your exam today! You've got this.",
            icon: '/favicon.ico',
            tag: dayOfId,
          });
          markScheduled(dayOfId);
        }, delay);
      }
    }
  }
}

export function scheduleStreakAlert(): void {
  if (Notification.permission !== 'granted') return;
  const now = new Date();
  const alertTime = new Date();
  alertTime.setHours(20, 0, 0, 0); // 8pm today
  if (alertTime <= now) return; // already past 8pm

  const alertId = `streak-${now.toISOString().split('T')[0]}`;
  if (getScheduled().has(alertId)) return;

  const delay = alertTime.getTime() - now.getTime();
  setTimeout(() => {
    // Only fire if user hasn't studied today (check localStorage sessions)
    try {
      const sessions = JSON.parse(localStorage.getItem('kivora-study-sessions') ?? '[]');
      const today = new Date().toISOString().split('T')[0];
      const studiedToday = sessions.some((s: { date: string; cards: number }) => s.date === today && s.cards > 0);
      if (!studiedToday) {
        new Notification('Keep your streak alive! 🔥', {
          body: "You haven't studied today yet. Review a few flashcards to keep your streak going.",
          icon: '/favicon.ico',
          tag: alertId,
        });
      }
    } catch {}
    markScheduled(alertId);
  }, delay);
}
