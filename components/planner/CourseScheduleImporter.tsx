'use client';

import { useState, useId } from 'react';

interface ParsedCourse {
  name: string;
  instructor: string;
  days: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[];
  startTime: string;
  endTime: string;
  location?: string;
  courseCode?: string;
}

export interface ImportedCalendarEvent {
  id: string;
  title: string;
  type: 'class';
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  description?: string;
}

interface Props {
  onImport: (events: ImportedCalendarEvent[]) => void;
  onClose: () => void;
}

const DAY_MAP: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

const DAY_COLORS: Record<string, string> = {
  Monday: '#6366f1', Tuesday: '#10b981', Wednesday: '#f59e0b',
  Thursday: '#8b5cf6', Friday: '#ec4899', Saturday: '#06b6d4', Sunday: '#f97316',
};

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function defaultEnd(): string {
  return toDateStr(addWeeks(new Date(), 16));
}

function defaultStart(): string {
  return toDateStr(new Date());
}

function generateEvents(courses: ParsedCourse[], selected: Set<number>, semStart: string, semEnd: string): ImportedCalendarEvent[] {
  const start = new Date(semStart + 'T00:00:00');
  const end = new Date(semEnd + 'T00:00:00');
  const events: ImportedCalendarEvent[] = [];

  for (let i = 0; i < courses.length; i++) {
    if (!selected.has(i)) continue;
    const course = courses[i];
    const title = course.courseCode ? `${course.courseCode} — ${course.name}` : course.name;
    const description = [
      course.instructor !== 'Unknown' ? `Instructor: ${course.instructor}` : '',
      course.location ? `Room: ${course.location}` : '',
    ].filter(Boolean).join(' · ');

    for (const dayName of course.days) {
      const targetDow = DAY_MAP[dayName];
      if (targetDow === undefined) continue;

      // Find first occurrence on or after semStart
      const cur = new Date(start);
      const diff = (targetDow - cur.getDay() + 7) % 7;
      cur.setDate(cur.getDate() + diff);

      while (cur <= end) {
        const uid = `import_${i}_${dayName}_${toDateStr(cur)}`;
        events.push({
          id: uid,
          title,
          type: 'class',
          date: toDateStr(cur),
          startTime: course.startTime,
          endTime: course.endTime,
          description: description || undefined,
        });
        cur.setDate(cur.getDate() + 7);
      }
    }
  }

  return events;
}

type Step = 'paste' | 'review' | 'done';

