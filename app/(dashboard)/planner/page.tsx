'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useStudyPlans } from '@/hooks/useStudyPlans';
import { PlanList } from '@/components/planner/PlanList';
import { PlanForm } from '@/components/planner/PlanForm';
import { generateStudySchedule } from '@/lib/planner/generate';
import type { StudyPlan } from '@/lib/planner/study-plan-types';
import { loadDecks, getWorkloadForecast } from '@/lib/srs/sm2';
import { useI18n } from '@/lib/i18n/useI18n';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'study' | 'exam' | 'deadline' | 'class' | 'break' | 'revision';
type CalendarView = 'month' | 'week' | 'day' | 'agenda';
type PlannerMode = 'timetable' | 'calendar' | 'plans';

interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  description?: string;
  planId?: string;
  completed?: boolean;
  color?: string;
}

interface NewEventForm {
  title: string;
  type: EventType;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
}

type TimetableFocus = 'balanced' | 'earliest' | 'compact' | 'seat-open';

interface TimetableMeeting {
  days: number[];
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  raw: string;
}

interface TimetableSection {
  id: string;
  label: string;
  instructor?: string;
  seatsOpen?: number | null;
  meetings: TimetableMeeting[];
  raw: string;
}

interface TimetableCourse {
  id: string;
  title: string;
  code?: string;
  raw: string;
  sections: TimetableSection[];
}

interface TimetablePrefs {
  earliestStart: string;
  latestFinish: string;
  avoidDays: number[];
  focus: TimetableFocus;
  seatOpenOnly: boolean;
}

