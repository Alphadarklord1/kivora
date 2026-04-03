'use client';

import { useRef, useState } from 'react';
import type { WritingSuggestion } from '@/app/api/coach/check/route';
import type { AssistAction } from '@/app/api/coach/assist/route';
import styles from '@/app/(dashboard)/coach/page.module.css';

type SuggType = WritingSuggestion['type'];
type FilterType = 'all' | SuggType;

const SUGG_TYPE_META: Record<SuggType, { label: string; color: string; bg: string; icon: string }> = {
  grammar: { label: 'Grammar', color: '#ef4444', bg: '#fef2f2',  icon: '✏️' },
  style:   { label: 'Style',   color: '#3b82f6', bg: '#eff6ff',  icon: '💬' },
  clarity: { label: 'Clarity', color: '#f59e0b', bg: '#fffbeb',  icon: '💡' },
  tone:    { label: 'Tone',    color: '#8b5cf6', bg: '#f5f3ff',  icon: '🎯' },
};

const ASSIST_ACTIONS: { id: AssistAction; label: string; icon: string; selectionOnly?: boolean }[] = [
  { id: 'rephrase', label: 'Rephrase',  icon: '🔁', selectionOnly: true  },
  { id: 'formal',   label: 'Make formal', icon: '🎓', selectionOnly: true },
  { id: 'simplify', label: 'Simplify', icon: '💡', selectionOnly: true  },
  { id: 'expand',   label: 'Expand',   icon: '📝', selectionOnly: true  },
  { id: 'shorten',  label: 'Shorten',  icon: '✂️', selectionOnly: true  },
  { id: 'bullets',  label: 'Bullets',  icon: '•',  selectionOnly: true  },
  { id: 'continue', label: 'Continue writing', icon: '→', selectionOnly: false },
];

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

