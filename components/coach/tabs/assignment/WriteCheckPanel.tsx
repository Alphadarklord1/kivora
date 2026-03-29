'use client';

import type { SourceBrief } from '@/lib/coach/source-brief';
import type { WritingSuggestion } from '@/app/api/coach/check/route';
import styles from '@/app/(dashboard)/coach/page.module.css';

type SuggType = WritingSuggestion['type'];
type FilterType = 'all' | SuggType;

const SUGG_TYPE_META: Record<SuggType, { label: string; color: string; bg: string; icon: string }> = {
  grammar: { label: 'Grammar', color: '#ef4444', bg: '#fef2f2', icon: '✏️' },
  style: { label: 'Style', color: '#3b82f6', bg: '#eff6ff', icon: '💬' },
  clarity: { label: 'Clarity', color: '#f59e0b', bg: '#fffbeb', icon: '💡' },
  tone: { label: 'Tone', color: '#8b5cf6', bg: '#f5f3ff', icon: '🎯' },
};

function scoreColor(score: number) {
  if (score >= 90) return '#10b981';
  if (score >= 75) return '#3b82f6';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs work';
}

interface WriteCheckPanelProps {
  checkLoading: boolean;
  checkText: string;
  hasWriterResult: boolean;
  writerSavedLib: boolean;
  activeSuggs: WritingSuggestion[];
  sourceLabel: string;
  writerWordCount: number;
  writerCharCount: number;
  checkScore: number | null;
  checkSummary: string;
  checkSuggs: WritingSuggestion[];
  suggFilter: FilterType;
  legacyResult: string;
  sourceBrief: SourceBrief | null;
  sourceActionLoading: 'notes' | 'quiz' | 'flashcards' | null;
  onCheckTextChange: (value: string) => void;
  onCheckWork: () => void;
  onApplyAllSuggs: () => void;
  onCopy: () => void;
  onExportWord: () => void;
  onSaveWriter: () => void;
  onClearWriter: () => void;
  onSendDraftToBuild: () => void;
  onClearWriterResults: () => void;
  onDismissSuggestion: (id: string) => void;
  onApplySuggestion: (suggestion: WritingSuggestion) => void;
  onFilterChange: (filter: FilterType) => void;
  onSourceAction: (mode: 'notes' | 'quiz' | 'flashcards') => void;
}

