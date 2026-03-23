'use client';

import { useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import type { SourceBrief } from '@/lib/coach/source-brief';
import styles from '@/app/(dashboard)/coach/page.module.css';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

interface FeedbackSection {
  heading: string;
  body: string;
  icon: string;
}

const SECTION_ICONS: Record<string, string> = {
  grammar:     '✏️',
  clarity:     '💡',
  structure:   '🏗️',
  flow:        '🌊',
  argument:    '🎯',
  evidence:    '📚',
  conclusion:  '🏁',
  suggestion:  '💬',
  improvement: '⬆️',
  vocabulary:  '📖',
  spelling:    '🔤',
  punctuation: '❗',
  overall:     '⭐',
  summary:     '📋',
};

function iconForHeading(heading: string): string {
  const lower = heading.toLowerCase();
  for (const [key, icon] of Object.entries(SECTION_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '📝';
}

/**
 * Parse AI feedback text into sections.
 * Splits on lines like "**Section Heading**" or "## Section Heading"
 */
function parseFeedbackSections(text: string): FeedbackSection[] {
  const sections: FeedbackSection[] = [];
  // Match "**Heading**" or "## Heading" at the start of a line
  const parts = text.split(/\n(?=\*\*[^*]+\*\*|##\s)/);

  for (const part of parts) {
    const headerMatch = part.match(/^(?:\*\*([^*]+)\*\*|##\s+(.+))/);
    if (headerMatch) {
      const heading = (headerMatch[1] ?? headerMatch[2]).trim();
      const body = part.replace(/^(?:\*\*[^*]+\*\*|##\s+.+)\n?/, '').trim();
      if (heading && body) {
        sections.push({ heading, body, icon: iconForHeading(heading) });
      }
    } else if (part.trim()) {
      // No header — show as an intro/summary block
      sections.push({ heading: 'Overview', body: part.trim(), icon: '📋' });
    }
  }

  return sections.length > 0 ? sections : [{ heading: 'Feedback', body: text.trim(), icon: '📝' }];
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface Props {
  sourceBrief: SourceBrief | null;
  sourceActionLoading: string | null;
  onSourceAction: (mode: 'notes' | 'quiz' | 'flashcards') => void;
}

export function WriterTab({ sourceBrief, sourceActionLoading, onSourceAction }: Props) {
  const { toast }      = useToast();
  const privacyMode    = loadClientAiDataMode();

  const [checkText,    setCheckText]    = useState('');
  const [checkResult,  setCheckResult]  = useState('');
  const [checkLoading, setCheckLoading] = useState(false);
  const [savedToLib,   setSavedToLib]   = useState(false);

  const wordCount = countWords(checkText);
  const charCount = checkText.length;
  const status    = checkLoading ? 'Checking…' : checkResult ? 'Feedback ready' : 'Ready';

  async function handleCheckWork() {
    if (!checkText.trim() || checkLoading) return;
    setCheckLoading(true);
    setCheckResult('');
    setSavedToLib(false);
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
      const data = await res.json() as { result?: string; error?: string };
      const result = data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No feedback returned');
      setCheckResult(result);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Work checker failed', 'error');
    } finally {
      setCheckLoading(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!checkResult) return;
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'notes',
          content: `Draft:\n\n${checkText}\n\n---\n\nFeedback:\n\n${checkResult}`,
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

  const feedbackSections = checkResult ? parseFeedbackSections(checkResult) : [];

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
            disabled={!checkResult || savedToLib}
            onClick={() => void handleSaveToLibrary()}
          >
            <span className={styles.ribbonIcon}>📚</span>{savedToLib ? 'Saved' : 'Save'}
          </button>
          <button
            className={styles.ribbonBtn}
            disabled={!checkText}
            onClick={() => { setCheckText(''); setCheckResult(''); setSavedToLib(false); }}
          >
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

      {/* Document body */}
      <div className={styles.wordBody}>

        {/* Paper */}
        <div className={styles.wordPageWrap}>
          <div className={styles.wordPage}>
            <textarea
              className={styles.wordEditor}
              value={checkText}
              onChange={e => setCheckText(e.target.value)}
              placeholder={`Paste or type your essay, report, or paragraph here…\n\nScholar Hub will check grammar, clarity, flow, and paragraph structure.`}
              spellCheck
            />
          </div>
        </div>

        {/* Feedback panel */}
        {checkResult && (
          <div className={styles.wordFeedback}>
            <div className={styles.feedbackHead}>
              <strong>✔ Writing Feedback</strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!savedToLib && (
                  <button className={styles.btnSecondary} onClick={() => void handleSaveToLibrary()}>
                    📚 Save
                  </button>
                )}
                <button className={styles.iconBtn} onClick={() => { setCheckResult(''); setSavedToLib(false); }}>✕</button>
              </div>
            </div>
            <div className={styles.feedbackBody}>
              {feedbackSections.length > 1 ? (
                <div className={styles.feedbackSections}>
                  {feedbackSections.map((section, i) => (
                    <div key={i} className={styles.feedbackSection}>
                      <div className={styles.feedbackSectionHead}>
                        <span className={styles.feedbackSectionIcon}>{section.icon}</span>
                        <strong>{section.heading}</strong>
                      </div>
                      <div className={styles.feedbackSectionBody}>
                        <pre className={styles.feedbackText}>{section.body}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className={styles.feedbackText}>{checkResult}</pre>
              )}
            </div>
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
        <span className={`${styles.statusItem} ${checkResult ? styles.statusGood : ''}`}>
          {checkLoading ? '⏳ ' : checkResult ? '✔ ' : '● '}{status}
        </span>
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
