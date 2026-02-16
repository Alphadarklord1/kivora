'use client';

import { useRouter } from 'next/navigation';
import { useAnalytics } from '@/hooks/useAnalytics';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { generateStudySchedule, type StudyTopic } from '@/lib/planner/generate';
import { useI18n } from '@/lib/i18n/useI18n';

const PERIOD_OPTIONS = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 365, label: 'Last year' },
];

type DailyPoint = { date: string; quizzes: number; avgScore: number };

export function StudyAnalytics() {
  const { t, locale } = useI18n({
    'Last 7 days': 'آخر 7 أيام',
    'Last 30 days': 'آخر 30 يومًا',
    'Last 90 days': 'آخر 90 يومًا',
    'Last year': 'آخر سنة',
    'Failed to load analytics': 'فشل تحميل التحليلات',
    'Try Again': 'حاول مرة أخرى',
    'Study Analytics': 'تحليلات الدراسة',
    'Track outcomes, identify weak spots, and improve consistency with AI guidance.': 'تتبّع النتائج، وحدد نقاط الضعف، وحسّن الاستمرارية بإرشاد الذكاء الاصطناعي.',
    'AI-powered insights': 'رؤى مدعومة بالذكاء الاصطناعي',
    Range: 'النطاق',
    'Export PDF': 'تصدير PDF',
    'Export CSV': 'تصدير CSV',
    'Share Snapshot': 'مشاركة اللقطة',
    'AI Study Advisor': 'مستشار الدراسة الذكي',
    'Adaptive recommendations': 'توصيات تكيفية',
    'Generate Plan': 'توليد خطة',
    'Review Weak Areas': 'مراجعة نقاط الضعف',
    'Average Score': 'متوسط الدرجة',
    'Across all attempts': 'عبر جميع المحاولات',
    'Average score across selected period': 'متوسط الدرجة خلال الفترة المحددة',
    'Total Quizzes': 'إجمالي الاختبارات',
    'Attempts completed': 'المحاولات المكتملة',
    'Total quiz attempts in selected period': 'إجمالي محاولات الاختبار في الفترة المحددة',
    'Study Streak': 'سلسلة الدراسة',
    'Consecutive days': 'أيام متتالية',
    'Current consecutive active-study days': 'عدد الأيام المتتالية النشطة حاليًا',
    'Tools Used': 'الأدوات المستخدمة',
    'No usage yet': 'لا يوجد استخدام بعد',
    'Distinct tools used this period': 'عدد الأدوات المختلفة المستخدمة في هذه الفترة',
    'Active Study Plan': 'الخطة الدراسية النشطة',
    'Plans currently marked active': 'الخطط المصنفة نشطة حاليًا',
    'Quiz Performance': 'أداء الاختبارات',
    'Easy Signal': 'إشارة السهل',
    'Medium Signal': 'إشارة المتوسط',
    'Hard Signal': 'إشارة الصعب',
    'Tool Usage': 'استخدام الأدوات',
    'Most used: {tool}': 'الأكثر استخدامًا: {tool}',
    'No tool activity yet.': 'لا يوجد نشاط أدوات بعد.',
    'Performance Trend': 'اتجاه الأداء',
    'Score trend': 'اتجاه الدرجات',
    Attempts: 'المحاولات',
    'Areas to Improve': 'المجالات التي تحتاج تحسين',
    'Generate Practice': 'توليد تدريب',
    'No weak areas identified yet. Keep practicing to get targeted coaching.': 'لم يتم تحديد نقاط ضعف بعد. واصل التدريب للحصول على توجيه أدق.',
    'Study Plan Analytics': 'تحليلات خطة الدراسة',
    'Completion Rate': 'معدل الإكمال',
    'Avg Study Time': 'متوسط وقت الدراسة',
    'Consistency Score': 'درجة الاستمرارية',
    'Completed Days': 'الأيام المكتملة',
    'Weekly Activity Heatmap': 'خريطة حرارة النشاط الأسبوعي',
    Low: 'منخفض',
    High: 'مرتفع',
    'Recent Quiz Scores': 'درجات الاختبارات الأخيرة',
    'Study Analytics Snapshot': 'لقطة تحليلات الدراسة',
    'Average score: {value}%': 'متوسط الدرجة: {value}%',
    'Total quizzes: {value}': 'إجمالي الاختبارات: {value}',
    'Current streak: {value} day(s)': 'السلسلة الحالية: {value} يوم',
    'Most used tool: {value}': 'الأداة الأكثر استخدامًا: {value}',
    'Consistency score: {value}%': 'درجة الاستمرارية: {value}%',
    General: 'عام',
    'Could not generate plan. Please try again.': 'تعذر توليد الخطة. يرجى المحاولة مرة أخرى.',
    'No AI insights yet. Complete a few more quizzes to unlock adaptive guidance.': 'لا توجد رؤى ذكاء اصطناعي بعد. أكمل بعض الاختبارات الإضافية لفتح التوجيه التكيفي.',
    'Top: {tool}': 'الأعلى: {tool}',
    'total plans': 'إجمالي الخطط',
    'Showing fallback analytics due to a temporary data issue.': 'يتم عرض تحليلات احتياطية بسبب مشكلة مؤقتة في البيانات.',
  });
  const router = useRouter();
  const { data, loading, error, refresh, setPeriod, period } = useAnalytics(30);
  const periodOptions = PERIOD_OPTIONS.map((option) => ({ ...option, label: t(option.label) }));

  if (loading) {
    return (
      <div className="analytics-skeleton">
        <div className="skeleton-hero">
          <SkeletonCard />
        </div>
        <div className="skeleton-stats">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="skeleton-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <style jsx>{`
          .analytics-skeleton {
            display: grid;
            gap: var(--space-4);
            padding: var(--space-4);
          }

          .skeleton-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: var(--space-3);
          }

          .skeleton-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: var(--space-4);
          }

          @media (max-width: 980px) {
            .skeleton-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-error">
        <p>{t('Failed to load analytics')}</p>
        <button className="btn" onClick={refresh}>{t('Try Again')}</button>
        <style jsx>{`
          .analytics-error {
            text-align: center;
            padding: var(--space-8);
            color: var(--error);
            display: grid;
            gap: var(--space-3);
            justify-items: center;
          }
        `}</style>
      </div>
    );
  }

  if (!data) return null;

  const { quizStats, planStats, weakAreas, activity, insights, usage } = data;

  const dailySeries: DailyPoint[] = activity.dailyActivity && activity.dailyActivity.length > 0
    ? activity.dailyActivity
    : [];

  const toolUsageEntries = Object.entries(usage.toolUsage);
  const maxToolCount = Math.max(1, ...toolUsageEntries.map(([, count]) => count));
  const totalToolHits = Math.max(1, toolUsageEntries.reduce((sum, [, count]) => sum + count, 0));
  const mostUsedTool = toolUsageEntries[0]?.[0] || 'none';

  const completionRate =
    planStats.totalStudyDays > 0
      ? Math.round((planStats.completedDays / planStats.totalStudyDays) * 100)
      : planStats.totalPlans > 0
        ? Math.round((planStats.completedPlans / planStats.totalPlans) * 100)
        : 0;

  const avgStudyMinutes =
    quizStats.totalAttempts > 0 ? Math.max(0, Math.round(quizStats.totalTimeTaken / quizStats.totalAttempts / 60)) : 0;

  const consistencyScore = Math.min(
    100,
    Math.round((activity.totalActiveDays / Math.max(period, 1)) * 65 + (Math.min(activity.currentStreak, 14) / 14) * 35)
  );

  const chronologicalScores = [...quizStats.recentScores].reverse().map((item) => item.score);

  const trendSeries = dailySeries.length > 0
    ? dailySeries
    : quizStats.recentScores
        .slice()
        .reverse()
        .map((item) => ({ date: item.date, quizzes: 1, avgScore: item.score }));

  const trendTail = trendSeries.slice(-Math.min(60, trendSeries.length));
  const trendLine = buildLinePoints(
    trendTail.map((point) => point.avgScore),
    760,
    220,
    20,
    0,
    100
  );
  const maxAttempts = Math.max(1, ...trendTail.map((point) => point.quizzes));
  const improvement = getImprovement(chronologicalScores);

  const easySignal = Math.round(
    ((quizStats.scoreDistribution.excellent + quizStats.scoreDistribution.good) / Math.max(quizStats.totalAttempts, 1)) * 100
  );
  const mediumSignal = Math.round((quizStats.scoreDistribution.fair / Math.max(quizStats.totalAttempts, 1)) * 100);
  const hardSignal = Math.round((quizStats.scoreDistribution.needsWork / Math.max(quizStats.totalAttempts, 1)) * 100);

  const heatmapWeeks = buildHeatmapWeeks(dailySeries);
  const maxHeat = Math.max(1, ...dailySeries.map((d) => d.quizzes));

  const aiInsights = insights.length > 0
    ? insights
    : [t('No AI insights yet. Complete a few more quizzes to unlock adaptive guidance.')];

  const exportCsv = () => {
    const rows: string[][] = [
      ['Metric', 'Value'],
      [t('Average Score'), `${quizStats.averageScore}%`],
      [t('Total Quizzes'), `${quizStats.totalAttempts}`],
      ['Current Streak', `${activity.currentStreak}`],
      [t('Tools Used'), `${toolUsageEntries.length}`],
      ['Active Plans', `${planStats.activePlans}`],
      [t('Completion Rate'), `${completionRate}%`],
      [t('Consistency Score'), `${consistencyScore}%`],
      ['Average Study Minutes', `${avgStudyMinutes}`],
      ['Most Used Tool', formatMode(mostUsedTool, t)],
      ['---', '---'],
      ['Weak Area', 'Accuracy'],
      ...weakAreas.map((item) => [item.topic, `${item.accuracy}%`]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    window.print();
  };

  const shareSnapshot = async () => {
    const snapshot = [
      `${t('Study Analytics')} (${period}d)`,
      t('Average score: {value}%', { value: quizStats.averageScore }),
      t('Total quizzes: {value}', { value: quizStats.totalAttempts }),
      t('Current streak: {value} day(s)', { value: activity.currentStreak }),
      t('Most used tool: {value}', { value: formatMode(mostUsedTool, t) }),
      t('Consistency score: {value}%', { value: consistencyScore }),
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: t('Study Analytics Snapshot'),
          text: snapshot,
        });
        return;
      } catch {
        // no-op
      }
    }

    await navigator.clipboard.writeText(snapshot);
  };

  const scrollToWeakAreas = () => {
    const node = document.getElementById('weak-areas-card');
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const generateCoachPlan = async (topic: string, minutes: number, difficulty: 'easy' | 'medium' | 'hard') => {
    const examDate = new Date();
    examDate.setDate(examDate.getDate() + 7);
    const normalizedDifficulty: StudyTopic['difficulty'] =
      difficulty === 'hard' ? 4 : difficulty === 'medium' ? 3 : 2;

    const topics: StudyTopic[] = [
      {
        name: topic,
        difficulty: normalizedDifficulty,
        estimatedHours: Math.max(1, Math.round((minutes * 4) / 60)),
        completed: false,
      },
    ];
    const schedule = generateStudySchedule(examDate, topics, minutes);

    const res = await fetch('/api/study-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: `Coach: ${topic} (${minutes}-min)`,
        examDate: examDate.toISOString(),
        dailyMinutes: minutes,
        topics,
        schedule,
        source: 'coach',
        coachContext: { topic, minutes, difficulty },
      }),
    });

    if (res.ok) {
      router.push('/planner');
    } else {
      window.alert(t('Could not generate plan. Please try again.'));
    }
  };

  const onCoachAction = async () => {
    const planAction = data.coachActions?.find((action) => action.type === 'plan');
    if (!planAction) {
      router.push('/planner');
      return;
    }
    const topic = planAction.payload.topic || 'General';
    const minutes = Number(planAction.payload.minutes || '20');
    const difficulty = (planAction.payload.difficulty || 'medium') as 'easy' | 'medium' | 'hard';
    await generateCoachPlan(topic, minutes, difficulty);
  };

  return (
    <div className="study-analytics">
      <section className="analytics-header">
        <div className="header-copy">
          <h1>{t('Study Analytics')}</h1>
          <p>{t('Track outcomes, identify weak spots, and improve consistency with AI guidance.')}</p>
          <span className="ai-badge">{t('AI-powered insights')}</span>
        </div>
        <div className="header-controls">
          <label className="period">
            <span>{t('Range')}</span>
            <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button className="analytics-btn ghost" onClick={exportPdf}>{t('Export PDF')}</button>
          <button className="analytics-btn ghost" onClick={exportCsv}>{t('Export CSV')}</button>
          <button className="analytics-btn ghost" onClick={shareSnapshot}>{t('Share Snapshot')}</button>
        </div>
      </section>

      {data.fallback && (
        <div className="fallback-banner">{t('Showing fallback analytics due to a temporary data issue.')}</div>
      )}

      <section className="ai-hero">
        <div className="ai-hero-head">
          <h2>🧠 {t('AI Study Advisor')}</h2>
          <span className="accent-pill">{t('Adaptive recommendations')}</span>
        </div>
        <ul>
          {aiInsights.slice(0, 3).map((insight, index) => (
            <li key={index}>{insight}</li>
          ))}
        </ul>
        <div className="hero-actions">
          <button className="analytics-btn primary" onClick={onCoachAction}>
            {t('Generate Plan')}
          </button>
          <button className="analytics-btn ghost" onClick={scrollToWeakAreas}>
            {t('Review Weak Areas')}
          </button>
        </div>
      </section>

      <section className="kpi-row">
        {[
          { label: t('Average Score'), value: `${quizStats.averageScore}%`, hint: t('Across all attempts'), tooltip: t('Average score across selected period') },
          { label: t('Total Quizzes'), value: `${quizStats.totalAttempts}`, hint: t('Attempts completed'), tooltip: t('Total quiz attempts in selected period') },
          { label: t('Study Streak'), value: `${activity.currentStreak}`, hint: t('Consecutive days'), tooltip: t('Current consecutive active-study days') },
          { label: t('Tools Used'), value: `${toolUsageEntries.length}`, hint: mostUsedTool === 'none' ? t('No usage yet') : t('Top: {tool}', { tool: formatMode(mostUsedTool, t) }), tooltip: t('Distinct tools used this period') },
          { label: t('Active Study Plan'), value: `${planStats.activePlans}`, hint: `${planStats.totalPlans} ${t('total plans')}`, tooltip: t('Plans currently marked active') },
        ].map((metric) => (
          <article key={metric.label} className="metric-card" title={metric.tooltip}>
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-value">{metric.value}</strong>
            <span className="metric-hint">{metric.hint}</span>
          </article>
        ))}
      </section>

      <section className="analytics-grid top">
        <article className="analytics-card performance">
          <h3>{t('Quiz Performance')}</h3>
          <div className="performance-grid">
            <div className="score-hero">
              <div className="score-main">{quizStats.averageScore}%</div>
              <div className={`trend-chip ${improvement >= 0 ? 'up' : 'down'}`}>
                {improvement >= 0 ? '↑' : '↓'} {Math.abs(improvement)}%
              </div>
              <svg viewBox="0 0 220 70" className="sparkline" role="img" aria-label={t('Score trend')}>
                <polyline points={buildLinePoints(chronologicalScores.length ? chronologicalScores : [0], 220, 70, 6, 0, 100)} />
              </svg>
            </div>
            <div className="difficulty-signal">
              {[
                { label: t('Easy Signal'), value: easySignal, tone: 'good' as const },
                { label: t('Medium Signal'), value: mediumSignal, tone: 'fair' as const },
                { label: t('Hard Signal'), value: hardSignal, tone: 'needs-work' as const },
              ].map((item) => (
                <div key={item.label} className="difficulty-row" title={`${item.label}: ${item.value}%`}>
                  <span className="difficulty-label">{item.label}</span>
                  <div className="difficulty-track">
                    <div className={`difficulty-fill ${item.tone}`} style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />
                  </div>
                  <strong className="difficulty-value">{item.value}%</strong>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="analytics-card tool-usage-card">
          <div className="card-head">
            <h3>{t('Tool Usage')}</h3>
            <span className="mini-badge">{t('Most used: {tool}', { tool: formatMode(mostUsedTool, t) })}</span>
          </div>
          {toolUsageEntries.length === 0 ? (
            <p className="muted">{t('No tool activity yet.')}</p>
          ) : (
            <div className="tool-usage-list">
              {toolUsageEntries.slice(0, 7).map(([tool, count]) => {
                const width = Math.round((count / maxToolCount) * 100);
                const percent = Math.round((count / totalToolHits) * 100);
                return (
                  <div key={tool} className="tool-row" title={`${formatMode(tool, t)}: ${count} uses`}>
                    <div className="tool-label">
                      <span className="tool-icon">{getToolIcon(tool)}</span>
                      <span>{formatMode(tool, t)}</span>
                    </div>
                    <div className="tool-bar">
                      <div className="tool-bar-fill" style={{ width: `${width}%` }} />
                    </div>
                    <span className="tool-percent">{percent}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="analytics-grid middle">
        <article className="analytics-card trend-card">
          <h3>{t('Performance Trend')}</h3>
          <div className="trend-chart-wrap">
            <svg viewBox="0 0 760 220" className="trend-chart" role="img" aria-label={`${t('Score trend')} + ${t('Attempts')}`}>
              <line x1="20" y1="20" x2="740" y2="20" className="guide-line" />
              <line x1="20" y1="110" x2="740" y2="110" className="guide-line" />
              <line x1="20" y1="200" x2="740" y2="200" className="guide-line" />
              {trendTail.map((point, index) => {
                const spacing = trendTail.length > 1 ? (720 / (trendTail.length - 1)) : 0;
                const x = 20 + index * spacing;
                const barHeight = Math.round((point.quizzes / maxAttempts) * 58);
                return (
                  <rect
                    key={`${point.date}-${index}`}
                    x={x - 3}
                    y={200 - barHeight}
                    width="6"
                    height={Math.max(2, barHeight)}
                    className="attempt-bar"
                  />
                );
              })}
              <polyline points={trendLine} className="score-line" />
            </svg>
          </div>
          <div className="trend-legend">
            <span><i className="legend score" /> {t('Score trend')}</span>
            <span><i className="legend attempts" /> {t('Attempts')}</span>
          </div>
        </article>

        <article id="weak-areas-card" className="analytics-card weak-areas-card">
          <h3>{t('Areas to Improve')}</h3>
          {weakAreas.length > 0 ? (
            <div className="weak-areas-list">
              {weakAreas.slice(0, 4).map((area, index) => (
                <div key={`${area.topic}-${index}`} className="weak-item">
                  <div className="weak-head">
                    <strong>{area.topic}</strong>
                    <span className={`score-pill ${getScoreClass(area.accuracy)}`}>{area.accuracy}%</span>
                  </div>
                  <p>{area.suggestion}</p>
                  <div className="weak-actions">
                    <button
                      className="analytics-btn ghost small"
                      onClick={() => router.push(`/tools?topic=${encodeURIComponent(area.topic)}`)}
                    >
                      {t('Generate Practice')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t('No weak areas identified yet. Keep practicing to get targeted coaching.')}</p>
          )}
        </article>
      </section>

      <section className="analytics-grid bottom">
        <article className="analytics-card plan-card">
          <h3>{t('Study Plan Analytics')}</h3>
          <div className="plan-kpis">
            <div className="plan-kpi">
              <span>{t('Completion Rate')}</span>
              <strong>{completionRate}%</strong>
            </div>
            <div className="plan-kpi">
              <span>{t('Avg Study Time')}</span>
              <strong>{avgStudyMinutes} min</strong>
            </div>
            <div className="plan-kpi">
              <span>{t('Consistency Score')}</span>
              <strong>{consistencyScore}%</strong>
            </div>
          </div>
          <div className="plan-progress">
            <div className="progress-head">
              <span>{t('Completed Days')}</span>
              <span>{planStats.completedDays} / {Math.max(planStats.totalStudyDays, 0)}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        </article>

        <article className="analytics-card heatmap-card">
          <h3>{t('Weekly Activity Heatmap')}</h3>
          <div className="heatmap-scroll">
            <div className="heatmap-grid">
              {heatmapWeeks.map((week, weekIndex) => (
                <div key={weekIndex} className="heatmap-week">
                  {week.map((day, dayIndex) => {
                    if (!day) return <span key={`${weekIndex}-${dayIndex}`} className="heat-cell empty" />;
                    const intensity = getIntensity(day.quizzes, maxHeat);
                    return (
                      <span
                        key={`${day.date}-${dayIndex}`}
                        className={`heat-cell i${intensity}`}
                        title={`${formatFullDate(day.date, locale)} • ${day.quizzes} activity`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="heatmap-legend">
            <span>{t('Low')}</span>
            <div className="legend-scale">
              <i className="heat-cell i0" />
              <i className="heat-cell i1" />
              <i className="heat-cell i2" />
              <i className="heat-cell i3" />
              <i className="heat-cell i4" />
            </div>
            <span>{t('High')}</span>
          </div>
        </article>
      </section>

      {quizStats.recentScores.length > 0 && (
        <section className="analytics-card recent-card">
          <h3>{t('Recent Quiz Scores')}</h3>
          <div className="recent-scores">
            {quizStats.recentScores.slice(0, 10).map((score, index) => (
              <div key={`${score.date}-${score.mode}-${index}`} className="recent-item">
                <div className="ring" style={{ background: `conic-gradient(var(--primary) ${score.score}%, var(--bg-inset) 0)` }}>
                  <span>{score.score}%</span>
                </div>
                <div className="recent-meta">
                  <strong>{formatMode(score.mode, t)}</strong>
                  <span>{formatShortDate(score.date, locale)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <style jsx>{`
        .study-analytics {
          display: grid;
          gap: var(--space-6);
          padding: var(--space-4);
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: var(--space-4);
          flex-wrap: wrap;
        }

        .fallback-banner {
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid color-mix(in srgb, var(--warning) 35%, var(--border-default));
          background: var(--warning-muted);
          color: var(--warning);
          font-size: var(--font-meta);
        }

        .header-copy h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 36px);
          font-weight: 700;
          letter-spacing: var(--letter-tight);
        }

        .header-copy p {
          margin: var(--space-2) 0 0;
          color: var(--text-muted);
          font-size: var(--font-body);
          max-width: 62ch;
        }

        .ai-badge {
          display: inline-flex;
          margin-top: var(--space-2);
          padding: 4px 10px;
          border: 1px solid color-mix(in srgb, var(--primary) 35%, var(--border-default));
          border-radius: var(--radius-full);
          background: color-mix(in srgb, var(--primary-muted) 45%, transparent);
          color: var(--primary);
          font-size: var(--font-tiny);
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .header-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: var(--space-2);
        }

        .period {
          display: grid;
          gap: 4px;
          min-width: 170px;
        }

        .period span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          letter-spacing: 0.05em;
          text-transform: uppercase;
          font-weight: 600;
        }

        .period select {
          height: 36px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: var(--font-meta);
        }

        .ai-hero,
        .analytics-card {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }

        .ai-hero:hover,
        .analytics-card:hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
          border-color: var(--border-default);
        }

        .ai-hero {
          padding: var(--space-5);
          border-left: 3px solid color-mix(in srgb, var(--primary) 60%, var(--border-default));
        }

        .ai-hero-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-3);
          margin-bottom: var(--space-3);
          flex-wrap: wrap;
        }

        .ai-hero h2 {
          margin: 0;
          font-size: var(--font-lg);
        }

        .accent-pill {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full);
          padding: 3px 10px;
          white-space: nowrap;
        }

        .ai-hero ul {
          margin: 0;
          padding-left: var(--space-4);
          display: grid;
          gap: var(--space-2);
        }

        .ai-hero li {
          color: var(--text-secondary);
          font-size: var(--font-body);
          line-height: 1.5;
        }

        .hero-actions {
          margin-top: var(--space-4);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .kpi-row {
          display: grid;
          gap: var(--space-3);
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        }

        .metric-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: var(--space-4);
          display: grid;
          gap: var(--space-2);
          transition: transform 0.2s ease, border-color 0.2s ease;
        }

        .metric-card:hover {
          transform: translateY(-1px);
          border-color: var(--border-default);
        }

        .metric-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }

        .metric-value {
          font-size: clamp(24px, 3vw, 34px);
          font-weight: 700;
          line-height: 1;
        }

        .metric-hint {
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }

        .analytics-grid {
          display: grid;
          gap: var(--space-4);
        }

        .analytics-grid.top {
          grid-template-columns: 1.3fr 1fr;
        }

        .analytics-grid.middle {
          grid-template-columns: 1.3fr 1fr;
        }

        .analytics-grid.bottom {
          grid-template-columns: 1fr 1fr;
        }

        @media (max-width: 1080px) {
          .analytics-grid.top,
          .analytics-grid.middle,
          .analytics-grid.bottom {
            grid-template-columns: 1fr;
          }
        }

        .analytics-card {
          padding: var(--space-4);
        }

        .analytics-card h3 {
          margin: 0 0 var(--space-3);
          font-size: var(--font-section);
          font-weight: 600;
        }

        .performance-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
          align-items: center;
        }

        @media (max-width: 780px) {
          .performance-grid {
            grid-template-columns: 1fr;
          }
        }

        .score-hero {
          display: grid;
          gap: var(--space-2);
          align-content: center;
        }

        .score-main {
          font-size: clamp(34px, 6vw, 56px);
          font-weight: 700;
          line-height: 1;
        }

        .trend-chip {
          display: inline-flex;
          width: fit-content;
          padding: 4px 8px;
          border-radius: var(--radius-full);
          font-size: var(--font-tiny);
          font-weight: 700;
        }

        .trend-chip.up {
          color: var(--success);
          background: color-mix(in srgb, var(--success) 18%, transparent);
        }

        .trend-chip.down {
          color: var(--error);
          background: color-mix(in srgb, var(--error) 16%, transparent);
        }

        .sparkline {
          width: 100%;
          max-width: 260px;
          height: 72px;
        }

        .sparkline polyline {
          fill: none;
          stroke: var(--primary);
          stroke-width: 2.5;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .difficulty-signal {
          display: grid;
          gap: var(--space-2);
        }

        .difficulty-row {
          display: grid;
          grid-template-columns: 110px 1fr 42px;
          gap: var(--space-2);
          align-items: center;
          font-size: var(--font-meta);
        }

        .difficulty-label {
          color: var(--text-secondary);
        }

        .difficulty-track {
          height: 8px;
          border-radius: var(--radius-full);
          background: var(--bg-inset);
          overflow: hidden;
        }

        .difficulty-fill {
          height: 100%;
          border-radius: var(--radius-full);
        }

        .difficulty-fill.good {
          background: color-mix(in srgb, var(--success) 85%, white);
        }

        .difficulty-fill.fair {
          background: color-mix(in srgb, var(--warning) 85%, white);
        }

        .difficulty-fill.needs-work {
          background: color-mix(in srgb, var(--error) 82%, white);
        }

        .difficulty-value {
          text-align: right;
          font-weight: 600;
        }

        .card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-2);
          flex-wrap: wrap;
        }

        .mini-badge {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full);
          padding: 3px 8px;
        }

        .tool-usage-list {
          display: grid;
          gap: var(--space-2);
        }

        .tool-row {
          display: grid;
          grid-template-columns: 1fr minmax(100px, 1fr) 42px;
          gap: var(--space-2);
          align-items: center;
        }

        .tool-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          color: var(--text-secondary);
          font-size: var(--font-meta);
        }

        .tool-label span:last-child {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tool-icon {
          font-size: 14px;
          line-height: 1;
        }

        .tool-bar {
          height: 10px;
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .tool-bar-fill {
          height: 100%;
          border-radius: var(--radius-full);
          background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 76%, #9cc4ff), var(--primary));
          transition: width 0.25s ease;
        }

        .tool-percent {
          text-align: right;
          font-weight: 600;
          font-size: var(--font-meta);
        }

        .trend-chart-wrap {
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          border-radius: 12px;
          padding: var(--space-2);
          overflow: auto;
        }

        .trend-chart {
          width: 100%;
          min-width: 520px;
          height: 240px;
          display: block;
        }

        .guide-line {
          stroke: color-mix(in srgb, var(--border-default) 55%, transparent);
          stroke-width: 1;
        }

        .attempt-bar {
          fill: color-mix(in srgb, var(--primary) 26%, transparent);
        }

        .score-line {
          fill: none;
          stroke: var(--primary);
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .trend-legend {
          margin-top: var(--space-2);
          display: flex;
          gap: var(--space-3);
          flex-wrap: wrap;
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }

        .trend-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .legend {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          display: inline-block;
        }

        .legend.score {
          background: var(--primary);
        }

        .legend.attempts {
          background: color-mix(in srgb, var(--primary) 28%, transparent);
        }

        .weak-areas-list {
          display: grid;
          gap: var(--space-2);
        }

        .weak-item {
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          border-radius: 12px;
          padding: var(--space-3);
          display: grid;
          gap: var(--space-2);
        }

        .weak-head {
          display: flex;
          justify-content: space-between;
          gap: var(--space-2);
          align-items: center;
        }

        .score-pill {
          font-size: var(--font-tiny);
          font-weight: 700;
          border-radius: var(--radius-full);
          padding: 3px 8px;
        }

        .score-pill.excellent {
          color: var(--success);
          background: color-mix(in srgb, var(--success) 16%, transparent);
        }

        .score-pill.good {
          color: var(--primary);
          background: color-mix(in srgb, var(--primary) 20%, transparent);
        }

        .score-pill.fair {
          color: var(--warning);
          background: color-mix(in srgb, var(--warning) 20%, transparent);
        }

        .score-pill.needs-work {
          color: var(--error);
          background: color-mix(in srgb, var(--error) 16%, transparent);
        }

        .weak-item p {
          margin: 0;
          color: var(--text-secondary);
          font-size: var(--font-meta);
          line-height: 1.5;
        }

        .weak-actions {
          display: flex;
          justify-content: flex-end;
        }

        .plan-kpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--space-2);
          margin-bottom: var(--space-3);
        }

        .plan-kpi {
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          background: var(--bg-surface);
          padding: var(--space-3);
          display: grid;
          gap: 4px;
        }

        .plan-kpi span {
          color: var(--text-muted);
          font-size: var(--font-tiny);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
        }

        .plan-kpi strong {
          font-size: var(--font-lg);
          line-height: 1;
        }

        @media (max-width: 780px) {
          .plan-kpis {
            grid-template-columns: 1fr;
          }
        }

        .plan-progress {
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          background: var(--bg-surface);
          padding: var(--space-3);
        }

        .progress-head {
          display: flex;
          justify-content: space-between;
          gap: var(--space-2);
          font-size: var(--font-meta);
          color: var(--text-secondary);
          margin-bottom: var(--space-2);
        }

        .progress-track {
          height: 8px;
          border-radius: var(--radius-full);
          background: var(--bg-inset);
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          border-radius: var(--radius-full);
          background: linear-gradient(90deg, color-mix(in srgb, var(--primary) 80%, #8ebcff), var(--primary));
          transition: width 0.25s ease;
        }

        .heatmap-scroll {
          overflow-x: auto;
          padding-bottom: var(--space-2);
        }

        .heatmap-grid {
          display: inline-flex;
          gap: 4px;
          min-width: fit-content;
        }

        .heatmap-week {
          display: grid;
          gap: 4px;
          grid-template-rows: repeat(7, 12px);
        }

        .heat-cell {
          width: 12px;
          height: 12px;
          border-radius: 3px;
          background: var(--bg-inset);
          border: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent);
        }

        .heat-cell.empty {
          opacity: 0.3;
          border-color: transparent;
        }

        .heat-cell.i0 { background: color-mix(in srgb, var(--bg-inset) 85%, var(--bg-surface)); }
        .heat-cell.i1 { background: color-mix(in srgb, var(--primary) 20%, var(--bg-inset)); }
        .heat-cell.i2 { background: color-mix(in srgb, var(--primary) 42%, var(--bg-inset)); }
        .heat-cell.i3 { background: color-mix(in srgb, var(--primary) 62%, var(--bg-inset)); }
        .heat-cell.i4 { background: color-mix(in srgb, var(--primary) 80%, var(--bg-inset)); }

        .heatmap-legend {
          margin-top: var(--space-3);
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          align-items: center;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .legend-scale {
          display: inline-flex;
          gap: 4px;
        }

        .recent-scores {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          padding-bottom: var(--space-1);
        }

        .recent-item {
          min-width: 84px;
          display: grid;
          justify-items: center;
          gap: var(--space-2);
        }

        .ring {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          position: relative;
        }

        .ring::before {
          content: '';
          position: absolute;
          inset: 6px;
          border-radius: 50%;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
        }

        .ring span {
          position: relative;
          z-index: 1;
          font-size: var(--font-tiny);
          font-weight: 700;
        }

        .recent-meta {
          text-align: center;
          display: grid;
          gap: 2px;
        }

        .recent-meta strong {
          font-size: var(--font-tiny);
        }

        .recent-meta span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .analytics-btn {
          height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-secondary);
          padding: 0 12px;
          font-size: var(--font-meta);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .analytics-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
          border-color: var(--border-default);
        }

        .analytics-btn.primary {
          background: var(--primary);
          border-color: color-mix(in srgb, var(--primary) 65%, var(--border-default));
          color: white;
        }

        .analytics-btn.primary:hover {
          background: var(--primary-hover);
          color: white;
        }

        .analytics-btn.small {
          height: 30px;
          font-size: var(--font-tiny);
          padding: 0 10px;
        }

        .muted {
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .analytics-btn:focus-visible,
        .period select:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--primary) 72%, transparent);
          outline-offset: 2px;
        }

        .analytics-btn:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

function buildLinePoints(
  values: number[],
  width: number,
  height: number,
  padding: number,
  minY: number,
  maxY: number
): string {
  if (values.length === 0) return '';
  if (values.length === 1) {
    const y = mapToY(values[0], height, padding, minY, maxY);
    return `${padding},${y} ${width - padding},${y}`;
  }

  const step = (width - padding * 2) / (values.length - 1);
  return values
    .map((value, index) => {
      const x = padding + index * step;
      const y = mapToY(value, height, padding, minY, maxY);
      return `${x},${y}`;
    })
    .join(' ');
}

function mapToY(value: number, height: number, padding: number, minY: number, maxY: number): number {
  const clamped = Math.max(minY, Math.min(maxY, value));
  const ratio = (clamped - minY) / (maxY - minY || 1);
  return Math.round(height - padding - ratio * (height - padding * 2));
}

function buildHeatmapWeeks(daily: DailyPoint[]): Array<Array<DailyPoint | null>> {
  if (daily.length === 0) return [];

  const firstDay = new Date(daily[0].date).getDay();
  const padded: Array<DailyPoint | null> = [...Array.from({ length: firstDay }, () => null), ...daily];
  const weeks: Array<Array<DailyPoint | null>> = [];

  for (let index = 0; index < padded.length; index += 7) {
    const week = padded.slice(index, index + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return weeks;
}

function getImprovement(scores: number[]): number {
  if (scores.length < 4) return 0;
  const middle = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, middle);
  const secondHalf = scores.slice(middle);
  const firstAvg = firstHalf.reduce((sum, value) => sum + value, 0) / Math.max(firstHalf.length, 1);
  const secondAvg = secondHalf.reduce((sum, value) => sum + value, 0) / Math.max(secondHalf.length, 1);
  return Math.round(secondAvg - firstAvg);
}

function getIntensity(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0) return 0;
  const ratio = value / Math.max(maxValue, 1);
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function formatMode(mode: string, t?: (key: string, params?: Record<string, string | number>) => string): string {
  const mapping: Record<string, string> = {
    mcq: 'MCQ',
    quiz: 'Quiz',
    summarize: 'Summarize',
    assignment: 'Assignment',
    notes: 'Notes',
    graph: 'Graph',
    math: 'Math',
    exam: 'Exam Prep',
    srs: 'SRS',
    visual: 'Visual',
    matlab: 'MATLAB',
    focus: 'Focus',
    pop: 'Pop Quiz',
    flashcards: 'Flashcards',
  };
  const value = mapping[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
  return t ? t(value) : value;
}

function getToolIcon(tool: string): string {
  const mapping: Record<string, string> = {
    summarize: '📄',
    assignment: '📝',
    mcq: '✅',
    quiz: '🧠',
    notes: '📒',
    math: '🧮',
    graph: '📈',
    visual: '🔍',
    matlab: '📐',
    focus: '⏱️',
    exam: '🎯',
    srs: '🧩',
    audio: '🎧',
    map: '🗺️',
  };
  return mapping[tool] || '🛠️';
}

function getScoreClass(score: number): 'excellent' | 'good' | 'fair' | 'needs-work' {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'needs-work';
}

function formatShortDate(dateStr: string, locale?: string): string {
  return new Date(dateStr).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string, locale?: string): string {
  return new Date(dateStr).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
