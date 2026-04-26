'use client';

import { useMemo, useState } from 'react';

export interface TimetableImportEvent {
  id: string;
  title: string;
  type: 'class';
  date: string;
  startTime: string;
  endTime: string;
  description?: string;
}

type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
type RankingFocus = 'balanced' | 'mornings' | 'day-off' | 'compact';

interface CourseOption {
  id: string;
  courseKey: string;
  courseCode: string;
  courseName: string;
  section: string;
  instructor: string;
  days: DayName[];
  startTime: string;
  endTime: string;
  seatsOpen: boolean;
  seatsLabel?: string;
  raw: string;
}

interface ScheduleBundle {
  id: string;
  options: CourseOption[];
  score: number;
  freeDays: DayName[];
}

interface Props {
  onImport: (events: TimetableImportEvent[]) => void;
}

const STUDY_DAYS: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_TO_INDEX: Record<DayName, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function normalizeTime(value: string): string | null {
  const trimmed = value.trim().toUpperCase().replace(/\./g, '');
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = match[3];
  if (meridiem === 'AM' && hours === 12) hours = 0;
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (!meridiem && hours > 23) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseDays(raw: string): DayName[] {
  const compact = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  const tokens: DayName[] = [];
  let i = 0;
  while (i < compact.length) {
    if (compact.startsWith('TH', i) || compact.startsWith('R', i)) {
      tokens.push('Thu');
      i += compact.startsWith('TH', i) ? 2 : 1;
      continue;
    }
    if (compact.startsWith('TU', i) || compact.startsWith('T', i)) {
      tokens.push('Tue');
      i += compact.startsWith('TU', i) ? 2 : 1;
      continue;
    }
    if (compact.startsWith('SU', i)) {
      tokens.push('Sun');
      i += 2;
      continue;
    }
    if (compact.startsWith('M', i)) { tokens.push('Mon'); i += 1; continue; }
    if (compact.startsWith('W', i)) { tokens.push('Wed'); i += 1; continue; }
    if (compact.startsWith('F', i)) { tokens.push('Fri'); i += 1; continue; }
    if (compact.startsWith('SA', i) || compact.startsWith('S', i)) {
      tokens.push('Sat');
      i += compact.startsWith('SA', i) ? 2 : 1;
      continue;
    }
    i += 1;
  }
  return Array.from(new Set(tokens));
}

function splitBlocks(input: string): string[] {
  return input
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseCourseOptions(input: string): CourseOption[] {
  const blocks = splitBlocks(input);
  const options: CourseOption[] = [];

  for (const [index, block] of blocks.entries()) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const merged = lines.join(' | ');
    const header = lines[0] ?? `Course ${index + 1}`;
    const courseCode = (merged.match(/\b[A-Z]{2,5}[- ]?\d{2,4}[A-Z]?\b/)?.[0] ?? '').replace(/\s+/g, ' ').trim();
    const section = merged.match(/\b(?:SEC|SECTION|LEC|LAB|TUT)\s*[:#-]?\s*([A-Z0-9-]+)\b/i)?.[1] ?? `Option ${index + 1}`;
    const instructor =
      merged.match(/\b(?:Instructor|Prof(?:essor)?|Dr)\.?\s*[:\-]?\s*([A-Z][A-Za-z .'-]+)/i)?.[1]?.trim() ??
      lines.find((line) => /\bprof|dr\.|instructor\b/i.test(line))?.replace(/\b(?:Instructor|Professor|Prof|Dr)\.?\s*[:\-]?\s*/i, '').trim() ??
      'Staff';

    const timeMatch = merged.match(/([A-Za-z/ ,]+?)\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i);
    const days = parseDays(timeMatch?.[1] ?? merged.match(/\b(?:MWF|TR|TTH|MTWRF|Mon(?:day)?(?:\/Wed(?:nesday)?)?|Tue(?:sday)?(?:\/Thu(?:rsday)?)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/i)?.[0] ?? '');
    const startTime = normalizeTime(timeMatch?.[2] ?? '') ?? '09:00';
    const endTime = normalizeTime(timeMatch?.[3] ?? '') ?? '10:00';

    const seatsMatch = merged.match(/\b(?:Seats?|Open|Available)\s*[:\-]?\s*(\d+)\b/i) ?? merged.match(/\b(\d+)\s+(?:seats?|spots?)\s+open\b/i);
    const seatsOpen = seatsMatch ? Number(seatsMatch[1]) > 0 : !/\bclosed|full|waitlist\b/i.test(merged);
    const seatsLabel = seatsMatch ? `${seatsMatch[1]} open` : /\bclosed|full|waitlist\b/i.test(merged) ? 'Closed' : undefined;

    const cleanedHeader = header
      .replace(courseCode, '')
      .replace(/\b(?:SEC|SECTION|LEC|LAB|TUT)\s*[:#-]?\s*[A-Z0-9-]+\b/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const courseName = cleanedHeader || courseCode || `Course ${index + 1}`;
    const courseKey = (courseCode || courseName).toUpperCase();

    if (days.length === 0) continue;

    options.push({
      id: `${courseKey}-${section}-${index}`,
      courseKey,
      courseCode: courseCode || courseName,
      courseName,
      section,
      instructor,
      days,
      startTime,
      endTime,
      seatsOpen,
      seatsLabel,
      raw: block,
    });
  }

  return options;
}

function hasConflict(a: CourseOption, b: CourseOption): boolean {
  const sharedDay = a.days.some((day) => b.days.includes(day));
  if (!sharedDay) return false;
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

function scoreBundle(bundle: CourseOption[], focus: RankingFocus, avoidDays: Set<DayName>): number {
  const earliest = Math.min(...bundle.map((item) => toMinutes(item.startTime)));
  const latest = Math.max(...bundle.map((item) => toMinutes(item.endTime)));
  const activeDays = new Set(bundle.flatMap((item) => item.days));
  const freeDays = STUDY_DAYS.filter((day) => !activeDays.has(day));
  const openSeats = bundle.filter((item) => item.seatsOpen).length;
  const avoidedHits = bundle.flatMap((item) => item.days).filter((day) => avoidDays.has(day)).length;
  const gapsPenalty = Math.max(0, latest - earliest - bundle.reduce((sum, item) => sum + (toMinutes(item.endTime) - toMinutes(item.startTime)), 0));

  let score = 0;
  score += openSeats * 30;
  score -= avoidedHits * 50;
  score -= gapsPenalty / 8;
  score -= Math.max(0, earliest - 8 * 60) / 12;
  score -= Math.max(0, latest - 16 * 60) / 10;

  if (focus === 'mornings') score -= latest / 8;
  if (focus === 'day-off') score += freeDays.length * 60;
  if (focus === 'compact') score -= (latest - earliest) / 5;
  if (focus === 'balanced') score += freeDays.length * 25 - Math.abs(earliest - 9 * 60) / 10;

  return score;
}

function generateBundles(
  groups: CourseOption[][],
  focus: RankingFocus,
  avoidDays: Set<DayName>,
  earliestStart: string,
  latestFinish: string,
  seatOpenOnly: boolean,
): ScheduleBundle[] {
  const results: ScheduleBundle[] = [];
  const earliestMinutes = earliestStart ? toMinutes(earliestStart) : 0;
  const latestMinutes = latestFinish ? toMinutes(latestFinish) : 24 * 60;

  function backtrack(index: number, current: CourseOption[]) {
    if (results.length >= 120) return;
    if (index >= groups.length) {
      const score = scoreBundle(current, focus, avoidDays);
      const activeDays = new Set(current.flatMap((item) => item.days));
      const freeDays = STUDY_DAYS.filter((day) => !activeDays.has(day));
      results.push({
        id: current.map((item) => item.id).join('__'),
        options: [...current],
        score,
        freeDays,
      });
      return;
    }

    for (const option of groups[index]) {
      if (seatOpenOnly && !option.seatsOpen) continue;
      if (toMinutes(option.startTime) < earliestMinutes) continue;
      if (toMinutes(option.endTime) > latestMinutes) continue;
      if (option.days.some((day) => avoidDays.has(day))) continue;
      if (current.some((picked) => hasConflict(picked, option))) continue;
      current.push(option);
      backtrack(index + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return results.sort((a, b) => b.score - a.score).slice(0, 8);
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultSemesterEnd(): string {
  const end = new Date();
  end.setDate(end.getDate() + 112);
  return toDateStr(end);
}

function recurringEventsForBundle(bundle: ScheduleBundle, semStart: string, semEnd: string): TimetableImportEvent[] {
  const start = new Date(`${semStart}T00:00:00`);
  const end = new Date(`${semEnd}T00:00:00`);
  const events: TimetableImportEvent[] = [];

  for (const option of bundle.options) {
    for (const day of option.days) {
      const cursor = new Date(start);
      const offset = (DAY_TO_INDEX[day] - cursor.getDay() + 7) % 7;
      cursor.setDate(cursor.getDate() + offset);

      while (cursor <= end) {
        events.push({
          id: `tt_${option.id}_${toDateStr(cursor)}`,
          title: `${option.courseCode}${option.section ? ` · ${option.section}` : ''}`,
          type: 'class',
          date: toDateStr(cursor),
          startTime: option.startTime,
          endTime: option.endTime,
          description: [option.courseName, option.instructor, option.seatsLabel].filter(Boolean).join(' · '),
        });
        cursor.setDate(cursor.getDate() + 7);
      }
    }
  }

  return events;
}

function formatDays(days: DayName[]): string {
  return days.join(' / ');
}

export function TimetableBuilder({ onImport }: Props) {
  const [rawText, setRawText] = useState('');
  const [earliestStart, setEarliestStart] = useState('08:00');
  const [latestFinish, setLatestFinish] = useState('18:00');
  const [focus, setFocus] = useState<RankingFocus>('balanced');
  const [seatOpenOnly, setSeatOpenOnly] = useState(false);
  const [avoidDays, setAvoidDays] = useState<Set<DayName>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [semStart, setSemStart] = useState(toDateStr(new Date()));
  const [semEnd, setSemEnd] = useState(defaultSemesterEnd);

  const parsedOptions = useMemo(() => parseCourseOptions(rawText), [rawText]);
  const groupedCourses = useMemo(() => {
    const groups = new Map<string, CourseOption[]>();
    for (const option of parsedOptions) {
      const existing = groups.get(option.courseKey) ?? [];
      existing.push(option);
      groups.set(option.courseKey, existing);
    }
    return Array.from(groups.values());
  }, [parsedOptions]);

  const scheduleBundles = useMemo(
    () => generateBundles(groupedCourses, focus, avoidDays, earliestStart, latestFinish, seatOpenOnly),
    [groupedCourses, focus, avoidDays, earliestStart, latestFinish, seatOpenOnly],
  );

  const seatOpenCount = parsedOptions.filter((option) => option.seatsOpen).length;

  function toggleAvoidDay(day: DayName) {
    setAvoidDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  function loadSample() {
    setRawText(`CS 101 Intro to Computer Science
Section A
Instructor: Dr. Smith
MWF 9:00 AM - 9:50 AM
12 seats open

CS 101 Intro to Computer Science
Section B
Instructor: Dr. Smith
TR 11:00 AM - 12:15 PM
Closed

SOC 210 Social Science Research
Section 01
Instructor: Prof. Lee
MW 10:00 AM - 11:15 AM
8 seats open

SOC 210 Social Science Research
Section 02
Instructor: Prof. Lee
TR 1:00 PM - 2:15 PM
6 seats open

MATH 221 Calculus II
Section 03
Instructor: Dr. Khan
MWF 8:00 AM - 8:50 AM
4 seats open`);
  }

  return (
    <section className="builder">
      <div className="builder-header">
        <div>
          <div className="builder-eyebrow">Planner Mode</div>
          <h2>Build your timetable from pasted course text</h2>
          <p>
            Paste registrar or catalog text, tune the constraints, and Kivora will surface schedule combinations that
            fit mornings, leave a day free, or stay compact.
          </p>
        </div>
        <button className="sample-btn" onClick={loadSample}>Use sample</button>
      </div>

      <div className="builder-stats">
        <div className="stat-card"><span>Courses</span><strong>{groupedCourses.length}</strong></div>
        <div className="stat-card"><span>Seat-open options</span><strong>{seatOpenCount}</strong></div>
        <div className="stat-card"><span>Pinned</span><strong>{pinned.size}</strong></div>
        <div className="stat-card"><span>Valid schedules</span><strong>{scheduleBundles.length}</strong></div>
      </div>

      <div className="builder-grid">
        <div className="builder-panel">
          <div className="panel-head">
            <h3>Courses</h3>
            <p>Paste one or more section blocks. Each blank line becomes one option.</p>
          </div>
          <textarea
            className="builder-textarea"
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Paste your registrar text here..."
            rows={16}
          />
        </div>

        <div className="builder-panel">
          <div className="panel-head">
            <h3>Preferences</h3>
            <p>Use these constraints to narrow the schedule combinations.</p>
          </div>

          <div className="prefs-grid">
            <label>
              <span>Earliest start</span>
              <input type="time" value={earliestStart} onChange={(event) => setEarliestStart(event.target.value)} />
            </label>
            <label>
              <span>Latest finish</span>
              <input type="time" value={latestFinish} onChange={(event) => setLatestFinish(event.target.value)} />
            </label>
            <label>
              <span>Semester start</span>
              <input type="date" value={semStart} onChange={(event) => setSemStart(event.target.value)} />
            </label>
            <label>
              <span>Semester end</span>
              <input type="date" value={semEnd} onChange={(event) => setSemEnd(event.target.value)} />
            </label>
          </div>

          <div className="focus-row">
            {[
              ['balanced', 'Balanced'],
              ['mornings', 'Mornings'],
              ['day-off', 'One day free'],
              ['compact', 'Compact'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`chip ${focus === value ? 'active' : ''}`}
                onClick={() => setFocus(value as RankingFocus)}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={seatOpenOnly} onChange={(event) => setSeatOpenOnly(event.target.checked)} />
            <span>Only show sections with open seats</span>
          </label>

          <div className="avoid-days">
            <span>Avoid days</span>
            <div className="day-row">
              {STUDY_DAYS.map((day) => (
                <button
                  key={day}
                  className={`day-chip ${avoidDays.has(day) ? 'active' : ''}`}
                  onClick={() => toggleAvoidDay(day)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="results-panel">
        <div className="panel-head">
          <h3>Schedule builder</h3>
          <p>
            {scheduleBundles.length > 0
              ? `${scheduleBundles.length} combinations matched your constraints.`
              : 'No schedules match the current constraints yet. Try relaxing a day or time preference.'}
          </p>
        </div>

        {groupedCourses.length === 0 ? (
          <div className="empty-card">
            <strong>Need help getting started?</strong>
            <p>Paste a few course section blocks above. Include the course, section, instructor, days, and times.</p>
          </div>
        ) : (
          <div className="schedule-list">
            {scheduleBundles.map((bundle, index) => (
              <article key={bundle.id} className="schedule-card">
                <div className="schedule-top">
                  <div>
                    <span className="schedule-rank">Option {index + 1}</span>
                    <h4>{bundle.freeDays.length > 0 ? `Free ${bundle.freeDays.join(', ')}` : 'No free study day'}</h4>
                  </div>
                  <div className="schedule-actions">
                    <button
                      className="ghost-btn"
                      onClick={() => setPinned((prev) => {
                        const next = new Set(prev);
                        if (next.has(bundle.id)) next.delete(bundle.id);
                        else next.add(bundle.id);
                        return next;
                      })}
                    >
                      {pinned.has(bundle.id) ? 'Pinned' : 'Pin'}
                    </button>
                    <button
                      className="primary-btn"
                      onClick={() => onImport(recurringEventsForBundle(bundle, semStart, semEnd))}
                    >
                      Add schedule
                    </button>
                  </div>
                </div>

                <div className="schedule-lines">
                  {bundle.options.map((option) => (
                    <div key={option.id} className="schedule-line">
                      <div>
                        <strong>{option.courseCode}</strong>
                        <span>{option.courseName}</span>
                      </div>
                      <div>
                        <span>{formatDays(option.days)}</span>
                        <span>{option.startTime}–{option.endTime}</span>
                      </div>
                      <div>
                        <span>{option.instructor}</span>
                        <span>{option.seatsLabel ?? (option.seatsOpen ? 'Open' : 'Closed')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .builder {
          padding: 20px 20px 0;
          display: grid;
          gap: 16px;
          background: linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, #dbeafe) 0%, transparent 100%);
        }
        .builder-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .builder-eyebrow {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
          margin-bottom: 6px;
        }
        .builder-header h2 {
          margin: 0;
          font-size: clamp(24px, 3vw, 34px);
          line-height: 1.05;
        }
        .builder-header p {
          margin: 10px 0 0;
          max-width: 760px;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        .sample-btn,
        .primary-btn,
        .ghost-btn,
        .chip,
        .day-chip {
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          border-radius: 999px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sample-btn {
          padding: 10px 14px;
          font-weight: 600;
          white-space: nowrap;
        }
        .builder-stats {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .stat-card,
        .builder-panel,
        .results-panel,
        .empty-card,
        .schedule-card {
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-elevated) 96%, white);
          border-radius: 20px;
          box-shadow: var(--shadow-sm);
        }
        .stat-card {
          padding: 16px 18px;
          display: grid;
          gap: 6px;
        }
        .stat-card span {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .stat-card strong {
          font-size: 34px;
          line-height: 1;
        }
        .builder-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1.2fr) minmax(340px, 0.8fr);
        }
        .builder-panel,
        .results-panel {
          padding: 18px;
        }
        .panel-head h3,
        .schedule-top h4 {
          margin: 0;
          font-size: 18px;
        }
        .panel-head p {
          margin: 6px 0 0;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .builder-textarea,
        .prefs-grid input {
          width: 100%;
          box-sizing: border-box;
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          padding: 14px 15px;
          font: inherit;
        }
        .builder-textarea {
          margin-top: 14px;
          resize: vertical;
          min-height: 280px;
          font-family: 'JetBrains Mono', monospace;
          line-height: 1.6;
        }
        .prefs-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: 14px;
        }
        .prefs-grid label,
        .avoid-days {
          display: grid;
          gap: 8px;
        }
        .prefs-grid span,
        .avoid-days > span {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .focus-row,
        .day-row,
        .schedule-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .focus-row {
          margin-top: 16px;
        }
        .chip,
        .day-chip,
        .ghost-btn,
        .primary-btn {
          padding: 8px 12px;
          font-weight: 600;
        }
        .chip.active,
        .day-chip.active,
        .primary-btn {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 16px 0;
          color: var(--text-secondary);
        }
        .results-panel {
          display: grid;
          gap: 14px;
          margin-bottom: 20px;
        }
        .empty-card {
          padding: 18px;
        }
        .empty-card p {
          margin: 6px 0 0;
          color: var(--text-secondary);
        }
        .schedule-list {
          display: grid;
          gap: 12px;
        }
        .schedule-card {
          padding: 16px;
          display: grid;
          gap: 14px;
        }
        .schedule-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .schedule-rank {
          display: inline-block;
          margin-bottom: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .schedule-lines {
          display: grid;
          gap: 10px;
        }
        .schedule-line {
          display: grid;
          grid-template-columns: 1.2fr 0.9fr 0.9fr;
          gap: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
        }
        .schedule-line div {
          display: grid;
          gap: 4px;
        }
        .schedule-line span {
          color: var(--text-secondary);
          font-size: 14px;
        }
        @media (max-width: 980px) {
          .builder-stats,
          .builder-grid {
            grid-template-columns: 1fr;
          }
          .schedule-line {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
