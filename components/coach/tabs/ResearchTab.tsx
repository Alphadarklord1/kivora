'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { writeScholarContext } from '@/lib/coach/scholar-context';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { ResearchMode, ResearchRanking, TopicResearchResult, CitationFormat } from '@/lib/coach/research';
import { formatCitations, buildMyBibUrl, buildMyBibCiteUrl } from '@/lib/coach/research';
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

  const [readingArticles,    setReadingArticles]    = useState<ArticleSuggestion[]>([]);
  const [citationFormat,     setCitationFormat]     = useState<CitationFormat>('apa');
  const [citationCopied,     setCitationCopied]     = useState(false);
  const [savingThread,       setSavingThread]       = useState(false);

  const topCitations = researchResult?.citations.slice(0, 4) ?? [];

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
    setReadingArticles([]);
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

  async function copyCitations() {
    if (!researchResult) return;
    const text = formatCitations(researchResult.citations, citationFormat);
    try {
      await navigator.clipboard.writeText(text);
      setCitationCopied(true);
      setTimeout(() => setCitationCopied(false), 2000);
    } catch {
      toast('Could not copy to clipboard', 'error');
    }
  }

  async function saveThreadToLibrary() {
    if (!researchResult || followUpHistory.length === 0 || savingThread) return;
    setSavingThread(true);
    try {
      const content = [
        `Follow-up Q&A: ${researchResult.topic}`,
        '─'.repeat(48),
        '',
        ...followUpHistory.slice().reverse().flatMap(item => [
          `Q: ${item.question}`,
          '',
          `A: ${item.answer}`,
          '',
          '─'.repeat(32),
          '',
        ]),
      ].join('\n');

      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'research',
          content,
          metadata: {
            title: `Q&A: ${researchResult.topic}`,
            category: 'Research',
            savedFrom: 'Scholar Hub',
          },
        }),
      });
      if (!res.ok) throw new Error('Could not save');
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Q&A thread saved to Library', 'success');
    } catch {
      toast('Could not save thread', 'error');
    } finally {
      setSavingThread(false);
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

        <div className={styles.plxHeaderMeta}>
          <button
            type="button"
            className={styles.plxAdvancedToggle}
            onClick={() => setShowAdvanced(v => !v)}
          >
            Advanced {showAdvanced ? '▲' : '▼'}
          </button>
          {researchResult && (
            <>
              <span className={styles.plxHeaderSummary}>
                {researchResult.sources.length} sources · {researchResult.citations.length} citations · via {researchResult.provider}
              </span>
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
                  {option === 'academic-first' ? 'Academic first' : option === 'broad-web' ? 'Broad web' : 'Balanced'}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeWeb} disabled={privacyMode === 'offline'} onChange={e => setIncludeWeb(e.target.checked)} />
              Search the web
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

          <div className={styles.plxAnswer}>
            <div className={styles.plxAnswerHead}>
              <div className={styles.plxAnswerLead}>
                <span className={styles.plxEyebrow}>Answer</span>
                <h2>{researchResult.topic}</h2>
                <p className={styles.plxAnswerMeta}>
                  Synthesized from {researchResult.sources.length} ranked sources with {researchResult.citations.length} visible citations · {researchResult.provider}
                </p>
              </div>
              <div className={styles.plxAnswerActions}>
                {savedLibraryId ? (
                  <a href="/library" className={styles.plxHeaderLink}>Saved</a>
                ) : (
                  <button
                    type="button"
                    className={styles.plxAdvancedToggle}
                    disabled={savingToLibrary}
                    onClick={() => void saveResearchToLibrary()}
                  >
                    {savingToLibrary ? 'Saving…' : 'Save'}
                  </button>
                )}
                <button type="button" className={styles.plxAdvancedToggle} disabled={docxExporting} onClick={() => void downloadResearchDocx()}>
                  {docxExporting ? 'Exporting…' : 'Word'}
                </button>
                {onNavigateToWrite && (
                  <button
                    type="button"
                    className={`${styles.plxAdvancedToggle} ${styles.plxPrimaryGhost}`}
                    onClick={onNavigateToWrite}
                    title="Open Writing Studio with this topic pre-filled"
                  >
                    Write report
                  </button>
                )}
              </div>
            </div>

            <div className={styles.plxSignalRow}>
              <div className={styles.plxSignalCard}>
                <span className={styles.plxSignalLabel}>Overview</span>
                <p>{researchResult.overview}</p>
              </div>
              <div className={styles.plxSignalCard}>
                <span className={styles.plxSignalLabel}>Ranking mode</span>
                <p>{researchResult.rankingSummary}</p>
              </div>
            </div>

            {researchResult.keyIdeas.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>Key takeaways</h3>
                  <span>{researchResult.keyIdeas.length} points</span>
                </div>
                <div className={styles.plxKeyPoints}>
                  {researchResult.keyIdeas.map((idea, i) => {
                    const linkedCitation = researchResult.citations[i];
                    return (
                      <div key={idea} className={styles.plxKeyPoint}>
                        <span className={styles.plxCiteBadge}>{i + 1}</span>
                        <div className={styles.plxKeyPointBody}>
                          <p className={styles.plxKeyPointText}>{idea}</p>
                          {linkedCitation && (
                            <a
                              href={linkedCitation.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.plxInlineCitation}
                              title={linkedCitation.title}
                            >
                              {linkedCitation.label} · {linkedCitation.title}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {topCitations.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>Citations used</h3>
                  <span>Jump straight to the evidence</span>
                </div>
                <div className={styles.plxCitationGrid}>
                  {topCitations.map((citation) => (
                    <a
                      key={citation.id}
                      href={citation.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.plxCitationCard}
                    >
                      <div className={styles.plxCitationHead}>
                        <span className={styles.plxSourceNum}>{citation.label.replace('S', '')}</span>
                        <span className={`${styles.plxSourceType} ${citation.confidenceLabel === 'High' ? styles.plxConfHigh : citation.confidenceLabel === 'Medium' ? styles.plxConfMed : styles.plxConfBase}`}>
                          {citation.confidenceLabel}
                        </span>
                      </div>
                      <strong>{citation.title}</strong>
                      <p>{citation.excerpt}</p>
                      <span className={styles.plxCitationMeta}>{citation.source} · ~{citation.readingMinutes} min</span>
                    </a>
                  ))}
                </div>

                {/* Citation export row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Export as:</span>
                  {(['apa', 'mla', 'chicago', 'harvard'] as CitationFormat[]).map(fmt => (
                    <button
                      key={fmt}
                      type="button"
                      className={`${styles.plxAdvancedToggle} ${citationFormat === fmt ? styles.plxPrimaryGhost : ''}`}
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.78rem', textTransform: 'uppercase' }}
                      onClick={() => setCitationFormat(fmt)}
                    >
                      {fmt}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.plxAdvancedToggle}
                    style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem' }}
                    onClick={() => void copyCitations()}
                  >
                    {citationCopied ? '✓ Copied' : 'Copy'}
                  </button>
                  <a
                    href={buildMyBibUrl(researchResult.topic)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.plxAdvancedToggle}
                    style={{ padding: '0.2rem 0.65rem', fontSize: '0.78rem', textDecoration: 'none' }}
                    title="Open MyBib to build a full bibliography for this topic"
                  >
                    MyBib →
                  </a>
                </div>

                {/* Per-source MyBib links in the sidebar below */}
              </section>
            )}

            {followUpSuggestions.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>Ask next</h3>
                  <span>Follow the same source set</span>
                </div>
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
              </section>
            )}

            {followUpHistory.length > 0 && (
              <section className={styles.plxSection}>
                <div className={styles.plxSectionHead}>
                  <h3>Follow-up thread</h3>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <span>{followUpHistory.length} answers</span>
                    <button
                      type="button"
                      className={styles.plxAdvancedToggle}
                      style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                      disabled={savingThread}
                      onClick={() => void saveThreadToLibrary()}
                    >
                      {savingThread ? 'Saving…' : 'Save to Library'}
                    </button>
                  </div>
                </div>
                <div className={styles.plxThread}>
                  {followUpHistory.map(item => (
                    <div key={`${item.question}-${item.answer.slice(0, 24)}`} className={styles.plxThreadItem}>
                      <div className={styles.plxThreadQ}>{item.question}</div>
                      <div className={styles.plxThreadA}>{item.answer}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={`${styles.plxSection} ${styles.plxFollowSection}`}>
              <div className={styles.plxSectionHead}>
                <h3>Ask a follow-up</h3>
                <span>Keep the current research context</span>
              </div>
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
                  {deepDiveLoading ? 'Thinking…' : 'Ask'}
                </button>
              </div>
              {deepDiveResult && (
                <div className={styles.plxFollowHint}>
                  <span>Latest answer was added to the thread above.</span>
                  <button
                    type="button"
                    className={styles.plxInlineBtn}
                    onClick={() => { setDeepDiveResult(''); setDeepDiveQuestion(''); }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </section>
          </div>

          <aside className={styles.plxSourcesPanel}>
            <div className={styles.plxSourcesHead}>
              <div>
                <h4>Sources</h4>
                <p className={styles.plxSourcesSubhead}>Open the originals and compare the ranking yourself.</p>
              </div>
              <span className={styles.plxHeaderSummary}>{researchResult.sources.length} ranked</span>
            </div>

            {researchResult.sources.map((source, i) => (
              <div key={source.id} className={styles.plxSourceCard} style={{ display: 'block' }}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: '0.5rem' }}
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
                <a
                  href={buildMyBibCiteUrl(source.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.35rem', marginLeft: '1.6rem', fontSize: '0.72rem', color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.75 }}
                  title="Cite this source in MyBib"
                >
                  Cite in MyBib →
                </a>
              </div>
            ))}

            {readingArticles.length > 0 && (
              <div className={styles.plxSidebarGroup}>
                <div className={styles.plxSidebarHead}>Related reading</div>
                <div className={styles.plxSidebarLinks}>
                  {readingArticles.slice(0, 4).map((article) => (
                    <Link key={article.url} href={article.url} target="_blank" rel="noopener noreferrer" className={styles.plxSidebarLink}>
                      {article.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {researchResult.rankingSummary && (
              <div className={styles.plxSidebarGroup}>
                <div className={styles.plxSidebarHead}>How this answer was ranked</div>
                <p className={styles.plxSidebarText}>{researchResult.rankingSummary}</p>
              </div>
            )}
          </aside>
        </div>
      )}

      </div>{/* end plxBody */}
    </div>
  );
}
