'use client';

import type { WeakArea } from '@/hooks/useAnalytics';
import type { SRSDeck } from '@/lib/srs/sm2';
import styles from '@/app/(dashboard)/coach/page.module.css';

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
  /** True once analytics has loaded AND the user has at least one quiz attempt
   * in the period. Lets us distinguish "all topics solid" from "no data yet". */
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
  /** Take the user to a place where they can take a quiz to seed analytics. */
  onTakeFirstQuiz:  () => void;
}

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

export function RecoveryTab({
  dueReviewSets,
  allReviewSets,
  topWeakAreas,
  hasQuizHistory,
  analyticsLoading,
  getSetAccuracy,
  mission,
  onStartMission,
  onMissionSecondary,
  onLaunchWeakTopic,
  onLoadRelatedReading,
  onTakeFirstQuiz,
}: Props) {
  return (
    <div className={styles.recoveryLayout}>
      <div className={styles.panelHead}>
        <h2>Recovery</h2>
        <p>Due review and weak-area guidance in one place.</p>
      </div>

      {/* Today's Mission card */}
      <div className={styles.missionCard}>
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

      {/* All decks summary → Workspace */}
      {allReviewSets.length > 0 && (
        <div className={styles.contextBanner} style={{ justifyContent: 'space-between' }}>
          <span>
            📇 <strong>{allReviewSets.length} review set{allReviewSets.length !== 1 ? 's' : ''}</strong>
            {' · '}
            {allReviewSets.reduce((n, s) => n + s.cards.length, 0).toLocaleString()} cards total
            {' · '}
            {dueReviewSets.length > 0 ? <strong>{dueReviewSets.length} due today</strong> : 'nothing due'}
          </span>
          <a href="/workspace" className={styles.btnSecondary} style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            Manage all decks in Workspace →
          </a>
        </div>
      )}

      {/* Weak Topics — now full-width since the Due Review column moved to
          the Workspace deck library (single source). */}
      <div>
        <h4>Weak Topics</h4>
        {analyticsLoading ? (
          <div className={styles.emptyBrief}><strong>Loading…</strong></div>
        ) : !hasQuizHistory ? (
          <div className={styles.emptyBrief} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
            <strong>No quiz history yet</strong>
            <span>Weak topics show up here once you&apos;ve taken at least one quiz, so we have data to compare against.</span>
            <button className={styles.btnPrimary} onClick={onTakeFirstQuiz}>Take your first quiz →</button>
          </div>
        ) : topWeakAreas.length === 0 ? (
          <div className={styles.emptyBrief}><strong>All topics solid ✔</strong> — your accuracy is high across the board, nothing flagged for review.</div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
