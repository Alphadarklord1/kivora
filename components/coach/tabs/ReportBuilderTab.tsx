'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { TopicResearchResult } from '@/lib/coach/research';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { OutlineSection } from '@/app/api/coach/report/route';
import type { GradeResult } from '@/app/api/coach/grade/route';
import styles from '@/app/(dashboard)/coach/page.module.css';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';
import { mdToHtml } from '@/lib/utils/md';

// ── Types ──────────────────────────────────────────────────────────────────

type ReportType = 'essay' | 'report' | 'literature_review';

const REPORT_TYPES = [
  { id: 'essay'             as const, label: 'Essay',      desc: 'Argumentative academic essay.' },
  { id: 'report'            as const, label: 'Report',     desc: 'Structured report with sections.' },
  { id: 'literature_review' as const, label: 'Lit Review', desc: 'Review of academic sources.' },
] as const;

const ASSIGN_MODES = [
  { id: 'rephrase'   as const, label: 'Rephrase',   desc: 'Rewrite in clearer language.' },
  { id: 'explain'    as const, label: 'Explain',    desc: 'Detailed explanation.' },
  { id: 'summarize'  as const, label: 'Summarise',  desc: 'Condense to key points.' },
  { id: 'assignment' as const, label: 'Break down', desc: 'Step-by-step task guide.' },
] as const;

type AssignMode = typeof ASSIGN_MODES[number]['id'];

// ── Credibility grading ────────────────────────────────────────────────────

interface SourceGrade {
  badge:    string;
  label:    string;
  cssClass: string;
  score:    number; // higher = more credible
}

function gradeSource(type: ArticleSuggestion['type']): SourceGrade {
  switch (type) {
    case 'academic':     return { badge: 'A+', label: 'Peer-reviewed',   cssClass: styles.gradeAPlus, score: 4 };
    case 'encyclopedia': return { badge: 'A',  label: 'Verified source', cssClass: styles.gradeA,    score: 3 };
    case 'educational':  return { badge: 'B',  label: 'Educational',     cssClass: styles.gradeB,    score: 2 };
    case 'news':         return { badge: 'C',  label: 'News/media',      cssClass: styles.gradeC,    score: 1 };
    default:             return { badge: 'B',  label: 'General',         cssClass: styles.gradeB,    score: 2 };
  }
}