interface TimetableCandidate {
  id: string;
  sections: Array<{
    courseId: string;
    courseTitle: string;
    section: TimetableSection;
  }>;
  score: number;
  firstStart: number;
  lastEnd: number;
  busyDays: number;
  seatOpenCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<EventType, string> = {
  study:    '#4f86f7',
  exam:     '#e05252',
  deadline: '#e07a52',
  class:    '#52b788',
  break:    '#a78bfa',
  revision: '#f59e0b',
};

const EVENT_ICONS: Record<EventType, string> = {
  study:    '📚',
  exam:     '📝',
  deadline: '⏰',
  class:    '🎓',
  break:    '☕',
  revision: '🔄',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const LS_KEY = 'kivora-calendar-events';

const TIMETABLE_FOCUS_OPTIONS: TimetableFocus[] = ['balanced', 'earliest', 'compact', 'seat-open'];
const TIMETABLE_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMETABLE_DAY_PATTERNS: Array<[RegExp, number[]]> = [
  [/sunday|sun\b|\bsu\b/i, [0]],
  [/monday|mon\b/i, [1]],
  [/tuesday|tue\b/i, [2]],
  [/wednesday|wed\b/i, [3]],
  [/thursday|thu\b|th\b/i, [4]],
  [/friday|fri\b/i, [5]],
  [/saturday|sat\b|\bsa\b/i, [6]],
];

const SAMPLE_CATALOG_TEXTS = [
  `MATH 201 Calculus II

Section A
Instructor: Dr. Rahman
Seats open: 8
MW 9:00 AM - 10:15 AM

Section B
Instructor: Dr. Silva
Seats open: 0
TR 1:00 PM - 2:15 PM`,
  `BIO 110 Biology Foundations

Section 01
Instructor: Prof. Al-Mansoori
Seats open: 12
TR 9:30 AM - 10:45 AM

Section 02
Instructor: Prof. Haddad
Seats open: 4
MW 11:00 AM - 12:15 PM`,
  `ENG 205 Academic Writing

Section A
Instructor: Dr. Khan
Seats open: 7
Sun 2:00 PM - 4:00 PM

Section B
Instructor: Dr. Noor
Seats open: 2
Wed 2:00 PM - 4:00 PM`,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parseDate(s: string): Date { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate()-r.getDay()); return r; }
function sameDay(a: Date, b: Date) { return toDateStr(a) === toDateStr(b); }

function loadEventsLocal(): CalendarEvent[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveEventsLocal(events: CalendarEvent[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(events)); } catch { /* noop */ }
}

async function fetchEventsFromApi(): Promise<CalendarEvent[] | null> {
  try {
    const res = await fetch('/api/planner/events');
    if (!res.ok) return null;
    const rows = await res.json() as Array<Record<string, unknown>>;
    // Map DB column names back to camelCase interface
    return rows.map(r => ({
      id: r.id as string,
      title: r.title as string,
      type: r.type as CalendarEvent['type'],
      date: r.date as string,
      startTime: (r.startTime ?? r.start_time) as string,
      endTime: (r.endTime ?? r.end_time) as string,
      description: r.description as string | undefined,
      planId: (r.planId ?? r.plan_id) as string | undefined,
      completed: Boolean(r.completed),
      color: r.color as string | undefined,
    }));
  } catch { return null; }
}

async function apiCreateEvent(evt: CalendarEvent): Promise<void> {
  try {
    await fetch('/api/planner/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evt),
    });
  } catch { /* noop — localStorage already updated */ }
}

async function apiUpdateEvent(id: string, patch: Partial<CalendarEvent>): Promise<void> {
  try {
    await fetch(`/api/planner/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  } catch { /* noop */ }
}

async function apiDeleteEvent(id: string): Promise<void> {
  try {
    await fetch(`/api/planner/events/${id}`, { method: 'DELETE' });
  } catch { /* noop */ }
}

function uid() { return `evt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

function daysUntil(dateStr: string): number {
  const target = parseDate(dateStr);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function timeToMinutes(value: string): number {
  const trimmed = value.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return Number.NaN;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = match[3];
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTimeLabel(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hrs >= 12 ? 'PM' : 'AM';
  const twelve = hrs % 12 || 12;
  return `${twelve}:${String(mins).padStart(2, '0')} ${suffix}`;
}

function parseMeetingDays(input: string): number[] {
  const normalized = input.replace(/[·,]/g, ' ').replace(/\s+/g, ' ').trim();
  const found = new Set<number>();
  for (const [pattern, days] of TIMETABLE_DAY_PATTERNS) {
    if (pattern.test(normalized)) days.forEach((day) => found.add(day));
  }
  if (found.size > 0) return [...found].sort((a, b) => a - b);

  const compact = normalized.replace(/[^A-Za-z]/g, '');
  for (let i = 0; i < compact.length; i += 1) {
    const pair = compact.slice(i, i + 2).toUpperCase();
    if (pair === 'SU') { found.add(0); i += 1; continue; }
    if (pair === 'SA') { found.add(6); i += 1; continue; }
    if (pair === 'TH') { found.add(4); i += 1; continue; }
    const single = compact[i]?.toUpperCase();
    if (single === 'M') found.add(1);
    if (single === 'T') found.add(2);
    if (single === 'W') found.add(3);
    if (single === 'R') found.add(4);
    if (single === 'F') found.add(5);
  }

  return [...found].sort((a, b) => a - b);
}

function parseMeetingLine(line: string): TimetableMeeting | null {
  const rangeMatch = line.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)[\s]*[-–][\s]*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
  if (!rangeMatch) return null;
  const startMinutes = timeToMinutes(rangeMatch[1]);
  const endMinutes = timeToMinutes(rangeMatch[2]);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes) || endMinutes <= startMinutes) return null;
  const days = parseMeetingDays(line.slice(0, rangeMatch.index ?? 0) || line);
  if (days.length === 0) return null;
  return {
    days,
    start: minutesToTimeLabel(startMinutes),
    end: minutesToTimeLabel(endMinutes),
    startMinutes,
    endMinutes,
    raw: line,
  };
}

function parseSectionChunk(courseId: string, title: string, rawChunk: string, index: number): TimetableSection | null {
  const lines = rawChunk.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const meetings = lines.map(parseMeetingLine).filter((meeting): meeting is TimetableMeeting => Boolean(meeting));
  if (meetings.length === 0) return null;
  const sectionMatch = rawChunk.match(/(?:section|sec|class|crn)[:\s#-]*([A-Za-z0-9-]+)/i);
  const instructorMatch = rawChunk.match(/(?:instructor|professor|faculty)[:\s-]*([^\n]+)/i);
  const seatsMatch = rawChunk.match(/(\d+)\s*(?:seats?\s*open|open\s*seats?|available)/i);
  return {
    id: `${courseId}_section_${index + 1}`,
    label: sectionMatch?.[1] ?? `Option ${index + 1}`,
    instructor: instructorMatch?.[1]?.trim(),
    seatsOpen: seatsMatch ? Number(seatsMatch[1]) : null,
    meetings,
    raw: rawChunk,
  };
}

function parseRegistrarCourse(raw: string): TimetableCourse | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const blocks = cleaned.split(/\n\s*\n+/).map((block) => block.trim()).filter(Boolean);
  const titleLine = blocks[0]?.split('\n')[0]?.trim() ?? 'Untitled course';
  const codeMatch = titleLine.match(/([A-Z]{2,}\s*\d{2,}[A-Z]?)/);
  const courseId = `${codeMatch?.[1]?.replace(/\s+/g, '-') ?? 'course'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sectionSources = blocks.length > 1 ? blocks.slice(1) : [cleaned];
  const sections = sectionSources.map((chunk, index) => parseSectionChunk(courseId, titleLine, chunk, index)).filter((section): section is TimetableSection => Boolean(section));
  if (sections.length === 0) return null;
  return {
    id: courseId,
    title: titleLine,
    code: codeMatch?.[1],
    raw: cleaned,
    sections,
  };
}

function sectionsConflict(a: TimetableSection, b: TimetableSection): boolean {
  return a.meetings.some((meetingA) => b.meetings.some((meetingB) =>
    meetingA.days.some((day) => meetingB.days.includes(day))
    && meetingA.startMinutes < meetingB.endMinutes
    && meetingB.startMinutes < meetingA.endMinutes,
  ));
}

function sectionMatchesPrefs(section: TimetableSection, prefs: TimetablePrefs): boolean {
  return section.meetings.every((meeting) =>
    meeting.startMinutes >= (prefs.earliestStart ? timeToMinutes(prefs.earliestStart) : 0)
    && meeting.endMinutes <= (prefs.latestFinish ? timeToMinutes(prefs.latestFinish) : 24 * 60)
    && meeting.days.every((day) => !prefs.avoidDays.includes(day)),
  ) && (!prefs.seatOpenOnly || (section.seatsOpen ?? 0) > 0);
}

function scoreCandidate(candidate: Omit<TimetableCandidate, 'score'>, prefs: TimetablePrefs): number {
  const span = candidate.lastEnd - candidate.firstStart;
  const seatBoost = candidate.seatOpenCount * 18;
  if (prefs.focus === 'earliest') return 10000 - candidate.firstStart - candidate.busyDays * 20 + seatBoost;
  if (prefs.focus === 'compact') return 10000 - span - candidate.busyDays * 65 + seatBoost;
  if (prefs.focus === 'seat-open') return 1000 + seatBoost - candidate.busyDays * 15 - candidate.firstStart * 0.1;
  return 10000 - span * 0.4 - candidate.busyDays * 45 - candidate.firstStart * 0.15 + seatBoost;
}

function buildTimetableCandidates(courses: TimetableCourse[], prefs: TimetablePrefs): TimetableCandidate[] {
  const filtered = courses.map((course) => ({ ...course, sections: course.sections.filter((section) => sectionMatchesPrefs(section, prefs)) }));
  if (filtered.some((course) => course.sections.length === 0)) return [];

  const candidates: TimetableCandidate[] = [];
  const current: Array<{ courseId: string; courseTitle: string; section: TimetableSection }> = [];

  const visit = (index: number) => {
    if (candidates.length > 500) return;
    if (index >= filtered.length) {
      const meetings = current.flatMap((item) => item.section.meetings);
      const daySet = new Set(meetings.flatMap((meeting) => meeting.days));
      const firstStart = Math.min(...meetings.map((meeting) => meeting.startMinutes));
      const lastEnd = Math.max(...meetings.map((meeting) => meeting.endMinutes));
      const seatOpenCount = current.filter((item) => (item.section.seatsOpen ?? 0) > 0).length;
      const base = {
        id: current.map((item) => item.section.id).join('__'),
        sections: [...current],
        firstStart,
        lastEnd,
        busyDays: daySet.size,
        seatOpenCount,
      };
      candidates.push({ ...base, score: scoreCandidate(base, prefs) });
      return;
    }

    const course = filtered[index];
    for (const section of course.sections) {
      if (current.some((item) => sectionsConflict(item.section, section))) continue;
      current.push({ courseId: course.id, courseTitle: course.title, section });
      visit(index + 1);
      current.pop();
    }
  };

  visit(0);
  return candidates.sort((a, b) => b.score - a.score).slice(0, 24);
}

function formatTimetableCandidate(candidate: TimetableCandidate): string {
  const header = `Kivora timetable · ${candidate.busyDays} day week · ${minutesToTimeLabel(candidate.firstStart)} to ${minutesToTimeLabel(candidate.lastEnd)}`;
  const lines = candidate.sections.map((item) => {
    const meetings = item.section.meetings
      .map((meeting) => `${meeting.days.map((day) => TIMETABLE_DAY_LABELS[day]).join('/')} ${meeting.start}-${meeting.end}`)
      .join('; ');
    const instructor = item.section.instructor ? ` · ${item.section.instructor}` : '';
    const seats = typeof item.section.seatsOpen === 'number' ? ` · ${item.section.seatsOpen} open` : '';
    return `- ${item.courseTitle} (${item.section.label}${instructor}${seats}): ${meetings}`;
  });
  return [header, ...lines].join('\\n');
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlannerPage() {
  useEffect(() => { document.title = 'Planner — Kivora'; }, []);
  const { t } = useI18n({
    'Academic Planner': 'المخطط الأكاديمي',
    'Map exams, deadlines, classes, and study blocks in one calm command center.': 'نظّم الاختبارات والمواعيد النهائية والدروس وجلسات الدراسة في مركز واحد هادئ.',
    'Active plans': 'الخطط النشطة',
    'Upcoming exams': 'الاختبارات القادمة',
    'Events this week': 'الأحداث هذا الأسبوع',
    "Today's sessions": "جلسات اليوم",
    'Create study plan': 'أنشئ خطة دراسة',
    'Add calendar event': 'أضف حدثًا للتقويم',
    'Planner board': 'لوحة المخطط',
    'A clearer view of what matters next.': 'رؤية أوضح لما يجب التركيز عليه بعد ذلك.',
    'Selected plan': 'الخطة المحددة',
    'No plan selected yet': 'لم يتم تحديد خطة بعد',
    'Current range': 'النطاق الحالي',
    'View': 'العرض',
    'Today agenda': 'أجندة اليوم',
    'No events scheduled for today.': 'لا توجد أحداث مجدولة اليوم.',
    'Planner setup': 'إعداد المخطط',
    'Start with one exam or deadline and Kivora will build the study blocks around it.': 'ابدأ باختبار واحد أو موعد نهائي وسيبني Kivora جلسات الدراسة حوله.',
    'Open Workspace': 'افتح مساحة العمل',
    'New Event': 'حدث جديد',
    'Event Types': 'أنواع الأحداث',
    'Exam Countdowns': 'عدّادات الاختبار',
    'Today': 'اليوم',
    'No events today': 'لا توجد أحداث اليوم',
    'Timetable Builder': 'منشئ الجدول',
    'Study Calendar': 'تقويم الدراسة',
    'Study Plans': 'خطط الدراسة',
    'Build your timetable': 'أنشئ جدولك',
    "Paste your catalog export, fine-tune constraints, and we'll build the best schedule for you.": 'الصق تصدير المقررات، واضبط القيود، وسنبني لك أفضل جدول ممكن.',
    Courses: 'المقررات',
    'Seat-open options': 'الخيارات ذات المقاعد المفتوحة',
    Pinned: 'المثبتة',
    'Valid schedules': 'الجداول الصالحة',
    'Use sample': 'استخدم مثالاً',
    'Demo set': 'مجموعة تجريبية',
    'Paste one registrar export chunk, hit add, and repeat for each course.': 'الصق جزءًا واحدًا من تصدير نظام التسجيل، ثم اضغط إضافة وكرر ذلك لكل مقرر.',
    'Paste the raw course text here...': 'الصق نص المقرر الخام هنا...',
    'Paste your catalog text to see structured options.': 'الصق نص المقررات لرؤية الخيارات المنظمة.',
    'Paste a course block with at least one section meeting line to generate options.': 'الصق كتلة مقرر تتضمن سطر موعد شعبة واحدًا على الأقل لإنشاء الخيارات.',
    'Sample course loaded. Add it, then add more courses or use the full demo set.': 'تم تحميل مقرر نموذجي. أضفه، ثم أضف مقررات أخرى أو استخدم المجموعة التجريبية الكاملة.',
    'Demo course set added. Try avoiding a day or changing the ranking focus to compare schedules.': 'تمت إضافة المجموعة التجريبية. جرّب استبعاد يوم أو تغيير أولوية الترتيب لمقارنة الجداول.',
    Preferences: 'التفضيلات',
    'Seat-open only': 'المقاعد المفتوحة فقط',
    'Earliest start': 'أبكر بداية',
    'Latest finish': 'أقصى نهاية',
    'Preference focus': 'تركيز التفضيل',
    'Avoid days': 'تجنب الأيام',
    'Schedule builder': 'منشئ الجداول',
    '{count} valid combinations after applying constraints.': 'هناك {count} توليفة صالحة بعد تطبيق القيود.',
    'No schedules match the current constraints. Try relaxing earliest/latest times or allowed days.': 'لا توجد جداول تطابق القيود الحالية. جرّب تخفيف أوقات البداية أو النهاية أو الأيام المسموح بها.',
    'Need help?': 'هل تحتاج إلى مساعدة؟',
    'How to find your best fit schedule': 'كيف تجد الجدول الأنسب لك',
    'Paste your courses, generate multiple timetables, and pick the one that works best for you.': 'الصق مقرراتك، وأنشئ عدة جداول، ثم اختر الأنسب لك.',
    'Simple workflow': 'خطوات بسيطة',
    'Multiple options': 'خيارات متعددة',
    'Pick the best': 'اختر الأفضل',
    'Paste course text from your registrar portal above. The planner generates all valid combinations from the sections it can read.': 'الصق نص المقرر من بوابة التسجيل بالأعلى. سينشئ المخطط كل التوليفات الصالحة التي يستطيع قراءتها من الشعب.',
    'Use focus and day filters to narrow down a calmer week, an earlier start, or seat-open sections only.': 'استخدم مرشحات التركيز والأيام للحصول على أسبوع أهدأ أو بداية أبكر أو شعب بمقاعد مفتوحة فقط.',
    'Pin your favorite schedules and keep your study plans, deadlines, and revision blocks in the same command center.': 'ثبّت جداولك المفضلة واحتفظ بخطط الدراسة والمواعيد النهائية وجلسات المراجعة في نفس المركز.',
    'Build an exam-ready revision path from your topics, daily minutes, and deadline.': 'ابنِ مسار مراجعة جاهزًا للاختبار من موضوعاتك ودقائقك اليومية وموعدك النهائي.',
    'Exam date': 'تاريخ الاختبار',
    'View on calendar': 'اعرض على التقويم',
    'No study plan selected yet': 'لم يتم تحديد خطة دراسة بعد',
    'Create your first plan or select one from the list to see its exam date, workload, and generated revision blocks.': 'أنشئ خطتك الأولى أو اختر واحدة من القائمة لرؤية تاريخ الاختبار وحجم العبء وجلسات المراجعة المُولدة.',
    'Schedule copied. You can paste it into notes, email, or your registrar planning sheet.': 'تم نسخ الجدول. يمكنك لصقه في الملاحظات أو البريد أو ورقة التخطيط الخاصة بك.',
    'Option {count}': 'الخيار {count}',
    'Pin': 'ثبّت',
    Copy: 'نسخ',
    'Add course': 'أضف مقررًا',
    'Example: Section A · Instructor: Dr. Noor · Seats open: 8 · MW 9:00 AM - 10:15 AM': 'مثال: الشعبة A · المحاضر: د. نور · المقاعد المفتوحة: 8 · اث/أر 9:00 ص - 10:15 ص',
    Remove: 'إزالة',
    Balanced: 'متوازن',
    Earliest: 'الأبكر',
    Compact: 'مكثف',
    '{count} open': '{count} مقعد مفتوح',
    'View mode {mode}': 'وضع العرض {mode}',
    Month: 'شهر',
    Week: 'أسبوع',
    Day: 'يوم',
    Agenda: 'جدول الأعمال',
    'Event detail': 'تفاصيل الحدث',
    Passed: 'انتهى',
    '{count}d': '{count}ي',
    'Study event': 'جلسة دراسة',
    'Exam event': 'اختبار',
    'Deadline event': 'موعد نهائي',
    'Class event': 'حصة',
    'Break event': 'استراحة',
    'Revision event': 'مراجعة',
    Unmark: 'إلغاء التعليم',
    Done: 'تم',
    Edit: 'تعديل',
    Delete: 'حذف',
    'Edit Event': 'عدّل الحدث',
    Title: 'العنوان',
    'Event title…': 'عنوان الحدث…',
    Type: 'النوع',
    Date: 'التاريخ',
    Start: 'البداية',
    End: 'النهاية',
    'Notes (optional)': 'ملاحظات (اختياري)',
    'Add notes…': 'أضف ملاحظات…',
    Cancel: 'إلغاء',
    'Save Changes': 'احفظ التغييرات',
    'Create Event': 'أنشئ الحدث',
    'Added course summary': 'تمت إضافة {title} مع {count} خيار شعبة.',
    '{count} section option': '{count} خيار شعبة',
    '{count} section options': '{count} خيارات شعب',
    '{count} topic': '{count} موضوع',
    '{count} topics': '{count} موضوعات',
    '{count} minutes/day': '{count} دقيقة/يوم',
  });
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalendarView>('week');
  const [plannerMode, setPlannerMode] = useState<PlannerMode>('timetable');
  const [cursor, setCursor] = useState<Date>(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [miniDate, setMiniDate] = useState<Date>(today);
  const [form, setForm] = useState<NewEventForm>({
    title: '', type: 'study', date: toDateStr(today),
    startTime: '09:00', endTime: '10:00', description: '',
  });
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ date: string; hour: number } | null>(null);
  const { plans, createPlan, deletePlan, loading: plansLoading } = useStudyPlans();
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [courseInput, setCourseInput] = useState('');
  const [timetableCourses, setTimetableCourses] = useState<TimetableCourse[]>([]);
  const [pinnedSchedules, setPinnedSchedules] = useState<string[]>([]);
  const [timetablePrefs, setTimetablePrefs] = useState<TimetablePrefs>({
    earliestStart: '',
    latestFinish: '',
    avoidDays: [],
    focus: 'balanced',
    seatOpenOnly: false,
  });
  const [courseParseError, setCourseParseError] = useState<string | null>(null);
  const [timetableActionMessage, setTimetableActionMessage] = useState<string | null>(null);

  // Load from API (falling back to localStorage) + inject from study plans
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const apiEvents = await fetchEventsFromApi();
      if (cancelled) return;
      // If API returned data, sync to localStorage cache
      if (apiEvents !== null) {
        saveEventsLocal(apiEvents);
      }
      const stored = apiEvents ?? loadEventsLocal();
      const stored_ids = new Set(stored.map(e => e.id));

    // Inject schedule days from study plans as events
    const planEvents: CalendarEvent[] = [];
    for (const plan of plans) {
      for (const day of plan.schedule?.days ?? []) {
        if (!day.date) continue;
        const evtId = `plan_${plan.id}_${day.date}`;
        if (stored_ids.has(evtId)) continue;
        const topicNames = day.topics?.map((t: { name: string }) => t.name).join(', ') || plan.title;
        planEvents.push({
          id: evtId,
          title: topicNames,
          type: day.isRevision ? 'revision' : 'study',
          date: day.date,
          startTime: '09:00',
          endTime: `${9 + Math.ceil((day.totalMinutes ?? 60)/60)}:00`.padStart(5,'0').slice(-5),
          description: `Study plan: ${plan.title}`,
          planId: plan.id,
          completed: day.completed,
        });
      }
      // Add exam event
      if (plan.schedule?.endDate) {
        const examId = `exam_${plan.id}`;
        if (!stored_ids.has(examId)) {
          planEvents.push({
            id: examId,
            title: `📝 Exam: ${plan.title}`,
            type: 'exam',
            date: plan.schedule.endDate,
            startTime: '09:00',
            endTime: '12:00',
            planId: plan.id,
          });
        }
      }
    }
      // Inject SRS due-card events from local decks (14-day horizon)
      const srsEvents: CalendarEvent[] = [];
      try {
        const decks = loadDecks();
        for (const deck of decks) {
          const forecast = getWorkloadForecast(deck, 14);
          forecast.forEach((count, dayOffset) => {
            if (count === 0) return;
            const d = new Date();
            d.setDate(d.getDate() + dayOffset);
            const dateStr = toDateStr(d);
            const evtId = `srs_${deck.id}_${dateStr}`;
            if (stored_ids.has(evtId)) return;
            srsEvents.push({
              id: evtId,
              title: `🃏 ${deck.name} (${count} due)`,
              type: 'revision',
              date: dateStr,
              startTime: '19:00',
              endTime: '19:30',
              description: `${count} flashcard${count !== 1 ? 's' : ''} due in "${deck.name}"`,
            });
          });
        }
      } catch { /* offline / localStorage unavailable */ }

      setEvents([...stored, ...planEvents, ...srsEvents]);
    })();
    return () => { cancelled = true; };
  }, [plans]);

  const persistEvents = useCallback((updated: CalendarEvent[]) => {
    // Only persist user-created events (not plan-injected or SRS-injected)
    const toSave = updated.filter(
      e => !e.id.startsWith('plan_') && !e.id.startsWith('exam_') && !e.id.startsWith('srs_'),
    );
    saveEventsLocal(toSave);
    setEvents(updated);
  }, []);

  // Scroll week view to 8am on mount
  useEffect(() => {
    if (view === 'week' || view === 'day') {
      setTimeout(() => {
        if (weekScrollRef.current) {
          weekScrollRef.current.scrollTop = 8 * 56;
        }
      }, 50);
    }
  }, [view]);

  const eventsForDate = useCallback((dateStr: string) => {
    return events.filter(e => e.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events]);

  const openNewEvent = useCallback((date?: string, startTime?: string) => {
    setEditingEvent(null);
    setForm({
      title: '', type: 'study',
      date: date ?? toDateStr(cursor),
      startTime: startTime ?? '09:00',
      endTime: startTime ? `${String(parseInt(startTime.split(':')[0])+1).padStart(2,'0')}:00` : '10:00',
      description: '',
    });
    setShowModal(true);
  }, [cursor]);

  const openEditEvent = useCallback((evt: CalendarEvent) => {
    setEditingEvent(evt);
    setForm({
      title: evt.title, type: evt.type,
      date: evt.date, startTime: evt.startTime, endTime: evt.endTime,
      description: evt.description ?? '',
    });
    setSelectedEvent(null);
    setShowModal(true);
  }, []);

  const saveEvent = useCallback(() => {
    if (!form.title.trim()) return;
    if (editingEvent) {
      const patch = { ...form, title: form.title.trim() };
      const updated = events.map(e => e.id === editingEvent.id ? { ...e, ...patch } : e);
      persistEvents(updated);
      void apiUpdateEvent(editingEvent.id, patch);
    } else {
      const newEvt: CalendarEvent = { id: uid(), ...form, title: form.title.trim() };
      persistEvents([...events, newEvt]);
      void apiCreateEvent(newEvt);
    }
    setShowModal(false);
  }, [form, editingEvent, events, persistEvents]);

  const deleteEvent = useCallback((id: string) => {
    persistEvents(events.filter(e => e.id !== id));
    setSelectedEvent(null);
    void apiDeleteEvent(id);
  }, [events, persistEvents]);

  const toggleComplete = useCallback((id: string) => {
    const evt = events.find(e => e.id === id);
    const newCompleted = !evt?.completed;
    const updated = events.map(e => e.id === id ? { ...e, completed: newCompleted } : e);
    persistEvents(updated);
    setSelectedEvent(prev => prev?.id === id ? { ...prev, completed: newCompleted } : prev);
    void apiUpdateEvent(id, { completed: newCompleted });
  }, [events, persistEvents]);

  const onEventDrop = useCallback((eventId: string, newDate: string, newHour: number) => {
    setDragOverSlot(null);
    setEvents(prev => {
      const updated = prev.map(e => {
        if (e.id !== eventId) return e;
        const [sh, sm] = e.startTime.split(':').map(Number);
        const [eh, em] = e.endTime.split(':').map(Number);
        const durationMins = (eh * 60 + em) - (sh * 60 + sm);
        const newStart = `${pad(newHour)}:00`;
        const endTotalMins = newHour * 60 + durationMins;
        const newEnd = `${pad(Math.floor(endTotalMins / 60) % 24)}:${pad(endTotalMins % 60)}`;
        return { ...e, date: newDate, startTime: newStart, endTime: newEnd };
      });
      const toSave = updated.filter(e => !e.id.startsWith('plan_') && !e.id.startsWith('exam_'));
      saveEventsLocal(toSave);
      const dropped = updated.find(e => e.id === eventId);
      if (dropped && !eventId.startsWith('plan_') && !eventId.startsWith('exam_')) {
        void apiUpdateEvent(eventId, { date: dropped.date, startTime: dropped.startTime, endTime: dropped.endTime });
      }
      return updated;
    });
  }, []);

  const activePlansCount = plans.filter((plan) => plan.status === 'active').length;
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);
  const weeklyEventsCount = events.filter((evt) => evt.date >= weekStartStr && evt.date <= weekEndStr).length;

  // Upcoming exams for sidebar countdown
  const upcomingExams = useMemo(() => {
    const todayStr = toDateStr(today);
    return events
      .filter(e => e.type === 'exam' && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  }, [events, today]);

  // Today events
  const todayEvents = useMemo(() => eventsForDate(toDateStr(today)), [eventsForDate, today]);

  const timetableCandidates = useMemo(() => buildTimetableCandidates(timetableCourses, timetablePrefs), [timetableCourses, timetablePrefs]);
  const seatOpenOptionCount = useMemo(() => timetableCourses.reduce((total, course) => total + course.sections.filter((section) => (section.seatsOpen ?? 0) > 0).length, 0), [timetableCourses]);
  const pinnedTimetables = useMemo(() => pinnedSchedules.map((candidateId) => timetableCandidates.find((candidate) => candidate.id === candidateId)).filter((candidate): candidate is TimetableCandidate => Boolean(candidate)), [pinnedSchedules, timetableCandidates]);

  const addTimetableCourse = useCallback(() => {
    const parsed = parseRegistrarCourse(courseInput);
    if (!parsed) {
      setCourseParseError(t('Paste a course block with at least one section meeting line to generate options.'));
      return;
    }
    setTimetableCourses((prev) => [...prev, parsed]);
    setCourseInput('');
    setCourseParseError(null);
    setTimetableActionMessage(t('Added course summary', { title: parsed.title, count: parsed.sections.length }));
  }, [courseInput, t]);

  const useSampleCatalogText = useCallback(() => {
    setCourseInput(SAMPLE_CATALOG_TEXTS[0]);
    setCourseParseError(null);
    setTimetableActionMessage(t('Sample course loaded. Add it, then add more courses or use the full demo set.'));
  }, [t]);

  const addSampleCourseSet = useCallback(() => {
    const parsed = SAMPLE_CATALOG_TEXTS.map(parseRegistrarCourse).filter((course): course is TimetableCourse => Boolean(course));
    setTimetableCourses(parsed);
    setPinnedSchedules([]);
    setCourseInput('');
    setCourseParseError(null);
    setTimetableActionMessage(t('Demo course set added. Try avoiding a day or changing the ranking focus to compare schedules.'));
  }, [t]);

  const copyTimetableCandidate = useCallback(async (candidate: TimetableCandidate) => {
    const text = formatTimetableCandidate(candidate);
    try {
      await navigator.clipboard.writeText(text);
      setTimetableActionMessage(t('Schedule copied. You can paste it into notes, email, or your registrar planning sheet.'));
    } catch {
      setTimetableActionMessage(text);
    }
  }, [t]);

  const removeTimetableCourse = useCallback((courseId: string) => {
    setTimetableCourses((prev) => prev.filter((course) => course.id !== courseId));
    setPinnedSchedules((prev) => prev.filter((candidateId) => !candidateId.includes(courseId)));
  }, []);

  const togglePinnedSchedule = useCallback((candidateId: string) => {
    setPinnedSchedules((prev) => prev.includes(candidateId) ? prev.filter((id) => id !== candidateId) : [...prev, candidateId]);
  }, []);

  // Navigation
  const goToday = () => { setCursor(new Date(today)); setMiniDate(new Date(today)); };
  const navPrev = () => {
    if (view === 'month') setCursor(d => { const r = new Date(d); r.setMonth(r.getMonth()-1); return r; });
    else if (view === 'week') setCursor(d => addDays(d, -7));
    else setCursor(d => addDays(d, -1));
  };
  const navNext = () => {
    if (view === 'month') setCursor(d => { const r = new Date(d); r.setMonth(r.getMonth()+1); return r; });
    else if (view === 'week') setCursor(d => addDays(d, 7));
    else setCursor(d => addDays(d, 1));
  };

  const navLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === 'week') {
      const ws = startOfWeek(cursor);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth())
        return `${MONTHS[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`;
      return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${ws.getFullYear()}`;
    }
    return `${DAYS[cursor.getDay()]}, ${MONTHS[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`;
  }, [view, cursor]);

  const plannerModeTitle = plannerMode === 'timetable'
    ? t('Timetable Builder')
    : plannerMode === 'calendar'
      ? t('Study Calendar')
      : t('Study Plans');

  const plannerModeSummary = plannerMode === 'timetable'
    ? t("Paste your catalog export, fine-tune constraints, and we'll build the best schedule for you.")
    : plannerMode === 'calendar'
      ? t('Map exams, deadlines, classes, and study blocks in one calm command center.')
      : t('Build an exam-ready revision path from your topics, daily minutes, and deadline.');

  return (
    <div className="cal-shell">
      <section className="planner-topbar">
        <div className="planner-topbar-copy">
          <h1>{plannerModeTitle}</h1>
          <p>{plannerModeSummary}</p>
        </div>
        <div className="planner-mode-switcher" role="tablist" aria-label="Planner modes">
          {([
            ['timetable', t('Timetable Builder')],
            ['calendar', t('Study Calendar')],
            ['plans', t('Study Plans')],
          ] as Array<[PlannerMode, string]>).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={plannerMode === mode}
              className={`mode-tab${plannerMode === mode ? ' active' : ''}`}
              onClick={() => setPlannerMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="planner-status-bar compact">
        <div className="planner-status-item">
          <span>{t('Current range')}</span>
          <strong>{navLabel}</strong>
        </div>
        {plannerMode === 'calendar' && (
          <>
            <div className="planner-status-item">
              <span>{t('Today agenda')}</span>
              <strong>{todayEvents[0]?.title ?? t('No events scheduled for today.')}</strong>
            </div>
            <div className="planner-status-item">
              <span>{t("Today's sessions")}</span>
              <strong>{todayEvents.length}</strong>
            </div>
          </>
        )}
        {plannerMode === 'plans' && (
          <>
            <div className="planner-status-item">
              <span>{t('Selected plan')}</span>
              <strong>{selectedPlan?.title ?? t('No plan selected yet')}</strong>
            </div>
            <div className="planner-status-item">
              <span>{t('Active plans')}</span>
              <strong>{activePlansCount}</strong>
            </div>
          </>
        )}
        {plannerMode === 'timetable' && (
          <>
            <div className="planner-status-item">
              <span>{t('Courses')}</span>
              <strong>{timetableCourses.length}</strong>
            </div>
            <div className="planner-status-item">
              <span>{t('Valid schedules')}</span>
              <strong>{timetableCandidates.length}</strong>
            </div>
          </>
        )}
      </section>

      {plannerMode === 'timetable' && (
        <section className="timetable-shell">
        <div className="timetable-header simplified">
          <div className="timetable-header-copy">
            <p>{t('Paste one registrar export chunk, hit add, and repeat for each course.')}</p>
          </div>
          <div className="timetable-stats compact">
            <article className="timetable-stat"><span>{t('Seat-open options')}</span><strong>{seatOpenOptionCount}</strong></article>
            <article className="timetable-stat"><span>{t('Pinned')}</span><strong>{pinnedTimetables.length}</strong></article>
          </div>
        </div>

        <div className="timetable-grid">
          <section className="timetable-panel">
            <div className="panel-heading">
              <h3>{t('Courses')}</h3>
              <div className="panel-actions">
                <button className="ghost-action" type="button" onClick={useSampleCatalogText}>{t('Use sample')}</button>
                <button className="ghost-action" type="button" onClick={addSampleCourseSet}>{t('Demo set')}</button>
                <button className="hero-btn primary compact" type="button" onClick={addTimetableCourse}>{t('Add course')}</button>
              </div>
            </div>
            <p className="panel-copy">{t('Paste one registrar export chunk, hit add, and repeat for each course.')}</p>
            <textarea
              className="timetable-textarea"
              value={courseInput}
              onChange={(event) => setCourseInput(event.target.value)}
              placeholder={t('Paste the raw course text here...')}
              rows={8}
            />
            {courseParseError && (
              <div className="builder-note error">
                <strong>{courseParseError}</strong>
                <span>{t('Example: Section A · Instructor: Dr. Noor · Seats open: 8 · MW 9:00 AM - 10:15 AM')}</span>
              </div>
            )}
            {timetableCourses.length === 0 ? (
              <p className="builder-note">{t('Paste your catalog text to see structured options.')}</p>
            ) : (
              <div className="course-stack">
                {timetableCourses.map((course) => (
                  <article key={course.id} className="course-card">
                    <div>
                      <strong>{course.title}</strong>
                      <p>{course.sections.length} {t('Valid schedules').toLowerCase()}</p>
                    </div>
                    <button className="ghost-action" type="button" onClick={() => removeTimetableCourse(course.id)}>{t('Remove')}</button>
                  </article>
                ))}
              </div>
            )}
            {timetableActionMessage && <p className="builder-note action">{timetableActionMessage}</p>}
          </section>

          <section className="timetable-panel">
            <div className="panel-heading">
              <h3>{t('Preferences')}</h3>
              <label className="seat-toggle">
                <input type="checkbox" checked={timetablePrefs.seatOpenOnly} onChange={(event) => setTimetablePrefs((prev) => ({ ...prev, seatOpenOnly: event.target.checked }))} />
                <span>{t('Seat-open only')}</span>
              </label>
            </div>
            <div className="pref-grid">
              <label>
                <span>{t('Earliest start')}</span>
                <input type="time" value={timetablePrefs.earliestStart} onChange={(event) => setTimetablePrefs((prev) => ({ ...prev, earliestStart: event.target.value }))} />
              </label>
              <label>
                <span>{t('Latest finish')}</span>
                <input type="time" value={timetablePrefs.latestFinish} onChange={(event) => setTimetablePrefs((prev) => ({ ...prev, latestFinish: event.target.value }))} />
              </label>
            </div>
            <div className="focus-wrap">
              <span>{t('Preference focus')}</span>
              <div className="focus-pills">
                {TIMETABLE_FOCUS_OPTIONS.map((option) => (
                  <button key={option} type="button" className={`focus-pill${timetablePrefs.focus === option ? ' active' : ''}`} onClick={() => setTimetablePrefs((prev) => ({ ...prev, focus: option }))}>
                    {option === 'seat-open' ? t('Seat-open only') : t(option.charAt(0).toUpperCase()+option.slice(1))}
                  </button>
                ))}
              </div>
            </div>
            <div className="focus-wrap">
              <span>{t('Avoid days')}</span>
              <div className="day-pills">
                {TIMETABLE_DAY_LABELS.map((day, index) => {
                  const active = timetablePrefs.avoidDays.includes(index);
                  return (
                    <button key={day} type="button" className={`focus-pill${active ? ' active' : ''}`} onClick={() => setTimetablePrefs((prev) => ({
                      ...prev,
                      avoidDays: active ? prev.avoidDays.filter((entry) => entry !== index) : [...prev.avoidDays, index].sort((a, b) => a - b),
                    }))}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="timetable-panel timetable-results">
            <div className="panel-heading">
              <h3>{t('Schedule builder')}</h3>
              <span className="builder-count">{t('{count} valid combinations after applying constraints.', { count: timetableCandidates.length })}</span>
            </div>
            {timetableCandidates.length === 0 ? (
              <div className="builder-empty">
                <p>{t('No schedules match the current constraints. Try relaxing earliest/latest times or allowed days.')}</p>
              </div>
            ) : (
              <div className="schedule-stack">
                {timetableCandidates.slice(0, 6).map((candidate, index) => (
                  <article key={candidate.id} className="schedule-card">
                    <div className="schedule-top">
                      <div>
                        <span className="schedule-rank">{t('Option {count}', { count: index + 1 })}</span>
                        <h4>{candidate.busyDays} day week · {minutesToTimeLabel(candidate.firstStart)} to {minutesToTimeLabel(candidate.lastEnd)}</h4>
                      </div>
                      <div className="schedule-actions">
                        <button className="ghost-action" type="button" onClick={() => void copyTimetableCandidate(candidate)}>{t('Copy')}</button>
                        <button className={`ghost-action${pinnedSchedules.includes(candidate.id) ? ' active' : ''}`} type="button" onClick={() => togglePinnedSchedule(candidate.id)}>{pinnedSchedules.includes(candidate.id) ? t('Pinned') : t('Pin')}</button>
                      </div>
                    </div>
                    <div className="schedule-summary">
                      {candidate.sections.map((item) => (
                        <div key={item.section.id} className="summary-row">
                          <div>
                            <strong>{item.courseTitle}</strong>
                            <p>{item.section.label}{item.section.instructor ? ` · ${item.section.instructor}` : ''}</p>
                          </div>
                          <div className="summary-meta">
                            <span>{item.section.meetings.map((meeting) => `${meeting.days.map((day) => TIMETABLE_DAY_LABELS[day]).join('/') } ${meeting.start}–${meeting.end}`).join(' • ')}</span>
                            {typeof item.section.seatsOpen === 'number' && <em>{t('{count} open', { count: item.section.seatsOpen })}</em>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="timetable-help compact">
          <p>{t('Paste course text from your registrar portal above. The planner generates all valid combinations from the sections it can read.')}</p>
          <p>{t('Use focus and day filters to narrow down a calmer week, an earlier start, or seat-open sections only.')}</p>
        </div>
        </section>
      )}

      {plannerMode === 'calendar' && (
        <>
      {/* ── Left Sidebar ────────────────────────────────────────────── */}
      <aside className="cal-sidebar">
        <button className="new-event-btn" onClick={() => openNewEvent()}>
          <span>＋</span> {t('New Event')}
        </button>

        {/* Mini calendar */}
        <MiniCalendar
          date={miniDate}
          today={today}
          events={events}
          onDateClick={(d) => { setCursor(new Date(d)); if (view === 'month') setView('week'); }}
          onNavMonth={(delta) => setMiniDate(d => { const r = new Date(d); r.setMonth(r.getMonth()+delta); return r; })}
        />

        {/* Event type legend */}
        <div className="sidebar-section">
          <p className="sidebar-label">{t('Event Types')}</p>
          <div className="legend">
            {(Object.entries(EVENT_COLORS) as [EventType, string][]).map(([type, color]) => (
              <div key={type} className="legend-item">
                <span className="legend-dot" style={{ background: color }} />
                <span>{EVENT_ICONS[type]} {type.charAt(0).toUpperCase()+type.slice(1)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exam countdowns */}
        {upcomingExams.length > 0 && (
          <div className="sidebar-section">
            <p className="sidebar-label">{t('Exam Countdowns')}</p>
            {upcomingExams.map(exam => {
              const d = daysUntil(exam.date);
              return (
                <div key={exam.id} className="countdown-item" onClick={() => { setCursor(parseDate(exam.date)); setView('day'); }}>
                  <div className="countdown-title">{exam.title.replace('📝 Exam: ','')}</div>
                  <div className="countdown-days" style={{ color: d <= 3 ? '#e05252' : d <= 7 ? '#e07a52' : 'var(--primary)' }}>
                    {d === 0 ? `${t('Today')}!` : d < 0 ? t('Passed') : t('{count}d', { count: d })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Today's agenda */}
        <div className="sidebar-section">
          <p className="sidebar-label">{t('Today')}</p>
          {todayEvents.length === 0
            ? <p className="sidebar-empty">{t('No events today')}</p>
            : todayEvents.map(evt => (
              <div
                key={evt.id}
                className="today-item"
                style={{ borderLeft: `3px solid ${EVENT_COLORS[evt.type]}` }}
                onClick={() => setSelectedEvent(evt)}
              >
                <span className="today-time">{evt.startTime}</span>
                <span className="today-title" style={{ textDecoration: evt.completed ? 'line-through' : 'none' }}>{evt.title}</span>
              </div>
            ))
          }
        </div>

      </aside>

      {/* ── Main Calendar ────────────────────────────────────────────── */}
      <main className="cal-main">
        {/* Header */}
        <header className="cal-header">
          <div className="cal-nav">
            <button className="nav-btn today-btn" onClick={goToday}>{t('Today')}</button>
            <button className="nav-btn icon-btn" onClick={navPrev}>‹</button>
            <button className="nav-btn icon-btn" onClick={navNext}>›</button>
            <h2 className="cal-title">{navLabel}</h2>
          </div>
          <div className="calendar-header-actions">
            <button className="hero-btn primary compact" type="button" onClick={() => openNewEvent()}>{t('Add calendar event')}</button>
            <div className="view-switcher">
            {(['month','week','day','agenda'] as CalendarView[]).map(v => (
              <button
                key={v}
                className={`view-btn${view === v ? ' active' : ''}`}
                aria-label={t('View mode {mode}', { mode: t(v.charAt(0).toUpperCase()+v.slice(1)) })}
                onClick={() => setView(v)}
              >
                {t(v.charAt(0).toUpperCase()+v.slice(1))}
              </button>
            ))}
            </div>
          </div>
        </header>

        {plans.length === 0 && events.length === 0 && (
          <div style={{
            margin: '0 20px 16px',
            padding: '18px 20px',
            borderRadius: 16,
            border: '1px dashed var(--border-subtle)',
            background: 'var(--bg-surface)',
            display: 'grid',
            gap: 10,
          }}>
            <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>
              {t('Planner setup')}
            </span>
            <strong style={{ fontSize: '1rem', color: 'var(--text)' }}>
              {t('Start with one exam or deadline and Kivora will build the study blocks around it.')}
            </strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => openNewEvent()}>
                {t('Add calendar event')}
              </button>
              <a href="/workspace" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                {t('Open Workspace')}
              </a>
            </div>
          </div>
        )}

        {/* Views */}
        {view === 'month' && (
          <MonthView
            cursor={cursor}
            today={today}
            events={events}
            onDayClick={(d) => { setCursor(parseDate(d)); setView('day'); }}
            onEventClick={setSelectedEvent}
            onCellDblClick={(d) => openNewEvent(d)}
            onEventDrop={onEventDrop}
          />
        )}
        {view === 'week' && (
          <WeekView
            cursor={cursor}
            today={today}
            events={events}
            scrollRef={weekScrollRef}
            onEventClick={setSelectedEvent}
            onSlotClick={(d, t) => openNewEvent(d, t)}
            dragOverSlot={dragOverSlot}
            onDragOverSlot={setDragOverSlot}
            onDragLeaveSlot={() => setDragOverSlot(null)}
            onEventDrop={onEventDrop}
          />
        )}
        {view === 'day' && (
          <DayView
            date={cursor}
            today={today}
            events={events}
            scrollRef={weekScrollRef}
            onEventClick={setSelectedEvent}
            onSlotClick={(t) => openNewEvent(toDateStr(cursor), t)}
            dragOverSlot={dragOverSlot}
            onDragOverSlot={setDragOverSlot}
            onDragLeaveSlot={() => setDragOverSlot(null)}
            onEventDrop={onEventDrop}
          />
        )}
        {view === 'agenda' && (
          <AgendaView
            cursor={cursor}
            events={events}
            onEventClick={setSelectedEvent}
          />
        )}
      </main>
        </>
      )}

      {plannerMode === 'plans' && (
        <section className="plans-mode-shell">
          <div className="mode-section-head">
            <div>
              <span className="planner-hero-eyebrow">{t('Study Plans')}</span>
              <h2>{t('Create study plan')}</h2>
              <p>{t('Build an exam-ready revision path from your topics, daily minutes, and deadline.')}</p>
            </div>
            <button className="hero-btn primary" type="button" onClick={() => setShowPlanForm(true)}>{t('Create study plan')}</button>
          </div>
          <div className="plans-mode-grid">
            <div className="plans-mode-list">
              <PlanList
                plans={plans}
                loading={plansLoading}
                selectedPlanId={selectedPlanId}
                onSelectPlan={(plan: StudyPlan) => {
                  setSelectedPlanId(plan.id);
                  const examD = new Date(plan.examDate);
                  setCursor(examD);
                  setMiniDate(examD);
                }}
                onNewPlan={() => setShowPlanForm(true)}
                onDeletePlan={(planId: string) => { void deletePlan(planId); }}
              />
            </div>
            <article className="plans-mode-detail">
              {selectedPlan ? (
                <>
                  <span className="schedule-rank">{t('Selected plan')}</span>
                  <h3>{selectedPlan.title}</h3>
                  <p>{t('Exam date')}: {new Date(selectedPlan.examDate).toLocaleDateString()}</p>
                  <p>{t(selectedPlan.topics.length === 1 ? '{count} topic' : '{count} topics', { count: selectedPlan.topics.length })} · {t('{count} minutes/day', { count: selectedPlan.dailyMinutes })}</p>
                  <button className="hero-btn" type="button" onClick={() => { setPlannerMode('calendar'); setCursor(new Date(selectedPlan.examDate)); }}>{t('View on calendar')}</button>
                </>
              ) : (
                <>
                  <span className="schedule-rank">{t('Planner setup')}</span>
                  <h3>{t('No study plan selected yet')}</h3>
                  <p>{t('Create your first plan or select one from the list to see its exam date, workload, and generated revision blocks.')}</p>
                </>
              )}
            </article>
          </div>
        </section>
      )}

      {/* ── Event Detail Panel ───────────────────────────────────────── */}
      {selectedEvent && (
        <div className="detail-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="detail-panel" onClick={e => e.stopPropagation()}>
            <div className="detail-header" style={{ background: EVENT_COLORS[selectedEvent.type] }}>
              <span className="detail-icon">{EVENT_ICONS[selectedEvent.type]}</span>
              <div>
                <div className="detail-type">{t(`${selectedEvent.type.charAt(0).toUpperCase()+selectedEvent.type.slice(1)} event`)}</div>
                <h3 className="detail-title">{selectedEvent.title}</h3>
              </div>
              <button className="detail-close" onClick={() => setSelectedEvent(null)}>✕</button>
            </div>
            <div className="detail-body">
              <div className="detail-row">
                <span className="detail-lbl">📅</span>
                <span>{parseDate(selectedEvent.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</span>
              </div>
              <div className="detail-row">
                <span className="detail-lbl">⏱️</span>
                <span>{selectedEvent.startTime} – {selectedEvent.endTime}</span>
              </div>
              {selectedEvent.description && (
                <div className="detail-row">
                  <span className="detail-lbl">📋</span>
                  <span>{selectedEvent.description}</span>
                </div>
              )}
              <div className="detail-actions">
                <button
                  className="det-btn complete"
                  onClick={() => toggleComplete(selectedEvent.id)}
                >
                  {selectedEvent.completed ? `↩ ${t('Unmark')}` : `✓ ${t('Done')}`}
                </button>
                {!selectedEvent.id.startsWith('plan_') && !selectedEvent.id.startsWith('exam_') && (
                  <>
                    <button className="det-btn edit" onClick={() => openEditEvent(selectedEvent)}>✏️ {t('Edit')}</button>
                    <button className="det-btn delete" onClick={() => deleteEvent(selectedEvent.id)}>🗑 {t('Delete')}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Event Create/Edit Modal ──────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEvent ? t('Edit Event') : t('New Event')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="field-label">{t('Title')}</label>
              <input
                className="field-input"
                placeholder={t('Event title…')}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && saveEvent()}
              />

              <label className="field-label">{t('Type')}</label>
              <div className="type-picker">
                {(Object.keys(EVENT_COLORS) as EventType[]).map((eventType) => (
                  <button
                    key={eventType}
                    className={`type-opt${form.type === eventType ? ' active' : ''}`}
                    style={form.type === eventType ? { background: EVENT_COLORS[eventType], color: '#fff', borderColor: EVENT_COLORS[eventType] } : {}}
                    onClick={() => setForm(f => ({ ...f, type: eventType }))}
                  >
                    {EVENT_ICONS[eventType]} {t(`${eventType.charAt(0).toUpperCase()+eventType.slice(1)} event`)}
                  </button>
                ))}
              </div>

              <label className="field-label">{t('Date')}</label>
              <input
                className="field-input"
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              />

              <div className="time-row">
                <div>
                  <label className="field-label">{t('Start')}</label>
                  <input className="field-input" type="time" value={form.startTime}
                    onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">{t('End')}</label>
                  <input className="field-input" type="time" value={form.endTime}
                    onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              <label className="field-label">{t('Notes (optional)')}</label>
              <textarea
                className="field-input field-textarea"
                placeholder={t('Add notes…')}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setShowModal(false)}>{t('Cancel')}</button>
              <button className="modal-btn save" onClick={saveEvent} disabled={!form.title.trim()}>
                {editingEvent ? t('Save Changes') : t('Create Event')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Study Plan Form Modal ────────────────────────────────────── */}
      {showPlanForm && (
        <div className="modal-overlay" onClick={() => setShowPlanForm(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <PlanForm
              onGenerate={async ({ title, examDate, dailyMinutes, topics, folderId }) => {
                const schedule = generateStudySchedule(new Date(examDate), topics, dailyMinutes);
                const newPlan = await createPlan({ title, examDate, dailyMinutes, topics, schedule, folderId });
                if (newPlan) {
                  setSelectedPlanId(newPlan.id);
                  setShowPlanForm(false);
                }
              }}
              onCancel={() => setShowPlanForm(false)}
            />
          </div>
        </div>
      )}

      <style jsx>{`
        /* ── Shell ─────────────────────────────────────────────────── */
        .cal-shell {
          display: grid;
          grid-template-columns: 280px minmax(0,1fr);
          grid-template-rows: auto auto 1fr;
          height: calc(100dvh - 40px);
          overflow: hidden;
          background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--primary) 10%, transparent), transparent 24%),
            linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 55%, white 45%), var(--bg-surface));
        }
        .planner-topbar {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          padding: 18px 24px 12px;
          border-bottom: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border-subtle));
          background: color-mix(in srgb, var(--bg-surface) 92%, white 8%);
        }
        .planner-topbar-copy {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .planner-topbar-copy h1 {
          margin: 0;
          font-size: clamp(1.1rem, 2vw, 1.45rem);
          letter-spacing: -0.03em;
          color: var(--text-primary);
        }
        .planner-topbar-copy p {
          margin: 0;
          max-width: 58ch;
          color: var(--text-secondary);
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .planner-hero-eyebrow {
          display: inline-block;
          margin-bottom: 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--primary);
        }
        .hero-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border-subtle));
          background: color-mix(in srgb, var(--bg-surface) 88%, white 12%);
          color: var(--text-primary);
          font-weight: 650;
          cursor: pointer;
          transition: 150ms ease;
        }
        .hero-btn:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
        .hero-btn.primary { background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, #1d4ed8)); color: white; border-color: transparent; }

        .planner-mode-switcher {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--bg-surface) 88%, white 12%);
          border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border-subtle));
          box-shadow: var(--shadow-sm);
          align-self: start;
        }
        .mode-tab {
          border: 0;
          border-radius: 999px;
          padding: 9px 14px;
          background: transparent;
          color: var(--text-secondary);
          font-weight: 700;
          cursor: pointer;
        }
        .mode-tab.active {
          background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 68%, #1d4ed8));
          color: white;
          box-shadow: var(--shadow-sm);
        }
        .mode-tab:focus-visible, .hero-btn:focus-visible, .ghost-action:focus-visible, .focus-pill:focus-visible {
          outline: 3px solid color-mix(in srgb, var(--primary) 34%, transparent);
          outline-offset: 2px;
        }
        .panel-actions, .calendar-header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .hero-btn.compact { min-height: 36px; padding: 0 13px; }

        .planner-status-bar {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding: 10px 24px 14px;
          background: color-mix(in srgb, var(--bg-surface) 90%, white 10%);
          border-bottom: 1px solid var(--border-subtle);
        }
        .planner-status-bar.compact {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .planner-status-item {
          display: grid;
          gap: 4px;
          min-width: 0;
          padding: 9px 12px;
          border-radius: 12px;
          background: color-mix(in srgb, var(--bg-elevated) 78%, white 22%);
          border: 1px solid var(--border-subtle);
        }
        .planner-status-item span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; }
        .planner-status-item strong { font-size: 0.92rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* ── Sidebar ───────────────────────────────────────────────── */
        .cal-sidebar {
          grid-row: 3;
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 16px 12px;
          border-right: 1px solid var(--border-subtle);
          overflow-y: auto;
          background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, white 8%), var(--bg-elevated));
        }
        .new-event-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          padding: 10px 16px;
          border-radius: 24px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          margin-bottom: 16px;
          box-shadow: var(--shadow-sm);
          transition: all 0.15s;
          box-shadow: var(--shadow-sm);
        }
        .new-event-btn:hover {
          border-color: var(--primary);
          color: var(--primary);
          box-shadow: var(--shadow-md);
        }
        .sidebar-section {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--border-subtle);
        }
        .sidebar-section-plans {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .sidebar-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin: 0 0 8px;
        }
        .legend { display: flex; flex-direction: column; gap: 5px; }
        .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-secondary); }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

        .countdown-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 8px; border-radius: 8px; cursor: pointer;
          margin-bottom: 4px; transition: background 0.12s;
        }
        .countdown-item:hover { background: var(--bg-surface); }
        .countdown-title { font-size: 12px; color: var(--text-secondary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .countdown-days { font-size: 14px; font-weight: 700; margin-left: 8px; flex-shrink: 0; }

        .today-item {
          display: flex; align-items: baseline; gap: 8px; padding: 5px 6px;
          border-radius: 6px; cursor: pointer; transition: background 0.12s; margin-bottom: 2px;
        }
        .today-item:hover { background: var(--bg-surface); }
        .today-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; min-width: 38px; }
        .today-title { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sidebar-empty { font-size: 12px; color: var(--text-muted); }

        /* ── Main ──────────────────────────────────────────────────── */
        .cal-main {
          grid-row: 3;
          display: flex; flex-direction: column; overflow: hidden;
        }
        .cal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 22px; border-bottom: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle));
          background: color-mix(in srgb, var(--bg-elevated) 85%, white 15%); flex-shrink: 0;
        }
        .cal-nav { display: flex; align-items: center; gap: 8px; }
        .cal-title { font-size: 18px; font-weight: 700; margin: 0; margin-left: 8px; letter-spacing: -0.02em; }
        .nav-btn {
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); cursor: pointer;
          color: var(--text-secondary); transition: all 0.12s;
          font-size: 14px; font-weight: 500; padding: 6px 12px;
        }
        .nav-btn:hover { border-color: var(--primary); color: var(--primary); }
        .icon-btn { padding: 4px 10px; font-size: 18px; }
        .today-btn { background: var(--bg-elevated); }
        .view-switcher { display: flex; gap: 2px; background: color-mix(in srgb, var(--bg-surface) 82%, white 18%); border-radius: 999px; padding: 4px; border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle)); box-shadow: var(--shadow-sm); }
        .view-btn {
          padding: 6px 14px; border-radius: 999px; border: none;
          background: transparent; color: var(--text-secondary);
          font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .view-btn.active { background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 65%, #1d4ed8)); color: white; }
        .view-btn:hover:not(.active) { color: var(--text-primary); }

        /* ── Detail panel ──────────────────────────────────────────── */
        .detail-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.35); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .detail-panel {
          background: var(--bg-elevated); border-radius: 20px;
          width: 360px; max-width: 90vw; overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3);
        }
        .detail-header {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 20px 20px 16px; color: white; position: relative;
        }
        .detail-icon { font-size: 24px; flex-shrink: 0; }
        .detail-type { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.85; }
        .detail-title { font-size: 18px; font-weight: 600; margin: 2px 0 0; line-height: 1.3; }
        .detail-close {
          position: absolute; top: 14px; right: 14px;
          background: rgba(255,255,255,0.2); border: none; color: white;
          width: 28px; height: 28px; border-radius: 50%; cursor: pointer;
          font-size: 13px; display: flex; align-items: center; justify-content: center;
        }
        .detail-body { padding: 16px 20px 20px; }
        .detail-row { display: flex; gap: 10px; margin-bottom: 10px; font-size: 14px; color: var(--text-secondary); align-items: flex-start; }
        .detail-lbl { flex-shrink: 0; }
        .detail-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
        .det-btn {
          padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-surface); cursor: pointer; font-size: 13px; font-weight: 500;
          color: var(--text-secondary); transition: all 0.12s;
        }
        .det-btn:hover { border-color: var(--primary); color: var(--primary); }
        .det-btn.delete:hover { border-color: #e05252; color: #e05252; }
        .det-btn.complete { background: var(--primary); color: white; border-color: var(--primary); }

        /* ── Modal ─────────────────────────────────────────────────── */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 300;
          background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
        }
        .modal {
          background: var(--bg-elevated); border-radius: 20px;
          width: 460px; max-width: 94vw; max-height: 90vh; overflow-y: auto;
          box-shadow: 0 32px 80px rgba(0,0,0,0.35);
          animation: modalIn 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .modal-wide {
          width: 620px; padding: 24px;
        }
        @keyframes modalIn {
          from { transform: scale(0.88) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 0;
        }
        .modal-header h3 { margin: 0; font-size: 18px; font-weight: 600; }
        .modal-close {
          background: var(--bg-surface); border: 1px solid var(--border-subtle);
          border-radius: 50%; width: 30px; height: 30px; cursor: pointer;
          font-size: 13px; display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
        }
        .modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 4px; }
        .field-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 10px; margin-bottom: 4px; display: block; }
        .field-input {
          width: 100%; padding: 9px 12px; border-radius: 10px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-primary);
          font-size: 14px; box-sizing: border-box; transition: border-color 0.15s;
        }
        .field-input:focus { outline: none; border-color: var(--primary); }
        .field-textarea { resize: vertical; min-height: 80px; font-family: inherit; }
        .type-picker { display: flex; flex-wrap: wrap; gap: 6px; }
        .type-opt {
          padding: 5px 12px; border-radius: 20px; border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 12px; cursor: pointer; transition: all 0.12s; font-weight: 500;
        }
        .type-opt:hover:not(.active) { border-color: var(--primary); color: var(--primary); }
        .time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .modal-footer {
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          padding: 12px 20px 20px; border-top: 1px solid var(--border-subtle);
        }
        .modal-btn {
          padding: 9px 20px; border-radius: 10px; border: 1.5px solid var(--border-subtle);
          font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.12s;
        }
        .modal-btn.cancel { background: var(--bg-surface); color: var(--text-secondary); }
        .modal-btn.cancel:hover { border-color: var(--primary); color: var(--primary); }
        .modal-btn.save { background: var(--primary); color: white; border-color: var(--primary); }
        .modal-btn.save:hover { opacity: 0.88; }
        .modal-btn.save:disabled { opacity: 0.4; cursor: not-allowed; }


        .plans-mode-shell {
          grid-column: 1 / -1;
          min-height: 0;
          overflow: auto;
          padding: 22px 24px 28px;
          background: color-mix(in srgb, var(--bg-surface) 88%, white 12%);
        }
        .mode-section-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
          padding: 18px;
          border-radius: 22px;
          border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle));
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, white), color-mix(in srgb, var(--bg-elevated) 88%, white 12%));
        }
        .mode-section-head h2, .mode-section-head p, .plans-mode-detail h3, .plans-mode-detail p { margin: 0; }
        .mode-section-head p, .plans-mode-detail p { color: var(--text-secondary); }
        .plans-mode-grid {
          display: grid;
          grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
          gap: 18px;
        }
        .plans-mode-list, .plans-mode-detail {
          border-radius: 22px;
          border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle));
          background: var(--bg-elevated);
          padding: 18px;
          box-shadow: var(--shadow-sm);
        }
        .plans-mode-detail {
          display: grid;
          align-content: start;
          gap: 12px;
          min-height: 260px;
        }

        .timetable-shell {
          grid-column: 1 / -1;
          min-height: 0;
          overflow: auto;
          padding: 20px 24px 24px;
          border-bottom: 1px solid var(--border-subtle);
          background: linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 88%, white 12%), color-mix(in srgb, var(--bg-elevated) 92%, white 8%));
        }
        .timetable-header {
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(320px, 540px);
          gap: 20px;
          align-items: end;
        }
        .timetable-header h2 {
          margin: 0;
          font-size: clamp(1.3rem, 2vw, 1.9rem);
          letter-spacing: -0.03em;
        }
        .timetable-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .timetable-stat {
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid color-mix(in srgb, var(--primary) 12%, var(--border-subtle));
          background: color-mix(in srgb, var(--bg-surface) 90%, white 10%);
          display: grid;
          gap: 4px;
        }
        .timetable-stat span, .schedule-rank {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .timetable-stat strong { font-size: 1.2rem; }
        .timetable-grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr);
          gap: 16px;
          align-items: start;
        }
        .timetable-panel {
          display: grid;
          gap: 14px;
          padding: 18px;
          border-radius: 22px;
          border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle));
          background: color-mix(in srgb, var(--bg-surface) 94%, white 6%);
          box-shadow: var(--shadow-sm);
        }
        .panel-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .panel-heading h3, .timetable-help h3, .schedule-card h4 { margin: 0; }
        .panel-copy, .builder-note, .builder-empty p, .timetable-help p, .help-grid p, .course-card p, .summary-row p {
          margin: 0;
          color: var(--text-secondary);
        }
        .builder-note.error { color: #b42318; display: grid; gap: 4px; }
        .builder-note.error span { color: var(--text-secondary); }
        .builder-note.action {
          border-radius: 14px;
          padding: 10px 12px;
          background: color-mix(in srgb, var(--primary) 7%, white);
          border: 1px solid color-mix(in srgb, var(--primary) 14%, var(--border-subtle));
        }
        .timetable-textarea {
          width: 100%;
          min-height: 180px;
          resize: vertical;
          border-radius: 18px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-elevated) 82%, white 18%);
          padding: 14px 16px;
          color: var(--text-primary);
          font: inherit;
        }
        .course-stack, .schedule-stack { display: grid; gap: 12px; }
        .course-card, .schedule-card {
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          background: color-mix(in srgb, var(--bg-elevated) 88%, white 12%);
          padding: 14px;
        }
        .course-card { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
        .ghost-action {
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-surface) 86%, white 14%);
          color: var(--text-secondary);
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .ghost-action.active { background: color-mix(in srgb, var(--primary) 14%, white); color: var(--primary); border-color: color-mix(in srgb, var(--primary) 25%, var(--border-subtle)); }
        .pref-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .pref-grid label, .focus-wrap { display: grid; gap: 8px; }
        .pref-grid span, .focus-wrap > span { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .pref-grid input { border-radius: 12px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-primary); padding: 10px 12px; }
        .focus-pills, .day-pills { display: flex; gap: 8px; flex-wrap: wrap; }
        .focus-pill {
          border: 1px solid var(--border-subtle);
          border-radius: 999px;
          padding: 8px 12px;
          background: color-mix(in srgb, var(--bg-surface) 86%, white 14%);
          color: var(--text-secondary);
          font-weight: 600;
          cursor: pointer;
        }
        .focus-pill.active { background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 68%, #1d4ed8)); color: white; border-color: transparent; }
        .seat-toggle { display: inline-flex; align-items: center; gap: 10px; color: var(--text-secondary); font-weight: 600; }
        .builder-count { color: var(--text-muted); font-size: 13px; }
        .builder-empty {
          border-radius: 18px;
          border: 1px dashed color-mix(in srgb, var(--primary) 24%, var(--border-subtle));
          padding: 18px;
          background: color-mix(in srgb, var(--bg-elevated) 78%, white 22%);
        }
        .schedule-top, .summary-row { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
        .schedule-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .schedule-top { margin-bottom: 12px; }
        .schedule-summary { display: grid; gap: 10px; }
        .summary-row { padding-top: 10px; border-top: 1px solid color-mix(in srgb, var(--primary) 8%, var(--border-subtle)); }
        .summary-row:first-child { padding-top: 0; border-top: none; }
        .summary-meta { display: grid; gap: 4px; text-align: right; max-width: 48%; }
        .summary-meta span { color: var(--text-secondary); font-size: 12px; }
        .summary-meta em { color: var(--primary); font-style: normal; font-size: 12px; font-weight: 700; }
        .timetable-help {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
          gap: 20px;
          margin-top: 18px;
          padding: 18px;
          border-radius: 22px;
          border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle));
          background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 6%, white), color-mix(in srgb, var(--bg-surface) 82%, white 18%));
        }
        .help-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .help-grid article { padding: 14px; border-radius: 16px; background: color-mix(in srgb, var(--bg-surface) 88%, white 12%); border: 1px solid color-mix(in srgb, var(--primary) 10%, var(--border-subtle)); }
        @media (max-width: 1024px) {
          .planner-topbar,
          .planner-status-bar,
          .timetable-header,
          .timetable-help {
            grid-template-columns: 1fr 1fr;
          }
          .planner-mode-switcher {
            justify-content: flex-start;
          }
          .timetable-stats,
          .help-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .timetable-grid, .plans-mode-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 768px) {
          .cal-shell { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; }
          .planner-topbar,
          .planner-status-bar,
          .timetable-header,
          .timetable-help,
          .timetable-stats,
          .help-grid,
          .pref-grid {
            grid-template-columns: 1fr;
          }
          .planner-topbar {
            padding: 16px 16px 10px;
          }
          .planner-mode-switcher, .mode-section-head, .calendar-header-actions {
            justify-content: flex-start;
          }
          .planner-status-bar, .timetable-shell, .plans-mode-shell {
            padding: 10px 16px 14px;
          }
          .summary-row, .schedule-top, .course-card, .schedule-actions {
            flex-direction: column;
          }
          .summary-meta {
            max-width: none;
            text-align: left;
          }
          .cal-sidebar { display: none; }
          .cal-main { grid-row: 3; }
        }
      `}</style>
    </div>
  );
}

// ─── Mini Calendar ────────────────────────────────────────────────────────────

function MiniCalendar({
  date, today, events, onDateClick, onNavMonth,
}: {
  date: Date; today: Date; events: CalendarEvent[];
  onDateClick: (d: string) => void; onNavMonth: (delta: number) => void;
}) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventDateSet = useMemo(() => new Set(events.map(e => e.date)), [events]);

  return (
    <div className="mini-cal">
      <div className="mini-nav">
        <button className="mini-nav-btn" onClick={() => onNavMonth(-1)}>‹</button>
        <span className="mini-nav-title">{MONTHS[month].slice(0,3)} {year}</span>
        <button className="mini-nav-btn" onClick={() => onNavMonth(1)}>›</button>
      </div>
      <div className="mini-grid">
        {DAYS.map(d => <div key={d} className="mini-hdr">{d[0]}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = `${year}-${pad(month+1)}-${pad(day)}`;
          const isToday = sameDay(new Date(year,month,day), today);
          const hasEvt = eventDateSet.has(ds);
          return (
            <button
              key={i}
              className={`mini-day${isToday ? ' today' : ''}`}
              onClick={() => onDateClick(ds)}
            >
              {day}
              {hasEvt && <span className="mini-dot" />}
            </button>
          );
        })}
      </div>
      <style jsx>{`
        .mini-cal { margin-bottom: 4px; }
        .mini-nav { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .mini-nav-btn { background:none; border:none; cursor:pointer; color:var(--text-secondary); font-size:16px; padding:2px 6px; border-radius:6px; }
        .mini-nav-btn:hover { color:var(--primary); }
        .mini-nav-title { font-size:13px; font-weight:600; color:var(--text-primary); }
        .mini-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:1px; }
        .mini-hdr { text-align:center; font-size:10px; font-weight:700; color:var(--text-muted); padding:3px 0; text-transform:uppercase; }
        .mini-day {
          position:relative; display:flex; align-items:center; justify-content:center;
          aspect-ratio:1; font-size:11px; border:none; background:none; cursor:pointer;
          border-radius:50%; color:var(--text-secondary); transition:all 0.1s;
        }
        .mini-day:hover { background:var(--bg-surface); color:var(--text-primary); }
        .mini-day.today { background:var(--primary); color:white; font-weight:700; }
        .mini-dot { position:absolute; bottom:1px; left:50%; transform:translateX(-50%); width:4px; height:4px; border-radius:50%; background:var(--primary); }
        .mini-day.today .mini-dot { background:white; }
      `}</style>
    </div>
  );
}

// ─── Month View ────────────────────────────────────────────────────────────────

function MonthView({ cursor, today, events, onDayClick, onEventClick, onCellDblClick, onEventDrop }: {
  cursor: Date; today: Date; events: CalendarEvent[];
  onDayClick: (d: string) => void;
  onEventClick: (e: CalendarEvent) => void;
  onCellDblClick: (d: string) => void;
  onEventDrop: (eventId: string, newDate: string, newHour: number) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    }
    return map;
  }, [events]);

  return (
    <div className="month-grid">
      {DAYS.map(d => <div key={d} className="month-hdr">{d}</div>)}
      {cells.map((day, i) => {
        if (!day) return <div key={i} className="month-cell empty" />;
        const ds = `${year}-${pad(month+1)}-${pad(day)}`;
        const isToday = sameDay(new Date(year,month,day), today);
        const isDragOver = dragOverDate === ds;
        const dayEvts = eventsByDate[ds] ?? [];
        return (
          <div
            key={i}
            className={`month-cell${isToday ? ' today' : ''}${isDragOver ? ' drag-over' : ''}`}
            onClick={() => onDayClick(ds)}
            onDoubleClick={() => onCellDblClick(ds)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverDate(ds); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverDate(null);
              const eventId = e.dataTransfer.getData('eventId');
              const origHour = parseInt(e.dataTransfer.getData('origHour') || '9', 10);
              if (eventId) onEventDrop(eventId, ds, origHour);
            }}
          >
            <span className="month-day-num">{day}</span>
            <div className="month-evts">
              {dayEvts.slice(0,3).map(evt => (
                <div
                  key={evt.id}
                  className="month-evt"
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('eventId', evt.id);
                    const [sh] = evt.startTime.split(':').map(Number);
                    e.dataTransfer.setData('origHour', String(sh));
                    e.dataTransfer.effectAllowed = 'move';
                    e.stopPropagation();
                  }}
                  style={{
                    background: EVENT_COLORS[evt.type]+'22',
                    borderLeft: `3px solid ${EVENT_COLORS[evt.type]}`,
                    textDecoration: evt.completed ? 'line-through' : 'none',
                    cursor: 'grab',
                  }}
                  onClick={e => { e.stopPropagation(); onEventClick(evt); }}
                >
                  {evt.title}
                </div>
              ))}
              {dayEvts.length > 3 && (
                <div className="month-more">+{dayEvts.length-3} more</div>
              )}
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .month-grid {
          flex: 1; display:grid; grid-template-columns:repeat(7,1fr);
          grid-auto-rows: minmax(100px,1fr); overflow:auto;
          border-top: 1px solid var(--border-subtle);
        }
        .month-hdr {
          padding:8px; text-align:center; font-size:11px; font-weight:700;
          text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted);
          background:var(--bg-elevated); border-bottom:1px solid var(--border-subtle);
          position:sticky; top:0; z-index:1;
        }
        .month-cell {
          padding:6px; border-right:1px solid var(--border-subtle);
          border-bottom:1px solid var(--border-subtle); cursor:pointer;
          transition:background 0.1s; min-height:100px; vertical-align:top;
        }
        .month-cell:hover { background:var(--bg-elevated); }
        .month-cell.drag-over { background:rgba(99,102,241,0.1); outline:2px dashed rgba(99,102,241,0.4); outline-offset:-2px; }
        .month-cell.empty { background:var(--bg-surface); cursor:default; opacity:0.4; }
        .month-cell.today { background:color-mix(in srgb, var(--primary) 6%, var(--bg-surface)); }
        .month-day-num {
          display:inline-flex; align-items:center; justify-content:center;
          width:24px; height:24px; border-radius:50%; font-size:13px; font-weight:500;
          color:var(--text-secondary);
        }
        .month-cell.today .month-day-num {
          background:var(--primary); color:white; font-weight:700;
        }
        .month-evts { display:flex; flex-direction:column; gap:2px; margin-top:2px; }
        .month-evt {
          font-size:11px; padding:2px 6px; border-radius:4px;
          color:var(--text-secondary); white-space:nowrap; overflow:hidden;
          text-overflow:ellipsis; cursor:grab;
        }
        .month-evt:hover { filter:brightness(0.9); }
        .month-more { font-size:11px; color:var(--text-muted); padding:1px 4px; }
      `}</style>
    </div>
  );
}

// ─── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ cursor, today, events, scrollRef, onEventClick, onSlotClick, dragOverSlot, onDragOverSlot, onDragLeaveSlot, onEventDrop }: {
  cursor: Date; today: Date; events: CalendarEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (date: string, time: string) => void;
  dragOverSlot: { date: string; hour: number } | null;
  onDragOverSlot: (slot: { date: string; hour: number }) => void;
  onDragLeaveSlot: () => void;
  onEventDrop: (eventId: string, newDate: string, newHour: number) => void;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({length:7}, (_,i) => addDays(weekStart, i));

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const evt of events) {
      if (!map[evt.date]) map[evt.date] = [];
      map[evt.date].push(evt);
    }
    return map;
  }, [events]);

  return (
    <div className="week-root">
      <div className="week-header">
        <div className="time-gutter" />
        {days.map(d => {
          const isToday = sameDay(d, today);
          return (
            <div key={d.getTime()} className={`week-day-hdr${isToday ? ' today' : ''}`}>
              <span className="wdh-name">{DAYS[d.getDay()]}</span>
              <span className={`wdh-num${isToday ? ' today' : ''}`}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>
      <div className="week-body" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="week-grid">
          {/* Hour rows */}
          {HOURS.map(h => (
            <div key={h} className="hour-row">
              <div className="time-label">{h === 0 ? '' : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`}</div>
              {days.map(d => {
                const ds = toDateStr(d);
                const t = `${pad(h)}:00`;
                const isOver = dragOverSlot?.date === ds && dragOverSlot?.hour === h;
                return (
                  <div
                    key={ds}
                    className="hour-cell"
                    data-date={ds}
                    data-hour={h}
                    style={isOver ? { background: 'rgba(99,102,241,0.12)' } : undefined}
                    onClick={() => onSlotClick(ds, t)}
                    onDragOver={(e) => { e.preventDefault(); onDragOverSlot({ date: ds, hour: h }); }}
                    onDragLeave={onDragLeaveSlot}
                    onDrop={(e) => {
                      e.preventDefault();
                      const eventId = e.dataTransfer.getData('eventId');
                      if (eventId) onEventDrop(eventId, ds, h);
                    }}
                  />
                );
              })}
            </div>
          ))}
          {/* Events overlay */}
          {days.map(d => {
            const ds = toDateStr(d);
            const dayEvts = eventsByDate[ds] ?? [];
            return dayEvts.map(evt => {
              const [sh, sm] = evt.startTime.split(':').map(Number);
              const [eh, em] = evt.endTime.split(':').map(Number);
              const top = (sh + sm/60) * 56;
              const height = Math.max(((eh + em/60) - (sh + sm/60)) * 56, 20);
              const dayIndex = days.findIndex(x => toDateStr(x) === ds);
              return (
                <div
                  key={evt.id}
                  className="week-evt"
                  draggable={true}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('eventId', evt.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  style={{
                    top, height,
                    left: `calc(60px + (100% - 60px) * ${dayIndex} / 7 + 3px)`,
                    width: `calc((100% - 60px) / 7 - 6px)`,
                    background: EVENT_COLORS[evt.type]+'dd',
                    textDecoration: evt.completed ? 'line-through' : 'none',
                    cursor: 'grab',
                  }}
                  onClick={() => onEventClick(evt)}
                >
                  <span className="we-title">{evt.title}</span>
                  <span className="we-time">{evt.startTime}–{evt.endTime}</span>
                </div>
              );
            });
          })}
        </div>
      </div>
      <style jsx>{`
        .week-root { display:flex; flex-direction:column; flex:1; overflow:hidden; }
        .week-header {
          display:grid; grid-template-columns: 60px repeat(7,1fr);
          border-bottom: 1px solid var(--border-subtle); background:var(--bg-elevated);
          flex-shrink:0;
        }
        .time-gutter { border-right:1px solid var(--border-subtle); }
        .week-day-hdr {
          display:flex; flex-direction:column; align-items:center; gap:2px;
          padding:8px 4px; border-right:1px solid var(--border-subtle);
        }
        .week-day-hdr.today { background:color-mix(in srgb, var(--primary) 8%, var(--bg-elevated)); }
        .wdh-name { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-muted); }
        .wdh-num {
          display:flex; align-items:center; justify-content:center;
          width:28px; height:28px; border-radius:50%; font-size:15px; font-weight:500;
          color:var(--text-secondary);
        }
        .wdh-num.today { background:var(--primary); color:white; font-weight:700; }
        .week-body { flex:1; overflow-y:auto; position:relative; }
        .week-grid { position:relative; }
        .hour-row { display:grid; grid-template-columns: 60px repeat(7,1fr); height:56px; }
        .time-label {
          border-right:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle);
          padding:0 8px; font-size:11px; color:var(--text-muted);
          display:flex; align-items:flex-start; padding-top:4px; justify-content:flex-end;
        }
        .hour-cell {
          border-right:1px solid var(--border-subtle); border-bottom:1px solid var(--border-subtle);
          cursor:pointer; transition:background 0.1s;
        }
        .hour-cell:hover { background:var(--bg-elevated); }
        .week-evt {
          position:absolute; border-radius:6px; padding:3px 6px;
          color:white; font-size:11px; cursor:pointer; z-index:5;
          overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.2);
          display:flex; flex-direction:column; gap:1px; transition:filter 0.1s;
        }
        .week-evt:hover { filter:brightness(1.1); z-index:6; }
        .we-title { font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .we-time { font-size:10px; opacity:0.85; }
      `}</style>
    </div>
  );
}

// ─── Day View ──────────────────────────────────────────────────────────────────

function DayView({ date, today, events, scrollRef, onEventClick, onSlotClick, dragOverSlot, onDragOverSlot, onDragLeaveSlot, onEventDrop }: {
  date: Date; today: Date; events: CalendarEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onEventClick: (e: CalendarEvent) => void;
  onSlotClick: (time: string) => void;
  dragOverSlot: { date: string; hour: number } | null;
  onDragOverSlot: (slot: { date: string; hour: number }) => void;
  onDragLeaveSlot: () => void;
  onEventDrop: (eventId: string, newDate: string, newHour: number) => void;
}) {
  const ds = toDateStr(date);
  const isToday = sameDay(date, today);
  const dayEvts = events.filter(e => e.date === ds).sort((a,b) => a.startTime.localeCompare(b.startTime));

  return (
    <div className="day-root">
      <div className="day-header">
        <span className="day-name">{DAYS[date.getDay()]}</span>
        <span className={`day-num${isToday ? ' today' : ''}`}>{date.getDate()}</span>
        <span className="day-month">{MONTHS[date.getMonth()]} {date.getFullYear()}</span>
        {dayEvts.length > 0 && <span className="day-count">{dayEvts.length} event{dayEvts.length!==1?'s':''}</span>}
      </div>
      <div className="day-body" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="day-grid">
          {HOURS.map(h => {
            const isOver = dragOverSlot?.date === ds && dragOverSlot?.hour === h;
            return (
              <div key={h} className="day-hour-row">
                <div className="day-time-lbl">{h === 0 ? '' : `${h%12||12}${h<12?'am':'pm'}`}</div>
                <div
                  className="day-slot"
                  data-hour={h}
                  style={isOver ? { background: 'rgba(99,102,241,0.12)' } : undefined}
                  onClick={() => onSlotClick(`${pad(h)}:00`)}
                  onDragOver={(e) => { e.preventDefault(); onDragOverSlot({ date: ds, hour: h }); }}
                  onDragLeave={onDragLeaveSlot}
                  onDrop={(e) => {
                    e.preventDefault();
                    const eventId = e.dataTransfer.getData('eventId');
                    if (eventId) onEventDrop(eventId, ds, h);
                  }}
                />
              </div>
            );
          })}
          {dayEvts.map(evt => {
            const [sh, sm] = evt.startTime.split(':').map(Number);
            const [eh, em] = evt.endTime.split(':').map(Number);
            const top = (sh + sm/60) * 56;
            const height = Math.max(((eh + em/60) - (sh + sm/60)) * 56, 24);
            return (
              <div
                key={evt.id}
                className="day-evt"
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData('eventId', evt.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                style={{ top, height, background: EVENT_COLORS[evt.type]+'dd', textDecoration: evt.completed?'line-through':'none', cursor: 'grab' }}
                onClick={() => onEventClick(evt)}
              >
                <span className="day-evt-icon">{EVENT_ICONS[evt.type]}</span>
                <div>
                  <div className="day-evt-title">{evt.title}</div>
                  <div className="day-evt-time">{evt.startTime} – {evt.endTime}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <style jsx>{`
        .day-root { display:flex; flex-direction:column; flex:1; overflow:hidden; }
        .day-header {
          display:flex; align-items:center; gap:12px; padding:12px 20px;
          border-bottom:1px solid var(--border-subtle); background:var(--bg-elevated); flex-shrink:0;
        }
        .day-name { font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); }
        .day-num {
          font-size:28px; font-weight:700; color:var(--text-secondary);
          display:flex; align-items:center; justify-content:center;
          width:44px; height:44px; border-radius:50%;
        }
        .day-num.today { background:var(--primary); color:white; }
        .day-month { font-size:15px; font-weight:500; color:var(--text-secondary); }
        .day-count { margin-left:auto; font-size:12px; color:var(--text-muted); background:var(--bg-surface); padding:3px 10px; border-radius:20px; border:1px solid var(--border-subtle); }
        .day-body { flex:1; overflow-y:auto; position:relative; }
        .day-grid { position:relative; padding-left:68px; }
        .day-hour-row { display:flex; height:56px; }
        .day-time-lbl {
          position:absolute; left:0; width:60px; text-align:right;
          padding-right:8px; font-size:11px; color:var(--text-muted);
          padding-top:4px; border-right:1px solid var(--border-subtle);
        }
        .day-slot {
          flex:1; border-bottom:1px solid var(--border-subtle); cursor:pointer; transition:background 0.1s;
        }
        .day-slot:hover { background:var(--bg-elevated); }
        .day-evt {
          position:absolute; left:76px; right:16px; border-radius:8px;
          padding:6px 10px; color:white; cursor:pointer; z-index:5;
          display:flex; align-items:flex-start; gap:8px;
          box-shadow:0 2px 8px rgba(0,0,0,0.2); transition:filter 0.1s;
        }
        .day-evt:hover { filter:brightness(1.1); }
        .day-evt-icon { font-size:16px; flex-shrink:0; }
        .day-evt-title { font-size:13px; font-weight:600; }
        .day-evt-time { font-size:11px; opacity:0.85; }
      `}</style>
    </div>
  );
}

// ─── Agenda View ───────────────────────────────────────────────────────────────

function AgendaView({ cursor, events, onEventClick }: {
  cursor: Date; events: CalendarEvent[]; onEventClick: (e: CalendarEvent) => void;
}) {
  const start = cursor;
  const end = addDays(start, 30);
  const startStr = toDateStr(start);
  const endStr = toDateStr(end);

  const upcoming = useMemo(() => {
    const filtered = events
      .filter(e => e.date >= startStr && e.date <= endStr)
      .sort((a,b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    const grouped: { date: string; events: CalendarEvent[] }[] = [];
    for (const evt of filtered) {
      const last = grouped[grouped.length-1];
      if (last && last.date === evt.date) last.events.push(evt);
      else grouped.push({ date: evt.date, events: [evt] });
    }
    return grouped;
  }, [events, startStr, endStr]);

  return (
    <div className="agenda-root">
      <div className="agenda-period">
        Next 30 days — {upcoming.reduce((s,g)=>s+g.events.length,0)} events
      </div>
      {upcoming.length === 0 && (
        <div className="agenda-empty">No events in the next 30 days</div>
      )}
      {upcoming.map(group => {
        const d = parseDate(group.date);
        return (
          <div key={group.date} className="agenda-group">
            <div className="agenda-date">
              <span className="agd-dow">{DAYS[d.getDay()]}</span>
              <span className="agd-num">{d.getDate()}</span>
              <span className="agd-mon">{MONTHS[d.getMonth()].slice(0,3)}</span>
            </div>
            <div className="agenda-evts">
              {group.events.map(evt => (
                <div
                  key={evt.id}
                  className="agenda-evt"
                  style={{ borderLeft: `4px solid ${EVENT_COLORS[evt.type]}` }}
                  onClick={() => onEventClick(evt)}
                >
                  <span className="agd-icon">{EVENT_ICONS[evt.type]}</span>
                  <div className="agd-info">
                    <span className="agd-title" style={{ textDecoration: evt.completed?'line-through':'none' }}>{evt.title}</span>
                    <span className="agd-time">{evt.startTime} – {evt.endTime}</span>
                  </div>
                  <span className="agd-type-badge" style={{ background: EVENT_COLORS[evt.type]+'22', color: EVENT_COLORS[evt.type] }}>
                    {evt.type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <style jsx>{`
        .agenda-root { flex:1; overflow-y:auto; padding:16px 24px; }
        .agenda-period { font-size:13px; color:var(--text-muted); margin-bottom:20px; }
        .agenda-empty { font-size:15px; color:var(--text-muted); text-align:center; padding:60px 0; }
        .agenda-group { display:flex; gap:24px; margin-bottom:24px; align-items:flex-start; }
        .agenda-date { display:flex; flex-direction:column; align-items:center; min-width:48px; gap:0; }
        .agd-dow { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-muted); }
        .agd-num { font-size:24px; font-weight:700; color:var(--text-secondary); line-height:1; }
        .agd-mon { font-size:11px; color:var(--text-muted); }
        .agenda-evts { flex:1; display:flex; flex-direction:column; gap:8px; }
        .agenda-evt {
          display:flex; align-items:center; gap:10px; padding:10px 14px;
          border-radius:10px; background:var(--bg-elevated); cursor:pointer;
          transition:background 0.12s; border:1px solid var(--border-subtle);
        }
        .agenda-evt:hover { background:var(--bg-surface); }
        .agd-icon { font-size:18px; flex-shrink:0; }
        .agd-info { flex:1; min-width:0; }
        .agd-title { display:block; font-size:14px; font-weight:500; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .agd-time { display:block; font-size:12px; color:var(--text-muted); }
        .agd-type-badge { padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600; text-transform:capitalize; flex-shrink:0; }
      `}</style>
    </div>
  );
}
