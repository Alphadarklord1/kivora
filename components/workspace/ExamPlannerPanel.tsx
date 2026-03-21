'use client';

import { useEffect, useRef, useState } from 'react';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';

interface Exam {
  id: string;
  name: string;
  subject: string;
  date: string;         // ISO date string YYYY-MM-DD
  topics: string;       // comma-separated topics
  schedule?: string;    // AI-generated schedule markdown
}

const STORAGE_KEY = 'kivora-exam-planner';

function loadExams(): Exam[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function saveExams(exams: Exam[]) {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(exams));
}

function daysUntil(dateStr: string): number {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function urgencyColor(days: number): string {
  if (days < 0)  return '#9ca3af'; // past
  if (days <= 3) return '#ef4444';
  if (days <= 7) return '#f59e0b';
  if (days <= 14) return '#4f86f7';
  return '#52b788';
}

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="margin:10px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="margin:12px 0 4px">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="margin:14px 0 6px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*] (.+)$/gm,  '<div style="padding-left:14px">• $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:14px">$1. $2</div>')
    .replace(/\n/g, '<br>');
}

export function ExamPlannerPanel() {
  const [exams,      setExams]      = useState<Exam[]>([]);
  const [adding,     setAdding]     = useState(false);
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState<string | null>(null); // exam id being scheduled

  // New exam form state
  const [form, setForm] = useState({ name: '', subject: '', date: '', topics: '' });

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setExams(loadExams()); }, []);

  function addExam() {
    if (!form.name.trim() || !form.date) return;
    const exam: Exam = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      subject: form.subject.trim(),
      date: form.date,
      topics: form.topics.trim(),
    };
    const next = [...exams, exam].sort((a, b) => a.date.localeCompare(b.date));
    setExams(next); saveExams(next);
    setForm({ name: '', subject: '', date: '', topics: '' });
    setAdding(false);
  }

  function removeExam(id: string) {
    if (!confirm('Remove this exam?')) return;
    const next = exams.filter(e => e.id !== id);
    setExams(next); saveExams(next);
  }

  async function generateSchedule(exam: Exam) {
    const days = daysUntil(exam.date);
    if (days < 0) return;

    setGenerating(exam.id);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const topicList = exam.topics
      ? `Key topics to cover: ${exam.topics}`
      : 'No specific topics listed — generate a general revision plan.';

    const prompt = `Create a day-by-day revision schedule for the following exam:

Exam: ${exam.name}
Subject: ${exam.subject || 'General'}
Date: ${exam.date} (${days} days from today)
${topicList}

Requirements:
- Start from today and go up to 1 day before the exam
- Group days into phases (Foundation, Deep Study, Practice, Review)
- Each day entry: Day N (date) — what to study
- Keep each day entry to 1-2 sentences
- Add a final "Exam Day Tips" section
- Format in clean markdown with headings per phase`;

    const ai = loadAiRuntimePreferences();
    const privacyMode = loadClientAiDataMode();

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'outline', text: prompt, ai, privacyMode }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) { setGenerating(null); return; }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', schedule = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data: ')) continue;
          try {
            const { token, done: isDone } = JSON.parse(t.slice(6));
            if (isDone) break;
            schedule += token;
            setExams(prev => {
              const next = prev.map(e => e.id === exam.id ? { ...e, schedule } : e);
              saveExams(next);
              return next;
            });
          } catch {}
        }
      }
      setExpanded(prev => ({ ...prev, [exam.id]: true }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>📅 Exam Planner</h3>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
            Track upcoming exams and auto-generate revision schedules
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(!adding)}>
          {adding ? '✕ Cancel' : '＋ Add Exam'}
        </button>
      </div>

      {/* Add exam form */}
      {adding && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Exam name *</label>
              <input
                className="input"
                placeholder="e.g. Biology Final"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Subject</label>
              <input
                className="input"
                placeholder="e.g. Biology"
                value={form.subject}
                onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Exam date *</label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Topics (comma-separated)</label>
              <input
                className="input"
                placeholder="e.g. Cell biology, Genetics, Ecology"
                value={form.topics}
                onChange={e => setForm(p => ({ ...p, topics: e.target.value }))}
              />
            </div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={!form.name.trim() || !form.date}
            onClick={addExam}
          >
            Add Exam
          </button>
        </div>
      )}

      {/* No exams */}
      {exams.length === 0 && !adding && (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <h3>No exams yet</h3>
          <p>Add an upcoming exam and Kivora will generate a personalised day-by-day revision schedule.</p>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>＋ Add your first exam</button>
        </div>
      )}

      {/* Exam cards */}
      {exams.map(exam => {
        const days  = daysUntil(exam.date);
        const color = urgencyColor(days);
        const isExp = expanded[exam.id];
        const isGen = generating === exam.id;
        return (
          <div key={exam.id} style={{ background: 'var(--surface)', border: `1px solid var(--border-2)`, borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderLeft: `4px solid ${color}` }}>
            <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Countdown circle */}
              <div style={{ textAlign: 'center', minWidth: 52 }}>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color, lineHeight: 1 }}>
                  {days < 0 ? '✓' : days}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 1 }}>
                  {days < 0 ? 'passed' : days === 0 ? 'TODAY' : days === 1 ? 'day' : 'days'}
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{exam.name}</div>
                {exam.subject && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{exam.subject}</div>}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                  {new Date(exam.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
                {exam.topics && (
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>
                    Topics: {exam.topics}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {days >= 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={isGen}
                    onClick={() => generateSchedule(exam)}
                    title="Generate a day-by-day revision plan using AI"
                  >
                    {isGen ? '⏳ Generating…' : exam.schedule ? '↻ Regenerate' : '🗓 Generate Plan'}
                  </button>
                )}
                {exam.schedule && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setExpanded(p => ({ ...p, [exam.id]: !isExp }))}
                  >
                    {isExp ? 'Hide' : 'View Plan'}
                  </button>
                )}
                <button
                  className="btn-icon"
                  style={{ color: 'var(--danger)', fontSize: 12, width: 24, height: 24 }}
                  onClick={() => removeExam(exam.id)}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Schedule preview */}
            {(isExp || isGen) && exam.schedule && (
              <div
                className="tool-output"
                style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', fontSize: 'var(--text-xs)' }}
                dangerouslySetInnerHTML={{ __html: mdToHtml(exam.schedule) + (isGen ? '<span class="stream-cursor">▍</span>' : '') }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
