'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import type { SourceBrief } from '@/lib/coach/source-brief';
import {
  applyWritingSuggestionToText,
  applyWritingSuggestionsToText,
  buildWriterLibraryContent,
  countWords,
} from '@/lib/coach/writing';
import type { CheckResult, WritingSuggestion } from '@/app/api/coach/check/route';
import styles from '@/app/(dashboard)/coach/page.module.css';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

// ── Types ─────────────────────────────────────────────────────────────────────

type SuggType = WritingSuggestion['type'];
type FilterType = 'all' | SuggType;

const TYPE_META: Record<SuggType, { label: string; color: string; bg: string; icon: string }> = {
  grammar:  { label: 'Grammar',  color: '#ef4444', bg: '#fef2f2', icon: '✏️' },
  style:    { label: 'Style',    color: '#3b82f6', bg: '#eff6ff', icon: '💬' },
  clarity:  { label: 'Clarity',  color: '#f59e0b', bg: '#fffbeb', icon: '💡' },
  tone:     { label: 'Tone',     color: '#8b5cf6', bg: '#f5f3ff', icon: '🎯' },
};

function scoreColor(score: number): string {
  if (score >= 90) return '#10b981';
  if (score >= 75) return '#3b82f6';
  if (score >= 60) return '#f59e0b';
  return '#ef4444';
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Needs work';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sourceBrief: SourceBrief | null;
  sourceActionLoading: string | null;
  onSourceAction: (mode: 'notes' | 'quiz' | 'flashcards') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

const WRITER_DRAFT_KEY = 'kivora_writer_draft';

export function WriterTab({ sourceBrief, sourceActionLoading, onSourceAction }: Props) {
  const { toast }   = useToast();
  const privacyMode = loadClientAiDataMode();

  const [checkText,    setCheckText]    = useState('');
  const [checkLoading, setCheckLoading] = useState(false);
  const [savedToLib,   setSavedToLib]   = useState(false);

  const draftLoadedRef = useRef(false);
  const draftSaveRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draft: restore on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WRITER_DRAFT_KEY);
      if (saved) { setCheckText(saved); toast('Draft restored', 'info'); }
    } catch { /* ignore */ }
    draftLoadedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Draft: auto-save text (debounced 1s)
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    draftSaveRef.current = setTimeout(() => {
      try {
        if (checkText.trim()) localStorage.setItem(WRITER_DRAFT_KEY, checkText);
        else localStorage.removeItem(WRITER_DRAFT_KEY);
      } catch { /* storage full */ }
    }, 1000);
    return () => { if (draftSaveRef.current) clearTimeout(draftSaveRef.current); };
  }, [checkText]);

  // Structured results
  const [score,       setScore]       = useState<number | null>(null);
  const [summary,     setSummary]     = useState('');
  const [suggestions, setSuggestions] = useState<WritingSuggestion[]>([]);
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set());
  const [filter,      setFilter]      = useState<FilterType>('all');

  // Legacy fallback text (when AI doesn't return JSON)
  const [legacyResult, setLegacyResult] = useState('');

  const wordCount = countWords(checkText);
  const charCount = checkText.length;

  const hasResult   = score !== null || legacyResult.length > 0;
  const activeSuggs = suggestions.filter(s => !dismissed.has(s.id));
  const filteredSuggs = filter === 'all' ? activeSuggs : activeSuggs.filter(s => s.type === filter);

  const countByType = (type: SuggType) => activeSuggs.filter(s => s.type === type).length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCheckWork() {
    if (!checkText.trim() || checkLoading) return;
    setCheckLoading(true);
    setScore(null); setSummary(''); setSuggestions([]); setDismissed(new Set());
    setLegacyResult(''); setSavedToLib(false);
    try {
      const contextBlock = sourceBrief
        ? `Reference source:\nTitle: ${sourceBrief.title}\nSummary: ${sourceBrief.summary}`
        : undefined;
      const res = await fetch('/api/coach/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: checkText.trim(),
          context: contextBlock,
          ai: loadAiRuntimePreferences(),
          privacyMode,
        }),
      });
      const data = await res.json() as Partial<CheckResult> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Feedback failed');
      if (typeof data.score === 'number') {
        setScore(data.score);
        setSummary(data.summary ?? '');
        setSuggestions(data.suggestions ?? []);
      } else {
        setLegacyResult(data.result ?? '');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Work checker failed', 'error');
    } finally {
      setCheckLoading(false);
    }
  }

  function applySuggestion(sug: WritingSuggestion) {
    const result = applyWritingSuggestionToText(checkText, sug);
    if (!result.applied) {
      toast('Original text not found — it may have been edited', 'warning');
      setDismissed(prev => new Set([...prev, sug.id]));
      return;
    }
    setCheckText(result.text);
    setDismissed(prev => new Set([...prev, sug.id]));
    toast('Applied', 'success');
  }

  function applyAll() {
    const result = applyWritingSuggestionsToText(checkText, activeSuggs);
    setCheckText(result.text);
    setDismissed(new Set(activeSuggs.map(s => s.id)));
    toast(`Applied ${result.applied} suggestion${result.applied !== 1 ? 's' : ''}`, 'success');
  }

  function dismissSuggestion(id: string) {
    setDismissed(prev => new Set([...prev, id]));
  }

  function clearAll() {
    setCheckText(''); setScore(null); setSummary(''); setSuggestions([]);
    setDismissed(new Set()); setLegacyResult(''); setSavedToLib(false);
    try { localStorage.removeItem(WRITER_DRAFT_KEY); } catch { /* */ }
  }

  async function handleSaveToLibrary() {
    if (!hasResult) return;
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'notes',
          content: buildWriterLibraryContent({
            draft: checkText,
            score,
            summary,
            suggestions,
            legacyResult,
          }),
          metadata: { title: 'Writer feedback', savedFrom: '/coach' },
        }),
      });
      setSavedToLib(true);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Saved to Library', 'success');
    } catch {
      toast('Library sync failed', 'warning');
    }
  }

  const sc = score ?? 0;
  const color = score !== null ? scoreColor(sc) : 'var(--border-2)';

  return (
    <div className={styles.wordApp}>

      {/* Ribbon */}
      <div className={styles.wordRibbon}>
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>REVIEW</span>
          <button
            className={`${styles.ribbonBtn} ${styles.ribbonBtnPrimary}`}
            disabled={checkLoading || !checkText.trim()}
            onClick={() => void handleCheckWork()}
          >
            {checkLoading
              ? <><span className={styles.ribbonIcon}>⏳</span>Checking…</>
              : <><span className={styles.ribbonIcon}>✔</span>Check Writing</>
            }
          </button>
          {activeSuggs.length > 1 && (
            <button className={styles.ribbonBtn} onClick={applyAll} title="Apply all suggestions at once">
              <span className={styles.ribbonIcon}>⚡</span>Apply All
            </button>
          )}
        </div>
        <div className={styles.ribbonDivider} />
        <div className={styles.ribbonGroup}>
          <span className={styles.ribbonLabel}>DOCUMENT</span>
          <button
            className={styles.ribbonBtn}
            disabled={!checkText}
            onClick={() => void navigator.clipboard.writeText(checkText).then(() => toast('Copied!', 'success'))}
          >
            <span className={styles.ribbonIcon}>📋</span>Copy
          </button>
          <button
            className={styles.ribbonBtn}
            disabled={!checkText}
            onClick={() => {
              void (async () => {
                try {
                  const title = checkText.trim().split('\n').find(l => l.trim()) ?? 'Essay';
                  const { generateDocx } = await import('@/lib/export/docx');
                  const blob = await generateDocx({ title: title.slice(0, 60), content: checkText });
                  const url = URL.createObjectURL(blob);
                  Object.assign(document.createElement('a'), { href: url, download: 'essay.docx' }).click();
                  URL.revokeObjectURL(url);
                  toast('Word document downloaded', 'success');
                } catch { toast('Could not export to Word', 'error'); }
              })();
            }}
            title="Download as Word document (.docx)"
          >
            <span className={styles.ribbonIcon}>📄</span>Word
          </button>
          <button
            className={styles.ribbonBtn}
            disabled={!hasResult || savedToLib}
            onClick={() => void handleSaveToLibrary()}
          >
            <span className={styles.ribbonIcon}>📚</span>{savedToLib ? 'Saved' : 'Save'}
          </button>
          <button className={styles.ribbonBtn} disabled={!checkText} onClick={clearAll}>
            <span className={styles.ribbonIcon}>🗑️</span>Clear
          </button>
        </div>
        {sourceBrief && (
          <>
            <div className={styles.ribbonDivider} />
            <div className={styles.ribbonGroup}>
              <span className={styles.ribbonLabel}>SOURCE</span>
              <span className={styles.ribbonContext}>
                📄 {sourceBrief.title.slice(0, 32)}{sourceBrief.title.length > 32 ? '…' : ''}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Document body — editor + feedback side by side */}
      <div className={styles.wordBody}>

        {/* Paper */}
        <div className={styles.wordPageWrap}>
          <div className={styles.wordPage}>
            <textarea
              className={styles.wordEditor}
              value={checkText}
              onChange={e => { setCheckText(e.target.value); }}
              placeholder={`Paste or type your essay, report, or paragraph here…\n\nScholar Hub will check grammar, style, clarity and tone — just like Grammarly.`}
              spellCheck
            />
          </div>
        </div>

        {/* Grammarly-style feedback panel */}
        {hasResult && (
          <div className={styles.wordFeedback}>

            {/* Score gauge + summary */}
            {score !== null && (
              <div className={styles.wfScoreRow}>
                {/* Score ring */}
                <div
                  className={styles.wfScoreRing}
                  style={{
                    background: `conic-gradient(${color} ${sc}%, var(--bg-inset, #f1f5f9) 0%)`,
                  }}
                >
                  <div className={styles.wfScoreInner} style={{ color }}>
                    {sc}
                  </div>
                </div>
                <div className={styles.wfScoreMeta}>
                  <strong style={{ color }}>{scoreLabel(sc)}</strong>
                  <span className={styles.wfSummary}>{summary}</span>
                </div>
                <button
                  className={styles.iconBtn}
                  style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}
                  onClick={() => { setScore(null); setSummary(''); setSuggestions([]); setDismissed(new Set()); setLegacyResult(''); setSavedToLib(false); }}
                >✕</button>
              </div>
            )}

            {/* Category filter tabs */}
            {suggestions.length > 0 && (
              <div className={styles.wfFilterRow}>
                {(['all', 'grammar', 'style', 'clarity', 'tone'] as FilterType[]).map(f => {
                  const cnt = f === 'all' ? activeSuggs.length : countByType(f as SuggType);
                  if (f !== 'all' && cnt === 0) return null;
                  const meta = f !== 'all' ? TYPE_META[f as SuggType] : null;
                  return (
                    <button
                      key={f}
                      className={`${styles.wfFilterBtn} ${filter === f ? styles.wfFilterBtnActive : ''}`}
                      style={filter === f && meta ? { borderColor: meta.color, color: meta.color, background: meta.bg } : {}}
                      onClick={() => setFilter(f)}
                    >
                      {meta?.icon ?? '📋'} {f === 'all' ? 'All' : meta?.label}
                      {cnt > 0 && <span className={styles.wfFilterCount}>{cnt}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Suggestion cards */}
            {filteredSuggs.length > 0 ? (
              <div className={styles.wfSuggList}>
                {filteredSuggs.map(sug => {
                  const meta = TYPE_META[sug.type];
                  return (
                    <div
                      key={sug.id}
                      className={styles.wfSuggCard}
                      style={{ borderLeft: `3px solid ${meta.color}` }}
                    >
                      <div className={styles.wfSuggHeader}>
                        <span
                          className={styles.wfSuggBadge}
                          style={{ color: meta.color, background: meta.bg }}
                        >
                          {meta.icon} {meta.label}
                        </span>
                        <button
                          className={styles.wfDismissBtn}
                          onClick={() => dismissSuggestion(sug.id)}
                          title="Dismiss"
                        >✕</button>
                      </div>
                      <div className={styles.wfSuggBody}>
                        <div className={styles.wfSuggDiff}>
                          <span className={styles.wfSuggOriginal}>{sug.original}</span>
                          <span className={styles.wfSuggArrow}>→</span>
                          <span className={styles.wfSuggNew}>{sug.suggestion}</span>
                        </div>
                        <p className={styles.wfSuggReason}>{sug.reason}</p>
                      </div>
                      <button
                        className={styles.wfApplyBtn}
                        onClick={() => applySuggestion(sug)}
                      >
                        Apply
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : activeSuggs.length === 0 && suggestions.length > 0 ? (
              <div className={styles.wfAllClear}>
                <span>✅</span>
                <p>All suggestions applied or dismissed!</p>
                {!savedToLib && (
                  <button className={styles.btnSecondary} onClick={() => void handleSaveToLibrary()}>
                    📚 Save to Library
                  </button>
                )}
              </div>
            ) : null}

            {/* Legacy text fallback */}
            {legacyResult && (
              <div className={styles.feedbackBody}>
                <pre className={styles.feedbackText}>{legacyResult}</pre>
              </div>
            )}

            {/* Source actions */}
            {sourceBrief && (
              <div className={styles.feedbackFooter}>
                <span className={styles.sectionLabel}>Save from source</span>
                <div className={styles.chipRow}>
                  <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => onSourceAction('notes')}>📝 Notes</button>
                  <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => onSourceAction('quiz')}>🧪 Quiz</button>
                  <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => onSourceAction('flashcards')}>🗂️ Review Set</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className={styles.wordStatusBar}>
        <span className={styles.statusItem}>Words: <strong>{wordCount.toLocaleString()}</strong></span>
        <span className={styles.statusPipe}>|</span>
        <span className={styles.statusItem}>Characters: <strong>{charCount.toLocaleString()}</strong></span>
        <span className={styles.statusPipe}>|</span>
        {score !== null ? (
          <span className={styles.statusItem} style={{ color: scoreColor(score) }}>
            ✔ Score: <strong>{score}/100</strong> — {scoreLabel(score)}
            {activeSuggs.length > 0 && ` · ${activeSuggs.length} suggestion${activeSuggs.length !== 1 ? 's' : ''}`}
          </span>
        ) : (
          <span className={`${styles.statusItem} ${checkLoading ? '' : hasResult ? styles.statusGood : ''}`}>
            {checkLoading ? '⏳ Checking…' : hasResult ? '✔ Feedback ready' : '● Ready'}
          </span>
        )}
        {sourceBrief && (
          <>
            <span className={styles.statusPipe}>|</span>
            <span className={styles.statusItem}>
              Source: <strong>{sourceBrief.title.slice(0, 28)}{sourceBrief.title.length > 28 ? '…' : ''}</strong>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
