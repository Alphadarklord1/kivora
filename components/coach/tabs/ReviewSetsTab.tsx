'use client';

import type { SRSDeck } from '@/lib/srs/sm2';
import styles from '@/app/(dashboard)/coach/page.module.css';

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  sortedReviewSets: SRSDeck[];
  loadingSets:      boolean;
  generatingQuiz:   boolean;
  getSetDue:        (s: SRSDeck) => number;
  getSetAccuracy:   (s: SRSDeck) => number;
  onOpenPanel:      (setId: string, panel: 'review' | 'manage') => void;
  onQuizSet:        (set: SRSDeck) => void;
}

export function ReviewSetsTab({
  sortedReviewSets,
  loadingSets,
  generatingQuiz,
  getSetDue,
  getSetAccuracy,
  onOpenPanel,
  onQuizSet,
}: Props) {
  return (
    <div className={styles.setsLayout}>
      <div className={styles.panelHead}>
        <h2>Review Sets</h2>
        <p>Your spaced-repetition decks, managed in Workspace and accessible here.</p>
      </div>

      {loadingSets ? (
        <div className={styles.emptyBrief}><strong>Loading…</strong></div>
      ) : sortedReviewSets.length === 0 ? (
        <div className={styles.emptyBrief}>
          <div className={styles.emptyIcon}>🗂️</div>
          <strong>No review sets yet</strong>
          <p>Analyze a source on the Source tab and click &ldquo;Review Set&rdquo; to create your first deck.</p>
        </div>
      ) : (
        <div className={styles.setList}>
          {sortedReviewSets.map(set => {
            const accuracy = getSetAccuracy(set);
            const due      = getSetDue(set);
            return (
              <div key={set.id} className={styles.setRow}>
                <div className={styles.setRowInfo}>
                  <strong>{set.name}</strong>
                  <span>
                    {set.cards.length} cards
                    {' · '}
                    {due > 0 ? `${due} due` : 'nothing due'}
                    {' · '}
                    {accuracy >= 0 ? `${accuracy}% accuracy` : 'no accuracy'}
                    {' · '}
                    {formatDate(set.lastStudied ?? set.createdAt)}
                  </span>
                  {set.description && <small>{set.description}</small>}
                </div>
                <div className={styles.setRowActions}>
                  <button className={styles.btnPrimary} onClick={() => onOpenPanel(set.id, 'review')}>Review</button>
                  <button className={styles.btnSecondary} disabled={generatingQuiz} onClick={() => onQuizSet(set)}>Quiz</button>
                  <button className={styles.btnSecondary} onClick={() => onOpenPanel(set.id, 'manage')}>Manage</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