export function WriteCheckPanel({
  checkLoading,
  checkText,
  hasWriterResult,
  writerSavedLib,
  activeSuggs,
  sourceLabel,
  writerWordCount,
  writerCharCount,
  checkScore,
  checkSummary,
  checkSuggs,
  suggFilter,
  legacyResult,
  sourceBrief,
  sourceActionLoading,
  onCheckTextChange,
  onCheckWork,
  onApplyAllSuggs,
  onCopy,
  onExportWord,
  onSaveWriter,
  onClearWriter,
  onSendDraftToBuild,
  onClearWriterResults,
  onDismissSuggestion,
  onApplySuggestion,
  onFilterChange,
  onSourceAction,
}: WriteCheckPanelProps) {
  const filteredSuggs =
    suggFilter === 'all'
      ? activeSuggs
      : activeSuggs.filter((suggestion) => suggestion.type === suggFilter);

  const countByType = (type: SuggType) =>
    activeSuggs.filter((suggestion) => suggestion.type === type).length;

  return (
    <div className={styles.wordApp}>
      <div className={styles.wordRibbon}>
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>REVIEW</span>
          <button
            className={`${styles.ribbonBtn} ${styles.ribbonBtnPrimary}`}
            disabled={checkLoading || !checkText.trim()}
            onClick={onCheckWork}
          >
            {checkLoading ? (
              <>
                <span className={styles.ribbonIcon}>⏳</span>Checking…
              </>
            ) : (
              <>
                <span className={styles.ribbonIcon}>✔</span>Check Writing
              </>
            )}
          </button>
          {activeSuggs.length > 1 && (
            <button className={styles.ribbonBtn} onClick={onApplyAllSuggs} title="Apply all suggestions">
              <span className={styles.ribbonIcon}>⚡</span>Apply All
            </button>
          )}
        </div>
        <div className={styles.ribbonDivider} />
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>DOCUMENT</span>
          <button className={styles.ribbonBtn} disabled={!checkText} onClick={onCopy}>
            <span className={styles.ribbonIcon}>📋</span>Copy
          </button>
          <button
            className={styles.ribbonBtn}
            disabled={!checkText}
            onClick={onExportWord}
            title="Download essay as Word document"
          >
            <span className={styles.ribbonIcon}>📄</span>Word
          </button>
          <button className={styles.ribbonBtn} disabled={!hasWriterResult || writerSavedLib} onClick={onSaveWriter}>
            <span className={styles.ribbonIcon}>📚</span>{writerSavedLib ? 'Saved' : 'Save'}
          </button>
          <button className={styles.ribbonBtn} disabled={!checkText} onClick={onClearWriter}>
            <span className={styles.ribbonIcon}>🗑️</span>Clear
          </button>
        </div>
        <div className={styles.ribbonDivider} />
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>BUILD</span>
          <button
            className={styles.ribbonBtn}
            disabled={!checkText.trim()}
            onClick={onSendDraftToBuild}
            title="Use this text as the basis for a report in Build Report"
          >
            <span className={styles.ribbonIcon}>📋</span>Send to Build
          </button>
        </div>
        {sourceLabel && (
          <>
            <div className={styles.ribbonDivider} />
            <div className={styles.ribbonGroup}>
              <span className={styles.ribbonLabel}>SOURCE</span>
              <span className={styles.ribbonContext}>
                📄 {sourceLabel.slice(0, 32)}
                {sourceLabel.length > 32 ? '…' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      <div className={styles.wordBody}>
        <div className={styles.wordPageWrap}>
          <div className={styles.wordPage}>
            <div className={styles.writerContextBar}>
              <div className={styles.writerContextCopy}>
                <span className={styles.writerContextLabel}>Live document</span>
                <strong>{sourceLabel ? 'Grounded in the current assignment context' : 'Working without a loaded source'}</strong>
              </div>
              <div className={styles.writerContextMeta}>
                <span>{writerWordCount.toLocaleString()} words</span>
                <span>{writerCharCount.toLocaleString()} chars</span>
              </div>
            </div>
            <textarea
              className={styles.wordEditor}
              value={checkText}
              onChange={(event) => onCheckTextChange(event.target.value)}
              placeholder={`Paste or type your essay, report, or paragraph here…\n\nScholar Hub checks grammar, style, clarity and tone — like Grammarly.${
                sourceLabel ? '\n\n(Source loaded and available as context.)' : ''
              }`}
              spellCheck
            />
          </div>
        </div>

        {hasWriterResult && (
          <div className={styles.wordFeedback}>
            {checkScore !== null && (
              <div className={styles.wfScoreRow}>
                <div
                  className={styles.wfScoreRing}
                  style={{
                    background: `conic-gradient(${scoreColor(checkScore)} ${checkScore}%, var(--bg-inset, #f1f5f9) 0%)`,
                  }}
                >
                  <div className={styles.wfScoreInner} style={{ color: scoreColor(checkScore) }}>
                    {checkScore}
                  </div>
                </div>
                <div className={styles.wfScoreMeta}>
                  <strong style={{ color: scoreColor(checkScore) }}>{scoreLabel(checkScore)}</strong>
                  <span className={styles.wfSummary}>{checkSummary}</span>
                </div>
                <button
                  className={styles.iconBtn}
                  style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}
                  onClick={onClearWriterResults}
                >
                  ✕
                </button>
              </div>
            )}

            {checkSuggs.length > 0 && (
              <div className={styles.wfFilterRow}>
                {(['all', 'grammar', 'style', 'clarity', 'tone'] as FilterType[]).map((filter) => {
                  const count = filter === 'all' ? activeSuggs.length : countByType(filter as SuggType);
                  if (filter !== 'all' && count === 0) return null;
                  const meta = filter !== 'all' ? SUGG_TYPE_META[filter as SuggType] : null;

                  return (
                    <button
                      key={filter}
                      className={`${styles.wfFilterBtn} ${suggFilter === filter ? styles.wfFilterBtnActive : ''}`}
                      style={
                        suggFilter === filter && meta
                          ? { borderColor: meta.color, color: meta.color, background: meta.bg }
                          : {}
                      }
                      onClick={() => onFilterChange(filter)}
                    >
                      {meta?.icon ?? '📋'} {filter === 'all' ? 'All' : meta?.label}
                      {count > 0 && <span className={styles.wfFilterCount}>{count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {filteredSuggs.length > 0 ? (
              <div className={styles.wfSuggList}>
                {filteredSuggs.map((suggestion) => {
                  const meta = SUGG_TYPE_META[suggestion.type];
                  return (
                    <div
                      key={suggestion.id}
                      className={styles.wfSuggCard}
                      style={{ borderLeft: `3px solid ${meta.color}` }}
                    >
                      <div className={styles.wfSuggHeader}>
                        <span className={styles.wfSuggBadge} style={{ color: meta.color, background: meta.bg }}>
                          {meta.icon} {meta.label}
                        </span>
                        <button
                          className={styles.wfDismissBtn}
                          onClick={() => onDismissSuggestion(suggestion.id)}
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                      <div className={styles.wfSuggBody}>
                        <div className={styles.wfSuggDiff}>
                          <span className={styles.wfSuggOriginal}>{suggestion.original}</span>
                          <span className={styles.wfSuggArrow}>→</span>
                          <span className={styles.wfSuggNew}>{suggestion.suggestion}</span>
                        </div>
                        <p className={styles.wfSuggReason}>{suggestion.reason}</p>
                      </div>
                      <button className={styles.wfApplyBtn} onClick={() => onApplySuggestion(suggestion)}>
                        Apply
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : activeSuggs.length === 0 && checkSuggs.length > 0 ? (
              <div className={styles.wfAllClear}>
                <span>✅</span>
                <p>All suggestions applied or dismissed!</p>
                {!writerSavedLib && (
                  <button className={styles.btnSecondary} onClick={onSaveWriter}>
                    📚 Save to Library
                  </button>
                )}
              </div>
            ) : null}

            {legacyResult && (
              <div className={styles.feedbackBody}>
                <pre className={styles.feedbackText}>{legacyResult}</pre>
              </div>
            )}

            {sourceBrief && (
              <div className={styles.feedbackFooter}>
                <span className={styles.sectionLabel}>Save from source</span>
                <div className={styles.chipRow}>
                  <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => onSourceAction('notes')}>
                    📝 Notes
                  </button>
                  <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => onSourceAction('quiz')}>
                    🧪 Quiz
                  </button>
                  <button
                    className={styles.actionChip}
                    disabled={sourceActionLoading !== null}
                    onClick={() => onSourceAction('flashcards')}
                  >
                    🗂️ Review Set
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.wordStatusBar}>
        <span className={styles.statusItem}>Words: <strong>{writerWordCount.toLocaleString()}</strong></span>
        <span className={styles.statusPipe}>|</span>
        <span className={styles.statusItem}>Characters: <strong>{writerCharCount.toLocaleString()}</strong></span>
        <span className={styles.statusPipe}>|</span>
        {checkScore !== null ? (
          <span className={styles.statusItem} style={{ color: scoreColor(checkScore) }}>
            ✔ Score: <strong>{checkScore}/100</strong> — {scoreLabel(checkScore)}
            {activeSuggs.length > 0 && ` · ${activeSuggs.length} suggestion${activeSuggs.length !== 1 ? 's' : ''}`}
          </span>
        ) : (
          <span className={`${styles.statusItem} ${hasWriterResult ? styles.statusGood : ''}`}>
            {checkLoading ? '⏳ Checking…' : hasWriterResult ? '✔ Feedback ready' : '● Ready'}
          </span>
        )}
        {sourceLabel && (
          <>
            <span className={styles.statusPipe}>|</span>
            <span className={styles.statusItem}>
              Source: <strong>{sourceLabel.slice(0, 28)}{sourceLabel.length > 28 ? '…' : ''}</strong>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
