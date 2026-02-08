// Calendar Export Functionality for Study Plans
// Generates iCalendar (.ics) files compatible with Google Calendar, Apple Calendar, and Outlook

import { GeneratedSchedule } from './generate';

/**
 * Generate a unique identifier for calendar events
 */
function generateUID(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}@studypilot`;
}

/**
 * Format a date for iCalendar format (YYYYMMDD)
 */
function formatICSDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Format a date with time for iCalendar format (YYYYMMDDTHHMMSS)
 */
function formatICSDateTime(dateStr: string, hours: number, minutes: number): string {
  const date = formatICSDate(dateStr);
  const h = hours.toString().padStart(2, '0');
  const m = minutes.toString().padStart(2, '0');
  return `${date}T${h}${m}00`;
}

/**
 * Escape special characters for iCalendar text fields
 */
function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold long lines per iCalendar spec (max 75 chars per line)
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;

  const parts: string[] = [];
  let remaining = line;

  while (remaining.length > 75) {
    parts.push(remaining.substring(0, 75));
    remaining = ' ' + remaining.substring(75);
  }
  parts.push(remaining);

  return parts.join('\r\n');
}

interface CalendarEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: string;
  dtend: string;
  location?: string;
}

/**
 * Generate a single VEVENT block
 */
function generateVEvent(event: CalendarEvent): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${formatICSDateTime(new Date().toISOString().split('T')[0], 0, 0)}Z`,
    `DTSTART:${event.dtstart}`,
    `DTEND:${event.dtend}`,
    foldLine(`SUMMARY:${escapeICSText(event.summary)}`),
    foldLine(`DESCRIPTION:${escapeICSText(event.description)}`),
  ];

  if (event.location) {
    lines.push(foldLine(`LOCATION:${escapeICSText(event.location)}`));
  }

  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * Generate iCalendar (.ics) file content from a study schedule
 */
export function generateICSContent(
  schedule: GeneratedSchedule,
  planTitle: string,
  studyStartHour: number = 9 // Default start time 9 AM
): string {
  const events: CalendarEvent[] = [];

  for (const day of schedule.days) {
    // Calculate end time based on total minutes
    const startHour = studyStartHour;
    const startMinute = 0;
    const endMinute = day.totalMinutes % 60;
    const endHour = startHour + Math.floor(day.totalMinutes / 60) + (startMinute + endMinute >= 60 ? 1 : 0);
    const actualEndMinute = (startMinute + endMinute) % 60;

    // Build description with topic details
    const topicDetails = day.topics
      .map(t => `- ${t.name}: ${t.duration}min (${t.tasks.join(', ')})`)
      .join('\n');

    const description = day.isRevision
      ? `REVISION DAY\n\nTopics to review:\n${topicDetails}`
      : `Study Session\n\nTopics:\n${topicDetails}`;

    events.push({
      uid: generateUID(),
      summary: day.isRevision
        ? `[REVISION] ${planTitle} - Day ${day.dayNumber}`
        : `${planTitle} - Day ${day.dayNumber}`,
      description,
      dtstart: formatICSDateTime(day.date, startHour, startMinute),
      dtend: formatICSDateTime(day.date, endHour, actualEndMinute),
    });
  }

  // Add exam day event
  events.push({
    uid: generateUID(),
    summary: `EXAM: ${planTitle}`,
    description: `Exam day for ${planTitle}. Good luck!`,
    dtstart: formatICSDate(schedule.endDate),
    dtend: formatICSDate(schedule.endDate),
  });

  // Build the complete iCalendar file
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyPilot//Study Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICSText(planTitle)}`,
    ...events.map(e => generateVEvent(e)),
    'END:VCALENDAR',
  ];

  return icsLines.join('\r\n');
}

/**
 * Download iCalendar file
 */
export function downloadICSFile(
  schedule: GeneratedSchedule,
  planTitle: string,
  studyStartHour: number = 9
): void {
  const content = generateICSContent(schedule, planTitle, studyStartHour);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${planTitle.replace(/[^a-z0-9]/gi, '_')}_study_plan.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate Google Calendar URL for a single event
 * Note: Google Calendar URL has limits, so this is best for individual events
 */
export function generateGoogleCalendarURL(
  title: string,
  description: string,
  startDate: string,
  endDate: string,
  startHour: number = 9,
  durationMinutes: number = 60
): string {
  const startDateTime = `${startDate.replace(/-/g, '')}T${startHour.toString().padStart(2, '0')}0000`;
  const endMinute = durationMinutes % 60;
  const endHour = startHour + Math.floor(durationMinutes / 60);
  const endDateTime = `${endDate.replace(/-/g, '')}T${endHour.toString().padStart(2, '0')}${endMinute.toString().padStart(2, '0')}00`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startDateTime}/${endDateTime}`,
    details: description,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Google Calendar URL for the exam event
 */
export function generateExamGoogleCalendarURL(
  planTitle: string,
  examDate: string
): string {
  const dateFormatted = examDate.replace(/-/g, '');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `EXAM: ${planTitle}`,
    dates: `${dateFormatted}/${dateFormatted}`,
    details: `Exam day for ${planTitle}. Good luck!`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Outlook Web URL for a single event
 */
export function generateOutlookCalendarURL(
  title: string,
  description: string,
  startDate: string,
  startHour: number = 9,
  durationMinutes: number = 60
): string {
  const start = new Date(startDate);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const params = new URLSearchParams({
    subject: title,
    body: description,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    path: '/calendar/action/compose',
    rru: 'addevent',
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Calendar export options interface
 */
export interface CalendarExportOptions {
  studyStartHour: number;
  includeReminders: boolean;
  reminderMinutes: number;
}

/**
 * Default export options
 */
export const defaultExportOptions: CalendarExportOptions = {
  studyStartHour: 9,
  includeReminders: true,
  reminderMinutes: 30,
};
