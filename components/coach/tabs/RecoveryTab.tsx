'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WeakArea } from '@/hooks/useAnalytics';
import type { SRSDeck } from '@/lib/srs/sm2';
import styles from '@/app/(dashboard)/coach/page.module.css';

/**
 * Recovery — rebuilt as a "Mistake Bank".
 *
 * Surfaces every wrong answer the user has ever submitted across MCQ,
 * Quiz, Exam Prep, and flashcard Test, grouped by source file or deck.
 * The data already exists in the quizAttempts table (each row stores a
 * per-answer summary with userAnswer / correctAnswer / isCorrect); the
 * old tab just wasn't using it. The Today's Mission and Weak Topics
 * blocks stay below as a secondary surface.
 */

interface Mission {
  eyebrow:        string;
  title:          string;
  description:    string;
  actionLabel:    string;
  secondaryLabel: string;
  kind:           'review' | 'weak' | 'plan' | 'import' | 'manage';
  setId?:         string;
  weakArea?:      WeakArea;
}

interface Props {
  dueReviewSets:    SRSDeck[];
  allReviewSets:    SRSDeck[];
  topWeakAreas:     WeakArea[];
  hasQuizHistory:   boolean;
  loadingSets:      boolean;
  analyticsLoading: boolean;
  getSetDue:        (s: SRSDeck) => number;
  getSetAccuracy:   (s: SRSDeck) => number;
  mission:          Mission;
  onStartMission:   () => void;
  onMissionSecondary: () => void;
  onOpenPanel:      (setId: string, panel: 'review' | 'manage') => void;
  onLaunchWeakTopic: (area: WeakArea, tool: 'quiz' | 'explain') => void;
  onLoadRelatedReading: (topic: string) => void;
  onTakeFirstQuiz:  () => void;
}

interface ApiAnswer {
  questionId: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
}

interface ApiAttempt {
  id: string;
  mode: string;
  totalQuestions: number;
  correctAnswers: number;
  score: number | null;
  timeTaken: number | null;
  answers: ApiAnswer[];
  createdAt: string;
  fileId: string | null;
  deckId: string | null;
  fileName?: string | null;
}

interface FlatMistake {
  attemptId: string;
  mode: string;
  date: string;
  source: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
}

const MODE_META: Record<string, { label: string; color: string; icon: string }> = {
  mcq:  { label: 'MCQ',   color: '#4f86f7', icon: '🧩' },
  quiz: { label: 'Quiz',  color: '#22c55e', icon: '❓' },
  exam: { label: 'Exam',  color: '#e05252', icon: '🏆' },
  test: { label: 'Test',  color: '#a78bfa', icon: '🎯' },
};

const FILTERS = [
  { id: 'all',   label: 'All' },
  { id: 'week',  label: 'This week' },
  { id: 'mcq',   label: '🧩 MCQ' },
  { id: 'quiz',  label: '❓ Quiz' },
  { id: 'exam',  label: '🏆 Exam' },
] as const;
type FilterId = typeof FILTERS[number]['id'];

