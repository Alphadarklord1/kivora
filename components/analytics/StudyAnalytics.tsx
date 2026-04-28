'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { getGoalPreferences, saveGoalPreferences } from '@/lib/srs/sm2';
import {
  useAnalytics,
  type CoachAction,
  type DeckStats,
  type QuizStats,
  type PlanStats,
  type WeakArea,
  type Activity,
  type UsageStats,
  type WeekOverWeek,
  type RetentionBucket,
  type DailyReview,
} from '@/hooks/useAnalytics';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

const PERIOD_OPTIONS = [
  { value: 7,   label: 'Last 7 days' },
  { value: 30,  label: 'Last 30 days' },
  { value: 90,  label: 'Last 90 days' },
  { value: 365, label: 'Last year' },
];

const SCORE_COLORS = {
  excellent: '#52b788',
  good:      '#4f86f7',
  fair:      '#f59e0b',
  needsWork: '#e05252',
};

// ─── Main Export ──────────────────────────────────────────────────────────────

export function StudyAnalytics() {
  const { data, loading, error, refresh, setPeriod, period } = useAnalytics(30);
  const [activeTab, setActiveTab] = useState<'overview' | 'scores' | 'activity' | 'retention' | 'goals'>('overview');

  // Daily-goal config — surfaced here in Analytics because users were
  // confused by the bare "Today's goal X/N" widget in the sidebar.
  const [dailyGoal, setDailyGoal] = useState(20);
  const [goalDraft, setGoalDraft] = useState('20');
  useEffect(() => {
    const g = getGoalPreferences().dailyGoal;
    setDailyGoal(g);
    setGoalDraft(String(g));
  }, []);
  function commitGoal() {
    const n = parseInt(goalDraft, 10);
    if (!Number.isFinite(n) || n < 1) { setGoalDraft(String(dailyGoal)); return; }
    const clamped = Math.min(500, n);
    setDailyGoal(clamped);
    setGoalDraft(String(clamped));
    saveGoalPreferences({ dailyGoal: clamped });
    void fetch('/api/srs/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyGoal: clamped }),
    }).catch(() => {});
  }

  if (loading) return <AnalyticsSkeleton />;
  if (error) return (
    <div className="an-error">
      <span className="an-error-icon">⚠️</span>
      <p>{error}</p>
      <button className="an-retry-btn" onClick={refresh}>Try Again</button>
    </div>
  );
  if (!data) return null;

  const { quizStats, planStats, weakAreas, coachActions, activity, insights, usage, deckStats, weekOverWeek, dailyReviews, retentionByInterval } = data;

  return (
    <div className="an-shell">
      {/* Hero */}
      <section className="an-hero">
        <div>
          <p className="eyebrow">Study Analytics</p>
          <h1>Your Progress</h1>
          <p>Track outcomes, spot weak areas, and see your consistency at a glance.</p>
        </div>
        <div className="an-hero-right">
          <select
            className="period-select"
            value={period}
            onChange={e => setPeriod(Number(e.target.value))}
          >
            {PERIOD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button className="an-refresh-btn" onClick={refresh}>↻ Refresh</button>
        </div>
      </section>

      {/* Daily Goal — config + explanation. Lives here in Analytics
          because the sidebar widget alone left users wondering what
          "Today's goal" was and how to change it. */}
      <section style={{
        background: 'var(--bg-elevated, #fff)',
        border: '1px solid var(--border-subtle, #e2e8f0)',
        borderRadius: 14,
        padding: '18px 22px',
        marginBottom: 18,
        display: 'flex',
        gap: 22,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: '2 1 320px', minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1db88e', marginBottom: 4 }}>
            Daily Goal
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #14161c)', marginBottom: 6, letterSpacing: '-0.01em' }}>
            {(deckStats?.reviewedToday ?? 0)} / {dailyGoal} cards reviewed today
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--text-2, #55595f)', lineHeight: 1.55, margin: 0 }}>
            Counts every flashcard you review across all decks. A practical
            target is 15–30 cards/day for a sustainable habit; bump higher
            if you&apos;re in exam-prep mode. The sidebar progress bar tracks
            this number in real time.
          </p>
        </div>
        <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', minWidth: 200 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2, #55595f)' }}>
            Set your goal
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              min={1}
              max={500}
              value={goalDraft}
              onChange={e => setGoalDraft(e.target.value)}
              onBlur={commitGoal}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
              style={{
                width: 90,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid var(--border-subtle, #cbd5e1)',
                background: 'var(--bg-surface, #fff)',
                color: 'var(--text-primary, #14161c)',
                fontSize: 16,
                fontWeight: 700,
              }}
            />
            <span style={{ fontSize: 13, color: 'var(--text-muted, #94a3b8)', alignSelf: 'center' }}>cards / day</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[10, 20, 30, 50].map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => { setGoalDraft(String(preset)); saveGoalPreferences({ dailyGoal: preset }); setDailyGoal(preset); }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: `1px solid ${dailyGoal === preset ? '#1db88e' : 'var(--border-subtle, #cbd5e1)'}`,
                  background: dailyGoal === preset ? '#1db88e' : 'transparent',
                  color: dailyGoal === preset ? '#fff' : 'var(--text-2, #55595f)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Stats cards */}
      <div className="stats-grid">
        <StatCard
          icon="🔥"
          label="Day Streak"
          value={activity?.currentStreak ?? 0}
          unit="days"
          accent="#e07a52"
          detail={`${activity?.totalActiveDays ?? 0} active days total`}
        />
        <StatCard
          icon="📊"
          label="Avg Score"
          value={`${Math.round(quizStats?.averageScore ?? 0)}%`}
          accent={
            (quizStats?.averageScore ?? 0) >= 80 ? '#52b788' :
            (quizStats?.averageScore ?? 0) >= 60 ? '#4f86f7' : '#e05252'
          }
          detail={weekOverWeek?.weekDelta != null
            ? `${weekOverWeek.weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekOverWeek.weekDelta)}% vs last week`
            : `${quizStats?.totalAttempts ?? 0} quizzes taken`}
        />
        <StatCard
          icon="📝"
          label="Total Quizzes"
          value={quizStats?.totalAttempts ?? 0}
          accent="#4f86f7"
          detail={`${quizStats?.totalQuestions ?? 0} questions answered`}
        />
        <StatCard
          icon="📅"
          label="Plans"
          value={planStats?.activePlans ?? 0}
          accent="#a78bfa"
          detail={`${planStats?.averageProgress ?? 0}% avg progress · ${planStats?.completedPlans ?? 0} completed`}
        />
        <StatCard
          icon="🎯"
          label="Due Today"
          value={deckStats?.dueCardsTotal ?? 0}
          accent={(deckStats?.dueCardsTotal ?? 0) > 20 ? '#e05252' : (deckStats?.dueCardsTotal ?? 0) > 0 ? '#f59e0b' : '#52b788'}
          detail={`${deckStats?.reviewedToday ?? 0}/${deckStats?.dailyGoal ?? 20} reviewed today`}
        />
        <StatCard
          icon="🏆"
          label="Cards Mastered"
          value={deckStats?.cardsMastered ?? 0}
          accent="#52b788"
          detail={`${deckStats?.overallRetention ?? 0}% overall retention`}
        />
        <StatCard
          icon="🃏"
          label="Review Sets"
          value={deckStats?.totalDecks ?? 0}
          accent="#7c3aed"
          detail={`${deckStats?.totalCards ?? 0} total cards · ${usage?.libraryItems ?? 0} library items`}
        />
        <StatCard
          icon="⏱️"
          label="Study Time"
          value={`${Math.round((quizStats?.totalTimeTaken ?? 0) / 60)}m`}
          accent="#f59e0b"
          detail="Total quiz time logged"
        />
      </div>

      {/* Tab navigation */}
      <div className="an-tabs" role="tablist" aria-label="Analytics sections">
        {(['overview', 'scores', 'activity', 'retention', 'goals'] as const).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`an-panel-${tab}`}
            id={`an-tab-${tab}`}
            className={`an-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase()+tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab
          quizStats={quizStats}
          planStats={planStats}
          weakAreas={weakAreas}
          coachActions={coachActions}
          insights={insights}
          usage={usage}
          deckStats={deckStats}
          weekOverWeek={weekOverWeek}
        />
      )}
      {activeTab === 'scores' && (
        <ScoresTab quizStats={quizStats} activity={activity} />
      )}
      {activeTab === 'activity' && (
        <ActivityTab
          activity={activity}
          period={period}
          dailyReviews={dailyReviews ?? []}
        />
      )}
      {activeTab === 'retention' && (
        <RetentionTab
          retentionByInterval={retentionByInterval ?? []}
          deckStats={deckStats}
          activity={activity}
        />
      )}
      {activeTab === 'goals' && (
        <GoalsTab planStats={planStats} weakAreas={weakAreas} deckStats={deckStats} />
      )}

      <style jsx>{`
        .an-shell {
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          max-width: 1200px;
          margin: 0 auto;
        }
        .an-hero {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-4);
          flex-wrap: wrap;
          padding: var(--space-5);
          border: 1px solid var(--border-subtle);
          border-radius: 28px;
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--primary) 14%, transparent), transparent 30%),
            linear-gradient(180deg, var(--bg-elevated), var(--bg-surface));
          box-shadow: var(--shadow-md);
        }
        .eyebrow {
          margin: 0 0 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }
        .an-hero h1 { margin: 0; font-size: clamp(2rem,4vw,3rem); line-height:1; letter-spacing:-0.04em; }
        .an-hero p { margin: 10px 0 0; max-width: 58ch; color: var(--text-muted); line-height:1.7; }
        .an-hero-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .period-select {
          padding: 8px 14px; border-radius: 12px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-primary);
          font-size: 13px; font-weight: 500; cursor: pointer;
        }
        .an-refresh-btn {
          padding: 8px 16px; border-radius: 12px;
          border: 1.5px solid var(--border-subtle);
          background: var(--bg-surface); color: var(--text-secondary);
          font-size: 13px; font-weight: 500; cursor: pointer;
          transition: all 0.15s;
        }
        .an-refresh-btn:hover { border-color: var(--primary); color: var(--primary); }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: var(--space-3);
        }
        .an-tabs {
          display: flex;
          gap: 4px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 4px;
          align-self: flex-start;
          flex-wrap: wrap;
        }
        .an-tab {
          padding: 8px 18px; border-radius: 10px; border: none;
          background: transparent; color: var(--text-secondary);
          font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.12s;
        }
        .an-tab.active { background: var(--primary); color: white; }
        .an-tab:hover:not(.active) { color: var(--text-primary); }
        .an-error {
          display:flex; flex-direction:column; align-items:center; gap:12px;
          padding:80px 40px; color:var(--text-muted); text-align:center;
        }
        .an-error-icon { font-size:32px; }
        .an-retry-btn {
          padding:8px 20px; border-radius:10px; border:1.5px solid var(--border-subtle);
          background:var(--bg-surface); color:var(--text-secondary); cursor:pointer; font-size:14px;
          transition:all 0.12s;
        }
        .an-retry-btn:hover { border-color:var(--primary); color:var(--primary); }
      `}</style>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, unit, accent, detail }: {
  icon: string; label: string; value: number | string; unit?: string; accent: string; detail?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: accent+'20' }}>{icon}</div>
      <div className="stat-body">
        <div className="stat-value" style={{ color: accent }}>
          {value}{unit && <span className="stat-unit">{unit}</span>}
        </div>
        <div className="stat-label">{label}</div>
        {detail && <div className="stat-detail">{detail}</div>}
      </div>
      <style jsx>{`
        .stat-card {
          display:flex; align-items:flex-start; gap:12px;
          padding:16px; border-radius:16px;
          border:1px solid var(--border-subtle);
          background:var(--bg-elevated);
          box-shadow:var(--shadow-sm);
          transition:transform 0.15s, box-shadow 0.15s;
        }
        .stat-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-md); }
        .stat-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
        .stat-body { min-width:0; }
        .stat-value { font-size:24px; font-weight:700; line-height:1; }
        .stat-unit { font-size:13px; font-weight:500; margin-left:3px; }
        .stat-label { font-size:12px; font-weight:600; color:var(--text-secondary); margin-top:4px; }
        .stat-detail { font-size:11px; color:var(--text-muted); margin-top:2px; }
      `}</style>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ quizStats, planStats: _planStats, weakAreas, coachActions, insights, usage, deckStats, weekOverWeek: _weekOverWeek }: {
  quizStats: QuizStats | null;
  planStats: PlanStats | null;
  weakAreas: WeakArea[];
  coachActions: CoachAction[];
  insights: string[];
  usage: UsageStats | null;
  deckStats: DeckStats;
  weekOverWeek?: WeekOverWeek;
}) {
  const dist = quizStats?.scoreDistribution;

  const distData = dist ? [
    { label: 'Excellent (90+)', value: dist.excellent as number, color: SCORE_COLORS.excellent },
    { label: 'Good (70–89)', value: dist.good as number, color: SCORE_COLORS.good },
    { label: 'Fair (50–69)', value: dist.fair as number, color: SCORE_COLORS.fair },
    { label: 'Needs Work (<50)', value: dist.needsWork as number, color: SCORE_COLORS.needsWork },
  ] : [];

  const toolUsage = (usage?.toolUsage ?? {}) as Record<string, number>;
  const toolEntries = Object.entries(toolUsage).sort((a,b) => (b[1] as number)-(a[1] as number)).slice(0,6);
  const maxTool = Math.max(...toolEntries.map(([,v]) => v as number), 1);

  return (
    <div className="ov-grid">
      {/* Score distribution */}
      <div className="an-card wide">
        <h3 className="card-title">Score Distribution</h3>
        {distData.every(d => d.value === 0) ? (
          <p className="card-empty">No quiz data yet. Take a quiz to see your score distribution.</p>
        ) : (
          <div className="dist-rows">
            {distData.map(item => (
              <div key={item.label} className="dist-row">
                <span className="dist-label">{item.label}</span>
                <div className="dist-bar-bg">
                  <div
                    className="dist-bar-fill"
                    style={{
                      width: `${(item.value / Math.max(...distData.map(d=>d.value),1)) * 100}%`,
                      background: item.color,
                    }}
                  />
                </div>
                <span className="dist-count" style={{ color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weak areas */}
      <div className="an-card">
        <h3 className="card-title">Weak Areas</h3>
        {(!weakAreas || weakAreas.length === 0) ? (
          <p className="card-empty">No weak areas detected yet.</p>
        ) : (
          <div className="weak-list">
            {(weakAreas as WeakArea[]).slice(0,5).map((area: WeakArea, i: number) => (
              <div key={i} className="weak-item">
                <div className="weak-header">
                  <span className="weak-topic">{area.topic}</span>
                  <span className="weak-pct" style={{ color: area.accuracy < 50 ? '#e05252' : area.accuracy < 70 ? '#f59e0b' : '#52b788' }}>
                    {Math.round(area.accuracy)}%
                  </span>
                </div>
                <div className="weak-bar-bg">
                  <div
                    className="weak-bar"
                    style={{
                      width: `${area.accuracy}%`,
                      background: area.accuracy < 50 ? '#e05252' : area.accuracy < 70 ? '#f59e0b' : '#52b788',
                    }}
                  />
                </div>
                <p className="weak-suggestion">{area.suggestion}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="an-card">
        <h3 className="card-title">Next Actions</h3>
        {coachActions.length === 0 ? (
          <p className="card-empty">Study a deck, take a quiz, or build a plan to unlock guided next steps here.</p>
        ) : (
          <div className="action-list">
            {coachActions.map((action) => (
              <div key={action.id} className={`action-card ${action.type}`}>
                <div className="action-copy">
                  <span className="action-type">
                    {action.type === 'review' ? 'Review' : action.type === 'practice' ? 'Practice' : 'Plan'}
                  </span>
                  <strong>{action.label}</strong>
                  {action.payload.detail ? <p>{action.payload.detail}</p> : null}
                </div>
                <Link href={action.payload.href || '/analytics'} className="action-link">
                  {action.payload.cta || 'Open'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tool usage */}
      <div className="an-card">
        <h3 className="card-title">Tool Usage</h3>
        {toolEntries.length === 0 ? (
          <p className="card-empty">No tool usage data yet.</p>
        ) : (
          <div className="tool-bars">
            {toolEntries.map(([tool, cnt]) => (
              <div key={tool} className="tool-row">
                <span className="tool-name">{tool}</span>
                <div className="tool-bar-bg">
                  <div className="tool-bar-fill" style={{ width: `${((cnt as number)/maxTool)*100}%` }} />
                </div>
                <span className="tool-count">{cnt as number}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="an-card wide">
        <h3 className="card-title">Review Set Performance</h3>
        {deckStats.topDecks.length === 0 ? (
          <p className="card-empty">No review-set activity yet. Import a set or generate flashcards to start tracking progress.</p>
        ) : (
          <div className="deck-grid-perf">
            {deckStats.topDecks.map((deck) => {
              const accColor = deck.accuracy >= 80 ? '#52b788' : deck.accuracy >= 60 ? '#4f86f7' : '#e05252';
              return (
                <div key={deck.deckId} className="deck-perf-card">
                  <div className="dp-head">
                    <strong className="dp-name">{deck.name}</strong>
                    <div className="dp-badges">
                      {deck.dueCards > 0 && (
                        <span className="dp-badge due">{deck.dueCards} due</span>
                      )}
                      {deck.sourceLabel && (
                        <span className="dp-badge src">{deck.sourceLabel}</span>
                      )}
                    </div>
                  </div>
                  <div className="dp-acc-row">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 70 }}>Accuracy</span>
                    <div className="dp-bar-bg">
                      <div className="dp-bar-fill" style={{ width: `${deck.accuracy}%`, background: accColor }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: accColor, minWidth: 36, textAlign: 'right' }}>{deck.accuracy}%</span>
                  </div>
                  <div className="dp-acc-row">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 70 }}>Today</span>
                    <div className="dp-bar-bg">
                      <div className="dp-bar-fill" style={{ width: `${deck.goalProgress}%`, background: '#7c3aed' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>{deck.reviewedToday}/{deckStats.dailyGoal}</span>
                  </div>
                  <div className="dp-stats">
                    <span>{deck.totalCards} cards</span>
                    <span>{deck.quizAttempts} quizzes</span>
                    <span>{deck.studyDays} study days</span>
                  </div>
                  {deck.weakConcepts.length > 0 && (
                    <div className="dp-weak">
                      <span className="dp-weak-label">Weak:</span>
                      {deck.weakConcepts.slice(0, 2).map((c, i) => (
                        <span key={i} className="dp-weak-chip">{c.length > 22 ? c.slice(0, 22) + '…' : c}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Insights */}
      {insights && insights.length > 0 && (
        <div className="an-card wide insights-card">
          <h3 className="card-title">🤖 AI Insights</h3>
          <ul className="insights-list">
            {insights.map((ins, i) => (
              <li key={i} className="insight-item">{ins}</li>
            ))}
          </ul>
        </div>
      )}

      <style jsx>{`
        .ov-grid { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); }
        .an-card {
          background:var(--bg-elevated); border:1px solid var(--border-subtle);
          border-radius:20px; padding:20px; box-shadow:var(--shadow-sm);
        }
        .an-card.wide { grid-column:1/-1; }
        .card-title { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--text-primary); }
        .card-empty { font-size:13px; color:var(--text-muted); }
        .dist-rows { display:flex; flex-direction:column; gap:10px; }
        .dist-row { display:flex; align-items:center; gap:10px; }
        .dist-label { font-size:12px; color:var(--text-secondary); min-width:140px; }
        .dist-bar-bg { flex:1; height:8px; background:var(--bg-surface); border-radius:4px; overflow:hidden; }
        .dist-bar-fill { height:100%; border-radius:4px; transition:width 0.5s; }
        .dist-count { font-size:13px; font-weight:600; min-width:28px; text-align:right; }
        .weak-list { display:flex; flex-direction:column; gap:12px; }
        .weak-item { }
        .weak-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
        .weak-topic { font-size:13px; font-weight:500; color:var(--text-primary); }
        .weak-pct { font-size:14px; font-weight:700; }
        .weak-bar-bg { height:6px; background:var(--bg-surface); border-radius:3px; overflow:hidden; margin-bottom:4px; }
        .weak-bar { height:100%; border-radius:3px; transition:width 0.5s; }
        .weak-suggestion { font-size:11px; color:var(--text-muted); margin:0; }
        .action-list { display:flex; flex-direction:column; gap:10px; }
        .action-card {
          display:grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-surface) 72%, transparent);
        }
        .action-card.review { border-color: color-mix(in srgb, #f59e0b 26%, var(--border-subtle)); }
        .action-card.practice { border-color: color-mix(in srgb, #4f86f7 26%, var(--border-subtle)); }
        .action-card.plan { border-color: color-mix(in srgb, #7c3aed 26%, var(--border-subtle)); }
        .action-copy { min-width: 0; }
        .action-type {
          display:inline-flex;
          margin-bottom: 6px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .action-copy strong {
          display:block;
          font-size: 13px;
          line-height: 1.45;
          color: var(--text-primary);
        }
        .action-copy p {
          margin: 6px 0 0;
          font-size: 11px;
          line-height: 1.55;
          color: var(--text-muted);
        }
        .action-link {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding: 9px 12px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          white-space: nowrap;
        }
        .action-link:hover { border-color: var(--primary); color: var(--primary); }
        .tool-bars { display:flex; flex-direction:column; gap:8px; }
        .tool-row { display:flex; align-items:center; gap:10px; }
        .tool-name { font-size:12px; color:var(--text-secondary); min-width:80px; text-transform:capitalize; }
        .tool-bar-bg { flex:1; height:8px; background:var(--bg-surface); border-radius:4px; overflow:hidden; }
        .tool-bar-fill { height:100%; border-radius:4px; background:var(--primary); transition:width 0.5s; }
        .tool-count { font-size:12px; font-weight:600; color:var(--text-muted); min-width:24px; text-align:right; }
        .deck-grid-perf { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .deck-perf-card {
          padding: 14px 16px; border-radius: 14px; border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-surface) 74%, transparent);
          display: flex; flex-direction: column; gap: 8px;
        }
        .dp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .dp-name { font-size: 14px; font-weight: 600; color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-badges { display: flex; gap: 4px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        .dp-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; }
        .dp-badge.due { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #b45309; border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent); }
        .dp-badge.src { background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent); }
        .dp-acc-row { display: flex; align-items: center; gap: 8px; }
        .dp-bar-bg { flex: 1; height: 6px; background: var(--bg-surface); border-radius: 3px; overflow: hidden; }
        .dp-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s; }
        .dp-stats { display: flex; gap: 10px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap; }
        .dp-weak { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .dp-weak-label { font-size: 10px; font-weight: 600; color: #e05252; }
        .dp-weak-chip { font-size: 10px; padding: 2px 7px; border-radius: 6px; background: color-mix(in srgb, #e05252 10%, var(--bg-surface)); color: var(--text-secondary); border: 1px solid color-mix(in srgb, #e05252 20%, transparent); }
        .insights-card { background:color-mix(in srgb, var(--primary) 5%, var(--bg-elevated)); }
        .insights-list { margin:0; padding:0 0 0 16px; display:flex; flex-direction:column; gap:6px; }
        .insight-item { font-size:14px; color:var(--text-secondary); line-height:1.6; }
        @media (max-width: 768px) {
          .ov-grid { grid-template-columns:1fr; }
          .action-card { grid-template-columns: 1fr; }
          .action-link { width: 100%; }
        }
      `}</style>
    </div>
  );
}

// ─── Scores Tab ───────────────────────────────────────────────────────────────

function ScoresTab({ quizStats, activity: _activity }: {
  quizStats: QuizStats | null;
  activity: Activity | null;
}) {
  const recentScores = useMemo(() => quizStats?.recentScores ?? [], [quizStats?.recentScores]);
  const byMode = (quizStats?.byMode ?? {}) as Record<string, { attempts: number; avgScore: number; totalQuestions: number }>;

  const chartData = useMemo(() => {
    if (recentScores.length === 0) return [];
    return recentScores.slice(-20).map((s: { score: number; date: string; mode: string }, i: number) => ({
      x: i,
      y: s.score as number,
      date: s.date as string,
      mode: s.mode as string,
    }));
  }, [recentScores]);

  const maxScore = Math.max(...chartData.map((d: { y: number }) => d.y), 100);
  const chartW = 600; const chartH = 200;

  const points = chartData.map((d: { x: number; y: number }, i: number) => {
    const x = chartData.length < 2 ? chartW/2 : (i / (chartData.length-1)) * (chartW - 40) + 20;
    const y = chartH - ((d.y / maxScore) * (chartH - 40)) - 20;
    return `${x},${y}`;
  }).join(' ');

  const pathD = chartData.length < 2 ? '' : chartData.map((d: { x: number; y: number }, i: number) => {
    const x = (i / (chartData.length-1)) * (chartW - 40) + 20;
    const y = chartH - ((d.y / maxScore) * (chartH - 40)) - 20;
    return i === 0 ? `M${x},${y}` : `L${x},${y}`;
  }).join(' ');

  // Moving average (5-point)
  const movAvg = chartData.map((_: unknown, i: number) => {
    const window = chartData.slice(Math.max(0, i-2), i+3);
    const avg = window.reduce((s: number, d: { y: number }) => s + d.y, 0) / window.length;
    const x = chartData.length < 2 ? chartW/2 : (i / (chartData.length-1)) * (chartW - 40) + 20;
    const y = chartH - ((avg / maxScore) * (chartH - 40)) - 20;
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');

  const modeEntries = Object.entries(byMode).sort((a,b) => b[1].avgScore - a[1].avgScore);

  return (
    <div className="sc-grid">
      {/* Line chart with moving avg */}
      <div className="an-card wide">
        <div className="chart-header">
          <h3 className="card-title" style={{ margin: 0 }}>Score Trend (Last 20 Quizzes)</h3>
          <div className="chart-legend">
            <span className="leg-item"><span className="leg-dot" style={{ background: 'var(--primary)' }} />Score</span>
            <span className="leg-item"><span className="leg-dot" style={{ background: '#f59e0b', opacity: 0.8 }} />Avg trend</span>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="card-empty" style={{ marginTop: 16 }}>No quiz scores yet. Complete some quizzes to see your trend.</p>
        ) : (
          <div className="chart-wrap">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="score-chart"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Quiz score trend over the last ${chartData.length} attempts`}
            >
              <title>Quiz score trend</title>
              {[0,25,50,75,100].map(pct => {
                const cy = chartH - ((pct/100) * (chartH-40)) - 20;
                return (
                  <g key={pct}>
                    <line x1={20} y1={cy} x2={chartW-20} y2={cy} stroke="var(--border-subtle)" strokeWidth={1} />
                    <text x={16} y={cy+4} fontSize={9} fill="var(--text-muted)" textAnchor="end">{pct}</text>
                  </g>
                );
              })}
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {pathD && (
                <path d={`${pathD} L${(chartW-40)+20},${chartH} L20,${chartH} Z`} fill="url(#scoreGrad)" />
              )}
              {pathD && (
                <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {/* Moving average line */}
              {chartData.length >= 3 && (
                <path d={movAvg} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" opacity={0.7} />
              )}
              {chartData.map((d: { x: number; y: number; date: string; mode: string }, i: number) => {
                const x = chartData.length < 2 ? chartW/2 : (i / (chartData.length-1)) * (chartW-40) + 20;
                const y = chartH - ((d.y / maxScore) * (chartH-40)) - 20;
                const dotColor = d.y >= 80 ? '#52b788' : d.y >= 60 ? '#4f86f7' : '#e05252';
                return (
                  <circle key={i} cx={x} cy={y} r={4} fill={dotColor} stroke="var(--bg-elevated)" strokeWidth={2}>
                    <title>{d.date}: {d.y}% ({d.mode})</title>
                  </circle>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Score by mode */}
      <div className="an-card">
        <h3 className="card-title">Score by Tool</h3>
        {modeEntries.length === 0 ? (
          <p className="card-empty">No mode data yet.</p>
        ) : (
          <div className="mode-list">
            {modeEntries.map(([mode, stats]: [string, { attempts: number; avgScore: number; totalQuestions: number }]) => (
              <div key={mode} className="mode-row">
                <div className="mode-header">
                  <span className="mode-name">{mode}</span>
                  <span className="mode-avg" style={{ color: stats.avgScore >= 80 ? '#52b788' : stats.avgScore >= 60 ? '#4f86f7' : '#e05252' }}>
                    {Math.round(stats.avgScore)}%
                  </span>
                </div>
                <div className="mode-bar-bg">
                  <div
                    className="mode-bar-fill"
                    style={{
                      width: `${stats.avgScore}%`,
                      background: stats.avgScore >= 80 ? '#52b788' : stats.avgScore >= 60 ? '#4f86f7' : '#e05252',
                    }}
                  />
                </div>
                <span className="mode-meta">{stats.attempts} attempts · {stats.totalQuestions} questions</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent attempts */}
      <div className="an-card">
        <h3 className="card-title">Recent Attempts</h3>
        {recentScores.length === 0 ? (
          <p className="card-empty">No recent attempts.</p>
        ) : (
          <div className="recent-list">
            {recentScores.slice(-10).reverse().map((s: { score: number; date: string; mode: string }, i: number) => (
              <div key={i} className="recent-item">
                <div className="recent-dot" style={{
                  background: s.score >= 80 ? '#52b788' : s.score >= 60 ? '#4f86f7' : '#e05252'
                }} />
                <div className="recent-info">
                  <span className="recent-mode">{s.mode}</span>
                  <span className="recent-date">{s.date}</span>
                </div>
                <span className="recent-score" style={{
                  color: s.score >= 80 ? '#52b788' : s.score >= 60 ? '#4f86f7' : '#e05252'
                }}>{s.score}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .sc-grid { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); }
        .an-card { background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:20px; padding:20px; box-shadow:var(--shadow-sm); }
        .an-card.wide { grid-column:1/-1; }
        .chart-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
        .chart-legend { display:flex; gap:12px; }
        .leg-item { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-muted); }
        .leg-dot { width:10px; height:3px; border-radius:2px; display:inline-block; }
        .card-title { margin:0 0 16px; font-size:15px; font-weight:600; }
        .card-empty { font-size:13px; color:var(--text-muted); }
        .chart-wrap { width:100%; overflow:hidden; }
        .score-chart { width:100%; height:200px; display:block; }
        .mode-list { display:flex; flex-direction:column; gap:12px; }
        .mode-row { }
        .mode-header { display:flex; justify-content:space-between; margin-bottom:4px; }
        .mode-name { font-size:13px; font-weight:500; color:var(--text-primary); text-transform:capitalize; }
        .mode-avg { font-size:14px; font-weight:700; }
        .mode-bar-bg { height:8px; background:var(--bg-surface); border-radius:4px; overflow:hidden; margin-bottom:3px; }
        .mode-bar-fill { height:100%; border-radius:4px; transition:width 0.5s; }
        .mode-meta { font-size:11px; color:var(--text-muted); }
        .recent-list { display:flex; flex-direction:column; gap:6px; }
        .recent-item { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border-subtle); }
        .recent-item:last-child { border-bottom:none; }
        .recent-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
        .recent-info { flex:1; min-width:0; }
        .recent-mode { display:block; font-size:13px; font-weight:500; color:var(--text-primary); text-transform:capitalize; }
        .recent-date { display:block; font-size:11px; color:var(--text-muted); }
        .recent-score { font-size:15px; font-weight:700; flex-shrink:0; }
        @media (max-width:768px) { .sc-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab({ activity, period: _period, dailyReviews }: {
  activity: Activity | null;
  period: number;
  dailyReviews: DailyReview[];
}) {
  const daily = useMemo(() => activity?.dailyActivity ?? [], [activity?.dailyActivity]);
  const weekly = useMemo(() => activity?.weeklyActivity ?? [], [activity?.weeklyActivity]);

  // Build proper aligned heatmap (Mon–Sun rows, weeks as columns)
  const today = new Date();
  const heatmapData = useMemo(() => {
    // Go back 15 weeks (105 days), then pad start to Monday
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 14 * 7);
    // Align to Monday
    const dayOfWeek = (startDate.getDay() + 6) % 7; // 0=Mon
    startDate.setDate(startDate.getDate() - dayOfWeek);

    const result: { date: string; quizzes: number; reviews: number; active: boolean }[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const ds = toDateStr(cur);
      const quizDay = (daily as { date: string; quizzes: number }[]).find(x => x.date === ds);
      const reviewDay = dailyReviews.find(r => r.date === ds);
      const quizzes = quizDay?.quizzes ?? 0;
      const reviews = reviewDay?.reviews ?? 0;
      result.push({ date: ds, quizzes, reviews, active: quizzes > 0 || reviews > 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, dailyReviews]);

  const maxActivity = Math.max(...heatmapData.map(d => d.quizzes + d.reviews), 1);

  // Combined daily chart (last 30 days)
  const combinedDaily = useMemo(() => {
    const last30 = daily.slice(-30) as { date: string; quizzes: number; avgScore: number }[];
    return last30.map(d => {
      const revDay = dailyReviews.find(r => r.date === d.date);
      return {
        date: d.date,
        quizzes: d.quizzes,
        reviews: revDay?.reviews ?? 0,
        score: d.avgScore,
      };
    });
  }, [daily, dailyReviews]);

  const maxCombined = Math.max(...combinedDaily.map(d => d.quizzes + d.reviews), 1);
  const maxW = Math.max(...(weekly as { quizzes: number }[]).map((w: { quizzes: number }) => w.quizzes), 1);

  // Group heatmap into weeks (columns)
  const weeks: typeof heatmapData[] = [];
  for (let i = 0; i < heatmapData.length; i += 7) {
    weeks.push(heatmapData.slice(i, i + 7));
  }

  return (
    <div className="act-grid">
      {/* Contribution heatmap — GitHub style */}
      <div className="an-card wide">
        <div className="chart-header">
          <h3 className="card-title" style={{ margin: 0 }}>Activity Heatmap (Last 14 Weeks)</h3>
          <div className="hmap-legend">
            <span className="hmap-leg-txt">Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <div key={v} className="hmap-leg-cell" style={{
                background: v === 0 ? 'var(--bg-surface)' : `color-mix(in srgb, var(--primary) ${Math.round(v * 100)}%, var(--bg-surface))`
              }} />
            ))}
            <span className="hmap-leg-txt">More</span>
          </div>
        </div>
        <div className="heatmap-container">
          <div className="hmap-day-labels">
            {['Mon','','Wed','','Fri','','Sun'].map((d, i) => (
              <span key={i} className="hmap-day-label">{d}</span>
            ))}
          </div>
          <div className="hmap-weeks">
            {weeks.map((week, wi) => (
              <div key={wi} className="hmap-week-col">
                {week.map((day, di) => {
                  const total = day.quizzes + day.reviews;
                  const intensity = total === 0 ? 0 : Math.max(0.2, total / maxActivity);
                  const isToday = day.date === toDateStr(today);
                  return (
                    <div
                      key={di}
                      className={`hmap-cell${isToday ? ' today' : ''}${day.active ? ' active' : ''}`}
                      style={{
                        background: total === 0
                          ? 'var(--bg-surface)'
                          : `color-mix(in srgb, var(--primary) ${Math.round(intensity * 100)}%, var(--bg-surface))`,
                      }}
                      title={`${day.date}: ${day.quizzes} quiz${day.quizzes !== 1 ? 'zes' : ''}, ${day.reviews} reviews`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Combined daily activity chart */}
      <div className="an-card wide">
        <h3 className="card-title">Daily Study Activity (Last 30 Days)</h3>
        {combinedDaily.length === 0 ? (
          <p className="card-empty">No activity data yet.</p>
        ) : (
          <div className="combined-chart">
            <div className="combined-bars">
              {combinedDaily.map((d, i) => (
                <div key={i} className="cb-col" title={`${d.date}\n${d.quizzes} quizzes, ${d.reviews} reviews`}>
                  <div className="cb-stack">
                    {d.reviews > 0 && (
                      <div
                        className="cb-reviews"
                        style={{ height: `${(d.reviews / maxCombined) * 100}%` }}
                      />
                    )}
                    {d.quizzes > 0 && (
                      <div
                        className="cb-quizzes"
                        style={{ height: `${(d.quizzes / maxCombined) * 100}%` }}
                      />
                    )}
                    {d.quizzes === 0 && d.reviews === 0 && (
                      <div className="cb-empty" />
                    )}
                  </div>
                  {/* Show date label every 5 days */}
                  {i % 5 === 0 && (
                    <span className="cb-label">{d.date.slice(5)}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="combined-legend">
              <span className="cleg-item"><span className="cleg-dot quizzes" />Quizzes</span>
              <span className="cleg-item"><span className="cleg-dot reviews" />Deck Reviews</span>
            </div>
          </div>
        )}
      </div>

      {/* Weekly bar chart */}
      <div className="an-card">
        <h3 className="card-title">Weekly Activity</h3>
        {weekly.length === 0 ? (
          <p className="card-empty">No weekly data yet.</p>
        ) : (
          <div className="weekly-bars">
            {(weekly as { week: string; quizzes: number; avgScore: number }[]).slice(-8).map((w: { week: string; quizzes: number; avgScore: number }, i: number) => (
              <div key={i} className="wb-col">
                <div className="wb-bar-wrap">
                  <div
                    className="wb-bar"
                    style={{ height: `${(w.quizzes/maxW)*120}px` }}
                    title={`${w.week}: ${w.quizzes} quizzes · avg ${w.avgScore}%`}
                  />
                </div>
                <span className="wb-label">{w.week?.slice(5) ?? ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Streak info */}
      <div className="an-card streak-card">
        <h3 className="card-title">Streak Details</h3>
        <div className="streak-nums">
          <div className="streak-block">
            <span className="streak-val" style={{ color: '#e07a52' }}>🔥 {activity?.currentStreak ?? 0}</span>
            <span className="streak-lbl">Current Streak</span>
          </div>
          <div className="streak-block">
            <span className="streak-val" style={{ color: '#4f86f7' }}>📅 {activity?.totalActiveDays ?? 0}</span>
            <span className="streak-lbl">Total Active Days</span>
          </div>
        </div>
        {/* Streak bar (last 14 days) */}
        <div className="streak-dots">
          {Array.from({ length: 14 }).map((_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (13 - i));
            const ds = toDateStr(d);
            const active = daily.some((x: { date: string }) => x.date === ds && (x as { date: string; quizzes: number }).quizzes > 0)
              || dailyReviews.some(r => r.date === ds && r.reviews > 0);
            return (
              <div
                key={i}
                className={`streak-dot${active ? ' active' : ''}`}
                title={ds}
              />
            );
          })}
        </div>
        <p className="streak-tip">
          {(activity?.currentStreak ?? 0) === 0
            ? "Start studying today to begin your streak!"
            : (activity?.currentStreak ?? 0) < 7
              ? `Keep going! ${7-(activity?.currentStreak??0)} more days to a week-long streak.`
              : `Impressive! You've been studying for ${activity?.currentStreak} days straight.`}
        </p>
      </div>

      <style jsx>{`
        .act-grid { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); }
        .an-card { background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:20px; padding:20px; box-shadow:var(--shadow-sm); }
        .an-card.wide { grid-column:1/-1; }
        .chart-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; flex-wrap:wrap; gap:8px; }
        .card-title { margin:0 0 16px; font-size:15px; font-weight:600; }
        .card-empty { font-size:13px; color:var(--text-muted); }

        /* Heatmap */
        .heatmap-container { display:flex; gap:6px; align-items:flex-start; overflow-x:auto; }
        .hmap-day-labels { display:flex; flex-direction:column; gap:2px; padding-top:2px; }
        .hmap-day-label { font-size:10px; color:var(--text-muted); height:14px; line-height:14px; width:24px; }
        .hmap-weeks { display:flex; gap:2px; }
        .hmap-week-col { display:flex; flex-direction:column; gap:2px; }
        .hmap-cell {
          width: 13px; height: 13px; border-radius: 3px; cursor: default;
          transition: transform 0.1s, outline 0.1s;
        }
        .hmap-cell:hover { transform:scale(1.3); z-index:1; position:relative; }
        .hmap-cell.today { outline:2px solid var(--primary); outline-offset:1px; }
        .hmap-legend { display:flex; align-items:center; gap:4px; }
        .hmap-leg-txt { font-size:10px; color:var(--text-muted); }
        .hmap-leg-cell { width:13px; height:13px; border-radius:2px; }

        /* Combined daily chart */
        .combined-chart { display:flex; flex-direction:column; gap:8px; }
        .combined-bars { display:flex; align-items:flex-end; gap:1.5px; height:120px; padding-bottom:4px; }
        .cb-col { display:flex; flex-direction:column; align-items:center; flex:1; height:100%; justify-content:flex-end; position:relative; }
        .cb-stack { display:flex; flex-direction:column; justify-content:flex-end; width:100%; height:100%; gap:0; }
        .cb-reviews { width:100%; background:#7c3aed; border-radius:2px 2px 0 0; min-height:2px; transition:height 0.4s; }
        .cb-quizzes { width:100%; background:var(--primary); min-height:2px; transition:height 0.4s; }
        .cb-empty { width:100%; height:2px; background:var(--bg-surface); border-radius:2px; }
        .cb-label { font-size:9px; color:var(--text-muted); position:absolute; bottom:-16px; white-space:nowrap; }
        .combined-legend { display:flex; gap:16px; padding-top:12px; }
        .cleg-item { display:flex; align-items:center; gap:5px; font-size:11px; color:var(--text-muted); }
        .cleg-dot { width:10px; height:10px; border-radius:2px; display:inline-block; }
        .cleg-dot.quizzes { background:var(--primary); }
        .cleg-dot.reviews { background:#7c3aed; }

        /* Weekly bars */
        .weekly-bars { display:flex; align-items:flex-end; gap:8px; padding-top:8px; height:160px; }
        .wb-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end; }
        .wb-bar-wrap { display:flex; align-items:flex-end; height:120px; width:100%; }
        .wb-bar { width:100%; background:var(--primary); border-radius:4px 4px 0 0; min-height:3px; transition:height 0.5s; }
        .wb-label { font-size:10px; color:var(--text-muted); text-align:center; }

        /* Streak */
        .streak-nums { display:flex; gap:24px; margin-bottom:12px; }
        .streak-block { display:flex; flex-direction:column; gap:4px; }
        .streak-val { font-size:28px; font-weight:700; }
        .streak-lbl { font-size:12px; color:var(--text-secondary); }
        .streak-dots { display:flex; gap:5px; margin-bottom:12px; }
        .streak-dot { width:20px; height:20px; border-radius:5px; background:var(--bg-surface); border:1.5px solid var(--border-subtle); transition:background 0.2s; }
        .streak-dot.active { background:var(--primary); border-color:var(--primary); }
        .streak-tip { font-size:13px; color:var(--text-muted); margin:0; line-height:1.6; }
        @media (max-width:768px) { .act-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}

// ─── Retention Tab ────────────────────────────────────────────────────────────

function RetentionTab({ retentionByInterval, deckStats, activity }: {
  retentionByInterval: RetentionBucket[];
  deckStats: DeckStats;
  activity: Activity | null;
}) {
  const overallRetention = Number.isFinite(deckStats?.overallRetention) ? deckStats.overallRetention : 0;
  const cardsMastered = Number.isFinite(deckStats?.cardsMastered) ? deckStats.cardsMastered : 0;
  const totalCards = Number.isFinite(deckStats?.totalCards) ? deckStats.totalCards : 0;
  const dueCardsTotal = Number.isFinite(deckStats?.dueCardsTotal) ? deckStats.dueCardsTotal : 0;
  const reviewedToday = Number.isFinite(deckStats?.reviewedToday) ? deckStats.reviewedToday : 0;
  const dailyGoal = Number.isFinite(deckStats?.dailyGoal) ? deckStats.dailyGoal : 20;
  const cardsStillLearning = Math.max(0, totalCards - cardsMastered);
  const hasData = retentionByInterval.some(b => b.cardCount > 0);
  const maxCards = Math.max(...retentionByInterval.map(b => b.cardCount), 1);

  return (
    <div className="ret-grid">
      {/* Retention curve */}
      <div className="an-card wide">
        <div className="chart-header">
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>SRS Retention Curve</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              How well you recall cards at different spaced repetition stages
            </p>
          </div>
          <div className="ret-legend">
            <span className="ret-leg">
              <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'var(--primary)', marginRight:5 }} />
              Retention %
            </span>
            <span className="ret-leg">
              <span style={{ display:'inline-block', width:12, height:12, borderRadius:3, background:'var(--border-subtle)', marginRight:5 }} />
              Card count
            </span>
          </div>
        </div>
        {!hasData ? (
          <div className="ret-empty">
            <p>📚 No SRS review data yet.</p>
            <p>Create or import a deck and start reviewing cards to see your retention curve.</p>
          </div>
        ) : (
          <div className="ret-chart">
            {/* SVG retention curve */}
            <div className="ret-bars">
              {retentionByInterval.map((bucket, i) => {
                const retention = bucket.retention ?? 0;
                const retColor = retention >= 90 ? '#52b788'
                  : retention >= 75 ? '#4f86f7'
                  : retention >= 60 ? '#f59e0b'
                  : '#e05252';
                const cardBarH = Math.round((bucket.cardCount / maxCards) * 60);
                return (
                  <div key={i} className="ret-col">
                    <div className="ret-val-label" style={{ color: bucket.retention === null ? 'var(--text-muted)' : retColor }}>
                      {bucket.retention === null ? '—' : `${bucket.retention}%`}
                    </div>
                    <div className="ret-bar-area">
                      {bucket.retention !== null && (
                        <div
                          className="ret-bar"
                          style={{
                            height: `${Math.max(4, (retention / 100) * 120)}px`,
                            background: `linear-gradient(180deg, ${retColor}cc, ${retColor}66)`,
                            borderColor: retColor,
                          }}
                        />
                      )}
                    </div>
                    {/* Card count bar (behind, grey) */}
                    <div className="ret-count-bar" style={{ height: `${cardBarH}px` }} />
                    <div className="ret-bucket-label">{bucket.label}</div>
                    <div className="ret-card-count">{bucket.cardCount} cards</div>
                  </div>
                );
              })}
            </div>
            {/* Horizontal guide at 80% (ideal retention) */}
            <div className="ret-ideal-line">
              <span>80% ideal</span>
            </div>
          </div>
        )}
      </div>

      {/* SRS summary cards */}
      <div className="an-card">
        <h3 className="card-title">Retention Summary</h3>
        <div className="ret-summary">
          <div className="rsum-row">
            <span className="rsum-label">Overall Retention</span>
            <span className="rsum-val" style={{
              color: overallRetention >= 80 ? '#52b788'
                : overallRetention >= 60 ? '#4f86f7' : '#e05252'
            }}>
              {overallRetention}%
            </span>
          </div>
          <div className="rsum-bar-bg">
            <div className="rsum-bar-fill" style={{
              width: `${overallRetention}%`,
              background: overallRetention >= 80 ? '#52b788'
                : overallRetention >= 60 ? '#4f86f7' : '#e05252'
            }} />
          </div>
          <p className="rsum-note">
            {overallRetention >= 85
              ? 'Excellent! Your recall is above the 85% ideal threshold.'
              : overallRetention >= 70
                ? 'Good retention. Review cards more frequently to reach 85%.'
                : 'Focus on daily reviews to improve retention.'}
          </p>

          <div className="rsum-stats">
            <div className="rsum-stat">
              <span className="rstat-num">{cardsMastered}</span>
              <span className="rstat-desc">Cards mastered (21d+ interval)</span>
            </div>
            <div className="rsum-stat">
              <span className="rstat-num">{cardsStillLearning}</span>
              <span className="rstat-desc">Still learning</span>
            </div>
            <div className="rsum-stat">
              <span className="rstat-num">{dueCardsTotal}</span>
              <span className="rstat-desc">Due for review today</span>
            </div>
            <div className="rsum-stat">
              <span className="rstat-num">{reviewedToday}</span>
              <span className="rstat-desc">Reviewed today</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mastery breakdown donut */}
      <div className="an-card">
        <h3 className="card-title">Card Mastery Breakdown</h3>
        {totalCards === 0 ? (
          <p className="card-empty">No cards yet.</p>
        ) : (() => {
          const mastered = cardsMastered;
          const total = totalCards;
          const learning = cardsStillLearning;
          const masteredPct = Math.round((mastered / total) * 100);
          const r = 60; const circ = 2 * Math.PI * r;
          const masteredOffset = circ - (masteredPct / 100) * circ;
          return (
            <div className="mastery-wrap">
              <svg
                width={160}
                height={160}
                viewBox="0 0 160 160"
                role="img"
                aria-label={`${masteredPct} percent of cards mastered: ${mastered} of ${total}`}
              >
                <title>Card mastery progress</title>
                <circle cx={80} cy={80} r={r} fill="none" stroke="var(--bg-surface)" strokeWidth={18} />
                <circle
                  cx={80} cy={80} r={r} fill="none"
                  stroke="#52b788" strokeWidth={18}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={masteredOffset}
                  transform="rotate(-90 80 80)"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x={80} y={76} textAnchor="middle" fontSize={22} fontWeight={700} fill="#52b788">{masteredPct}%</text>
                <text x={80} y={94} textAnchor="middle" fontSize={11} fill="var(--text-muted)">mastered</text>
              </svg>
              <div className="mastery-legend">
                <div className="mleg-item">
                  <span className="mleg-dot" style={{ background: '#52b788' }} />
                  <span>{mastered} Mastered</span>
                </div>
                <div className="mleg-item">
                  <span className="mleg-dot" style={{ background: 'var(--border-subtle)' }} />
                  <span>{learning} Learning</span>
                </div>
              </div>
            </div>
          );
        })()}
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'color-mix(in srgb, var(--primary) 6%, var(--bg-surface))' }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Daily streak: <strong style={{ color: 'var(--text-primary)' }}>{activity?.currentStreak ?? 0} days</strong>
            {' '}· Reviewed today: <strong style={{ color: 'var(--text-primary)' }}>{reviewedToday}/{dailyGoal}</strong> cards
          </p>
        </div>
      </div>

      <style jsx>{`
        .ret-grid { display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3); }
        .an-card { background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:20px; padding:20px; box-shadow:var(--shadow-sm); }
        .an-card.wide { grid-column:1/-1; }
        .chart-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:20px; flex-wrap:wrap; gap:8px; }
        .card-title { margin:0 0 16px; font-size:15px; font-weight:600; }
        .card-empty { font-size:13px; color:var(--text-muted); }
        .ret-legend { display:flex; gap:12px; font-size:11px; color:var(--text-muted); align-items:center; flex-wrap:wrap; }
        .ret-leg { display:flex; align-items:center; }
        .ret-empty { text-align:center; padding:40px 20px; }
        .ret-empty p { margin:4px 0; font-size:13px; color:var(--text-muted); }
        .ret-chart { position:relative; }
        .ret-bars { display:flex; gap:8px; align-items:flex-end; height:200px; padding-bottom:48px; position:relative; }
        .ret-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; height:100%; justify-content:flex-end; position:relative; }
        .ret-val-label { font-size:13px; font-weight:700; position:absolute; top:0; }
        .ret-bar-area { width:100%; display:flex; align-items:flex-end; justify-content:center; height:130px; }
        .ret-bar {
          width:70%; border-radius:6px 6px 0 0;
          border:1px solid transparent;
          transition:height 0.6s ease;
        }
        .ret-count-bar {
          width:100%; background:var(--border-subtle); border-radius:2px;
          position:absolute; bottom:40px; left:0; transition:height 0.4s;
          opacity:0.4;
        }
        .ret-bucket-label { position:absolute; bottom:22px; font-size:11px; font-weight:600; color:var(--text-secondary); text-align:center; width:100%; }
        .ret-card-count { position:absolute; bottom:6px; font-size:10px; color:var(--text-muted); text-align:center; width:100%; }
        .ret-ideal-line {
          position:absolute; top:calc(20% + 30px); left:0; right:0;
          border-top:1.5px dashed #52b78860;
          display:flex; align-items:center; justify-content:flex-end;
          padding-right:8px;
        }
        .ret-ideal-line span { font-size:10px; color:#52b788; background:var(--bg-elevated); padding:0 4px; }

        /* Summary */
        .ret-summary { display:flex; flex-direction:column; gap:12px; }
        .rsum-row { display:flex; justify-content:space-between; align-items:baseline; }
        .rsum-label { font-size:13px; color:var(--text-secondary); }
        .rsum-val { font-size:22px; font-weight:700; }
        .rsum-bar-bg { height:8px; background:var(--bg-surface); border-radius:4px; overflow:hidden; }
        .rsum-bar-fill { height:100%; border-radius:4px; transition:width 0.5s; }
        .rsum-note { font-size:12px; color:var(--text-muted); margin:0; line-height:1.6; }
        .rsum-stats { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px; }
        .rsum-stat { }
        .rstat-num { display:block; font-size:22px; font-weight:700; color:var(--text-primary); }
        .rstat-desc { font-size:11px; color:var(--text-muted); }

        /* Donut */
        .mastery-wrap { display:flex; align-items:center; gap:20px; }
        .mastery-legend { display:flex; flex-direction:column; gap:8px; }
        .mleg-item { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-secondary); }
        .mleg-dot { width:12px; height:12px; border-radius:3px; flex-shrink:0; }

        @media (max-width:768px) { .ret-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}

// ─── Goals Tab ────────────────────────────────────────────────────────────────

function GoalsTab({ planStats, weakAreas, deckStats }: {
  planStats: PlanStats | null;
  weakAreas: WeakArea[];
  deckStats: DeckStats;
}) {
  const progress = planStats?.averageProgress ?? 0;
  const completedDays = planStats?.completedDays ?? 0;
  const totalDays = planStats?.totalStudyDays ?? 0;
  const activePlans = planStats?.activePlans ?? 0;
  const completedPlans = planStats?.completedPlans ?? 0;
  const totalPlans = planStats?.totalPlans ?? 0;

  const r = 72; const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  const progressColor = progress >= 80 ? '#52b788' : progress >= 50 ? '#4f86f7' : '#f59e0b';

  return (
    <div className="goals-grid">
      {/* Ring progress */}
      <div className="an-card ring-card">
        <h3 className="card-title">Overall Study Progress</h3>
        <div className="ring-wrap">
          <svg
            width={180}
            height={180}
            viewBox="0 0 180 180"
            role="img"
            aria-label={`Overall study progress: ${progress} percent`}
          >
            <title>Overall study progress</title>
            <circle cx={90} cy={90} r={r} fill="none" stroke="var(--bg-surface)" strokeWidth={14} />
            <circle
              cx={90} cy={90} r={r} fill="none"
              stroke={progressColor} strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              transform="rotate(-90 90 90)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            <text x={90} y={86} textAnchor="middle" fontSize={28} fontWeight={700} fill={progressColor}>{Math.round(progress)}%</text>
            <text x={90} y={104} textAnchor="middle" fontSize={12} fill="var(--text-muted)">complete</text>
          </svg>
          <div className="ring-stats">
            <div className="rstat">
              <span className="rstat-v">{completedDays}</span>
              <span className="rstat-l">Days done</span>
            </div>
            <div className="rstat">
              <span className="rstat-v">{totalDays}</span>
              <span className="rstat-l">Total days</span>
            </div>
            <div className="rstat">
              <span className="rstat-v">{activePlans}</span>
              <span className="rstat-l">Active plans</span>
            </div>
            <div className="rstat">
              <span className="rstat-v">{completedPlans}</span>
              <span className="rstat-l">Completed</span>
            </div>
          </div>
        </div>
        {totalPlans === 0 && (
          <p className="card-empty" style={{ marginTop: 12 }}>
            No study plans yet. Create one in the Planner to track your goals.
          </p>
        )}
      </div>

      {/* Improvement roadmap */}
      <div className="an-card">
        <h3 className="card-title">Improvement Roadmap</h3>
        {(!weakAreas || weakAreas.length === 0) ? (
          <p className="card-empty">You have no weak areas! Keep up the great work.</p>
        ) : (
          <div className="roadmap-list">
            {(weakAreas as WeakArea[]).slice(0,5).map((area: WeakArea, i: number) => (
              <div key={i} className="roadmap-item">
                <div className="roadmap-num" style={{ background: `hsl(${220+i*30},70%,60%)` }}>{i+1}</div>
                <div className="roadmap-body">
                  <span className="roadmap-topic">{area.topic}</span>
                  <span className="roadmap-time">~{area.estimatedMinutes} min to review</span>
                  <span className="roadmap-tip">{area.suggestion}</span>
                </div>
                <div className="roadmap-acc" style={{ color: area.accuracy < 50 ? '#e05252' : area.accuracy < 70 ? '#f59e0b' : '#52b788' }}>
                  {Math.round(area.accuracy)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="an-card">
        <h3 className="card-title">Review Set Goal Progress</h3>
        {deckStats.topDecks.length === 0 ? (
          <p className="card-empty">No review-set goal data yet. Review a set to start building daily progress.</p>
        ) : (
          <div className="goal-list">
            {deckStats.topDecks.slice(0, 5).map((deck) => (
              <div key={deck.deckId} className="goal-row">
                <div className="goal-header">
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{deck.name}</span>
                  <strong>{deck.reviewedToday}/{deckStats.dailyGoal}</strong>
                </div>
                <div className="goal-bar-bg">
                  <div className="goal-bar-fill" style={{ width: `${deck.goalProgress}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .goals-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:var(--space-3); }
        .an-card { background:var(--bg-elevated); border:1px solid var(--border-subtle); border-radius:20px; padding:20px; box-shadow:var(--shadow-sm); }
        .card-title { margin:0 0 16px; font-size:15px; font-weight:600; }
        .card-empty { font-size:13px; color:var(--text-muted); margin:0; }
        .ring-card { }
        .ring-wrap { display:flex; align-items:center; gap:24px; flex-wrap:wrap; }
        .ring-stats { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .rstat { display:flex; flex-direction:column; gap:2px; }
        .rstat-v { font-size:22px; font-weight:700; color:var(--text-primary); }
        .rstat-l { font-size:11px; color:var(--text-muted); }
        .roadmap-list { display:flex; flex-direction:column; gap:12px; }
        .roadmap-item { display:flex; align-items:flex-start; gap:12px; }
        .roadmap-num { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:white; flex-shrink:0; }
        .roadmap-body { flex:1; min-width:0; }
        .roadmap-topic { display:block; font-size:13px; font-weight:600; color:var(--text-primary); }
        .roadmap-time { display:block; font-size:11px; color:var(--text-muted); margin:1px 0; }
        .roadmap-tip { display:block; font-size:12px; color:var(--text-secondary); line-height:1.5; }
        .roadmap-acc { font-size:14px; font-weight:700; flex-shrink:0; }
        .goal-list { display:flex; flex-direction:column; gap:12px; }
        .goal-row { display:grid; gap:6px; }
        .goal-header { display:flex; justify-content:space-between; gap:10px; font-size:12px; color:var(--text-secondary); }
        .goal-header strong { color:var(--text-primary); }
        .goal-bar-bg { height:8px; background:var(--bg-surface); border-radius:999px; overflow:hidden; }
        .goal-bar-fill { height:100%; border-radius:999px; background:#7c3aed; transition:width 0.4s ease; }
        @media (max-width:900px) { .goals-grid { grid-template-columns:1fr 1fr; } }
        @media (max-width:600px) { .goals-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function AnalyticsSkeleton() {
  return (
    <div className="an-skel">
      <div className="skel-hero" />
      <div className="skel-cards">
        {Array.from({length:6}).map((_,i) => <div key={i} className="skel-card" />)}
      </div>
      <div className="skel-tabs" />
      <div className="skel-main" />
      <style jsx>{`
        .an-skel { padding:var(--space-4); display:flex; flex-direction:column; gap:var(--space-3); }
        .skel-hero { height:120px; border-radius:28px; background:var(--bg-elevated); animation:shimmer 1.5s infinite; }
        .skel-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:var(--space-3); }
        .skel-card { height:90px; border-radius:16px; background:var(--bg-elevated); animation:shimmer 1.5s infinite; }
        .skel-tabs { height:48px; width:400px; border-radius:14px; background:var(--bg-elevated); animation:shimmer 1.5s infinite; }
        .skel-main { height:300px; border-radius:20px; background:var(--bg-elevated); animation:shimmer 1.5s infinite; }
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