export function CourseScheduleImporter({ onImport, onClose }: Props) {
  const formId = useId();
  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<ParsedCourse[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [semStart, setSemStart] = useState(defaultStart);
  const [semEnd, setSemEnd] = useState(defaultEnd);
  const [importedCount, setImportedCount] = useState(0);

  async function parse() {
    if (text.trim().length < 10) {
      setError('Please paste your course schedule (at least a few lines).');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/planner/import-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not parse the schedule. Try adding more detail.');
        return;
      }
      const parsed: ParsedCourse[] = data.courses ?? [];
      setCourses(parsed);
      setSelected(new Set(parsed.map((_, i) => i)));
      setStep('review');
    } catch {
      setError('Network error — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function toggleCourse(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function doImport() {
    const events = generateEvents(courses, selected, semStart, semEnd);
    setImportedCount(events.length);
    onImport(events);
    setStep('done');
  }

  return (
    <div className="importer-overlay" onClick={onClose}>
      <div className="importer-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="importer-header">
          <div>
            <div className="importer-eyebrow">Planner</div>
            <h2 className="importer-title">
              {step === 'paste' && 'Import Course Schedule'}
              {step === 'review' && `Review ${courses.length} Course${courses.length === 1 ? '' : 's'}`}
              {step === 'done' && 'Schedule Imported'}
            </h2>
          </div>
          <button className="importer-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Step 1: Paste ── */}
        {step === 'paste' && (
          <div className="importer-body">
            <p className="importer-hint">
              Paste your course schedule — any format works. Copy directly from your student portal, registration page, or syllabus email.
            </p>
            <div className="paste-example">
              <span className="example-label">Example</span>
              <pre>{`CS 101 · Intro to Computer Science
Dr. Smith · MWF 9:00–9:50 AM · Room 204

MATH 201 · Calculus II
Prof. Jones · TR 2:00–3:15 PM · Hall B`}</pre>
            </div>
            {error && <div className="importer-error">{error}</div>}
            <textarea
              id={`${formId}-text`}
              className="paste-input"
              placeholder="Paste your course schedule here…"
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
            />
            <div className="importer-footer">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={parse} disabled={loading || text.trim().length < 10}>
                {loading ? 'Parsing…' : 'Parse Schedule →'}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === 'review' && (
          <div className="importer-body">
            <p className="importer-hint">
              Select the courses to add, then set your semester date range.
            </p>

            <div className="course-list">
              {courses.map((c, i) => (
                <label key={i} className={`course-card ${selected.has(i) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleCourse(i)}
                    className="course-check"
                  />
                  <div className="course-info">
                    <div className="course-name">
                      {c.courseCode && <span className="course-code">{c.courseCode}</span>}
                      {c.name}
                    </div>
                    <div className="course-meta">
                      {c.instructor !== 'Unknown' && <span>{c.instructor}</span>}
                      {c.instructor !== 'Unknown' && c.location && <span className="meta-sep">·</span>}
                      {c.location && <span>{c.location}</span>}
                    </div>
                    <div className="course-days">
                      {c.days.map(d => (
                        <span key={d} className="day-chip" style={{ background: `${DAY_COLORS[d]}18`, color: DAY_COLORS[d], borderColor: `${DAY_COLORS[d]}30` }}>
                          {d.slice(0, 3)}
                        </span>
                      ))}
                      <span className="course-time">{c.startTime} – {c.endTime}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div className="semester-range">
              <div className="range-group">
                <label className="range-label" htmlFor={`${formId}-start`}>Semester start</label>
                <input id={`${formId}-start`} type="date" className="range-input" value={semStart} onChange={e => setSemStart(e.target.value)} />
              </div>
              <div className="range-sep">→</div>
              <div className="range-group">
                <label className="range-label" htmlFor={`${formId}-end`}>Semester end</label>
                <input id={`${formId}-end`} type="date" className="range-input" value={semEnd} onChange={e => setSemEnd(e.target.value)} />
              </div>
            </div>

            <div className="import-preview-note">
              {selected.size > 0
                ? `Will add ${generateEvents(courses, selected, semStart, semEnd).length} class sessions to your calendar`
                : 'Select at least one course to continue'}
            </div>

            {error && <div className="importer-error">{error}</div>}

            <div className="importer-footer">
              <button className="btn-secondary" onClick={() => { setStep('paste'); setError(''); }}>← Back</button>
              <button className="btn-primary" onClick={doImport} disabled={selected.size === 0 || !semStart || !semEnd}>
                Add to Calendar
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === 'done' && (
          <div className="importer-body done-state">
            <div className="done-icon">📅</div>
            <h3 className="done-title">Done!</h3>
            <p className="done-desc">
              Added <strong>{importedCount}</strong> class session{importedCount === 1 ? '' : 's'} to your calendar across {selected.size} course{selected.size === 1 ? '' : 's'}.
            </p>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </div>
        )}
      </div>

      <style jsx>{`
        .importer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .importer-modal {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-xl, 20px);
          box-shadow: 0 24px 64px rgba(0,0,0,0.18);
          width: 100%;
          max-width: 540px;
          max-height: 90dvh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .importer-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .importer-eyebrow {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
          margin-bottom: 4px;
        }
        .importer-title {
          font-size: 17px;
          font-weight: 700;
          margin: 0;
          color: var(--text-primary);
        }
        .importer-close {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-surface);
          color: var(--text-secondary);
          cursor: pointer;
          flex-shrink: 0;
        }
        .importer-body {
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
          flex: 1;
        }
        .importer-hint {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.55;
          margin: 0;
        }
        .paste-example {
          position: relative;
          border: 1px dashed var(--border-subtle);
          border-radius: var(--radius-lg, 12px);
          padding: 12px 14px;
          background: var(--bg-inset);
        }
        .example-label {
          position: absolute;
          top: -9px;
          left: 12px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          background: var(--bg-inset);
          color: var(--text-muted);
          padding: 0 4px;
        }
        .paste-example pre {
          margin: 0;
          font-size: 11.5px;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-secondary);
          line-height: 1.7;
          white-space: pre-wrap;
        }
        .importer-error {
          padding: 10px 14px;
          border-radius: var(--radius-md, 8px);
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          color: #ef4444;
          font-size: 13px;
        }
        .paste-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: var(--radius-lg, 12px);
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: 13px;
          font-family: 'JetBrains Mono', monospace;
          line-height: 1.65;
          resize: vertical;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.15s;
        }
        .paste-input:focus {
          border-color: var(--primary);
        }
        .course-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .course-card {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 12px 14px;
          border: 1.5px solid var(--border-subtle);
          border-radius: var(--radius-lg, 12px);
          background: var(--bg-surface);
          cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .course-card.selected {
          border-color: color-mix(in srgb, var(--primary) 45%, var(--border-subtle));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent);
        }
        .course-check {
          margin-top: 3px;
          flex-shrink: 0;
          width: 15px;
          height: 15px;
          accent-color: var(--primary);
          cursor: pointer;
        }
        .course-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .course-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .course-code {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--primary) 12%, transparent);
          color: var(--primary);
        }
        .course-meta {
          font-size: 12px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .meta-sep { opacity: 0.4; }
        .course-days {
          display: flex;
          align-items: center;
          gap: 5px;
          flex-wrap: wrap;
          margin-top: 2px;
        }
        .day-chip {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid;
        }
        .course-time {
          font-size: 12px;
          color: var(--text-secondary);
          font-family: 'JetBrains Mono', monospace;
          margin-left: 4px;
        }
        .semester-range {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg, 12px);
          background: var(--bg-inset);
          flex-wrap: wrap;
        }
        .range-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 140px;
        }
        .range-label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .range-input {
          padding: 7px 10px;
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          width: 100%;
          box-sizing: border-box;
        }
        .range-sep {
          font-size: 14px;
          color: var(--text-muted);
          padding-top: 18px;
          flex-shrink: 0;
        }
        .import-preview-note {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          padding: 8px;
          background: var(--bg-inset);
          border-radius: var(--radius-md, 8px);
        }
        .importer-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 4px;
          flex-shrink: 0;
          border-top: 1px solid var(--border-subtle);
          margin-top: 4px;
          padding-top: 16px;
        }
        .btn-primary {
          padding: 9px 18px;
          border-radius: var(--radius-md, 8px);
          border: none;
          background: var(--primary);
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .btn-primary:disabled {
          opacity: 0.4;
          cursor: default;
        }
        .btn-secondary {
          padding: 9px 16px;
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .done-state {
          align-items: center;
          text-align: center;
          padding: 40px 24px;
        }
        .done-icon {
          font-size: 48px;
          margin-bottom: 8px;
        }
        .done-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 8px;
          color: var(--text-primary);
        }
        .done-desc {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0 0 20px;
        }
      `}</style>
    </div>
  );
}
