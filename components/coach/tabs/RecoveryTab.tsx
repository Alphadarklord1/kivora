'use client';

import { useState } from 'react';
import type { WeakArea } from '@/hooks/useAnalytics';
import type { SRSDeck } from '@/lib/srs/sm2';
import { useI18n } from '@/lib/i18n/useI18n';
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

function urgencyLabel(due: number): { label: string; color: string } {
  if (due === 0) return { label: '', color: '' };
  if (due >= 20) return { label: `${due} overdue`, color: '#ef4444' };
  if (due >= 10) return { label: `${due} due`, color: '#f59e0b' };
  return { label: `${due} due`, color: '#4f86f7' };
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
  const { t } = useI18n();

  // Session state — tracks what the student has acted on this visit
  const [practicedTopics, setPracticedTopics] = useState<Set<string>>(new Set());
  const [reviewedSets,    setReviewedSets]    = useState<Set<string>>(new Set());

  const allClear = !loadingSets && !analyticsLoading
    && dueReviewSets.length === 0 && topWeakAreas.length === 0;

  const sessionDone = practicedTopics.size + reviewedSets.size;
  const sessionTotal = topWeakAreas.length + dueReviewSets.length;

  function markPracticed(topic: string) {
    setPracticedTopics(prev => new Set(prev).add(topic));
  }

  function markReviewed(setId: string) {
    setReviewedSets(prev => new Set(prev).add(setId));
  }

  return (
    <div className={styles.recoveryLayout}>
      <div className={styles.panelHead}>
        <h2>{t('Recovery')}</h2>
        <p>Due review and weak-area guidance in one place.</p>
      </div>

      {/* All-clear celebration */}
      {allClear && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          padding: '36px 24px', textAlign: 'center',
          background: 'color-mix(in srgb, #22c55e 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, #22c55e 25%, transparent)',
          borderRadius: 16, marginBottom: 20,
        }}>
          <span style={{ fontSize: 48 }}>🎉</span>
          <strong style={{ fontSize: 'var(--text-lg)' }}>{t('All caught up!')}</strong>
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', maxWidth: 340, margin: 0 }}>
            No cards due and no weak areas detected. Keep reviewing regularly to stay ahead.
          </p>
          <a href="/workspace" style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            {t('Go to Workspace →')}
          </a>
        </div>
      )}

      {/* Session progress bar */}
      {sessionTotal > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          borderRadius: 10, marginBottom: 16, fontSize: 'var(--text-xs)',
        }}>
          <span style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t('Session progress')}</span>
          <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3, background: 'var(--accent)',
              width: `${sessionTotal > 0 ? Math.round((sessionDone / sessionTotal) * 100) : 0}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
          <span style={{ color: 'var(--text-2)', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {sessionDone} / {sessionTotal} addressed
          </span>
        </div>
      )}

      {/* Today's Mission card */}
      {!allClear && (
        <div className={styles.missionCard}>
          <div className={styles.missionBody}>
            <span className={styles.eyebrowPill}>{t("Today's Mission")}</span>
            <h3>{mission.title}</h3>
            <p>{mission.description}</p>
          </div>
          <div className={styles.missionActions}>
            <button className={styles.btnPrimary} onClick={onStartMission}>{mission.actionLabel}</button>
            <button className={styles.btnSecondary} onClick={onMissionSecondary}>{mission.secondaryLabel}</button>
          </div>
        </div>
      )}

      {/* All decks summary */}
      {allReviewSets.length > 0 && (
        <div className={styles.contextBanner} style={{ justifyContent: 'space-between' }}>
          <span>
            📇 <strong>{allReviewSets.length} review set{allReviewSets.length !== 1 ? 's' : ''}</strong>
            {' · '}
            {allReviewSets.reduce((n, s) => n + s.cards.length, 0).toLocaleString()} cards total
            {' · '}
            {dueReviewSets.length > 0
              ? <strong style={{ color: '#f59e0b' }}>{dueReviewSets.length} due today</strong>
              : <span style={{ color: '#22c55e' }}>nothing due ✔</span>}
          </span>
          <a href="/workspace" className={styles.btnSecondary} style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
            {t('Manage all in Workspace →')}
          </a>
        </div>
      )}

      <div className={styles.recoveryColumns}>

        {/* Due Review column */}
        <div className={styles.recoveryCol}>
          <h4>
            {t('Due Review')}
            {dueReviewSets.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: '#f59e0b' }}>
                {dueReviewSets.length} set{dueReviewSets.length !== 1 ? 's' : ''}
              </span>
            )}
          </h4>
          {loadingSets ? (
            <>
              {[1, 2].map(i => (
                <div key={i} style={{ height: 72, borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </>
          ) : dueReviewSets.length === 0 ? (
            <div className={styles.emptyBrief}>
              <strong style={{ color: '#22c55e' }}>{t('Nothing due right now ✔')}</strong>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginTop: 4 }}>
                Check back tomorrow or add more cards.
              </span>
            </div>
          ) : (
            <div className={styles.setList}>
              {dueReviewSets.map(set => {
                const accuracy  = getSetAccuracy(set);
                const due       = getSetDue(set);
                const urgency   = urgencyLabel(due);
                const isDone    = reviewedSets.has(set.id);
                return (
                  <div key={set.id} className={styles.setRow} style={{ opacity: isDone ? 0.55 : 1 }}>
                    <div className={styles.setRowInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong>{set.name}</strong>
                        {isDone && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>✓ reviewed</span>}
                      </div>
                      <span>
                        {set.cards.length} cards
                        {urgency.label && (
                          <span style={{ marginLeft: 6, fontWeight: 600, color: urgency.color }}>
                            · {urgency.label}
                          </span>
                        )}
                      </span>
                      {accuracy >= 0 && <AccuracyBar pct={accuracy} />}
                    </div>
                    <div className={styles.setRowActions}>
                      <button
                        className={styles.btnPrimary}
                        onClick={() => { markReviewed(set.id); onOpenPanel(set.id, 'review'); }}
                      >
                        {t('Review')}
                      </button>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => onOpenPanel(set.id, 'manage')}
                      >
                        {t('Manage')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Weak Topics column */}
        <div className={styles.recoveryCol}>
          <h4>
            {t('Weak Topics')}
            {topWeakAreas.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: '#f59e0b' }}>
                {topWeakAreas.length} area{topWeakAreas.length !== 1 ? 's' : ''}
              </span>
            )}
          </h4>
          {analyticsLoading ? (
            <>
              {[1, 2].map(i => (
                <div key={i} style={{ height: 80, borderRadius: 10, background: 'var(--surface-2)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
            </>
          ) : topWeakAreas.length === 0 ? (
            <div className={styles.emptyBrief}>
              <strong style={{ color: '#22c55e' }}>{t('No weak topics detected ✔')}</strong>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginTop: 4 }}>
                Take more quizzes to see topic-level insights.
              </span>
            </div>
          ) : (
            <div className={styles.setList}>
              {topWeakAreas.map(area => {
                const pct    = Math.round(area.accuracy);
                const isDone = practicedTopics.has(area.topic);
                return (
                  <div key={area.topic} className={styles.setRow} style={{ opacity: isDone ? 0.55 : 1 }}>
                    <div className={styles.setRowInfo}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong>{area.topic}</strong>
                        {isDone && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 600 }}>✓ practiced</span>}
                      </div>
                      <AccuracyBar pct={pct} />
                      <span>
                        {area.attempts} attempts
                        {area.estimatedMinutes != null && ` · ~${area.estimatedMinutes} min to recover`}
                      </span>
                      <small>{area.suggestion}</small>
                    </div>
                    <div className={styles.setRowActions}>
                      <button
                        className={styles.btnPrimary}
                        onClick={() => { markPracticed(area.topic); onLaunchWeakTopic(area, 'quiz'); }}
                      >
                        {t('Practice')}
                      </button>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => { markPracticed(area.topic); onLaunchWeakTopic(area, 'explain'); }}
                      >
                        {t('Explain')}
                      </button>
                      <button
                        className={styles.btnSecondary}
                        onClick={() => onLoadRelatedReading(area.topic)}
                      >
                        {t('Reading')}
                      </button>
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