export interface WriteCheckPanelProps {
  checkLoading:       boolean;
  checkText:          string;
  hasWriterResult:    boolean;
  writerSavedLib:     boolean;
  activeSuggs:        WritingSuggestion[];
  sourceLabel:        string;
  writerWordCount:    number;
  writerCharCount:    number;
  checkScore:         number | null;
  checkSummary:       string;
  checkSuggs:         WritingSuggestion[];
  suggFilter:         FilterType;
  legacyResult:       string;
  onCheckTextChange:  (value: string) => void;
  onCheckWork:        () => void;
  onApplyAllSuggs:    () => void;
  onCopy:             () => void;
  onExportWord:       () => void;
  onSaveWriter:       () => void;
  onClearWriter:      () => void;
  onSendDraftToBuild: () => void;
  onClearWriterResults: () => void;
  onDismissSuggestion:  (id: string) => void;
  onApplySuggestion:    (suggestion: WritingSuggestion) => void;
  onFilterChange:       (filter: FilterType) => void;
  /** Called when user wants AI to transform selected text or continue writing */
  onAiAssist:           (action: AssistAction, selectedText: string, selStart: number, selEnd: number) => void;
  assistLoading:        boolean;
  /** Optional target word count to show progress bar */
  wordCountGoal?:       number;
  onWordCountGoalChange?: (n: number) => void;
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
  onAiAssist,
  assistLoading,
  wordCountGoal,
  onWordCountGoalChange,
}: WriteCheckPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selStart, setSelStart] = useState(0);
  const [selEnd,   setSelEnd]   = useState(0);
  const [showGoalInput, setShowGoalInput] = useState(false);

  const selectedText = checkText.slice(selStart, selEnd);
  const hasSelection = selEnd > selStart && selectedText.trim().length > 0;

  const filteredSuggs =
    suggFilter === 'all'
      ? activeSuggs
      : activeSuggs.filter(s => s.type === suggFilter);

  const countByType = (type: SuggType) =>
    activeSuggs.filter(s => s.type === type).length;

  function handleSelect() {
    const el = textareaRef.current;
    if (!el) return;
    setSelStart(el.selectionStart);
    setSelEnd(el.selectionEnd);
  }

  function handleAssistAction(action: AssistAction) {
    const meta = ASSIST_ACTIONS.find(a => a.id === action);
    if (meta?.selectionOnly && !hasSelection) return;
    onAiAssist(action, selectedText, selStart, selEnd);
  }

  const goalPct = wordCountGoal && wordCountGoal > 0
    ? Math.min(100, Math.round((writerWordCount / wordCountGoal) * 100))
    : null;

  return (
    <div className={styles.wordApp}>

      {/* ── Ribbon ─────────────────────────────────────────────────── */}
      <div className={styles.wordRibbon}>

        {/* AI Assist group */}
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>AI ASSIST</span>
          {ASSIST_ACTIONS.map(action => {
            const disabled = assistLoading || (action.selectionOnly && !hasSelection) || (!action.selectionOnly && !checkText.trim());
            return (
              <button
                key={action.id}
                className={`${styles.ribbonBtn} ${action.id === 'continue' ? styles.ribbonBtnPrimary : ''}`}
                disabled={disabled}
                onClick={() => handleAssistAction(action.id)}
                title={
                  action.selectionOnly && !hasSelection
                    ? `Select text first, then ${action.label.toLowerCase()}`
                    : action.label
                }
              >
                <span className={styles.ribbonIcon}>{action.icon}</span>
                {action.label}
              </button>
            );
          })}
          {assistLoading && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center', paddingLeft: '0.35rem' }}>
              ⏳ Writing…
            </span>
          )}
        </div>

        <div className={styles.ribbonDivider} />

        {/* Review group */}
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>REVIEW</span>
          <button
            className={`${styles.ribbonBtn} ${styles.ribbonBtnAccent}`}
            disabled={checkLoading || !checkText.trim()}
            onClick={onCheckWork}
          >
            {checkLoading
              ? <><span className={styles.ribbonIcon}>⏳</span>Checking…</>
              : <><span className={styles.ribbonIcon}>✔</span>Check Writing</>
            }
          </button>
          {activeSuggs.length > 1 && (
            <button className={styles.ribbonBtn} onClick={onApplyAllSuggs} title="Apply all suggestions">
              <span className={styles.ribbonIcon}>⚡</span>Apply All
            </button>
          )}
        </div>

        <div className={styles.ribbonDivider} />

        {/* Document group */}
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>DOCUMENT</span>
          <button className={styles.ribbonBtn} disabled={!checkText} onClick={onCopy}>
            <span className={styles.ribbonIcon}>📋</span>Copy
          </button>
          <button className={styles.ribbonBtn} disabled={!checkText} onClick={onClearWriter}>
            <span className={styles.ribbonIcon}>🗑️</span>Clear
          </button>
          <button className={styles.ribbonBtn} disabled={!checkText.trim()} onClick={onSendDraftToBuild}>
            <span className={styles.ribbonIcon}>📋</span>Send to Build
          </button>
        </div>

        {sourceLabel && (
          <>
            <div className={styles.ribbonDivider} />
            <div className={styles.ribbonGroup}>
              <span className={styles.ribbonLabel}>SOURCE</span>
              <span className={styles.ribbonContext}>
                📄 {sourceLabel.slice(0, 28)}{sourceLabel.length > 28 ? '…' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Main body ──────────────────────────────────────────────── */}
      <div className={styles.wordBody}>

        {/* Document page */}
        <div className={styles.wordPageWrap}>
          <div className={styles.wordPage}>

            {/* Context bar */}
            <div className={styles.writerContextBar}>
              <div className={styles.writerContextCopy}>
                <span className={styles.writerContextLabel}>Live document</span>
                <strong>
                  {sourceLabel
                    ? 'Grounded in the current assignment context'
                    : 'Working without a loaded source'}
                </strong>
              </div>
              <div className={styles.writerContextMeta}>
                {hasSelection && (
                  <span style={{
                    fontSize: '0.75rem',
                    background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                    color: 'var(--primary)',
                    padding: '2px 7px',
                    borderRadius: '0.4rem',
                    fontWeight: 600,
                  }}>
                    {selEnd - selStart} chars selected — use AI Assist above
                  </span>
                )}
                <span>{writerWordCount.toLocaleString()} words</span>
                <span>{writerCharCount.toLocaleString()} chars</span>
              </div>
            </div>

            {/* Word count goal bar */}
            {(wordCountGoal && wordCountGoal > 0) ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 1.35rem',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--bg-inset)',
              }}>
                <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${goalPct}%`,
                    background: goalPct! >= 100 ? '#10b981' : 'var(--primary)',
                    borderRadius: 99,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {writerWordCount} / {wordCountGoal} words {goalPct! >= 100 ? '✅' : `(${goalPct}%)`}
                </span>
                <button
                  type="button"
                  onClick={() => onWordCountGoalChange?.(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
                >
                  ✕
                </button>
              </div>
            ) : showGoalInput ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 1.35rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-inset)' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Word count goal:</span>
                <input
                  type="number"
                  min={50}
                  max={10000}
                  defaultValue={500}
                  style={{ width: 72, padding: '2px 6px', fontSize: '0.82rem', border: '1px solid var(--border-default)', borderRadius: 6 }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const v = parseInt((e.target as HTMLInputElement).value, 10);
                      if (v > 0) { onWordCountGoalChange?.(v); setShowGoalInput(false); }
                    }
                  }}
                />
                <button type="button" onClick={() => setShowGoalInput(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}>✕</button>
              </div>
            ) : null}

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className={styles.wordEditor}
              value={checkText}
              onChange={e => onCheckTextChange(e.target.value)}
              onSelect={handleSelect}
              onKeyUp={handleSelect}
              onMouseUp={handleSelect}
              placeholder={`Start writing or paste your essay here…\n\nAI Assist — select any text and use the toolbar above:\n• Rephrase • Make Formal • Simplify • Expand • Shorten • Bullets\n\nOr click "Continue writing →" to let AI write the next paragraph.\n\nWhen ready, click "Check Writing" for Grammarly-style feedback.${
                sourceLabel ? '\n\n(Assignment context loaded.)' : ''
              }`}
              spellCheck
            />
          </div>
        </div>

        {/* Feedback sidebar */}
        {hasWriterResult && (
          <div className={styles.wordFeedback}>
            {checkScore !== null && (
              <div className={styles.wfScoreRow}>
                <div
                  className={styles.wfScoreRing}
                  style={{ background: `conic-gradient(${scoreColor(checkScore)} ${checkScore}%, var(--bg-inset) 0%)` }}
                >
                  <div className={styles.wfScoreInner} style={{ color: scoreColor(checkScore) }}>
                    {checkScore}
                  </div>
                </div>
                <div className={styles.wfScoreMeta}>
                  <strong style={{ color: scoreColor(checkScore) }}>{scoreLabel(checkScore)}</strong>
                  <span className={styles.wfSummary}>{checkSummary}</span>
                </div>
                <button className={styles.iconBtn} style={{ marginLeft: 'auto', alignSelf: 'flex-start' }} onClick={onClearWriterResults}>✕</button>
              </div>
            )}

            {checkSuggs.length > 0 && (
              <div className={styles.wfFilterRow}>
                {(['all', 'grammar', 'style', 'clarity', 'tone'] as FilterType[]).map(filter => {
                  const count = filter === 'all' ? activeSuggs.length : countByType(filter as SuggType);
                  if (filter !== 'all' && count === 0) return null;
                  const meta = filter !== 'all' ? SUGG_TYPE_META[filter as SuggType] : null;
                  return (
                    <button
                      key={filter}
                      className={`${styles.wfFilterBtn} ${suggFilter === filter ? styles.wfFilterBtnActive : ''}`}
                      style={suggFilter === filter && meta ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
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
                {filteredSuggs.map(suggestion => {
                  const meta = SUGG_TYPE_META[suggestion.type];
                  return (
                    <div key={suggestion.id} className={styles.wfSuggCard} style={{ borderLeft: `3px solid ${meta.color}` }}>
                      <div className={styles.wfSuggHeader}>
                        <span className={styles.wfSuggBadge} style={{ color: meta.color, background: meta.bg }}>
                          {meta.icon} {meta.label}
                        </span>
                        <button className={styles.wfDismissBtn} onClick={() => onDismissSuggestion(suggestion.id)} title="Dismiss">✕</button>
                      </div>
                      <div className={styles.wfSuggBody}>
                        <div className={styles.wfSuggDiff}>
                          <span className={styles.wfSuggOriginal}>{suggestion.original}</span>
                          <span className={styles.wfSuggArrow}>→</span>
                          <span className={styles.wfSuggNew}>{suggestion.suggestion}</span>
                        </div>
                        <p className={styles.wfSuggReason}>{suggestion.reason}</p>
                      </div>
                      <button className={styles.wfApplyBtn} onClick={() => onApplySuggestion(suggestion)}>Apply</button>
                    </div>
                  );
                })}
              </div>
            ) : activeSuggs.length === 0 && checkSuggs.length > 0 ? (
              <div className={styles.wfAllClear}>
                <span>✅</span>
                <p>All suggestions applied or dismissed!</p>
              </div>
            ) : null}

            {legacyResult && (
              <div className={styles.feedbackBody}>
                <pre className={styles.feedbackText}>{legacyResult}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Prominent action footer ─────────────────────────────────── */}
      <div className={styles.wordActionFooter}>
        <div className={styles.wordActionFooterLeft}>
          {!showGoalInput && !wordCountGoal && (
            <button
              type="button"
              className={styles.wordFooterGhost}
              onClick={() => setShowGoalInput(true)}
            >
              🎯 Set word goal
            </button>
          )}
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {writerWordCount.toLocaleString()} words · {writerCharCount.toLocaleString()} chars
            {checkScore !== null && (
              <span style={{ color: scoreColor(checkScore), fontWeight: 700, marginLeft: '0.5rem' }}>
                · Score {checkScore}/100 — {scoreLabel(checkScore)}
              </span>
            )}
          </span>
        </div>
        <div className={styles.wordActionFooterRight}>
          <button
            className={styles.wordFooterBtn}
            disabled={!checkText}
            onClick={onExportWord}
            title="Download as Word document"
          >
            📄 Download Word
          </button>
          <button
            className={`${styles.wordFooterBtn} ${styles.wordFooterBtnPrimary}`}
            disabled={!hasWriterResult || writerSavedLib}
            onClick={onSaveWriter}
            title="Save to Library"
          >
            {writerSavedLib ? '✅ Saved to Library' : '📚 Save to Library'}
          </button>
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────── */}
      <div className={styles.wordStatusBar}>
        <span className={styles.statusItem}>Words: <strong>{writerWordCount.toLocaleString()}</strong></span>
        <span className={styles.statusPipe}>|</span>
        <span className={styles.statusItem}>Chars: <strong>{writerCharCount.toLocaleString()}</strong></span>
        {goalPct !== null && (
          <>
            <span className={styles.statusPipe}>|</span>
            <span className={styles.statusItem} style={{ color: goalPct >= 100 ? '#10b981' : 'var(--text-secondary)' }}>
              Goal: <strong>{goalPct}%</strong>
            </span>
          </>
        )}
        <span className={styles.statusPipe}>|</span>
        {checkScore !== null ? (
          <span className={styles.statusItem} style={{ color: scoreColor(checkScore) }}>
            ✔ Score: <strong>{checkScore}/100</strong> — {scoreLabel(checkScore)}
            {activeSuggs.length > 0 && ` · ${activeSuggs.length} suggestion${activeSuggs.length !== 1 ? 's' : ''}`}
          </span>
        ) : (
          <span className={`${styles.statusItem} ${hasWriterResult ? styles.statusGood : ''}`}>
            {checkLoading ? '⏳ Checking…' : assistLoading ? '⏳ Writing…' : hasWriterResult ? '✔ Feedback ready' : '● Ready'}
          </span>
        )}
        {sourceLabel && (
          <>
            <span className={styles.statusPipe}>|</span>
            <span className={styles.statusItem}>Source: <strong>{sourceLabel.slice(0, 24)}{sourceLabel.length > 24 ? '…' : ''}</strong></span>
          </>
        )}
      </div>
    </div>
  );
}
