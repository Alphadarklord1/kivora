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
  loadingSets,
  analyticsLoading,
  getSetDue,
  getSetAccuracy,
  mission,
  onStartMission,
  onMissionSecondary,
  onOpenPanel,
  onLaunchWeakTopic,
  onLoadRelatedReading,
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

      <div className={styles.recoveryColumns}>

        {/* Due Review column */}
        <div className={styles.recoveryCol}>
          <h4>Due Review</h4>
          {loadingSets ? (
            <div className={styles.emptyBrief}><strong>Loading…</strong></div>
          ) : dueReviewSets.length === 0 ? (
            <div className={styles.emptyBrief}><strong>Nothing due right now ✔</strong></div>
          ) : (
            <div className={styles.setList}>
              {dueReviewSets.slice(0, 5).map(set => {
                const accuracy = getSetAccuracy(set);
                const due      = getSetDue(set);
                return (
                  <div key={set.id} className={styles.setRow}>
                    <div className={styles.setRowInfo}>
                      <strong>{set.name}</strong>
                      <span>{set.cards.length} cards · {due} due</span>
                      {accuracy >= 0 && <AccuracyBar pct={accuracy} />}
                    </div>
                    <div className={styles.setRowActions}>
                      <button className={styles.btnPrimary} onClick={() => onOpenPanel(set.id, 'review')}>Review</button>
                      <button className={styles.btnSecondary} onClick={() => onOpenPanel(set.id, 'manage')}>Manage</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Weak Topics column */}
        <div className={styles.recoveryCol}>
          <h4>Weak Topics</h4>
          {analyticsLoading ? (
            <div className={styles.emptyBrief}><strong>Loading…</strong></div>
          ) : topWeakAreas.length === 0 ? (
            <div className={styles.emptyBrief}><strong>No weak topics detected ✔</strong></div>
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
    </div>
  );
}