function buildCitationText(source: ArticleSuggestion): string {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${source.title}. ${source.source}. Available at: ${source.url}. [Accessed ${today}]`;
}

function buildContextText(
  selectedSources: ArticleSuggestion[],
  sourceBrief: SourceBrief | null,
  researchResult: TopicResearchResult | null,
): string {
  const parts: string[] = [];

  if (researchResult) {
    parts.push(`Topic overview: ${researchResult.overview}`);
    if (researchResult.keyIdeas.length) {
      parts.push(`Key ideas:\n${researchResult.keyIdeas.map(k => `- ${k}`).join('\n')}`);
    }
  } else if (sourceBrief) {
    parts.push(`Source: ${sourceBrief.title}`);
    parts.push(`Summary: ${sourceBrief.summary}`);
    if (sourceBrief.keyPoints.length) {
      parts.push(`Key points:\n${sourceBrief.keyPoints.map(k => `- ${k}`).join('\n')}`);
    }
  }

  if (selectedSources.length > 0) {
    const refs = selectedSources
      .map((s, i) => `[S${i + 1}] ${s.title} (${s.source}): ${s.excerpt}`)
      .join('\n');
    parts.push(`Selected sources:\n${refs}`);
  }

  return parts.filter(Boolean).join('\n\n');
}

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(topic: string): string {
  return topic.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  sourceBrief:         SourceBrief | null;
  researchResult:      TopicResearchResult | null;
  onNavigateToResearch: (topic: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

const REPORT_DRAFT_KEY = 'kivora_report_draft';

export function ReportBuilderTab({ sourceBrief, researchResult, onNavigateToResearch }: Props) {
  const { toast }    = useToast();
  const privacyMode  = loadClientAiDataMode();

  // Report config
  const [reportTopic,     setReportTopic]     = useState('');
  const [reportType,      setReportType]      = useState<ReportType>('essay');
  const [reportWordCount, setReportWordCount] = useState(1000);
  const [reportKeyPoints, setReportKeyPoints] = useState('');

  // Two-step generation
  const [outline,        setOutline]        = useState<OutlineSection[] | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [reportResult,   setReportResult]   = useState('');
  const [reportLoading,  setReportLoading]  = useState(false);
  const [savedToLib,     setSavedToLib]     = useState(false);
  const [exportingDocx,  setExportingDocx]  = useState(false);
  const [exportingPptx,  setExportingPptx]  = useState(false);
  const [showPreview,    setShowPreview]    = useState(false);
  const [gradeResult,    setGradeResult]    = useState<GradeResult | null>(null);
  const [grading,        setGrading]        = useState(false);

  // Assignment helper
  const [assignText,    setAssignText]    = useState('');
  const [assignMode,    setAssignMode]    = useState<AssignMode>('assignment');
  const [assignResult,  setAssignResult]  = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Source discovery
  const [sources,         setSources]         = useState<ArticleSuggestion[]>([]);
  const [sourcesLoading,  setSourcesLoading]  = useState(false);
  const [sourcesError,    setSourcesError]    = useState('');
  const [selectedUrls,    setSelectedUrls]    = useState<Set<string>>(new Set());
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);
  const draftSaveRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Draft: restore on mount ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REPORT_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (typeof d.reportTopic     === 'string') setReportTopic(d.reportTopic);
        if (d.reportType === 'essay' || d.reportType === 'report' || d.reportType === 'literature_review') setReportType(d.reportType);
        if (typeof d.reportWordCount === 'number') setReportWordCount(d.reportWordCount);
        if (typeof d.reportKeyPoints === 'string') setReportKeyPoints(d.reportKeyPoints);
        if (Array.isArray(d.outline))               setOutline(d.outline as OutlineSection[]);
        if (typeof d.reportResult    === 'string') setReportResult(d.reportResult);
        if (d.reportTopic || d.reportResult) toast('Draft restored', 'info');
      }
    } catch { /* ignore */ }
    draftLoadedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Draft: auto-save (debounced 1s) ──────────────────────────────────────
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    draftSaveRef.current = setTimeout(() => {
      try {
        if (!reportTopic && !reportResult) { localStorage.removeItem(REPORT_DRAFT_KEY); return; }
        localStorage.setItem(REPORT_DRAFT_KEY, JSON.stringify({
          reportTopic, reportType, reportWordCount, reportKeyPoints, outline, reportResult,
        }));
      } catch { /* storage full */ }
    }, 1000);
    return () => { if (draftSaveRef.current) clearTimeout(draftSaveRef.current); };
  }, [reportTopic, reportType, reportWordCount, reportKeyPoints, outline, reportResult]);

  // ── Source discovery fetch (debounced on topic change) ──────────────────

  const fetchSources = useCallback(async (topic: string) => {
    const trimmed = topic.trim();
    if (!trimmed) { setSources([]); setSelectedUrls(new Set()); return; }
    setSourcesLoading(true);
    setSourcesError('');
    try {
      const res = await fetch('/api/coach/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, privacyMode }),
      });
      const data = await res.json().catch(() => null) as ArticleSuggestion[] | { error?: string } | null;
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Could not find sources');
      const articles = Array.isArray(data) ? data : [];
      // Sort by grade score descending
      articles.sort((a, b) => gradeSource(b.type).score - gradeSource(a.type).score);
      setSources(articles);
      // Auto-select the top 2 most credible sources
      const top2 = new Set(articles.slice(0, 2).map(a => a.url));
      setSelectedUrls(top2);
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : 'Could not load sources');
      setSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }, [privacyMode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!reportTopic.trim()) {
      setSources([]);
      setSelectedUrls(new Set());
      return;
    }
    debounceRef.current = setTimeout(() => { void fetchSources(reportTopic); }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [reportTopic, fetchSources]);

  // ── Derived ─────────────────────────────────────────────────────────────

  const selectedSources = sources.filter(s => selectedUrls.has(s.url));

  const context = buildContextText(selectedSources, sourceBrief, researchResult);

  const contextSource = researchResult
    ? `Research: ${researchResult.topic}`
    : sourceBrief
      ? `Source: ${sourceBrief.title}`
      : null;

  // ── Handlers ────────────────────────────────────────────────────────────

  function toggleSource(url: string) {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }

  async function handleCopyCitation(source: ArticleSuggestion) {
    try {
      await navigator.clipboard.writeText(buildCitationText(source));
      toast('Citation copied for MyBib', 'success');
    } catch {
      toast('Could not copy citation', 'warning');
    }
  }

  async function handleCopyAllCitations() {
    if (selectedSources.length === 0) return;
    const text = selectedSources.map((s, i) => `[${i + 1}] ${buildCitationText(s)}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(`${selectedSources.length} citation${selectedSources.length > 1 ? 's' : ''} copied for MyBib`, 'success');
    } catch {
      toast('Could not copy citations', 'warning');
    }
  }

  async function handleGenerateOutline() {
    if (!reportTopic.trim() || outlineLoading) return;
    setOutlineLoading(true);
    setOutline(null);
    setReportResult('');
    setSavedToLib(false);
    try {
      const res = await fetch('/api/coach/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: reportTopic.trim(), type: reportType,
          wordCount: reportWordCount, keyPoints: reportKeyPoints.trim(),
          context: context || undefined,
          ai: loadAiRuntimePreferences(), privacyMode,
          step: 'outline',
        }),
      });
      const data = await res.json() as { outline?: OutlineSection[]; error?: string };
      if (!res.ok || !data.outline) throw new Error(data.error ?? 'Could not generate outline');
      setOutline(data.outline);
      toast('Outline ready — review and edit it, then write the full draft', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not generate outline', 'error');
    } finally {
      setOutlineLoading(false);
    }
  }

  async function handleWriteDraft() {
    if (!reportTopic.trim() || reportLoading) return;
    setReportLoading(true);
    setReportResult('');
    setSavedToLib(false);
    try {
      const res = await fetch('/api/coach/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: reportTopic.trim(), type: reportType,
          wordCount: reportWordCount, keyPoints: reportKeyPoints.trim(),
          context: context || undefined,
          ai: loadAiRuntimePreferences(), privacyMode,
          step: 'draft',
          outline: outline ?? undefined,
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'No content returned');
      setReportResult(data.result);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Report builder failed', 'error');
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSaveToLibrary() {
    if (!reportResult) return;
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'notes',
          content: reportResult,
          metadata: {
            title: `${REPORT_TYPES.find(t => t.id === reportType)?.label} — ${reportTopic}`,
            savedFrom: '/coach',
          },
        }),
      });
      setSavedToLib(true);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Saved to Library', 'success');
    } catch {
      toast('Library sync failed', 'warning');
    }
  }

  async function handleAssignHelper() {
    if (!assignText.trim() || assignLoading) return;
    setAssignLoading(true);
    setAssignResult('');
    try {
      const text = context
        ? `Reference source:\n${context}\n\nStudent request:\n${assignText.trim()}`
        : assignText.trim();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: assignMode, text, options: { count: 5 }, ai: loadAiRuntimePreferences(), privacyMode }),
      });
      const data = await res.json() as { content?: string; result?: string; error?: string };
      const result = data.content ?? data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No result returned');
      setAssignResult(result);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Assignment helper failed', 'error');
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleGrade() {
    if (!reportResult || grading) return;
    setGrading(true);
    try {
      const res = await fetch('/api/coach/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report:           reportResult,
          topic:            reportTopic,
          type:             reportType,
          targetWordCount:  reportWordCount,
          sourceCount:      selectedSources.length,
          ai:               loadAiRuntimePreferences(),
          privacyMode,
        }),
      });
      const data = await res.json() as GradeResult & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Grading failed');
      setGradeResult(data);
      setShowPreview(true);
      toast(`Report graded: ${data.overall}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not grade report', 'error');
    } finally {
      setGrading(false);
    }
  }

  async function handleExportDocx() {
    if (!reportResult || exportingDocx) return;
    setExportingDocx(true);
    try {
      const refs = selectedSources.map((s, i) => `[${i + 1}] ${s.title}. ${s.source}. ${s.url}`);
      const { generateDocx } = await import('@/lib/export/docx');
      const blob = await generateDocx({ title: reportTopic, content: reportResult, references: refs });
      triggerDownload(blob, `${safeFilename(reportTopic)}.docx`);
      toast('Word document downloaded', 'success');
    } catch {
      toast('Could not generate Word document', 'error');
    } finally {
      setExportingDocx(false);
    }
  }

  async function handleExportPptx() {
    if (!reportResult || exportingPptx) return;
    setExportingPptx(true);
    try {
      const refs = selectedSources.map((s, i) => `[${i + 1}] ${s.title}. ${s.source}. ${s.url}`);
      const { generatePptx } = await import('@/lib/export/pptx');
      const blob = await generatePptx({
        title:      reportTopic,
        subtitle:   REPORT_TYPES.find(t => t.id === reportType)?.label,
        content:    reportResult,
        references: refs,
      });
      triggerDownload(blob, `${safeFilename(reportTopic)}.pptx`);
      toast('PowerPoint downloaded', 'success');
    } catch {
      toast('Could not generate PowerPoint', 'error');
    } finally {
      setExportingPptx(false);
    }
  }

  const draftWordCount = countWords(reportResult);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.reportLayout}>

      <div className={styles.panelHead}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Report Builder</h2>
          {(reportTopic || reportResult) && (
            <button
              className={styles.btnSecondary}
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                setReportTopic(''); setReportType('essay'); setReportWordCount(1000);
                setReportKeyPoints(''); setOutline(null); setReportResult('');
                setSavedToLib(false); setGradeResult(null);
                localStorage.removeItem(REPORT_DRAFT_KEY);
                toast('Draft cleared', 'info');
              }}
              title="Clear all work and start fresh"
            >
              🗑 Clear draft
            </button>
          )}
        </div>
        <p>Find and verify sources, then generate a model report or essay to reference while you write your own.</p>
      </div>

      {/* Controls row */}
      <div className={styles.reportControls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Type</label>
          <div className={styles.segControl}>
            {REPORT_TYPES.map(t => (
              <button
                key={t.id}
                className={`${styles.segBtn} ${reportType === t.id ? styles.segBtnActive : ''}`}
                onClick={() => setReportType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.controlGroup} style={{ flex: 2 }}>
          <label className={styles.controlLabel}>Topic</label>
          <input
            className={styles.textInput}
            value={reportTopic}
            onChange={e => setReportTopic(e.target.value)}
            placeholder="e.g. The causes of World War I"
            onKeyDown={e => e.key === 'Enter' && !outlineLoading && reportTopic.trim() ? void handleGenerateOutline() : undefined}
          />
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Words</label>
          <select className={styles.selectInput} value={reportWordCount} onChange={e => setReportWordCount(+e.target.value)}>
            {[500, 750, 1000, 1500, 2000, 3000].map(n => (
              <option key={n} value={n}>{n.toLocaleString()}</option>
            ))}
          </select>
        </div>
        <button
          className={styles.btnPrimary}
          style={{ alignSelf: 'flex-end' }}
          disabled={outlineLoading || reportLoading || !reportTopic.trim()}
          onClick={() => void handleGenerateOutline()}
        >
          {outlineLoading ? 'Building…' : '📋 Outline'}
        </button>
        {outline && (
          <button
            className={styles.btnPrimary}
            style={{ alignSelf: 'flex-end' }}
            disabled={reportLoading}
            onClick={() => void handleWriteDraft()}
          >
            {reportLoading ? 'Writing…' : '✨ Write Draft'}
          </button>
        )}
      </div>

      <div className={styles.controlGroup}>
        <label className={styles.controlLabel}>
          Key points to cover <span className={styles.optional}>(optional)</span>
        </label>
        <textarea
          className={styles.textArea}
          rows={2}
          value={reportKeyPoints}
          onChange={e => setReportKeyPoints(e.target.value)}
          placeholder="e.g. Alliance system, nationalism, assassination of Franz Ferdinand…"
        />
      </div>

      {/* ── Source discovery panel ────────────────────────────────── */}
      {reportTopic.trim() && (
        <div className={styles.sourceDiscovery}>
          <div className={styles.sourceDiscoveryHead}>
            <strong>📚 Sources</strong>
            <span className={styles.sourceDiscoveryStatus}>
              {sourcesLoading
                ? '⏳ Finding sources…'
                : sourcesError
                  ? `⚠️ ${sourcesError}`
                  : sources.length > 0
                    ? `${sources.length} sources found — ${selectedUrls.size} selected for report`
                    : 'No sources yet'}
            </span>
          </div>

          {sources.length > 0 && (
            <div className={styles.sourceCardGrid}>
              {sources.map(source => {
                const grade    = gradeSource(source.type);
                const selected = selectedUrls.has(source.url);
                return (
                  <div
                    key={source.url}
                    className={`${styles.sourceCard} ${selected ? styles.sourceCardSelected : ''}`}
                    onClick={() => toggleSource(source.url)}
                  >
                    <div className={styles.sourceCardTop}>
                      <div className={styles.sourceCardMeta}>
                        <span className={`${styles.sourceGradeBadge} ${grade.cssClass}`} title={grade.label}>
                          {grade.badge}
                        </span>
                        <span className={styles.sourceCardOrigin}>{source.source}</span>
                      </div>
                      <span className={styles.sourceCardTime}>~{source.readingMinutes} min</span>
                    </div>
                    <strong className={styles.sourceCardTitle}>{source.title}</strong>
                    <p className={styles.sourceCardExcerpt}>{source.excerpt}</p>
                    <div className={styles.sourceCardFooter}>
                      <label className={styles.sourceCardCheckbox} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSource(source.url)}
                        />
                        Use in report
                      </label>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.citationBtn}
                          onClick={e => e.stopPropagation()}
                        >
                          Open ↗
                        </a>
                        <button
                          className={styles.citationBtn}
                          onClick={e => { e.stopPropagation(); void handleCopyCitation(source); }}
                          title="Copy citation in MyBib format"
                        >
                          📎 Cite
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedUrls.size > 0 && (
            <div style={{ padding: '0 0.85rem 0.85rem' }}>
              <div className={styles.selectedBar}>
                <strong>
                  {selectedUrls.size} source{selectedUrls.size > 1 ? 's' : ''} selected
                  {' '}— included as context in your report
                </strong>
                <button className={styles.btnSecondary} onClick={() => void handleCopyAllCitations()}>
                  📎 Copy all citations for MyBib
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context banner (existing source brief / research) */}
      {contextSource && (
        <div className={styles.contextBanner}>
          <span>📄 Also using: <strong>{contextSource}</strong></span>
          <div className={styles.bannerActions}>
            <button className={styles.btnSecondary} onClick={() => onNavigateToResearch(reportTopic || (sourceBrief?.title ?? ''))}>
              Research wider
            </button>
            <a className={styles.btnSecondary} href="https://www.mybib.com/" target="_blank" rel="noopener noreferrer">
              MyBib ↗
            </a>
          </div>
        </div>
      )}

      {/* Outline editor */}
      {outline && (
        <div className={styles.outlineEditor}>
          <div className={styles.outlineEditorHead}>
            <strong>📋 Outline — edit before writing</strong>
            <div className={styles.outlineActions}>
              <button className={styles.btnSecondary} onClick={() => setOutline(null)}>Discard</button>
              <button className={styles.btnPrimary} disabled={reportLoading} onClick={() => void handleWriteDraft()}>
                {reportLoading ? 'Writing…' : '✨ Write Full Draft'}
              </button>
            </div>
          </div>
          {outline.map((section, i) => (
            <div key={i} className={styles.outlineSectionRow}>
              <span className={styles.outlineSectionNum}>{i + 1}</span>
              <div className={styles.outlineSectionInputs}>
                <input
                  className={styles.outlineHeadingInput}
                  value={section.heading}
                  onChange={e => setOutline(prev => prev ? prev.map((s, j) => j === i ? { ...s, heading: e.target.value } : s) : prev)}
                />
                <textarea
                  className={styles.outlineSummaryInput}
                  rows={2}
                  value={section.summary}
                  onChange={e => setOutline(prev => prev ? prev.map((s, j) => j === i ? { ...s, summary: e.target.value } : s) : prev)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Draft output */}
      {reportResult && (
        <div className={styles.reportOutput}>
          <div className={styles.reportOutputHead}>
            <div className={styles.reportMeta}>
              <strong>{reportTopic} — {REPORT_TYPES.find(t => t.id === reportType)?.label}</strong>
              <span className={styles.wordCountPill}>~{draftWordCount.toLocaleString()} words</span>
              {gradeResult && (
                <span
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 10px', borderRadius: 999, fontWeight: 700, fontSize: 13,
                    background: gradeResult.overall.startsWith('A') ? '#d1fae5' : gradeResult.overall.startsWith('B') ? '#dbeafe' : gradeResult.overall.startsWith('C') ? '#fef3c7' : '#fee2e2',
                    color: gradeResult.overall.startsWith('A') ? '#065f46' : gradeResult.overall.startsWith('B') ? '#1e40af' : gradeResult.overall.startsWith('C') ? '#92400e' : '#991b1b',
                  }}
                >
                  {gradeResult.overall} · {gradeResult.percentage}%
                </span>
              )}
            </div>
            <div className={styles.reportOutputActions}>
              <button className={styles.btnPrimary} onClick={() => setShowPreview(true)}>
                👁 Preview
              </button>
              <button
                className={styles.btnSecondary}
                disabled={grading}
                onClick={() => void handleGrade()}
                title="Grade this report with AI rubric"
              >
                {grading ? 'Grading…' : '🏅 Grade'}
              </button>
              <button className={styles.btnSecondary} onClick={() => void navigator.clipboard.writeText(reportResult).then(() => toast('Copied!', 'success'))}>
                📋 Copy
              </button>
              <button
                className={styles.btnSecondary}
                disabled={exportingDocx}
                onClick={() => void handleExportDocx()}
                title="Download as Word document (.docx)"
              >
                {exportingDocx ? '…' : '📄 Word'}
              </button>
              <button
                className={styles.btnSecondary}
                disabled={exportingPptx}
                onClick={() => void handleExportPptx()}
                title="Download as PowerPoint presentation (.pptx)"
              >
                {exportingPptx ? '…' : '📊 Slides'}
              </button>
              {!savedToLib && (
                <button className={styles.btnSecondary} onClick={() => void handleSaveToLibrary()}>
                  📚 Save
                </button>
              )}
              <button className={styles.btnSecondary} onClick={() => {
                setReportResult(''); setSavedToLib(false); setGradeResult(null);
                setOutline(null);
                try { localStorage.setItem(REPORT_DRAFT_KEY, JSON.stringify({ reportTopic, reportType, reportWordCount, reportKeyPoints, outline: null, reportResult: '' })); } catch { /* */ }
              }}>
                Clear
              </button>
            </div>
          </div>
          {savedToLib && <div className={styles.savedStrip}>✓ Saved to Library</div>}
          <div className={styles.reportDoc}>{reportResult}</div>

          {/* References section */}
          {selectedSources.length > 0 && (
            <div style={{ padding: '0 2rem 1.5rem' }}>
              <div className={styles.refSection}>
                <h4>References</h4>
                <ol className={styles.refList}>
                  {selectedSources.map((s, i) => (
                    <li key={s.url} className={styles.refItem}>
                      <span className={styles.refNum}>[{i + 1}]</span>
                      <span>
                        {s.title}. <em>{s.source}</em>.{' '}
                        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a>
                        {'. [Accessed ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ']'}
                      </span>
                    </li>
                  ))}
                </ol>
                <div style={{ marginTop: '0.6rem' }}>
                  <button className={styles.btnSecondary} onClick={() => void handleCopyAllCitations()}>
                    📎 Copy all for MyBib
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Report Preview Modal ──────────────────────────────────────────── */}
      {showPreview && reportResult && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report preview"
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '20px 16px', overflowY: 'auto',
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowPreview(false); }}
        >
          <div style={{
            background: 'var(--bg-elevated, #fff)', borderRadius: 16,
            width: '100%', maxWidth: 820,
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Preview header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                  {reportTopic}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '2px 8px' }}>
                  {REPORT_TYPES.find(t => t.id === reportType)?.label}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>~{draftWordCount.toLocaleString()} words</span>
                {gradeResult && (
                  <span style={{
                    padding: '3px 12px', borderRadius: 999, fontWeight: 700, fontSize: 14,
                    background: gradeResult.overall.startsWith('A') ? '#d1fae5' : gradeResult.overall.startsWith('B') ? '#dbeafe' : gradeResult.overall.startsWith('C') ? '#fef3c7' : '#fee2e2',
                    color: gradeResult.overall.startsWith('A') ? '#065f46' : gradeResult.overall.startsWith('B') ? '#1e40af' : gradeResult.overall.startsWith('C') ? '#92400e' : '#991b1b',
                  }}>
                    Grade: {gradeResult.overall} ({gradeResult.percentage}%)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className={styles.btnSecondary}
                  disabled={exportingDocx}
                  onClick={() => void handleExportDocx()}
                  title="Download as Word .docx"
                >
                  {exportingDocx ? '…' : '📄 Download Word'}
                </button>
                <button
                  className={styles.btnSecondary}
                  disabled={exportingPptx}
                  onClick={() => void handleExportPptx()}
                >
                  {exportingPptx ? '…' : '📊 Download Slides'}
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}
                  aria-label="Close preview"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document body */}
            <div style={{ padding: '32px 48px 24px', overflowY: 'auto', maxHeight: '60vh' }}>
              <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 24px', color: 'var(--text-primary)', borderBottom: '2px solid var(--border-subtle)', paddingBottom: 12 }}>
                {reportTopic}
              </h1>
              <div
                className={styles.reportDoc}
                dangerouslySetInnerHTML={{ __html: mdToHtml(reportResult) }}
                style={{ lineHeight: 1.8, fontSize: 15 }}
              />
            </div>

            {/* Sources used */}
            {selectedSources.length > 0 && (
              <div style={{ padding: '0 48px 24px', borderTop: '1px solid var(--border-subtle)', marginTop: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 12px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Sources Used
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedSources.map((s, i) => {
                    const grade = gradeSource(s.type);
                    return (
                      <div key={s.url} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0, minWidth: 20 }}>[{i + 1}]</span>
                        <span className={`${styles.sourceGradeBadge} ${grade.cssClass}`} style={{ flexShrink: 0 }} title={grade.label}>
                          {grade.badge}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{s.title}</strong>
                          {'. '}<em>{s.source}</em>{'. '}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', wordBreak: 'break-all' }}>{s.url}</a>
                          {' [Accessed ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ']'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Grade breakdown */}
            {gradeResult && (
              <div style={{ padding: '0 48px 32px', borderTop: '1px solid var(--border-subtle)', marginTop: 8 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 12px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Grade Breakdown
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {gradeResult.criteria.map(c => (
                    <div key={c.name}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.score}/{c.maxScore}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--border-subtle)', overflow: 'hidden', marginBottom: 4 }}>
                        <div style={{
                          height: '100%',
                          width: `${(c.score / c.maxScore) * 100}%`,
                          borderRadius: 999,
                          background: c.score >= 8 ? '#10b981' : c.score >= 6 ? '#3b82f6' : c.score >= 4 ? '#f59e0b' : '#ef4444',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{c.feedback}</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
                  {gradeResult.strengths.length > 0 && (
                    <div style={{ background: 'color-mix(in srgb, #10b981 8%, var(--bg-surface))', border: '1px solid color-mix(in srgb, #10b981 25%, transparent)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#059669', marginBottom: 8 }}>✓ Strengths</div>
                      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {gradeResult.strengths.map((s, i) => (
                          <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {gradeResult.improvements.length > 0 && (
                    <div style={{ background: 'color-mix(in srgb, #f59e0b 8%, var(--bg-surface))', border: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#d97706', marginBottom: 8 }}>↑ To Improve</div>
                      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {gradeResult.improvements.map((s, i) => (
                          <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {!gradeResult && (
                <button className={styles.btnSecondary} disabled={grading} onClick={() => void handleGrade()}>
                  {grading ? 'Grading…' : '🏅 Grade this report'}
                </button>
              )}
              <button className={styles.btnPrimary} onClick={() => setShowPreview(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment helper */}
      <details className={styles.detailsBlock}>
        <summary className={styles.detailsSummary}>🔍 Assignment Helper — decode a confusing prompt</summary>
        <div className={styles.detailsBody}>
          <div className={styles.segControl} style={{ marginBottom: '0.75rem' }}>
            {ASSIGN_MODES.map(m => (
              <button
                key={m.id}
                className={`${styles.segBtn} ${assignMode === m.id ? styles.segBtnActive : ''}`}
                onClick={() => setAssignMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className={styles.inputRow}>
            <textarea
              className={styles.textArea}
              rows={3}
              value={assignText}
              onChange={e => setAssignText(e.target.value)}
              placeholder="Paste the assignment prompt here…"
              style={{ flex: 1 }}
            />
            <button
              className={styles.btnPrimary}
              disabled={assignLoading || !assignText.trim()}
              onClick={() => void handleAssignHelper()}
              style={{ alignSelf: 'flex-end' }}
            >
              {assignLoading ? '…' : 'Go'}
            </button>
          </div>
          {assignResult && (
            <div className={styles.resultBlock}>
              <div className={styles.resultHead}>
                <strong>Result</strong>
                <button className={styles.btnSecondary} onClick={() => { setAssignResult(''); setAssignText(''); }}>Clear</button>
              </div>
              <pre className={styles.preText}>{assignResult}</pre>
            </div>
          )}
        </div>
      </details>

    </div>
  );
}
