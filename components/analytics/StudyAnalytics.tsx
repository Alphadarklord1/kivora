'use client';

import { useState, useMemo } from 'react';
import {
  useAnalytics,
  type DeckStats,
  type QuizStats,
  type PlanStats,
  type WeakArea,
  type Activity,
  type UsageStats,
  type WeekOverWeek,
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
  const [activeTab, setActiveTab] = useState<'overview' | 'scores' | 'activity' | 'goals'>('overview');

  if (loading) return <AnalyticsSkeleton />;
  if (error) return (
    <div className="an-error">
      <span className="an-error-icon">⚠️</span>
      <p>{error}</p>
      <button className="an-retry-btn" onClick={refresh}>Try Again</button>
    </div>
  );
  if (!data) return null;

  const { quizStats, planStats, weakAreas, activity, insights, usage, deckStats, weekOverWeek } = data;

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
          label="Decks"
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
      <div className="an-tabs">
        {(['overview', 'scores', 'activity', 'goals'] as const).map(tab => (
          <button
            key={tab}
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
        <ActivityTab activity={activity} period={period} />
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
        }
        .an-tab {
          padding: 8px 20px; border-radius: 10px; border: none;
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

function OverviewTab({ quizStats, planStats: _planStats, weakAreas, insights, usage, deckStats, weekOverWeek: _weekOverWeek }: {
  quizStats: QuizStats | null;
  planStats: PlanStats | null;
  weakAreas: WeakArea[];
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
        <h3 className="card-title">Deck Performance</h3>
        {deckStats.topDecks.length === 0 ? (
          <p className="card-empty">No deck activity yet. Import a deck or generate flashcards to start tracking progress.</p>
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
                  {/* Accuracy bar */}
                  <div className="dp-acc-row">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 70 }}>Accuracy</span>
                    <div className="dp-bar-bg">
                      <div className="dp-bar-fill" style={{ width: `${deck.accuracy}%`, background: accColor }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: accColor, minWidth: 36, textAlign: 'right' }}>{deck.accuracy}%</span>
                  </div>
                  {/* Goal progress */}
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
        @media (max-width: 768px) { .ov-grid { grid-template-columns:1fr; } }
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

  // Build score line chart data from recent scores
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

  const modeEntries = Object.entries(byMode).sort((a,b) => b[1].avgScore - a[1].avgScore);

  return (
    <div className="sc-grid">
      {/* Line chart */}
      <div className="an-card wide">
        <h3 className="card-title">Score Trend (Last 20 Quizzes)</h3>
        {chartData.length === 0 ? (
          <p className="card-empty">No quiz scores yet. Complete some quizzes to see your trend.</p>
        ) : (
          <div className="chart-wrap">
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="score-chart" preserveAspectRatio="none">
              {/* Grid lines */}
              {[0,25,50,75,100].map(pct => {
                const cy = chartH - ((pct/100) * (chartH-40)) - 20;
                return (
                  <g key={pct}>
                    <line x1={20} y1={cy} x2={chartW-20} y2={cy} stroke="var(--border-subtle)" strokeWidth={1} />
                    <text x={16} y={cy+4} fontSize={9} fill="var(--text-muted)" textAnchor="end">{pct}</text>
                  </g>
                );
              })}
              {/* Gradient fill */}
              <defs>
                <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              {pathD && (
                <path d={`${pathD} L${(chartW-40)+20},${chartH} L20,${chartH} Z`} fill="url(#scoreGrad)" />
              )}
              {pathD && (
                <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              )}
              {/* Dots */}
              {chartData.map((d: { x: number; y: number; date: string; mode: string }, i: number) => {
                const x = chartData.length < 2 ? chartW/2 : (i / (chartData.length-1)) * (chartW-40) + 20;
                const y = chartH - ((d.y / maxScore) * (chartH-40)) - 20;
                return (
                  <circle key={i} cx={x} cy={y} r={4} fill="var(--primary)" stroke="var(--bg-elevated)" strokeWidth={2}>
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
            {recentScores.slice(-8).reverse().map((s: { score: number; date: string; mode: string }, i: number) => (
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
        .recent-list { display:flex; flex-direction:column; gap:8px; }
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

function ActivityTab({ activity, period: _period }: {
  activity: Activity | null;
  period: number;
}) {
  const daily = activity?.dailyActivity ?? [];
  const weekly = activity?.weeklyActivity ?? [];

  // Build a 12-week heatmap
  const today = new Date();
  const heatmapDays = useMemo(() => {
    const days: { date: string; quizzes: number }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate()-i);
      const ds = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
      const found = (daily as { date: string; quizzes: number }[]).find((x: { date: string }) => x.date === ds);
      days.push({ date: ds, quizzes: found?.quizzes ?? 0 });
    }
    return days;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily]);

  const maxQ = Math.max(...heatmapDays.map((d: { quizzes: number }) => d.quizzes), 1);

  // Weekly bar chart
  const maxW = Math.max(...(weekly as { quizzes: number }[]).map((w: { quizzes: number }) => w.quizzes), 1);

  return (
    <div className="act-grid">
      {/* Activity heatmap */}
      <div className="an-card wide">
        <h3 className="card-title">Activity Heatmap (Last 12 Weeks)</h3>
        <div className="heatmap-wrap">
          <div className="heatmap">
            {heatmapDays.map((day, i) => {
              const intensity = day.quizzes === 0 ? 0 : Math.max(0.15, day.quizzes / maxQ);
              const isToday = day.date === toDateStr(today);
              return (
                <div
                  key={i}
                  className={`hmap-cell${isToday ? ' today' : ''}`}
                  style={{
                    background: day.quizzes === 0
                      ? 'var(--bg-surface)'
                      : `color-mix(in srgb, var(--primary) ${Math.round(intensity*100)}%, var(--bg-surface))`,
                  }}
                  title={`${day.date}: ${day.quizzes} quiz${day.quizzes!==1?'zes':''}`}
                />
              );
            })}
          </div>
          <div className="hmap-legend">
            <span className="hmap-leg-txt">Less</span>
            {[0,0.25,0.5,0.75,1].map(v => (
              <div key={v} className="hmap-leg-cell" style={{
                background: v === 0 ? 'var(--bg-surface)' : `color-mix(in srgb, var(--primary) ${Math.round(v*100)}%, var(--bg-surface))`
              }} />
            ))}
            <span className="hmap-leg-txt">More</span>
          </div>
        </div>
      </div>

      {/* Weekly bar chart */}
      <div className="an-card">
        <h3 className="card-title">Weekly Activity</h3>
        {weekly.length === 0 ? (
          <p className="card-empty">No weekly data yet.</p>
        ) : (
          <div className="weekly-bars">
            {(weekly as { week: string; quizzes: number; avgScore: number }[]).slice(-8).map((w: { week: string; quizzes: number }, i: number) => (
              <div key={i} className="wb-col">
                <div className="wb-bar-wrap">
                  <div
                    className="wb-bar"
                    style={{ height: `${(w.quizzes/maxW)*120}px` }}
                    title={`${w.week}: ${w.quizzes} quizzes`}
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
        .card-title { margin:0 0 16px; font-size:15px; font-weight:600; }
        .card-empty { font-size:13px; color:var(--text-muted); }
        .heatmap-wrap { display:flex; flex-direction:column; gap:8px; }
        .heatmap { display:grid; grid-template-columns:repeat(12,1fr); grid-template-rows:repeat(7,1fr); gap:3px; }
        .hmap-cell { aspect-ratio:1; border-radius:3px; cursor:default; transition:transform 0.1s; }
        .hmap-cell:hover { transform:scale(1.3); z-index:1; }
        .hmap-cell.today { outline:2px solid var(--primary); outline-offset:1px; }
        .hmap-legend { display:flex; align-items:center; gap:4px; }
        .hmap-leg-txt { font-size:10px; color:var(--text-muted); }
        .hmap-leg-cell { width:12px; height:12px; border-radius:2px; }
        .weekly-bars { display:flex; align-items:flex-end; gap:8px; padding-top:8px; height:160px; }
        .wb-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end; }
        .wb-bar-wrap { display:flex; align-items:flex-end; height:120px; width:100%; }
        .wb-bar { width:100%; background:var(--primary); border-radius:4px 4px 0 0; min-height:3px; transition:height 0.5s; }
        .wb-label { font-size:10px; color:var(--text-muted); text-align:center; }
        .streak-card { }
        .streak-nums { display:flex; gap:24px; margin-bottom:12px; }
        .streak-block { display:flex; flex-direction:column; gap:4px; }
        .streak-val { font-size:28px; font-weight:700; }
        .streak-lbl { font-size:12px; color:var(--text-secondary); }
        .streak-tip { font-size:13px; color:var(--text-muted); margin:0; line-height:1.6; }
        @media (max-width:768px) { .act-grid { grid-template-columns:1fr; } }
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

  // Circumference for SVG ring
  const r = 72; const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;

  const progressColor = progress >= 80 ? '#52b788' : progress >= 50 ? '#4f86f7' : '#f59e0b';

  return (
    <div className="goals-grid">
      {/* Ring progress */}
      <div className="an-card ring-card">
        <h3 className="card-title">Overall Study Progress</h3>
        <div className="ring-wrap">
          <svg width={180} height={180} viewBox="0 0 180 180">
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
        <h3 className="card-title">Deck Goal Progress</h3>
        {deckStats.topDecks.length === 0 ? (
          <p className="card-empty">No deck goal data yet. Review a deck to start building daily progress.</p>
        ) : (
          <div className="goal-list">
            {deckStats.topDecks.slice(0, 4).map((deck) => (
              <div key={deck.deckId} className="goal-row">
                <div className="goal-header">
                  <span>{deck.name}</span>
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
        @media (max-width:768px) { .goals-grid { grid-template-columns:1fr; } }
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
        .skel-tabs { height:48px; width:300px; border-radius:14px; background:var(--bg-elevated); animation:shimmer 1.5s infinite; }
        .skel-main { height:300px; border-radius:20px; background:var(--bg-elevated); animation:shimmer 1.5s infinite; }
        @keyframes shimmer { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}
