'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { writeScholarContext } from '@/lib/coach/scholar-context';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { ResearchMode, TopicResearchResult } from '@/lib/coach/research';
import styles from '@/app/(dashboard)/coach/page.module.css';

interface Props {
  sourceBrief:        SourceBrief | null;
  researchResult:     TopicResearchResult | null;
  onResearchResult:   (result: TopicResearchResult | null) => void;
  /** When set, pre-fills the topic input and triggers a search. */
  preloadTopic?:      string;
  onPreloadConsumed?: () => void;
}

export function ResearchTab({
  sourceBrief,
  researchResult,
  onResearchResult,
  preloadTopic,
  onPreloadConsumed,
}: Props) {
  const { toast }       = useToast();
  const privacyMode     = loadClientAiDataMode();

  const [researchTopic,      setResearchTopic]      = useState(preloadTopic ?? sourceBrief?.title ?? '');
  const [researchMode,       setResearchMode]       = useState<ResearchMode>('automatic');
  const [manualUrls,         setManualUrls]         = useState('');
  const [researchLoading,    setResearchLoading]    = useState(false);

  const [deepDiveQuestion,   setDeepDiveQuestion]   = useState('');
  const [deepDiveResult,     setDeepDiveResult]     = useState('');
  const [deepDiveLoading,    setDeepDiveLoading]    = useState(false);

  const [readingTopic,       setReadingTopic]       = useState<string | null>(sourceBrief?.title ?? null);
  const [readingArticles,    setReadingArticles]    = useState<ArticleSuggestion[]>([]);
  const [readingLoading,     setReadingLoading]     = useState(false);
  const [readingSourceLabel, setReadingSourceLabel] = useState<'source' | 'weak-topic' | null>(sourceBrief ? 'source' : null);

  // Seed reading articles from initial source brief
  useEffect(() => {
    if (sourceBrief?.title && readingArticles.length === 0 && !readingLoading) {
      void loadRelatedReading(sourceBrief.title, 'source');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBrief?.title]);

  // When a pre-load topic arrives (e.g., from Recovery tab)
  useEffect(() => {
    if (!preloadTopic) return;
    setResearchTopic(preloadTopic);
    void loadRelatedReading(preloadTopic, 'weak-topic');
    onPreloadConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadTopic]);

  const contextText = researchResult
    ? [
        `Topic: ${researchResult.topic}`,
        `Overview: ${researchResult.overview}`,
        researchResult.keyIdeas.length
          ? `Key ideas:\n${researchResult.keyIdeas.map(k => `- ${k}`).join('\n')}`
          : '',
      ].filter(Boolean).join('\n\n')
    : sourceBrief
      ? [
          `Title: ${sourceBrief.title}`,
          `Summary: ${sourceBrief.summary}`,
        ].filter(Boolean).join('\n\n')
      : '';

  async function loadRelatedReading(topic: string, source: 'source' | 'weak-topic') {
    const trimmed = topic.trim();
    if (!trimmed) return;
    setReadingTopic(trimmed);
    setReadingSourceLabel(source);
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
      setReadingSourceLabel('source');
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
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Deep dive failed', 'error');
    } finally {
      setDeepDiveLoading(false);
    }
  }

  return (
    <div className={styles.deepDiveLayout}>
      <div className={styles.panelHead}>
        <h2>Research</h2>
        <p>Research a topic across multiple articles, pull out the shared ideas, and keep digging with follow-up questions.</p>
      </div>

      <div className={styles.contextBanner}>
        <span>🌐 Topic research uses live web sources. Offline/local mode still works for Source Brief on pasted text or uploaded files, but automatic article research needs internet.</span>
      </div>

      {/* ── Topic research ─────────────────────────────────────────── */}
      <div className={styles.questionBox}>
        <div className={styles.readingSectionHead}>
          <h3>Topic Research</h3>
          <span className={styles.metaTag}>
            {researchMode === 'automatic' ? 'Automatic search' : researchMode === 'manual' ? 'Manual sources' : 'Hybrid'}
          </span>
          {researchResult && <span className={styles.metaTag}>Provider: {researchResult.provider}</span>}
        </div>

        <div className={styles.modeToggle}>
          {(['automatic', 'manual', 'hybrid'] as ResearchMode[]).map(mode => (
            <button
              key={mode}
              className={`${styles.modeToggleBtn} ${researchMode === mode ? styles.modeToggleBtnActive : ''}`}
              disabled={privacyMode === 'offline'}
              onClick={() => setResearchMode(mode)}
            >
              {mode === 'automatic' ? 'Auto search' : mode === 'manual' ? 'Manual links' : 'Hybrid'}
            </button>
          ))}
        </div>

        <div className={styles.inputRow}>
          <input
            className={styles.textInput}
            value={researchTopic}
            onChange={e => setResearchTopic(e.target.value)}
            placeholder="Research a topic like photosynthesis, the French Revolution, or stoichiometry…"
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && void handleTopicResearch()}
          />
          <button
            className={styles.btnPrimary}
            disabled={privacyMode === 'offline' || researchLoading || !researchTopic.trim()}
            onClick={() => void handleTopicResearch()}
          >
            {privacyMode === 'offline' ? 'Needs internet' : researchLoading ? 'Researching…' : 'Research topic'}
          </button>
        </div>

        {researchMode !== 'automatic' && (
          <textarea
            className={styles.textArea}
            rows={4}
            value={manualUrls}
            onChange={e => setManualUrls(e.target.value)}
            disabled={privacyMode === 'offline'}
            placeholder={'Add one article URL per line to compare manual sources.\nhttps://example.com/article-1\nhttps://example.com/article-2'}
          />
        )}

        {privacyMode === 'offline' && (
          <div className={styles.statusNote}>
            Offline privacy mode is on, so topic research is paused. Use Source Brief with pasted text or uploaded files for fully local work.
          </div>
        )}

        {!researchResult ? (
          <div className={styles.emptyBrief}>
            <div className={styles.emptyIcon}>🔎</div>
            <strong>Your research synthesis appears here</strong>
            <p>Use automatic search, manual article links, or both. Scholar Hub will compare the sources and extract the shared ideas.</p>
          </div>
        ) : (
          <div className={styles.resultBlock}>
            <div className={styles.resultHead}>
              <strong>Research synthesis</strong>
              <button className={styles.btnSecondary} onClick={() => onResearchResult(null)}>Clear</button>
            </div>
            <p className={styles.researchOverview}>{researchResult.overview}</p>
            <div className={styles.metaTagRow}>
              <span className={styles.metaTag}>{researchResult.topic}</span>
              <span className={styles.metaTag}>{researchResult.sources.length} sources</span>
            </div>
            <ul className={styles.researchIdeaList}>
              {researchResult.keyIdeas.map(idea => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Compared sources ───────────────────────────────────────── */}
      {researchResult && (
        <div className={styles.readingSection}>
          <div className={styles.readingSectionHead}>
            <h3>Compared Sources</h3>
            <span className={styles.metaTag}>Manual + automatic collection</span>
          </div>
          <div className={styles.articleGrid}>
            {researchResult.sources.map((source, index) => (
              <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className={styles.articleCard}>
                <div className={styles.articleCardHead}>
                  <span className={styles.articleSource}>{source.origin === 'manual' ? `Manual S${index + 1}` : `Auto S${index + 1}`}</span>
                  <span className={styles.articleTime}>~{source.readingMinutes} min</span>
                </div>
                <strong className={styles.articleTitle}>{source.title}</strong>
                <p className={styles.articleExcerpt}>{source.excerpt}</p>
                {source.keyPoints.length > 0 && (
                  <ul className={styles.sourcePointList}>
                    {source.keyPoints.slice(0, 3).map(point => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                )}
                <span className={styles.articleLink}>Open source ↗</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Follow-up question ─────────────────────────────────────── */}
      <div className={styles.questionBox}>
        <div className={styles.readingSectionHead}>
          <h3>Ask a follow-up</h3>
          {researchResult && <span className={styles.metaTag}>Uses current research context</span>}
        </div>
        <div className={styles.inputRow}>
          <textarea
            className={styles.textArea}
            rows={3}
            value={deepDiveQuestion}
            onChange={e => setDeepDiveQuestion(e.target.value)}
            placeholder={
              researchResult
                ? `Ask anything about "${researchResult.topic}"…`
                : sourceBrief
                  ? `Ask anything about "${sourceBrief.title}"…`
                  : 'Ask a follow-up question about any topic…'
            }
            style={{ flex: 1 }}
          />
          <button
            className={styles.btnPrimary}
            disabled={deepDiveLoading || !deepDiveQuestion.trim()}
            onClick={() => void handleDeepDive()}
            style={{ alignSelf: 'flex-end' }}
          >
            {deepDiveLoading ? '…' : 'Ask'}
          </button>
        </div>
        {deepDiveResult && (
          <div className={styles.resultBlock}>
            <div className={styles.resultHead}>
              <strong>Explanation</strong>
              <button className={styles.btnSecondary} onClick={() => { setDeepDiveResult(''); setDeepDiveQuestion(''); }}>Clear</button>
            </div>
            <pre className={styles.preText}>{deepDiveResult}</pre>
          </div>
        )}
      </div>

      {/* ── More Reading ───────────────────────────────────────────── */}
      <div className={styles.readingSection}>
        <div className={styles.readingSectionHead}>
          <h3>More Reading</h3>
          {readingTopic && <span className={styles.metaTag}>Topic: {readingTopic}</span>}
          {sourceBrief && readingSourceLabel !== 'source' && (
            <button className={styles.btnSecondary} onClick={() => void loadRelatedReading(sourceBrief.title, 'source')}>
              Back to source
            </button>
          )}
        </div>
        {!readingTopic ? (
          <div className={styles.emptyBrief}>
            <div className={styles.emptyIcon}>📚</div>
            <strong>More reading appears here</strong>
            <p>Run topic research, analyze a source, or ask a question above to get reading suggestions.</p>
          </div>
        ) : readingLoading ? (
          <div className={styles.loadingNote}>⏳ Loading suggestions for <em>{readingTopic}</em>…</div>
        ) : readingArticles.length === 0 ? (
          <div className={styles.emptyBrief}><strong>No suggestions found</strong></div>
        ) : (
          <div className={styles.articleGrid}>
            {readingArticles.map(art => (
              <a key={art.url} href={art.url} target="_blank" rel="noopener noreferrer" className={styles.articleCard}>
                <div className={styles.articleCardHead}>
                  <span className={styles.articleSource}>{art.source}</span>
                  <span className={styles.articleTime}>~{art.readingMinutes} min</span>
                </div>
                <strong className={styles.articleTitle}>{art.title}</strong>
                <p className={styles.articleExcerpt}>{art.excerpt}</p>
                <span className={styles.articleLink}>Open article ↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