function AccuracyBar({ pct }: { pct: number }) {
  const color = pct < 40 ? '#ef4444' : pct < 65 ? '#f97316' : '#22c55e';
  return (
    <div className={styles.accuracyBarWrap}>
      <span className={styles.accuracyBarLabel} style={{ color }}>{pct}%</span>
      <div className={styles.accuracyBar}>
        <div className={styles.accuracyFill} style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function fmtRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60) return diffMin <= 1 ? 'just now' : `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function RecoveryTab({
  topWeakAreas,
  hasQuizHistory,
  analyticsLoading,
  mission,
  onStartMission,
  onMissionSecondary,
  onLaunchWeakTopic,
  onLoadRelatedReading,
  onTakeFirstQuiz,
}: Props) {
  const [attempts, setAttempts] = useState<ApiAttempt[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<FilterId>('all');
  const [hidden,   setHidden]   = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('kivora-recovery-hidden');
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch { return new Set(); }
  });

  // Pull the most recent 50 attempts. The route already left-joins file
  // names so we get a usable source label per attempt.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/quiz-attempts?limit=50', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { attempts: [] })
      .then((data: { attempts?: ApiAttempt[] }) => {
        if (!cancelled) setAttempts(Array.isArray(data.attempts) ? data.attempts : []);
      })
      .catch(() => { if (!cancelled) setAttempts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Flatten attempts into individual wrong-answer records.
  const mistakes = useMemo<FlatMistake[]>(() => {
    const out: FlatMistake[] = [];
    for (const a of attempts) {
      const source = a.fileName ?? (a.deckId ? `Deck ${a.deckId.slice(0, 6)}` : 'Other');
      for (const ans of a.answers ?? []) {
        if (ans.isCorrect) continue;
        const id = `${a.id}::${ans.questionId}`;
        if (hidden.has(id)) continue;
        out.push({
          attemptId: id,
          mode: a.mode,
          date: a.createdAt,
          source,
          question: ans.question,
          userAnswer: ans.userAnswer,
          correctAnswer: ans.correctAnswer,
        });
      }
    }
    return out;
  }, [attempts, hidden]);

  const filtered = useMemo(() => {
    if (filter === 'all') return mistakes;
    if (filter === 'week') {
      const cutoff = Date.now() - 7 * 86400_000;
      return mistakes.filter(m => new Date(m.date).getTime() >= cutoff);
    }
    return mistakes.filter(m => m.mode === filter);
  }, [mistakes, filter]);

  // Group by source for the rendered list.
  const grouped = useMemo(() => {
    const map = new Map<string, FlatMistake[]>();
    for (const m of filtered) {
      const list = map.get(m.source) ?? [];
      list.push(m);
      map.set(m.source, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // Stats strip
  const totalMistakes = mistakes.length;
  const weekMistakes  = mistakes.filter(m => Date.now() - new Date(m.date).getTime() < 7 * 86400_000).length;
  const byMode: Record<string, number> = {};
  for (const m of mistakes) byMode[m.mode] = (byMode[m.mode] ?? 0) + 1;
  const topMode = Object.entries(byMode).sort((a, b) => b[1] - a[1])[0];

  function hideOne(id: string) {
    setHidden(prev => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem('kivora-recovery-hidden', JSON.stringify(Array.from(next))); } catch { /* noop */ }
      return next;
    });
  }

  function unhideAll() {
    setHidden(new Set());
    try { localStorage.removeItem('kivora-recovery-hidden'); } catch { /* noop */ }
  }

  return (
    <div className={styles.recoveryLayout}>
      <div className={styles.panelHead}>
        <h2>Mistake Bank</h2>
        <p>
          Every question you got wrong, grouped by source. Re-quiz a topic, mark a question as
          handled, or cycle back through them when you&apos;re prepping for a final.
        </p>
      </div>

      {/* ── Stat strip ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={statTile('#ef4444')}>
          <div style={statNum}>{totalMistakes}</div>
          <div style={statLabel}>Total mistakes</div>
        </div>
        <div style={statTile('#f97316')}>
          <div style={statNum}>{weekMistakes}</div>
          <div style={statLabel}>Past 7 days</div>
        </div>
        <div style={statTile('#4f86f7')}>
          <div style={statNum}>{topMode ? MODE_META[topMode[0]]?.label ?? topMode[0] : '—'}</div>
          <div style={statLabel}>Most-missed mode</div>
        </div>
        <div style={statTile('#a78bfa')}>
          <div style={statNum}>{attempts.length}</div>
          <div style={statLabel}>Attempts logged</div>
        </div>
      </div>

      {/* ── Filter pills ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '5px 12px',
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${active ? 'var(--accent, #1db88e)' : 'var(--border-subtle, #cbd5e1)'}`,
                background: active ? 'var(--accent, #1db88e)' : 'transparent',
                color: active ? '#fff' : 'var(--text-2, #475569)',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          );
        })}
        {hidden.size > 0 && (
          <button
            onClick={unhideAll}
            style={{
              padding: '5px 12px',
              borderRadius: 16,
              fontSize: 12,
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-3)',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            Restore {hidden.size} hidden
          </button>
        )}
      </div>

      {/* ── Mistakes list ──────────────────────────────────────────────── */}
      {loading ? (
        <div className={styles.emptyBrief}><strong>Loading attempts…</strong></div>
      ) : !hasQuizHistory && attempts.length === 0 ? (
        <div className={styles.emptyBrief} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <strong>No mistakes logged yet</strong>
          <span>The Mistake Bank fills in automatically every time you submit an MCQ, Quiz, Exam Prep, or flashcard Test. Take one quiz to seed it.</span>
          <button className={styles.btnPrimary} onClick={onTakeFirstQuiz}>Take your first quiz →</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyBrief}><strong>Nothing in this filter ✔</strong> — switch filters above or come back after another attempt.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {grouped.map(([source, items]) => (
            <div key={source} style={{ background: 'var(--bg-elevated, #fff)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', background: 'var(--bg-inset, #f8fafc)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                <span>📄 {source}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{items.length} mistake{items.length === 1 ? '' : 's'}</span>
              </div>
              {items.map(m => {
                const meta = MODE_META[m.mode];
                return (
                  <div key={m.attemptId} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                      {meta && (
                        <span style={{ padding: '2px 7px', borderRadius: 999, background: `${meta.color}18`, color: meta.color, fontWeight: 700 }}>
                          {meta.icon} {meta.label}
                        </span>
                      )}
                      <span style={{ color: 'var(--text-muted)' }}>{fmtRelativeDate(m.date)}</span>
                      <button
                        onClick={() => hideOne(m.attemptId)}
                        title="Hide from mistake bank"
                        style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}
                      >
                        ✓ Got it now
                      </button>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>{m.question}</div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, lineHeight: 1.5 }}>
                      <div style={{ flex: '1 1 240px' }}>
                        <span style={{ color: '#ef4444', fontWeight: 700, marginRight: 4 }}>You:</span>
                        <span style={{ color: 'var(--text-2)' }}>{m.userAnswer || '(no answer)'}</span>
                      </div>
                      <div style={{ flex: '1 1 240px' }}>
                        <span style={{ color: '#22c55e', fontWeight: 700, marginRight: 4 }}>Correct:</span>
                        <span style={{ color: 'var(--text-2)' }}>{m.correctAnswer || '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Today's Mission (kept as a secondary surface) ──────────────── */}
      <div className={styles.missionCard} style={{ marginTop: 8 }}>
        <div className={styles.missionBody}>
          <span className={styles.eyebrowPill}>Today&apos;s Mission</span>
          <h3>{mission.title}</h3>
          <p>{mission.description}</p>
        </div>
        <div className={styles.missionActions}>
          <button className={styles.btnPrimary} onClick={onStartMission}>{mission.actionLabel}</button>
          <button className={styles.btnSecondary} onClick={onMissionSecondary}>{mission.secondaryLabel}</button>
        </div>
      </div>

      {/* ── Weak topics (data-driven, optional) ────────────────────────── */}
      {!analyticsLoading && topWeakAreas.length > 0 && (
        <div>
          <h4>Weakest topics by accuracy</h4>
          <div className={styles.setList}>
            {topWeakAreas.map(area => {
              const pct = Math.round(area.accuracy);
              return (
                <div key={area.topic} className={styles.setRow}>
                  <div className={styles.setRowInfo}>
                    <strong>{area.topic}</strong>
                    <AccuracyBar pct={pct} />
                    <span>{area.attempts} attempts · ~{area.estimatedMinutes} min to recover</span>
                    <small>{area.suggestion}</small>
                  </div>
                  <div className={styles.setRowActions}>
                    <button className={styles.btnPrimary} onClick={() => onLaunchWeakTopic(area, 'quiz')}>Practice</button>
                    <button className={styles.btnSecondary} onClick={() => onLaunchWeakTopic(area, 'explain')}>Explain</button>
                    <button className={styles.btnSecondary} onClick={() => onLoadRelatedReading(area.topic)}>Reading</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const statTile = (color: string): React.CSSProperties => ({
  flex: '1 1 140px',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'var(--bg-elevated, #fff)',
  border: `1px solid ${color}30`,
  borderLeft: `3px solid ${color}`,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 130,
});

const statNum: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: 'var(--text-primary)',
  letterSpacing: '-0.01em',
};

const statLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
};
