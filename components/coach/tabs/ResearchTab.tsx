'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { writeScholarContext } from '@/lib/coach/scholar-context';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { ResearchMode, ResearchRanking, TopicResearchResult } from '@/lib/coach/research';
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
  const [ranking,            setRanking]            = useState<ResearchRanking>('balanced');
  const [includeWeb,         setIncludeWeb]         = useState(true);
  const [manualUrls,         setManualUrls]         = useState('');
  const [researchLoading,    setResearchLoading]    = useState(false);

  const [deepDiveQuestion,   setDeepDiveQuestion]   = useState('');
  const [deepDiveResult,     setDeepDiveResult]     = useState('');
  const [deepDiveLoading,    setDeepDiveLoading]    = useState(false);
  const [followUpHistory,    setFollowUpHistory]    = useState<Array<{ question: string; answer: string }>>([]);

  const [readingTopic,       setReadingTopic]       = useState<string | null>(sourceBrief?.title ?? null);
  const [readingArticles,    setReadingArticles]    = useState<ArticleSuggestion[]>([]);
  const [readingLoading,     setReadingLoading]     = useState(false);
  const [readingSourceLabel, setReadingSourceLabel] = useState<'source' | 'weak-topic' | null>(sourceBrief ? 'source' : null);

  const quickTopics = Array.from(new Set([
    sourceBrief?.title,
    ...(sourceBrief?.keyPoints ?? []).slice(0, 3),
    ...(researchResult?.keyIdeas ?? []).slice(0, 3),
  ].filter((value): value is string => Boolean(value && value.trim())))).slice(0, 5);

  const confidenceTone = (label: 'High' | 'Medium' | 'Baseline') => {
    if (label === 'High') return styles.confidenceHigh;
    if (label === 'Medium') return styles.confidenceMedium;
    return styles.confidenceBaseline;
  };

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

  useEffect(() => {
    if (researchTopic.trim()) return;
    if (sourceBrief?.title) setResearchTopic(sourceBrief.title);
  }, [researchTopic, sourceBrief?.title]);

  useEffect(() => {
    setFollowUpHistory([]);
    setDeepDiveQuestion('');
    setDeepDiveResult('');
  }, [researchResult?.topic]);

  const followUpSuggestions = useMemo(() => {
    if (researchResult?.followUpPrompts?.length) return researchResult.followUpPrompts;
    if (sourceBrief?.keyPoints?.length) {
      return sourceBrief.keyPoints.slice(0, 4).map((point) => `Explain this further: ${point}`);
    }
    return [];
  }, [researchResult?.followUpPrompts, sourceBrief?.keyPoints]);

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
      setFollowUpHistory((current) => [{ question: deepDiveQuestion.trim(), answer: result }, ...current].slice(0, 6));
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
        <p>Search across multiple sources, synthesize the answer, and keep your claims grounded with visible evidence.</p>
      </div>

      <div className={styles.contextBanner}>
        <span>🌐 Scholar Hub research compares multiple articles, ranks stronger sources higher, and keeps citations visible as you explore.</span>
      </div>

      {/* ── Topic research ─────────────────────────────────────────── */}
      <div className={styles.questionBox}>
        <div className={styles.readingSectionHead}>
          <h3>Research Workspace</h3>
          <span className={styles.metaTag}>
            {researchMode === 'automatic' ? 'Automatic search' : researchMode === 'manual' ? 'Manual sources' : 'Hybrid'}
          </span>
          {researchResult && <span className={styles.metaTag}>Provider: {researchResult.provider}</span>}
          <span className={styles.metaTag}>{ranking === 'academic-first' ? 'Academic first' : ranking === 'broad-web' ? 'Broad web' : 'Balanced ranking'}</span>
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

        <div className={styles.researchToolbar}>
          <label className={styles.researchToggle}>
            <input
              type="checkbox"
              checked={includeWeb}
              disabled={privacyMode === 'offline'}
              onChange={(event) => setIncludeWeb(event.target.checked)}
            />
            <span>Search the web for this topic</span>
          </label>
          <div className={styles.researchRankingGroup}>
            {(['academic-first', 'balanced', 'broad-web'] as ResearchRanking[]).map((option) => (
              <button
                key={option}
                className={`${styles.segBtn} ${ranking === option ? styles.segBtnActive : ''}`}
                onClick={() => setRanking(option)}
              >
                {option === 'academic-first' ? 'Academic first' : option === 'broad-web' ? 'Broad web' : 'Balanced'}
              </button>
            ))}
          </div>
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

        {quickTopics.length > 0 && (
          <div className={styles.quickTopicBar}>
            <span className={styles.sectionLabel}>Quick Starts</span>
            <div className={styles.quickTopicRow}>
              {quickTopics.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className={styles.quickTopicChip}
                  onClick={() => setResearchTopic(topic)}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        )}

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
            Offline privacy mode is on, so topic research is paused. Use Workspace summarizing or chat with pasted text and uploaded files for fully local work.
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
            <div className={styles.answerShell}>
              <div className={styles.answerLead}>
                <span className={styles.answerEyebrow}>Answer</span>
                <p className={styles.researchOverview}>{researchResult.overview}</p>
              </div>
              <div className={styles.answerEvidence}>
                <span className={styles.answerEyebrow}>Evidence base</span>
                <p>
                  Built from {researchResult.sources.length} ranked source{researchResult.sources.length === 1 ? '' : 's'} with
                  {' '}{researchResult.citations.length} citation{researchResult.citations.length === 1 ? '' : 's'} kept visible below.
                </p>
              </div>
            </div>
            <div className={styles.researchSummaryGrid}>
              <div className={styles.summaryCard}>
                <span>Sources</span>
                <strong>{researchResult.sources.length}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Citations</span>
                <strong>{researchResult.citations.length}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Provider</span>
                <strong>{researchResult.provider}</strong>
              </div>
              <div className={styles.summaryCard}>
                <span>Ranking</span>
                <strong>{researchResult.ranking === 'academic-first' ? 'Academic first' : researchResult.ranking === 'broad-web' ? 'Broad web' : 'Balanced'}</strong>
              </div>
            </div>
            <div className={styles.metaTagRow}>
              <span className={styles.metaTag}>{researchResult.topic}</span>
              <span className={styles.metaTag}>{researchResult.sources.length} sources</span>
              <span className={styles.metaTag}>{researchResult.includeWeb ? 'Web + academic' : 'Academic/local links only'}</span>
            </div>
            <div className={styles.rankingCallout}>
              <strong>How these sources were ranked</strong>
              <p>{researchResult.rankingSummary}</p>
            </div>
            <div className={styles.researchClaimList}>
              {researchResult.keyIdeas.map((idea, index) => {
                const linked = researchResult.citations.slice(index, index + 2);
                return (
                  <article key={idea} className={styles.researchClaimCard}>
                    <div className={styles.researchClaimHead}>
                      <span className={styles.claimIndex}>Key idea {index + 1}</span>
                      <div className={styles.claimCitationStack}>
                        {linked.map((citation) => (
                          <a
                            key={citation.id}
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.claimCitation}
                            title={citation.title}
                          >
                            {citation.label}
                          </a>
                        ))}
                      </div>
                    </div>
                    <p>{idea}</p>
                  </article>
                );
              })}
            </div>
            <div className={styles.citationRail}>
              <strong>Citations</strong>
              <div className={styles.citationCardGrid}>
                {researchResult.citations.map((citation) => (
                  <a
                    key={citation.id}
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.citationCard}
                    title={citation.source}
                  >
                    <div className={styles.citationCardHead}>
                      <span className={styles.citationLabel}>[{citation.label}]</span>
                      <span className={`${styles.citationConfidence} ${confidenceTone(citation.confidenceLabel)}`}>
                        {citation.confidenceLabel}
                      </span>
                    </div>
                    <strong>{citation.title}</strong>
                    <p>{citation.excerpt}</p>
                    <div className={styles.citationMetaRow}>
                      <span>{citation.type}</span>
                      <span>{citation.origin === 'manual' ? 'Manual source' : 'Auto-ranked'}</span>
                      <span>~{citation.readingMinutes} min</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Compared sources ───────────────────────────────────────── */}
      {researchResult && (
        <div className={styles.readingSection}>
          <div className={styles.readingSectionHead}>
            <h3>Compared Sources</h3>
            <span className={styles.metaTag}>Manual + automatic collection</span>
            <span className={styles.metaTag}>Ranked by source confidence</span>
          </div>
          <div className={styles.articleGrid}>
            {researchResult.sources.map((source) => (
              <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className={styles.articleCard}>
                <div className={styles.articleCardHead}>
                  <span className={styles.articleSource}>{source.origin === 'manual' ? `Manual ${source.citationLabel}` : `Auto ${source.citationLabel}`}</span>
                  <span className={styles.articleTime}>~{source.readingMinutes} min</span>
                </div>
                <div className={styles.articleBadgeRow}>
                  <span className={styles.metaTag}>{source.type}</span>
                  <span className={`${styles.metaTag} ${confidenceTone(source.confidenceLabel)}`}>{source.confidenceLabel} confidence</span>
                  <span className={styles.metaTag}>Score {source.confidenceScore}</span>
                </div>
                <div className={styles.sourceScoreBar}>
                  <div className={styles.sourceScoreFill} style={{ width: `${source.confidenceScore}%` }} />
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
                <span className={styles.articleLink}>Open source [{source.citationLabel}] ↗</span>
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
        {followUpSuggestions.length > 0 && (
          <div className={styles.quickTopicBar}>
            <span className={styles.sectionLabel}>Suggested follow-ups</span>
            <div className={styles.quickTopicRow}>
              {followUpSuggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className={styles.quickTopicChip}
                  onClick={() => setDeepDiveQuestion(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
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
        {followUpHistory.length > 0 && (
          <div className={styles.followUpThread}>
            {followUpHistory.map((item) => (
              <article key={`${item.question}-${item.answer.slice(0, 32)}`} className={styles.followUpCard}>
                <div className={styles.followUpQuestion}>{item.question}</div>
                <pre className={styles.preText}>{item.answer}</pre>
              </article>
            ))}
          </div>
        )}
        {deepDiveResult && (
          <div className={styles.resultBlock}>
            <div className={styles.resultHead}>
              <strong>Latest answer</strong>
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
