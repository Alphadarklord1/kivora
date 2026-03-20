'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

// ── Mini-report types ──────────────────────────────────────────────────────

interface MiniStats {
  streak: number;
  reviewedToday: number;
  dueCards: number;
  totalDecks: number;
  recentScores: { mode: string; score: number; date: string }[];
  weeklyQuizzes: number;
  avgScore: number;
  filesCount: number;
  libraryCount: number;
}

const EMPTY: MiniStats = {
  streak: 0,
  reviewedToday: 0,
  dueCards: 0,
  totalDecks: 0,
  recentScores: [],
  weeklyQuizzes: 0,
  avgScore: 0,
  filesCount: 0,
  libraryCount: 0,
};

// ── Sparkline SVG ──────────────────────────────────────────────────────────

function Sparkline({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 80, h = 24;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Score pill ─────────────────────────────────────────────────────────────

function ScorePill({ score }: { score: number }) {
  const color = score >= 80 ? '#4ade80' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
      background: `${color}22`, color,
    }}>
      {score}%
    </span>
  );
}

// ── Mini bar chart ─────────────────────────────────────────────────────────

function MiniBar({ value, max, color = 'var(--accent)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--border-2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface ReportsSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function ReportsSidebar({ open, onClose }: ReportsSidebarProps) {
  const [stats, setStats] = useState<MiniStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics?period=7', { credentials: 'include' });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();

      // Extract streak from analytics or localStorage fallback
      const streak = data?.activity?.currentStreak
        ?? Number(localStorage.getItem('kivora_study_streak') ?? 0);

      const deckStats = data?.deckStats ?? {};
      const quizStats = data?.quizStats ?? {};
      const usage = data?.usage ?? {};

      setStats({
        streak,
        reviewedToday: deckStats.reviewedToday ?? 0,
        dueCards: deckStats.dueCardsTotal ?? 0,
        totalDecks: deckStats.totalDecks ?? 0,
        recentScores: (quizStats.recentScores ?? []).slice(0, 7),
        weeklyQuizzes: quizStats.totalAttempts ?? 0,
        avgScore: Math.round(quizStats.averageScore ?? 0),
        filesCount: usage.totalFiles ?? 0,
        libraryCount: usage.libraryItems ?? 0,
      });
    } catch {
      // Fallback: read what we can from localStorage
      const streak = Number(localStorage.getItem('kivora_study_streak') ?? 0);
      setStats({ ...EMPTY, streak });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const scoreValues = stats.recentScores.map(s => s.score);
  const modeEmoji: Record<string, string> = {
    mcq: '🧩', quiz: '❓', flashcards: '📇', exam: '🏆', practice: '🎯',
  };

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderLeft: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideInRight 0.18s ease',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', flex: 1 }}>📊 Reports</span>
        <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={onClose}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
          ))
        ) : (
          <>
            {/* Streak */}
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 2 }}>🔥</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{stats.streak}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>day streak</div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                { label: 'Reviewed', value: stats.reviewedToday, icon: '✅' },
                { label: 'Due cards', value: stats.dueCards, icon: '📅' },
                { label: 'Sets', value: stats.totalDecks, icon: '📇' },
                { label: 'Files', value: stats.filesCount, icon: '📁' },
                { label: 'Quizzes', value: stats.weeklyQuizzes, icon: '❓', note: '7 days' },
                { label: 'Avg score', value: `${stats.avgScore}%`, icon: '🎯' },
              ].map(item => (
                <div key={item.label} style={{
                  padding: '6px 8px', borderRadius: 8, background: 'var(--surface-2)',
                  display: 'flex', flexDirection: 'column', gap: 1,
                }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.icon} {item.label}{item.note ? <span style={{ fontSize: 9, marginLeft: 2 }}>({item.note})</span> : ''}</div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Average score bar */}
            {stats.avgScore > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>7-day avg score</span>
                  <ScorePill score={stats.avgScore} />
                </div>
                <MiniBar value={stats.avgScore} max={100}
                  color={stats.avgScore >= 80 ? '#4ade80' : stats.avgScore >= 60 ? '#f59e0b' : '#ef4444'} />
              </div>
            )}

            {/* Score trend sparkline */}
            {scoreValues.length >= 2 && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 6 }}>Score trend</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Sparkline values={scoreValues} />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>last 7</span>
                    <ScorePill score={scoreValues[scoreValues.length - 1] ?? 0} />
                  </div>
                </div>
              </div>
            )}

            {/* Recent sessions */}
            {stats.recentScores.length > 0 && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 6 }}>Recent sessions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {stats.recentScores.slice(0, 5).map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12 }}>{modeEmoji[s.mode] ?? '📝'}</span>
                      <span style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--text-2)', textTransform: 'capitalize' }}>{s.mode}</span>
                      <ScorePill score={s.score} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Due cards alert */}
            {stats.dueCards > 0 && (
              <Link
                href="/coach"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 8, textDecoration: 'none',
                  background: 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                }}
              >
                <span style={{ fontSize: 16 }}>📅</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent)' }}>
                    {stats.dueCards} card{stats.dueCards !== 1 ? 's' : ''} due
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Tap to review →</div>
                </div>
              </Link>
            )}

            {/* Library count */}
            {stats.libraryCount > 0 && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', textAlign: 'center', paddingBottom: 4 }}>
                {stats.libraryCount} item{stats.libraryCount !== 1 ? 's' : ''} saved to library
              </div>
            )}

            {/* Full analytics link */}
            <a href="/analytics" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              <span className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                Full analytics ↗
              </span>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
