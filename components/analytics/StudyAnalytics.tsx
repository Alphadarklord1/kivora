'use client';

import { useAnalytics } from '@/hooks/useAnalytics';
import { SkeletonCard } from '@/components/ui/Skeleton';

export function StudyAnalytics() {
  const { data, loading, error, refresh, setPeriod, period } = useAnalytics(30);

  if (loading) {
    return (
      <div className="analytics-skeleton">
        <div className="skeleton-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="skeleton-columns">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <style jsx>{`
          .analytics-skeleton {
            padding: var(--space-4);
          }
          .skeleton-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: var(--space-3);
            margin-bottom: var(--space-4);
          }
          .skeleton-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--space-4);
          }
          @media (max-width: 800px) {
            .skeleton-columns {
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
        <p>Failed to load analytics</p>
        <button className="btn" onClick={refresh}>Try Again</button>
        <style jsx>{`
          .analytics-error {
            text-align: center;
            padding: var(--space-8);
            color: var(--error);
          }
        `}</style>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { quizStats, planStats, weakAreas, activity, insights } = data;

  return (
    <div className="study-analytics">
      {/* Header */}
      <div className="analytics-header">
        <div>
          <h2>Study Analytics</h2>
          <p>Track your progress and identify areas for improvement</p>
        </div>
        <div className="period-selector">
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </div>
      </div>

      {/* Insights Banner */}
      {insights.length > 0 && (
        <div className="insights-banner">
          <h3>Insights</h3>
          <ul>
            {insights.map((insight, i) => (
              <li key={i}>{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{quizStats.averageScore}%</div>
            <div className="stat-label">Average Score</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{quizStats.totalAttempts}</div>
            <div className="stat-label">Quizzes Taken</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <div className="stat-value">{activity.currentStreak}</div>
            <div className="stat-label">Day Streak</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📅</div>
          <div className="stat-content">
            <div className="stat-value">{planStats.activePlans}</div>
            <div className="stat-label">Active Plans</div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="analytics-columns">
        {/* Left Column */}
        <div className="analytics-column">
          {/* Quiz Performance */}
          <div className="analytics-card">
            <h3>Quiz Performance</h3>
            <div className="performance-summary">
              <div className="perf-stat">
                <span className="perf-label">Total Questions</span>
                <span className="perf-value">{quizStats.totalQuestions}</span>
              </div>
              <div className="perf-stat">
                <span className="perf-label">Correct Answers</span>
                <span className="perf-value success">{quizStats.totalCorrect}</span>
              </div>
              <div className="perf-stat">
                <span className="perf-label">Accuracy Rate</span>
                <span className="perf-value">
                  {quizStats.totalQuestions > 0
                    ? Math.round((quizStats.totalCorrect / quizStats.totalQuestions) * 100)
                    : 0}%
                </span>
              </div>
            </div>

            {/* Score Distribution */}
            <div className="score-distribution">
              <h4>Score Distribution</h4>
              <div className="distribution-bars">
                <div className="dist-item">
                  <div className="dist-label">90-100%</div>
                  <div className="dist-bar-container">
                    <div
                      className="dist-bar excellent"
                      style={{
                        width: `${quizStats.totalAttempts > 0
                          ? (quizStats.scoreDistribution.excellent / quizStats.totalAttempts) * 100
                          : 0}%`
                      }}
                    />
                  </div>
                  <div className="dist-count">{quizStats.scoreDistribution.excellent}</div>
                </div>
                <div className="dist-item">
                  <div className="dist-label">70-89%</div>
                  <div className="dist-bar-container">
                    <div
                      className="dist-bar good"
                      style={{
                        width: `${quizStats.totalAttempts > 0
                          ? (quizStats.scoreDistribution.good / quizStats.totalAttempts) * 100
                          : 0}%`
                      }}
                    />
                  </div>
                  <div className="dist-count">{quizStats.scoreDistribution.good}</div>
                </div>
                <div className="dist-item">
                  <div className="dist-label">50-69%</div>
                  <div className="dist-bar-container">
                    <div
                      className="dist-bar fair"
                      style={{
                        width: `${quizStats.totalAttempts > 0
                          ? (quizStats.scoreDistribution.fair / quizStats.totalAttempts) * 100
                          : 0}%`
                      }}
                    />
                  </div>
                  <div className="dist-count">{quizStats.scoreDistribution.fair}</div>
                </div>
                <div className="dist-item">
                  <div className="dist-label">0-49%</div>
                  <div className="dist-bar-container">
                    <div
                      className="dist-bar needs-work"
                      style={{
                        width: `${quizStats.totalAttempts > 0
                          ? (quizStats.scoreDistribution.needsWork / quizStats.totalAttempts) * 100
                          : 0}%`
                      }}
                    />
                  </div>
                  <div className="dist-count">{quizStats.scoreDistribution.needsWork}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance by Mode */}
          {Object.keys(quizStats.byMode).length > 0 && (
            <div className="analytics-card">
              <h3>Performance by Quiz Type</h3>
              <div className="mode-list">
                {Object.entries(quizStats.byMode).map(([mode, stats]) => (
                  <div key={mode} className="mode-item">
                    <div className="mode-header">
                      <span className="mode-name">{formatMode(mode)}</span>
                      <span className={`mode-score ${getScoreClass(stats.avgScore)}`}>
                        {stats.avgScore}%
                      </span>
                    </div>
                    <div className="mode-details">
                      <span>{stats.attempts} attempts</span>
                      <span>{stats.totalQuestions} questions</span>
                    </div>
                    <div className="mode-bar-container">
                      <div
                        className={`mode-bar ${getScoreClass(stats.avgScore)}`}
                        style={{ width: `${stats.avgScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="analytics-column">
          {/* Weak Areas */}
          <div className="analytics-card">
            <h3>Areas to Improve</h3>
            {weakAreas.length > 0 ? (
              <div className="weak-areas-list">
                {weakAreas.map((area, i) => (
                  <div key={i} className="weak-area-item">
                    <div className="weak-area-header">
                      <span className="weak-topic">{area.topic}</span>
                      <span className={`weak-accuracy ${getScoreClass(area.accuracy)}`}>
                        {area.accuracy}%
                      </span>
                    </div>
                    <p className="weak-suggestion">{area.suggestion}</p>
                    <div className="weak-bar-container">
                      <div
                        className={`weak-bar ${getScoreClass(area.accuracy)}`}
                        style={{ width: `${area.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">🎉</span>
                <p>No weak areas identified!</p>
                <span className="empty-hint">Keep taking quizzes to get personalized recommendations</span>
              </div>
            )}
          </div>

          {/* Study Plans Progress */}
          <div className="analytics-card">
            <h3>Study Plans</h3>
            <div className="plans-summary">
              <div className="plan-stat">
                <div className="plan-value">{planStats.totalPlans}</div>
                <div className="plan-label">Total Plans</div>
              </div>
              <div className="plan-stat">
                <div className="plan-value success">{planStats.completedPlans}</div>
                <div className="plan-label">Completed</div>
              </div>
              <div className="plan-stat">
                <div className="plan-value primary">{planStats.activePlans}</div>
                <div className="plan-label">Active</div>
              </div>
            </div>
            {planStats.totalStudyDays > 0 && (
              <div className="study-days-progress">
                <div className="progress-header">
                  <span>Study Days Completed</span>
                  <span>{planStats.completedDays} / {planStats.totalStudyDays}</span>
                </div>
                <div className="progress-bar-container">
                  <div
                    className="progress-bar"
                    style={{
                      width: `${(planStats.completedDays / planStats.totalStudyDays) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Weekly Activity */}
          {activity.weeklyActivity.length > 0 && (
            <div className="analytics-card">
              <h3>Weekly Activity</h3>
              <div className="weekly-chart">
                {activity.weeklyActivity.map((week, i) => (
                  <div key={i} className="week-item">
                    <div className="week-bar-container">
                      <div
                        className="week-bar"
                        style={{
                          height: `${Math.min(100, week.quizzes * 20)}%`
                        }}
                        title={`${week.quizzes} quizzes, ${week.avgScore}% avg`}
                      />
                    </div>
                    <div className="week-label">
                      {new Date(week.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Scores */}
      {quizStats.recentScores.length > 0 && (
        <div className="analytics-card full-width">
          <h3>Recent Quiz Scores</h3>
          <div className="recent-scores">
            {quizStats.recentScores.map((score, i) => (
              <div key={i} className="score-item">
                <div className={`score-badge ${getScoreClass(score.score)}`}>
                  {score.score}%
                </div>
                <div className="score-details">
                  <span className="score-mode">{formatMode(score.mode)}</span>
                  <span className="score-date">{formatDate(score.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .study-analytics {
          padding: var(--space-4);
        }

        .analytics-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-4);
          flex-wrap: wrap;
          gap: var(--space-3);
        }

        .analytics-header h2 {
          margin: 0 0 var(--space-1) 0;
          font-size: var(--font-xl);
        }

        .analytics-header p {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .period-selector select {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          background: var(--bg-surface);
        }

        .insights-banner {
          background: linear-gradient(135deg, var(--primary-muted), var(--bg-surface));
          border: 1px solid var(--primary);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          margin-bottom: var(--space-4);
        }

        .insights-banner h3 {
          margin: 0 0 var(--space-2) 0;
          font-size: var(--font-body);
          color: var(--primary);
        }

        .insights-banner ul {
          margin: 0;
          padding-left: var(--space-4);
        }

        .insights-banner li {
          margin-bottom: var(--space-1);
          color: var(--text-secondary);
          font-size: var(--font-meta);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }

        .stat-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          display: flex;
          align-items: center;
          gap: var(--space-3);
          box-shadow: var(--shadow-sm);
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .stat-card:hover {
          border-color: var(--border-default);
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .stat-card.primary {
          background: var(--primary-muted);
          border-color: var(--primary);
        }

        .stat-card.primary:hover {
          box-shadow: var(--shadow-md);
        }

        .stat-icon {
          font-size: 28px;
        }

        .stat-value {
          font-size: var(--font-xl);
          font-weight: 700;
          color: var(--text-primary);
        }

        .stat-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .analytics-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-4);
        }

        @media (max-width: 800px) {
          .analytics-columns {
            grid-template-columns: 1fr;
          }
        }

        .analytics-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
          margin-bottom: var(--space-4);
          box-shadow: var(--shadow-sm);
          transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }

        .analytics-card:hover {
          border-color: var(--border-default);
          box-shadow: var(--shadow-md);
          transform: translateY(-1px);
        }

        .analytics-card.full-width {
          grid-column: 1 / -1;
        }

        .analytics-card h3 {
          margin: 0 0 var(--space-3) 0;
          font-size: var(--font-body);
          font-weight: 600;
        }

        .performance-summary {
          display: flex;
          gap: var(--space-4);
          margin-bottom: var(--space-4);
          flex-wrap: wrap;
        }

        .perf-stat {
          display: flex;
          flex-direction: column;
        }

        .perf-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .perf-value {
          font-size: var(--font-lg);
          font-weight: 600;
        }

        .perf-value.success {
          color: var(--success);
        }

        .score-distribution h4 {
          margin: 0 0 var(--space-2) 0;
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }

        .distribution-bars {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .dist-item {
          display: grid;
          grid-template-columns: 60px 1fr 30px;
          align-items: center;
          gap: var(--space-2);
        }

        .dist-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .dist-bar-container {
          height: 8px;
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .dist-bar {
          height: 100%;
          border-radius: var(--radius-full);
          transition: width 0.3s ease;
        }

        .dist-bar.excellent { background: var(--success); }
        .dist-bar.good { background: var(--primary); }
        .dist-bar.fair { background: var(--warning); }
        .dist-bar.needs-work { background: var(--error); }

        .dist-count {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          text-align: right;
        }

        .mode-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .mode-item {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .mode-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-1);
        }

        .mode-name {
          font-weight: 500;
        }

        .mode-score {
          font-weight: 600;
        }

        .mode-score.excellent { color: var(--success); }
        .mode-score.good { color: var(--primary); }
        .mode-score.fair { color: var(--warning); }
        .mode-score.needs-work { color: var(--error); }

        .mode-details {
          display: flex;
          gap: var(--space-3);
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-bottom: var(--space-2);
        }

        .mode-bar-container {
          height: 6px;
          background: var(--bg-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .mode-bar {
          height: 100%;
          border-radius: var(--radius-full);
          transition: width 0.3s ease;
        }

        .mode-bar.excellent { background: var(--success); }
        .mode-bar.good { background: var(--primary); }
        .mode-bar.fair { background: var(--warning); }
        .mode-bar.needs-work { background: var(--error); }

        .weak-areas-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .weak-area-item {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          border-left: 3px solid var(--warning);
        }

        .weak-area-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-1);
        }

        .weak-topic {
          font-weight: 500;
        }

        .weak-accuracy {
          font-weight: 600;
        }

        .weak-accuracy.excellent { color: var(--success); }
        .weak-accuracy.good { color: var(--primary); }
        .weak-accuracy.fair { color: var(--warning); }
        .weak-accuracy.needs-work { color: var(--error); }

        .weak-suggestion {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          margin: 0 0 var(--space-2) 0;
        }

        .weak-bar-container {
          height: 4px;
          background: var(--bg-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .weak-bar {
          height: 100%;
          border-radius: var(--radius-full);
        }

        .weak-bar.excellent { background: var(--success); }
        .weak-bar.good { background: var(--primary); }
        .weak-bar.fair { background: var(--warning); }
        .weak-bar.needs-work { background: var(--error); }

        .empty-state {
          text-align: center;
          padding: var(--space-4);
          color: var(--text-muted);
        }

        .empty-icon {
          font-size: 32px;
          display: block;
          margin-bottom: var(--space-2);
        }

        .empty-hint {
          font-size: var(--font-tiny);
        }

        .plans-summary {
          display: flex;
          justify-content: space-around;
          margin-bottom: var(--space-4);
        }

        .plan-stat {
          text-align: center;
        }

        .plan-value {
          font-size: var(--font-xl);
          font-weight: 700;
        }

        .plan-value.success { color: var(--success); }
        .plan-value.primary { color: var(--primary); }

        .plan-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .study-days-progress {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .progress-header {
          display: flex;
          justify-content: space-between;
          font-size: var(--font-meta);
          margin-bottom: var(--space-2);
        }

        .progress-bar-container {
          height: 8px;
          background: var(--bg-surface);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          background: var(--success);
          border-radius: var(--radius-full);
          transition: width 0.3s ease;
        }

        .weekly-chart {
          display: flex;
          justify-content: space-around;
          align-items: flex-end;
          height: 100px;
          padding-top: var(--space-2);
        }

        .week-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
        }

        .week-bar-container {
          width: 24px;
          height: 80px;
          background: var(--bg-inset);
          border-radius: var(--radius-sm);
          display: flex;
          align-items: flex-end;
          overflow: hidden;
        }

        .week-bar {
          width: 100%;
          background: var(--primary);
          border-radius: var(--radius-sm);
          transition: height 0.3s ease;
          min-height: 4px;
        }

        .week-label {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-top: var(--space-1);
        }

        .recent-scores {
          display: flex;
          gap: var(--space-3);
          overflow-x: auto;
          padding: var(--space-2) 0;
        }

        .score-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 70px;
        }

        .score-badge {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: var(--font-meta);
          margin-bottom: var(--space-1);
        }

        .score-badge.excellent { background: var(--success-muted); color: var(--success); }
        .score-badge.good { background: var(--primary-muted); color: var(--primary); }
        .score-badge.fair { background: var(--warning-muted); color: var(--warning); }
        .score-badge.needs-work { background: var(--error-muted); color: var(--error); }

        .score-details {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .score-mode {
          font-size: var(--font-tiny);
          font-weight: 500;
        }

        .score-date {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}

function formatMode(mode: string): string {
  const modeNames: Record<string, string> = {
    mcq: 'MCQ',
    quiz: 'Quiz',
    pop: 'Pop Quiz',
    flashcards: 'Flashcards',
  };
  return modeNames[mode] || mode.charAt(0).toUpperCase() + mode.slice(1);
}

function getScoreClass(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'needs-work';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
