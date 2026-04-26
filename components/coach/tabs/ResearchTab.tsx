'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { writeScholarContext } from '@/lib/coach/scholar-context';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { ResearchMode, ResearchRanking, TopicResearchResult } from '@/lib/coach/research';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';
import styles from '@/app/(dashboard)/coach/page.module.css';

interface Props {
  researchResult:     TopicResearchResult | null;
  onResearchResult:   (result: TopicResearchResult | null) => void;
  /** When set, pre-fills the topic input and triggers a search. */
  preloadTopic?:      string;
  onPreloadConsumed?: () => void;
  /** Called when the user clicks "Write report →" to switch to Writing Studio */
  onNavigateToWrite?: () => void;
}

export function ResearchTab({
  researchResult,
  onResearchResult,
  preloadTopic,
  onPreloadConsumed,
  onNavigateToWrite,
}: Props) {
  const { toast }       = useToast();
  const privacyMode     = loadClientAiDataMode();

  const [researchTopic,      setResearchTopic]      = useState(preloadTopic ?? '');
  const [researchMode,       setResearchMode]       = useState<ResearchMode>('automatic');
  const [ranking,            setRanking]            = useState<ResearchRanking>('balanced');
  const [includeWeb,         setIncludeWeb]         = useState(true);
  const [manualUrls,         setManualUrls]         = useState('');
  const [researchLoading,    setResearchLoading]    = useState(false);
  const [showAdvanced,       setShowAdvanced]       = useState(false);

  const [deepDiveQuestion,   setDeepDiveQuestion]   = useState('');
  const [deepDiveResult,     setDeepDiveResult]     = useState('');
  const [deepDiveLoading,    setDeepDiveLoading]    = useState(false);
  const [docxExporting,      setDocxExporting]      = useState(false);
  const [savingToLibrary,    setSavingToLibrary]    = useState(false);
  const [savedLibraryId,     setSavedLibraryId]     = useState<string | null>(null);
  const docxLinkRef = useRef<HTMLAnchorElement | null>(null);
  const [followUpHistory,    setFollowUpHistory]    = useState<Array<{ question: string; answer: string }>>([]);

  // setters are used in loadRelatedReading; getters are reserved for an
  // upcoming "related reading" panel — underscored to satisfy lint.
  const [_readingTopic, setReadingTopic] = useState<string | null>(null);
  const [_readingArticles, setReadingArticles] = useState<ArticleSuggestion[]>([]);
  const [_readingLoading, setReadingLoading] = useState(false);

  // When a pre-load topic arrives (e.g., from Recovery tab)
  useEffect(() => {
    if (!preloadTopic) return;
    setResearchTopic(preloadTopic);
    void loadRelatedReading(preloadTopic);
    onPreloadConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadTopic]);

  useEffect(() => {
    setFollowUpHistory([]);
    setDeepDiveQuestion('');
    setDeepDiveResult('');
    setSavedLibraryId(null);
  }, [researchResult?.topic]);

  const followUpSuggestions = useMemo(() => {
    return researchResult?.followUpPrompts ?? [];
  }, [researchResult?.followUpPrompts]);

  const contextText = researchResult
    ? [
        `Topic: ${researchResult.topic}`,
        `Overview: ${researchResult.overview}`,
        researchResult.keyIdeas.length
          ? `Key ideas:\n${researchResult.keyIdeas.map(k => `- ${k}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n\n')
    : '';

  async function loadRelatedReading(topic: string) {
    const trimmed = topic.trim();
    if (!trimmed) return;
    setReadingTopic(trimmed);
    setReadingArticles([]);
    setReadingLoading(true);
    try {
      const res = await fetch('/api/coach/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, privacyMode }),
      });
      const payload = await res.json().catch(() => null) as ArticleSuggestion[] | { error?: string } | null;
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error ?? 'Could not load suggestions');
      setReadingArticles(Array.isArray(payload) ? payload : []);
    } catch {
      toast('Could not load reading suggestions', 'error');
    } finally {
      setReadingLoading(false);
    }
  }

  async function handleTopicResearch() {
    if (!researchTopic.trim() || researchLoading) return;
    setResearchLoading(true);
    try {
      const res = await fetch('/api/coach/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: researchTopic.trim(),
          mode: researchMode,
          ranking,
          includeWeb,
          manualUrls,
          ai: loadAiRuntimePreferences(),
          privacyMode,
        }),
      });
      const data = await res.json().catch(() => null) as TopicResearchResult & { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? 'Could not research this topic');
      const result = data as TopicResearchResult;
      onResearchResult(result);
      setReadingTopic(result.topic);
      setReadingArticles(result.relatedLinks ?? []);
      // Share context with Workspace
      writeScholarContext({
        label:            result.topic,
        sourceText:       `Topic: ${result.topic}\n\nOverview: ${result.overview}\n\nKey ideas:\n${result.keyIdeas.map(k => `- ${k}`).join('\n')}`,
        researchOverview: result.overview,
        kind:             'research',
      });
      toast(`Research brief ready from ${result.sources.length} source${result.sources.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not research this topic', 'error');
    } finally {
      setResearchLoading(false);
    }
  }

  async function handleDeepDive() {
    if (!deepDiveQuestion.trim() || deepDiveLoading) return;
    setDeepDiveLoading(true);
    setDeepDiveResult('');
    try {
      const prompt = contextText
        ? `Source context:\n${contextText}\n\nStudent question:\n${deepDiveQuestion.trim()}`
        : deepDiveQuestion.trim();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'explain', text: prompt, ai: loadAiRuntimePreferences(), privacyMode }),
      });
      const data = await res.json() as { content?: string; result?: string; error?: string };
      const result = data.content ?? data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No explanation returned');
      setDeepDiveResult(result);
      setFollowUpHistory((current) => [{ question: deepDiveQuestion.trim(), answer: result }, ...current].slice(0, 6));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Deep dive failed', 'error');
    } finally {
      setDeepDiveLoading(false);
    }
  }

  async function downloadResearchDocx() {
    if (!researchResult || docxExporting) return;
    setDocxExporting(true);
    try {
      const lines: string[] = [
        `RESEARCH BRIEF: ${researchResult.topic.toUpperCase()}`,
        '',
        'OVERVIEW',
        researchResult.overview,
        '',
        'KEY IDEAS',
        ...researchResult.keyIdeas.map((idea, i) => `${i + 1}. ${idea}`),
        '',
        'CITATIONS',
        ...researchResult.citations.map((c) =>
          `[${c.label}] ${c.title}\n${c.url}\n${c.excerpt}`
        ),
        '',
        'SOURCE RANKING',
        researchResult.rankingSummary,
      ];
      const { generateDocx } = await import('@/lib/export/docx');
      const blob = await generateDocx({
        title: `Research Brief — ${researchResult.topic}`,
        content: lines.join('\n'),
      });
      const url = URL.createObjectURL(blob);
      const a = docxLinkRef.current ?? Object.assign(document.createElement('a'), {});
      a.href = url;
      a.download = `research-${researchResult.topic.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Research brief downloaded', 'success');
    } catch {
      toast('Could not export to Word', 'error');
    } finally {
      setDocxExporting(false);
    }
  }

  async function saveResearchToLibrary() {
    if (!researchResult || savingToLibrary) return;
    setSavingToLibrary(true);
    setSavedLibraryId(null);
    try {
      const content = [
        `Research Brief: ${researchResult.topic}`,
        '─'.repeat(48),
        '',
        'OVERVIEW',
        researchResult.overview,
        '',
        'KEY IDEAS',
        ...researchResult.keyIdeas.map((idea, i) => `${i + 1}. ${idea}`),
        '',
        'CITATIONS',
        ...researchResult.citations.map((c) => `[${c.label}] ${c.title}\n    ${c.url}`),
        '',
        'SOURCE RANKING',
        researchResult.rankingSummary,
      ].join('\n');

      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'research',
          content,
          metadata: {
            title: `Research: ${researchResult.topic}`,
            category: 'Research',
            savedFrom: 'Scholar Hub',
          },
        }),
      });
      if (!res.ok) throw new Error('Could not save to library');
      const saved = await res.json() as { id: string };
      setSavedLibraryId(saved.id);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Research brief saved to Library', 'success');
    } catch {
      toast('Could not save to Library', 'error');
    } finally {
      setSavingToLibrary(false);
    }
  }

  const SUGGESTED_TOPICS = [
    'Photosynthesis explained',
    'Causes of World War I',
    'Quadratic equations',
    'Cell division — mitosis vs meiosis',
    'French Revolution timeline',
    'Newton\'s laws of motion',
    'DNA replication process',
    'Supply and demand economics',
  ];

  return (
    <div className={styles.plxPage}>

      {/* ── Sticky search header ────────────────────────────────────── */}
      <div className={styles.plxSearchHeader}>
        <div className={styles.plxSearchRow}>
          <input
            className={styles.plxSearchInput}
            value={researchTopic}
            onChange={e => setResearchTopic(e.target.value)}
            placeholder="Search any topic — photosynthesis, French Revolution, quadratic equations…"
            onKeyDown={e => e.key === 'Enter' && void handleTopicResearch()}
            disabled={privacyMode === 'offline'}
          />
          <button
            className={styles.plxSearchBtn}
            disabled={privacyMode === 'offline' || researchLoading || !researchTopic.trim()}
            onClick={() => void handleTopicResearch()}
          >
            {privacyMode === 'offline' ? 'Offline' : researchLoading ? 'Searching…' : '🔍 Search'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={styles.plxAdvancedToggle}
            onClick={() => setShowAdvanced(v => !v)}
          >
            Advanced {showAdvanced ? '▲' : '▼'}
          </button>
          {researchResult && (
            <>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {researchResult.sources.length} sources · {researchResult.citations.length} citations · via {researchResult.provider}
              </span>
              {savedLibraryId ? (
                <a href="/library" style={{ fontSize: '0.76rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>✅ Saved to Library →</a>
              ) : (
                <button
                  type="button"
                  className={styles.plxAdvancedToggle}
                  disabled={savingToLibrary}
                  onClick={() => void saveResearchToLibrary()}
                >
                  {savingToLibrary ? 'Saving…' : '📚 Save'}
                </button>
              )}
              {onNavigateToWrite && (
                <button
                  type="button"
                  className={styles.plxAdvancedToggle}
                  style={{ borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 700 }}
                  onClick={onNavigateToWrite}
                  title="Open Writing Studio with this topic pre-filled"
                >
                  ✍️ Write report →
                </button>
              )}
              <button type="button" className={styles.plxAdvancedToggle} disabled={docxExporting} onClick={() => void downloadResearchDocx()}>
                {docxExporting ? 'Exporting…' : '📄 Word'}
              </button>
              <button type="button" className={styles.plxAdvancedToggle} onClick={() => onResearchResult(null)}>Clear</button>
            </>
          )}
        </div>

        {showAdvanced && (
          <div className={styles.plxAdvanced}>
            <div className={styles.modeToggle} style={{ marginBottom: 0 }}>
              {(['automatic', 'manual', 'hybrid'] as ResearchMode[]).map(mode => (
                <button
                  key={mode}
                  className={`${styles.modeToggleBtn} ${researchMode === mode ? styles.modeToggleBtnActive : ''}`}
                  disabled={privacyMode === 'offline'}
                  onClick={() => setResearchMode(mode)}
                >
                  {mode === 'automatic' ? 'Auto' : mode === 'manual' ? 'Manual links' : 'Hybrid'}
                </button>
              ))}
            </div>
            <div className={styles.researchRankingGroup} style={{ display: 'flex', gap: '0.35rem' }}>
              {(['academic-first', 'balanced', 'broad-web'] as ResearchRanking[]).map(option => (
                <button
                  key={option}
                  className={`${styles.segBtn} ${ranking === option ? styles.segBtnActive : ''}`}
                  onClick={() => setRanking(option)}
                >
                  {option === 'academic-first' ? 'Academic first' : option === 'broad-web' ? 'Encyclopedic' : 'Balanced'}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeWeb} disabled={privacyMode === 'offline'} onChange={e => setIncludeWeb(e.target.checked)} />
              Include Wikipedia
            </label>
            {researchMode !== 'automatic' && (
              <textarea
                className={styles.textArea}
                rows={3}
                value={manualUrls}
                onChange={e => setManualUrls(e.target.value)}
                disabled={privacyMode === 'offline'}
                placeholder={'One URL per line\nhttps://example.com/article'}
                style={{ minWidth: '320px', fontSize: '0.82rem' }}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────── */}
      <div className={styles.plxBody}>

      {/* ── Offline notice ───────────────────────────────────────────── */}
      {privacyMode === 'offline' && (
        <div style={{ padding: '1rem 1.25rem' }}>
          <div className={styles.statusNote}>
            Offline privacy mode is on — topic research requires internet. Use Workspace tools for fully local work.
          </div>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {researchLoading && (
        <div className={styles.plxLoading}>
          <div>Researching <em>{researchTopic}</em>…</div>
          <div className={styles.plxLoadingBar}>
            <div className={styles.plxLoadingFill} />
          </div>
          <div style={{ fontSize: '0.79rem', color: 'var(--text-muted)' }}>Comparing sources and synthesizing answer</div>
        </div>
      )}

      {/* ── Hero empty state ─────────────────────────────────────────── */}
      {!researchResult && !researchLoading && (
        <div className={styles.plxHero}>
          <div className={styles.plxHeroIcon}>🔍</div>
          <h2>Search any study topic</h2>
          <p>Scholar Hub compares multiple sources, ranks stronger ones higher, and keeps every claim grounded with visible citations.</p>
          <div className={styles.plxSuggestions}>
            {SUGGESTED_TOPICS.map(t => (
              <button
                key={t}
                type="button"
                className={styles.plxSuggestionChip}
                onClick={() => setResearchTopic(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Result — two-column Perplexity layout ─────────────────────── */}
      {researchResult && !researchLoading && (
        <div className={styles.plxResultLayout}>

          {/* Left — Answer */}
          <div className={styles.plxAnswer}>
            <div className={styles.plxAnswerHead}>
              <h2>{researchResult.topic}</h2>
            </div>

            {/* Overview paragraph */}
            <p className={styles.plxAnswerText}>{researchResult.overview}</p>

            {/* Key ideas with citation badges */}
            {researchResult.keyIdeas.length > 0 && (
              <div className={styles.plxKeyPoints}>
                {researchResult.keyIdeas.map((idea, i) => {
                  const linkedCitation = researchResult.citations[i];
                  return (
                    <div key={idea} className={styles.plxKeyPoint}>
                      <span className={styles.plxCiteBadge}>{i + 1}</span>
                      <p className={styles.plxKeyPointText}>
                        {idea}
                        {linkedCitation && (
                          <a
                            href={linkedCitation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ marginLeft: '0.35rem', fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', verticalAlign: 'super' }}
                            title={linkedCitation.title}
                          >
                            [{linkedCitation.label}]
                          </a>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Write report prompt */}
            {onNavigateToWrite && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem 1rem',
                background: 'color-mix(in srgb, var(--primary, #6366f1) 6%, var(--bg-surface, #fff))',
                border: '1px solid color-mix(in srgb, var(--primary, #6366f1) 22%, transparent)',
                borderRadius: '0.85rem',
              }}>
                <span style={{ fontSize: '1.25rem' }}>✍️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Ready to write about this?
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>
                    Open Writing Studio with &quot;{researchResult.topic}&quot; pre-filled and your research as context.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onNavigateToWrite}
                  style={{
                    padding: '0.45rem 1rem',
                    border: 'none',
                    borderRadius: '0.65rem',
                    background: 'var(--primary)',
                    color: '#fff',
                    fontSize: '0.83rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Write report →
                </button>
              </div>
            )}

            {/* Related follow-up chips */}
            {followUpSuggestions.length > 0 && (
              <div className={styles.plxRelated}>
                <span className={styles.plxRelatedLabel}>Related questions</span>
                <div className={styles.plxRelatedChips}>
                  {followUpSuggestions.map(q => (
                    <button
                      key={q}
                      type="button"
                      className={styles.plxRelatedChip}
                      onClick={() => setDeepDiveQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up thread */}
            {followUpHistory.length > 0 && (
              <div className={styles.plxThread}>
                {followUpHistory.map(item => (
                  <div key={`${item.question}-${item.answer.slice(0, 24)}`} className={styles.plxThreadItem}>
                    <div className={styles.plxThreadQ}>{item.question}</div>
                    <div className={styles.plxThreadA}>{item.answer}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up input */}
            <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div className={styles.plxFollowRow}>
                <input
                  className={styles.plxFollowInput}
                  value={deepDiveQuestion}
                  onChange={e => setDeepDiveQuestion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && void handleDeepDive()}
                  placeholder={`Ask a follow-up about "${researchResult.topic}"…`}
                />
                <button
                  className={styles.plxFollowBtn}
                  disabled={deepDiveLoading || !deepDiveQuestion.trim()}
                  onClick={() => void handleDeepDive()}
                >
                  {deepDiveLoading ? '…' : 'Ask'}
                </button>
              </div>
              {deepDiveResult && (
                <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span>Latest answer saved to thread above</span>
                  <button
                    type="button"
                    style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => { setDeepDiveResult(''); setDeepDiveQuestion(''); }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right — Sources panel */}
          <div className={styles.plxSourcesPanel}>
            <div className={styles.plxSourcesHead}>
              <h4>Sources</h4>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{researchResult.sources.length} ranked</span>
            </div>

            {researchResult.sources.map((source, i) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.plxSourceCard}
              >
                <span className={styles.plxSourceNum}>{i + 1}</span>
                <div className={styles.plxSourceBody}>
                  <div className={styles.plxSourceTitle}>{source.title}</div>
                  <p className={styles.plxSourceExcerpt}>{source.excerpt}</p>
                  <div className={styles.plxSourceMeta}>
                    <span className={styles.plxSourceType}>{source.type}</span>
                    <span className={`${styles.plxSourceType} ${source.confidenceLabel === 'High' ? styles.plxConfHigh : source.confidenceLabel === 'Medium' ? styles.plxConfMed : styles.plxConfBase}`}>
                      {source.confidenceLabel}
                    </span>
                    <span className={styles.plxSourceTime}>~{source.readingMinutes} min</span>
                  </div>
                </div>
              </a>
            ))}

            {/* Ranking summary */}
            {researchResult.rankingSummary && (
              <div style={{ padding: '0.75rem 0.85rem', border: '1px solid var(--border-subtle)', borderRadius: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem', fontSize: '0.73rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>How sources were ranked</strong>
                {researchResult.rankingSummary}
              </div>
            )}
          </div>
        </div>
      )}

      </div>{/* end plxBody */}
    </div>
  );
}
