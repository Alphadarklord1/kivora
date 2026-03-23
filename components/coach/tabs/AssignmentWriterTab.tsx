'use client';

/**
 * AssignmentWriterTab — combines Report Builder + Writer into one tab.
 *
 * Students can load their assignment brief or draft (PDF/Word upload or
 * Workspace picker) at the top, then switch between two inner panels:
 *
 *   📋 Build Report  — source discovery, outline, draft, assignment helper
 *   ✍️ Write & Check — Word-style editor with grammar/clarity feedback
 *
 * The loaded file text flows into both panels automatically:
 *   - Build: auto-fills the Assignment Helper textarea
 *   - Write: pre-fills the editor when switching to that inner tab
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import { idbStore } from '@/lib/idb';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { TopicResearchResult } from '@/lib/coach/research';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import type { OutlineSection } from '@/app/api/coach/report/route';
import styles from '@/app/(dashboard)/coach/page.module.css';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

// ── Types ────────────────────────────────────────────────────────────────────

type InnerTab = 'build' | 'write';
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

interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  localBlobId: string | null;
  folderId: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SourceGrade {
  badge: string; label: string; cssClass: string; score: number;
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
  fileText: string,
): string {
  const parts: string[] = [];
  if (fileText.trim()) parts.push(`Assignment document:\n${fileText.trim().slice(0, 4000)}`);
  if (researchResult) {
    parts.push(`Topic overview: ${researchResult.overview}`);
    if (researchResult.keyIdeas.length)
      parts.push(`Key ideas:\n${researchResult.keyIdeas.map(k => `- ${k}`).join('\n')}`);
  } else if (sourceBrief) {
    parts.push(`Source: ${sourceBrief.title}\nSummary: ${sourceBrief.summary}`);
    if (sourceBrief.keyPoints.length)
      parts.push(`Key points:\n${sourceBrief.keyPoints.map(k => `- ${k}`).join('\n')}`);
  }
  if (selectedSources.length > 0) {
    parts.push(`Selected sources:\n${selectedSources.map((s, i) => `[S${i + 1}] ${s.title} (${s.source}): ${s.excerpt}`).join('\n')}`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function countWords(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(topic: string) {
  return topic.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

interface FeedbackSection { heading: string; body: string; icon: string; }

const SECTION_ICONS: Record<string, string> = {
  grammar: '✏️', clarity: '💡', structure: '🏗️', flow: '🌊',
  argument: '🎯', evidence: '📚', conclusion: '🏁', suggestion: '💬',
  improvement: '⬆️', vocabulary: '📖', spelling: '🔤', punctuation: '❗',
  overall: '⭐', summary: '📋',
};

function iconForHeading(heading: string): string {
  const lower = heading.toLowerCase();
  for (const [key, icon] of Object.entries(SECTION_ICONS)) { if (lower.includes(key)) return icon; }
  return '📝';
}

function parseFeedbackSections(text: string): FeedbackSection[] {
  const sections: FeedbackSection[] = [];
  for (const part of text.split(/\n(?=\*\*[^*]+\*\*|##\s)/)) {
    const m = part.match(/^(?:\*\*([^*]+)\*\*|##\s+(.+))/);
    if (m) {
      const heading = (m[1] ?? m[2]).trim();
      const body = part.replace(/^(?:\*\*[^*]+\*\*|##\s+.+)\n?/, '').trim();
      if (heading && body) sections.push({ heading, body, icon: iconForHeading(heading) });
    } else if (part.trim()) {
      sections.push({ heading: 'Overview', body: part.trim(), icon: '📋' });
    }
  }
  return sections.length > 0 ? sections : [{ heading: 'Feedback', body: text.trim(), icon: '📝' }];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sourceBrief: SourceBrief | null;
  researchResult: TopicResearchResult | null;
  onNavigateToResearch: (topic: string) => void;
  sourceActionLoading: string | null;
  onSourceAction: (mode: 'notes' | 'quiz' | 'flashcards') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssignmentWriterTab({
  sourceBrief,
  researchResult,
  onNavigateToResearch,
  sourceActionLoading,
  onSourceAction,
}: Props) {
  const { toast } = useToast();
  const privacyMode = loadClientAiDataMode();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Inner tab ────────────────────────────────────────────────────────────
  const [innerTab, setInnerTab] = useState<InnerTab>('build');

  // ── Shared file input ─────────────────────────────────────────────────────
  const [fileName,     setFileName]     = useState('');
  const [fileText,     setFileText]     = useState('');
  const [fileWords,    setFileWords]    = useState(0);
  const [fileLoading,  setFileLoading]  = useState(false);
  const [fileError,    setFileError]    = useState('');
  const [filePanelOpen, setFilePanelOpen] = useState<'upload' | 'workspace' | null>(null);

  // Workspace file picker
  const [wsFiles,   setWsFiles]   = useState<WorkspaceFile[]>([]);
  const [wsSearch,  setWsSearch]  = useState('');
  const [wsLoading, setWsLoading] = useState(false);
  const [wsPicking, setWsPicking] = useState<string | null>(null);

  useEffect(() => {
    if (filePanelOpen !== 'workspace' || wsFiles.length > 0) return;
    setWsLoading(true);
    fetch('/api/files?all=true')
      .then(r => r.json())
      .then((data: WorkspaceFile[]) =>
        setWsFiles(Array.isArray(data) ? data.filter(f => f.localBlobId) : []))
      .catch(() => toast('Could not load Workspace files', 'error'))
      .finally(() => setWsLoading(false));
  }, [filePanelOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setFileLoading(true); setFileError(''); setFileName(file.name); setFileText(''); setFileWords(0);
    try {
      const extracted = await extractTextFromBlob(file, file.name);
      if (extracted.error) throw new Error(extracted.error);
      if (!extracted.text.trim()) throw new Error('No readable text found in this file.');
      setFileText(extracted.text);
      setFileWords(extracted.wordCount);
      setAssignText(extracted.text.slice(0, 2000));
      setFilePanelOpen(null);
      toast(`Loaded "${file.name}"`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read this file.';
      setFileError(msg); toast(msg, 'error');
    } finally { setFileLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePickWorkspaceFile(wsFile: WorkspaceFile) {
    if (!wsFile.localBlobId || wsPicking) return;
    setWsPicking(wsFile.id); setFileError('');
    try {
      const payload = await idbStore.get(wsFile.localBlobId);
      if (!payload) throw new Error('File not found in local storage — it may have been cleared.');
      const extracted = await extractTextFromBlob(payload.blob, wsFile.name);
      if (extracted.error) throw new Error(extracted.error);
      if (!extracted.text.trim()) throw new Error('No readable text found in this file.');
      setFileName(wsFile.name);
      setFileText(extracted.text);
      setFileWords(extracted.wordCount);
      setAssignText(extracted.text.slice(0, 2000));
      setFilePanelOpen(null);
      toast(`Loaded "${wsFile.name}" from Workspace`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read this file.';
      setFileError(msg); toast(msg, 'error');
    } finally { setWsPicking(null); }
  }

  function clearFile() {
    setFileName(''); setFileText(''); setFileWords(0); setFileError('');
    setAssignText('');
  }

  const filteredWsFiles = wsFiles.filter(f =>
    !wsSearch.trim() || f.name.toLowerCase().includes(wsSearch.toLowerCase()),
  );

  // ── Build: Report Builder state ───────────────────────────────────────────
  const [reportTopic,     setReportTopic]     = useState('');
  const [reportType,      setReportType]      = useState<ReportType>('essay');
  const [reportWordCount, setReportWordCount] = useState(1000);
  const [reportKeyPoints, setReportKeyPoints] = useState('');
  const [outline,         setOutline]         = useState<OutlineSection[] | null>(null);
  const [outlineLoading,  setOutlineLoading]  = useState(false);
  const [reportResult,    setReportResult]    = useState('');
  const [reportLoading,   setReportLoading]   = useState(false);
  const [reportSavedLib,  setReportSavedLib]  = useState(false);
  const [exportingDocx,   setExportingDocx]   = useState(false);
  const [exportingPptx,   setExportingPptx]   = useState(false);

  // Assignment helper
  const [assignText,    setAssignText]    = useState('');
  const [assignMode,    setAssignMode]    = useState<AssignMode>('assignment');
  const [assignResult,  setAssignResult]  = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Source discovery
  const [sources,        setSources]        = useState<ArticleSuggestion[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError,   setSourcesError]   = useState('');
  const [selectedUrls,   setSelectedUrls]   = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Write & Check state ───────────────────────────────────────────────────
  const [checkText,       setCheckText]       = useState('');
  const [checkResult,     setCheckResult]     = useState('');
  const [checkLoading,    setCheckLoading]    = useState(false);
  const [writerSavedLib,  setWriterSavedLib]  = useState(false);

  // ── Source discovery fetch ────────────────────────────────────────────────
  const fetchSources = useCallback(async (topic: string) => {
    const trimmed = topic.trim();
    if (!trimmed) { setSources([]); setSelectedUrls(new Set()); return; }
    setSourcesLoading(true); setSourcesError('');
    try {
      const res = await fetch('/api/coach/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmed, privacyMode }),
      });
      const data = await res.json().catch(() => null) as ArticleSuggestion[] | { error?: string } | null;
      if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Could not find sources');
      const articles = Array.isArray(data) ? data : [];
      articles.sort((a, b) => gradeSource(b.type).score - gradeSource(a.type).score);
      setSources(articles);
      setSelectedUrls(new Set(articles.slice(0, 2).map(a => a.url)));
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : 'Could not load sources');
      setSources([]);
    } finally { setSourcesLoading(false); }
  }, [privacyMode]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!reportTopic.trim()) { setSources([]); setSelectedUrls(new Set()); return; }
    debounceRef.current = setTimeout(() => { void fetchSources(reportTopic); }, 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [reportTopic, fetchSources]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedSources = sources.filter(s => selectedUrls.has(s.url));
  const context = buildContextText(selectedSources, sourceBrief, researchResult, fileText);
  const contextSource = researchResult
    ? `Research: ${researchResult.topic}`
    : sourceBrief ? `Source: ${sourceBrief.title}`
    : fileText    ? `File: ${fileName}`
    : null;

  function toggleSource(url: string) {
    setSelectedUrls(prev => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n; });
  }

  // ── Build handlers ────────────────────────────────────────────────────────
  async function handleCopyCitation(source: ArticleSuggestion) {
    try { await navigator.clipboard.writeText(buildCitationText(source)); toast('Citation copied for MyBib', 'success'); }
    catch { toast('Could not copy citation', 'warning'); }
  }

  async function handleCopyAllCitations() {
    if (!selectedSources.length) return;
    try {
      await navigator.clipboard.writeText(selectedSources.map((s, i) => `[${i + 1}] ${buildCitationText(s)}`).join('\n'));
      toast(`${selectedSources.length} citation${selectedSources.length > 1 ? 's' : ''} copied`, 'success');
    } catch { toast('Could not copy citations', 'warning'); }
  }

  async function handleGenerateOutline() {
    if (!reportTopic.trim() || outlineLoading) return;
    setOutlineLoading(true); setOutline(null); setReportResult(''); setReportSavedLib(false);
    try {
      const res = await fetch('/api/coach/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: reportTopic.trim(), type: reportType,
          wordCount: reportWordCount, keyPoints: reportKeyPoints.trim(),
          context: context || undefined,
          ai: loadAiRuntimePreferences(), privacyMode, step: 'outline',
        }),
      });
      const data = await res.json() as { outline?: OutlineSection[]; error?: string };
      if (!res.ok || !data.outline) throw new Error(data.error ?? 'Could not generate outline');
      setOutline(data.outline);
      toast('Outline ready — review and edit it, then write the full draft', 'success');
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not generate outline', 'error'); }
    finally { setOutlineLoading(false); }
  }

  async function handleWriteDraft() {
    if (!reportTopic.trim() || reportLoading) return;
    setReportLoading(true); setReportResult(''); setReportSavedLib(false);
    try {
      const res = await fetch('/api/coach/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: reportTopic.trim(), type: reportType,
          wordCount: reportWordCount, keyPoints: reportKeyPoints.trim(),
          context: context || undefined,
          ai: loadAiRuntimePreferences(), privacyMode, step: 'draft',
          outline: outline ?? undefined,
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'No content returned');
      setReportResult(data.result);
    } catch (err) { toast(err instanceof Error ? err.message : 'Report builder failed', 'error'); }
    finally { setReportLoading(false); }
  }

  async function handleSaveReport() {
    if (!reportResult) return;
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'notes', content: reportResult,
          metadata: { title: `${REPORT_TYPES.find(t => t.id === reportType)?.label} — ${reportTopic}`, savedFrom: '/coach' },
        }),
      });
      setReportSavedLib(true);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Saved to Library', 'success');
    } catch { toast('Library sync failed', 'warning'); }
  }

  async function handleAssignHelper() {
    if (!assignText.trim() || assignLoading) return;
    setAssignLoading(true); setAssignResult('');
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
    } catch (err) { toast(err instanceof Error ? err.message : 'Assignment helper failed', 'error'); }
    finally { setAssignLoading(false); }
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
    } catch { toast('Could not generate Word document', 'error'); }
    finally { setExportingDocx(false); }
  }

  async function handleExportPptx() {
    if (!reportResult || exportingPptx) return;
    setExportingPptx(true);
    try {
      const refs = selectedSources.map((s, i) => `[${i + 1}] ${s.title}. ${s.source}. ${s.url}`);
      const { generatePptx } = await import('@/lib/export/pptx');
      const blob = await generatePptx({
        title: reportTopic,
        subtitle: REPORT_TYPES.find(t => t.id === reportType)?.label,
        content: reportResult, references: refs,
      });
      triggerDownload(blob, `${safeFilename(reportTopic)}.pptx`);
      toast('PowerPoint downloaded', 'success');
    } catch { toast('Could not generate PowerPoint', 'error'); }
    finally { setExportingPptx(false); }
  }

  // ── Write handlers ────────────────────────────────────────────────────────
  async function handleCheckWork() {
    if (!checkText.trim() || checkLoading) return;
    setCheckLoading(true); setCheckResult(''); setWriterSavedLib(false);
    try {
      const contextBlock = sourceBrief
        ? `Reference source:\nTitle: ${sourceBrief.title}\nSummary: ${sourceBrief.summary}`
        : fileText
          ? `Assignment document:\n${fileText.slice(0, 2000)}`
          : undefined;
      const res = await fetch('/api/coach/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: checkText.trim(), context: contextBlock, ai: loadAiRuntimePreferences(), privacyMode }),
      });
      const data = await res.json() as { result?: string; error?: string };
      const result = data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No feedback returned');
      setCheckResult(result);
    } catch (err) { toast(err instanceof Error ? err.message : 'Work checker failed', 'error'); }
    finally { setCheckLoading(false); }
  }

  async function handleSaveWriter() {
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
      setWriterSavedLib(true);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Saved to Library', 'success');
    } catch { toast('Library sync failed', 'warning'); }
  }

  // ── Derived display ───────────────────────────────────────────────────────
  const draftWordCount    = countWords(reportResult);
  const writerWordCount   = countWords(checkText);
  const writerCharCount   = checkText.length;
  const writerStatus      = checkLoading ? 'Checking…' : checkResult ? 'Feedback ready' : 'Ready';
  const feedbackSections  = checkResult ? parseFeedbackSections(checkResult) : [];
  const sourceLabel       = (sourceBrief?.title ?? fileName) || '';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.reportLayout}>

      {/* ── Panel header ── */}
      <div className={styles.panelHead}>
        <h2>Assignment &amp; Writing</h2>
        <p>
          Load your assignment brief or student draft (PDF or Word), then build a model report or
          get writing feedback — all in one place.
        </p>
      </div>

      {/* ── File input banner ── */}
      <div className={styles.fileInputBanner}>
        <div className={styles.fileInputRow}>
          <span className={styles.fileInputLabel}>📎 Load a file</span>
          <div className={styles.fileInputBtns}>
            <button
              className={`${styles.btnSecondary} ${filePanelOpen === 'upload' ? styles.segBtnActive : ''}`}
              onClick={() => setFilePanelOpen(p => p === 'upload' ? null : 'upload')}
            >
              📄 Upload PDF / Word
            </button>
            <button
              className={`${styles.btnSecondary} ${filePanelOpen === 'workspace' ? styles.segBtnActive : ''}`}
              onClick={() => setFilePanelOpen(p => p === 'workspace' ? null : 'workspace')}
            >
              🗂️ From Workspace
            </button>
          </div>
          {fileName && (
            <div className={styles.fileLoadedChip}>
              <span>✓ {fileName}</span>
              {fileWords > 0 && <span className={styles.wordCountPill}>{fileWords.toLocaleString()} words</span>}
              <button className={styles.iconBtn} onClick={clearFile} title="Remove file">✕</button>
            </div>
          )}
        </div>

        {/* Upload drop zone */}
        {filePanelOpen === 'upload' && (
          <div
            className={styles.fileDropZone}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); void handleFileSelected(e.dataTransfer.files[0] ?? null); }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className={styles.hiddenInput}
              onChange={e => void handleFileSelected(e.target.files?.[0] ?? null)}
            />
            {fileLoading
              ? <span>⏳ Extracting text…</span>
              : <span>Click to choose or drag a PDF / Word file here</span>
            }
          </div>
        )}

        {/* Workspace picker */}
        {filePanelOpen === 'workspace' && (
          <div className={styles.wsPicker}>
            <input
              className={styles.textInput}
              placeholder="Search workspace files…"
              value={wsSearch}
              onChange={e => setWsSearch(e.target.value)}
            />
            {wsLoading
              ? <p className={styles.wsPickerHint}>Loading workspace files…</p>
              : filteredWsFiles.length === 0
                ? <p className={styles.wsPickerHint}>No files with local content found in Workspace.</p>
                : (
                  <div className={styles.wsFileList}>
                    {filteredWsFiles.map(f => (
                      <button
                        key={f.id}
                        className={styles.wsFileRow}
                        disabled={!!wsPicking}
                        onClick={() => void handlePickWorkspaceFile(f)}
                      >
                        <span className={styles.wsFileName}>{f.name}</span>
                        {wsPicking === f.id
                          ? <span className={styles.wsFileLoading}>Loading…</span>
                          : null}
                      </button>
                    ))}
                  </div>
                )
            }
          </div>
        )}

        {fileError && (
          <div className={styles.errorNote} style={{ marginTop: '0.5rem' }}>⚠️ {fileError}</div>
        )}
      </div>

      {/* ── Inner tab switcher ── */}
      <div className={styles.innerTabNav}>
        <button
          className={`${styles.segBtn} ${innerTab === 'build' ? styles.segBtnActive : ''}`}
          onClick={() => setInnerTab('build')}
        >
          📋 Build Report
        </button>
        <button
          className={`${styles.segBtn} ${innerTab === 'write' ? styles.segBtnActive : ''}`}
          onClick={() => {
            setInnerTab('write');
            // Auto-fill editor from loaded file if it is empty
            if (fileText && !checkText) setCheckText(fileText.slice(0, 8000));
          }}
        >
          ✍️ Write &amp; Check
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Build panel                                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {innerTab === 'build' && (
        <>
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

          {/* Source discovery */}
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
                        ? `${sources.length} sources found — ${selectedUrls.size} selected`
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
                            <span className={`${styles.sourceGradeBadge} ${grade.cssClass}`} title={grade.label}>{grade.badge}</span>
                            <span className={styles.sourceCardOrigin}>{source.source}</span>
                          </div>
                          <span className={styles.sourceCardTime}>~{source.readingMinutes} min</span>
                        </div>
                        <strong className={styles.sourceCardTitle}>{source.title}</strong>
                        <p className={styles.sourceCardExcerpt}>{source.excerpt}</p>
                        <div className={styles.sourceCardFooter}>
                          <label className={styles.sourceCardCheckbox} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected} onChange={() => toggleSource(source.url)} />
                            Use in report
                          </label>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            <a href={source.url} target="_blank" rel="noopener noreferrer" className={styles.citationBtn} onClick={e => e.stopPropagation()}>Open ↗</a>
                            <button className={styles.citationBtn} onClick={e => { e.stopPropagation(); void handleCopyCitation(source); }} title="Copy citation">📎 Cite</button>
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
                    <strong>{selectedUrls.size} source{selectedUrls.size > 1 ? 's' : ''} selected — included as context in your report</strong>
                    <button className={styles.btnSecondary} onClick={() => void handleCopyAllCitations()}>📎 Copy all for MyBib</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Context banner */}
          {contextSource && (
            <div className={styles.contextBanner}>
              <span>📄 Also using: <strong>{contextSource}</strong></span>
              <div className={styles.bannerActions}>
                <button className={styles.btnSecondary} onClick={() => onNavigateToResearch(reportTopic || sourceBrief?.title || fileName)}>
                  Research wider
                </button>
                <a className={styles.btnSecondary} href="https://www.mybib.com/" target="_blank" rel="noopener noreferrer">MyBib ↗</a>
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
                </div>
                <div className={styles.reportOutputActions}>
                  <button className={styles.btnSecondary} onClick={() => void navigator.clipboard.writeText(reportResult).then(() => toast('Copied!', 'success'))}>📋 Copy</button>
                  <button className={styles.btnSecondary} disabled={exportingDocx} onClick={() => void handleExportDocx()}>{exportingDocx ? '…' : '📄 Word'}</button>
                  <button className={styles.btnSecondary} disabled={exportingPptx} onClick={() => void handleExportPptx()}>{exportingPptx ? '…' : '📊 PowerPoint'}</button>
                  {!reportSavedLib && <button className={styles.btnSecondary} onClick={() => void handleSaveReport()}>📚 Save to Library</button>}
                  <button
                    className={styles.btnSecondary}
                    title="Load this draft into Write & Check"
                    onClick={() => { setInnerTab('write'); setCheckText(reportResult); }}
                  >
                    ✍️ Check this draft
                  </button>
                  <button className={styles.btnSecondary} onClick={() => { setReportResult(''); setReportSavedLib(false); }}>Clear</button>
                </div>
              </div>
              {reportSavedLib && <div className={styles.savedStrip}>✓ Saved to Library</div>}
              <div className={styles.reportDoc}>{reportResult}</div>
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
                      <button className={styles.btnSecondary} onClick={() => void handleCopyAllCitations()}>📎 Copy all for MyBib</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Assignment helper — auto-opens when a file is loaded */}
          <details className={styles.detailsBlock} open={!!assignText}>
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
                  placeholder="Paste the assignment prompt here, or load a file above to auto-fill…"
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Write & Check panel                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {innerTab === 'write' && (
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
              <button className={styles.ribbonBtn} disabled={!checkText} onClick={() => void navigator.clipboard.writeText(checkText).then(() => toast('Copied!', 'success'))}>
                <span className={styles.ribbonIcon}>📋</span>Copy
              </button>
              <button className={styles.ribbonBtn} disabled={!checkResult || writerSavedLib} onClick={() => void handleSaveWriter()}>
                <span className={styles.ribbonIcon}>📚</span>{writerSavedLib ? 'Saved' : 'Save'}
              </button>
              <button className={styles.ribbonBtn} disabled={!checkText} onClick={() => { setCheckText(''); setCheckResult(''); setWriterSavedLib(false); }}>
                <span className={styles.ribbonIcon}>🗑️</span>Clear
              </button>
            </div>
            {sourceLabel && (
              <>
                <div className={styles.ribbonDivider} />
                <div className={styles.ribbonGroup}>
                  <span className={styles.ribbonLabel}>SOURCE</span>
                  <span className={styles.ribbonContext}>
                    📄 {sourceLabel.slice(0, 32)}{sourceLabel.length > 32 ? '…' : ''}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Document body */}
          <div className={styles.wordBody}>
            <div className={styles.wordPageWrap}>
              <div className={styles.wordPage}>
                <textarea
                  className={styles.wordEditor}
                  value={checkText}
                  onChange={e => setCheckText(e.target.value)}
                  placeholder={`Paste or type your essay, report, or paragraph here…\n\nScholar Hub will check grammar, clarity, flow, and paragraph structure.${fileText ? '\n\n(File loaded — switch to this tab to auto-fill from your file.)' : ''}`}
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
                    {!writerSavedLib && (
                      <button className={styles.btnSecondary} onClick={() => void handleSaveWriter()}>📚 Save</button>
                    )}
                    <button className={styles.iconBtn} onClick={() => { setCheckResult(''); setWriterSavedLib(false); }}>✕</button>
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
            <span className={styles.statusItem}>Words: <strong>{writerWordCount.toLocaleString()}</strong></span>
            <span className={styles.statusPipe}>|</span>
            <span className={styles.statusItem}>Characters: <strong>{writerCharCount.toLocaleString()}</strong></span>
            <span className={styles.statusPipe}>|</span>
            <span className={`${styles.statusItem} ${checkResult ? styles.statusGood : ''}`}>
              {checkLoading ? '⏳ ' : checkResult ? '✔ ' : '● '}{writerStatus}
            </span>
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
      )}

    </div>
  );
}
