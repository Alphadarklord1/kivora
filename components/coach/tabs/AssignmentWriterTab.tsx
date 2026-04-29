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
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { idbStore } from '@/lib/idb';
import type { TopicResearchResult } from '@/lib/coach/research';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import {
  applyWritingSuggestionToText,
  applyWritingSuggestionsToText,
  buildWriterLibraryContent,
  countWords,
} from '@/lib/coach/writing';
import type { OutlineSection } from '@/app/api/coach/report/route';
import type { CheckResult, WritingSuggestion } from '@/app/api/coach/check/route';
import type { AssistAction } from '@/app/api/coach/assist/route';
import { AssignmentFileBanner } from './assignment/AssignmentFileBanner';
import { WriteCheckPanel } from './assignment/WriteCheckPanel';
import styles from '@/app/(dashboard)/coach/page.module.css';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';
import { mdToHtml } from '@/lib/utils/md';

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
  researchResult: TopicResearchResult | null,
  fileText: string,
): string {
  const parts: string[] = [];
  if (fileText.trim()) parts.push(`Assignment document:\n${fileText.trim().slice(0, 4000)}`);
  if (researchResult) {
    parts.push(`Topic overview: ${researchResult.overview}`);
    if (researchResult.keyIdeas.length)
      parts.push(`Key ideas:\n${researchResult.keyIdeas.map(k => `- ${k}`).join('\n')}`);
  }
  if (selectedSources.length > 0) {
    parts.push(`Selected sources:\n${selectedSources.map((s, i) => `[S${i + 1}] ${s.title} (${s.source}): ${s.excerpt}`).join('\n')}`);
  }
  return parts.filter(Boolean).join('\n\n');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function safeFilename(topic: string) {
  return topic.slice(0, 40).replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

type FilterType = 'all' | WritingSuggestion['type'];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  researchResult: TopicResearchResult | null;
  onNavigateToResearch: (topic: string) => void;
  /** When set, pre-fills the report topic and auto-switches to Build Report panel. */
  preloadTopic?: string;
  onPreloadConsumed?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AssignmentWriterTab({
  researchResult,
  onNavigateToResearch,
  preloadTopic,
  onPreloadConsumed,
}: Props) {
  const { toast } = useToast();
  const privacyMode = loadClientAiDataMode();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Inner tab ────────────────────────────────────────────────────────────
  const [innerTab, setInnerTab] = useState<InnerTab>('build');

  // ── Draft persistence ─────────────────────────────────────────────────────
  const DRAFT_KEY = 'kivora_assignment_draft';
  const draftLoadedRef = useRef(false);
  const draftSaveRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const [checkLoading,    setCheckLoading]    = useState(false);
  const [writerSavedLib,  setWriterSavedLib]  = useState(false);
  // Structured Grammarly-like results
  const [checkScore,      setCheckScore]      = useState<number | null>(null);
  const [checkSummary,    setCheckSummary]    = useState('');
  const [checkSuggs,      setCheckSuggs]      = useState<WritingSuggestion[]>([]);
  const [dismissed,       setDismissed]       = useState<Set<string>>(new Set());
  const [suggFilter,      setSuggFilter]      = useState<FilterType>('all');
  const [legacyResult,    setLegacyResult]    = useState('');
  const [assistLoading,   setAssistLoading]   = useState(false);
  const [wordCountGoal,   setWordCountGoal]   = useState(0);

  // ── Draft: restore on mount ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (typeof d.reportTopic     === 'string') setReportTopic(d.reportTopic);
        if (d.reportType === 'essay' || d.reportType === 'report' || d.reportType === 'literature_review') setReportType(d.reportType);
        if (typeof d.reportWordCount === 'number') setReportWordCount(d.reportWordCount);
        if (typeof d.reportKeyPoints === 'string') setReportKeyPoints(d.reportKeyPoints);
        if (Array.isArray(d.outline)) {
          // Drop persisted outlines that are too short to be useful — old
          // generations from before the server's < 3 section fallback
          // existed could have left a single "Conclusion" entry stuck in
          // localStorage forever. Self-heals on first restore.
          const valid = (d.outline as OutlineSection[])
            .filter(s => s && typeof s.heading === 'string' && s.heading.trim().length > 0);
          if (valid.length >= 3) {
            // Backfill missing summaries with the heading so empty rows
            // don't render as blank textareas after restore.
            setOutline(valid.map(s => ({
              heading: s.heading.trim(),
              summary: typeof s.summary === 'string' && s.summary.trim() ? s.summary : s.heading,
            })));
          }
        }
        if (typeof d.reportResult    === 'string') setReportResult(d.reportResult);
        if (typeof d.checkText       === 'string') setCheckText(d.checkText);
        if (d.innerTab === 'build' || d.innerTab === 'write') setInnerTab(d.innerTab);
        if (d.reportTopic || d.reportResult || d.checkText) {
          toast('Draft restored', 'info');
        }
      }
    } catch { /* ignore corrupt draft */ }
    draftLoadedRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-load topic from Research tab ─────────────────────────────────────
  useEffect(() => {
    if (!preloadTopic) return;
    setReportTopic(preloadTopic);
    setInnerTab('build');
    onPreloadConsumed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadTopic]);

  // ── Draft: auto-save on change (debounced 1s) ─────────────────────────────
  useEffect(() => {
    if (!draftLoadedRef.current) return;
    if (draftSaveRef.current) clearTimeout(draftSaveRef.current);
    draftSaveRef.current = setTimeout(() => {
      try {
        if (!reportTopic && !reportResult && !checkText) {
          localStorage.removeItem(DRAFT_KEY);
          return;
        }
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          reportTopic, reportType, reportWordCount, reportKeyPoints,
          outline, reportResult, checkText, innerTab,
        }));
      } catch { /* storage full or private mode */ }
    }, 1000);
    return () => { if (draftSaveRef.current) clearTimeout(draftSaveRef.current); };
  }, [reportTopic, reportType, reportWordCount, reportKeyPoints, outline, reportResult, checkText, innerTab]);

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
  const context = buildContextText(selectedSources, researchResult, fileText);
  const contextSource = researchResult
    ? `Research: ${researchResult.topic}`
    : fileName || null;

  function toggleSource(url: string) {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
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

  const handleGenerateOutline = useSingleFlight(async () => {
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
  });

  const handleWriteDraft = useSingleFlight(async () => {
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
  });

  const handleSaveReport = useSingleFlight(async () => {
    if (!reportResult || reportSavedLib) return;
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
  });

  const handleAssignHelper = useSingleFlight(async () => {
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
  });

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

  function clearWriterResults() {
    setCheckScore(null); setCheckSummary(''); setCheckSuggs([]);
    setDismissed(new Set()); setLegacyResult(''); setWriterSavedLib(false);
  }

  const handleCheckWork = useSingleFlight(async () => {
    if (!checkText.trim() || checkLoading) return;
    setCheckLoading(true);
    clearWriterResults();
    try {
      const contextBlock = fileText
        ? `Assignment document:\n${fileText.slice(0, 2000)}`
        : undefined;
      const res = await fetch('/api/coach/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: checkText.trim(), context: contextBlock, ai: loadAiRuntimePreferences(), privacyMode }),
      });
      const data = await res.json() as Partial<CheckResult> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'No feedback returned');
      if (typeof data.score === 'number') {
        setCheckScore(data.score);
        setCheckSummary(data.summary ?? '');
        setCheckSuggs(data.suggestions ?? []);
      } else {
        setLegacyResult(data.result ?? '');
      }
    } catch (err) { toast(err instanceof Error ? err.message : 'Work checker failed', 'error'); }
    finally { setCheckLoading(false); }
  });

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

  function applyAllSuggs() {
    const active = checkSuggs.filter(s => !dismissed.has(s.id));
    const result = applyWritingSuggestionsToText(checkText, active);
    setCheckText(result.text);
    setDismissed(new Set(active.map(s => s.id)));
    toast(`Applied ${result.applied} suggestion${result.applied !== 1 ? 's' : ''}`, 'success');
  }

  function sendDraftToBuild() {
    // Extract first non-empty line as topic candidate
    const firstLine = checkText.trim().split('\n').find(l => l.trim().length > 4) ?? '';
    const topic = firstLine.slice(0, 80).replace(/[#*_]+/g, '').trim();
    if (topic) setReportTopic(topic);
    setInnerTab('build');
    toast('Switched to Build Report — topic pre-filled', 'info');
  }

  async function handleAiAssist(action: AssistAction, selectedText: string, selStart: number, selEnd: number) {
    if (assistLoading) return;
    setAssistLoading(true);
    try {
      const ai = loadAiRuntimePreferences();
      const privacyMode = loadClientAiDataMode();
      const res = await fetch('/api/coach/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text:    action === 'continue' ? checkText : selectedText,
          action,
          context: fileText.slice(0, 1200) || '',
          ai,
          privacyMode,
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok || !data.result) throw new Error(data.error ?? 'AI assist failed');

      if (action === 'continue') {
        // Append the new paragraph at the end
        setCheckText(prev => prev.trimEnd() + '\n\n' + data.result!);
      } else {
        // Replace the selected range in the text
        setCheckText(prev => prev.slice(0, selStart) + data.result! + prev.slice(selEnd));
      }
      toast(`${action.charAt(0).toUpperCase() + action.slice(1)} applied`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'AI assist failed', 'error');
    } finally {
      setAssistLoading(false);
    }
  }

  const handleSaveWriter = useSingleFlight(async () => {
    const hasResult = checkScore !== null || legacyResult.length > 0;
    if (!hasResult || writerSavedLib) return;
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'notes',
          content: buildWriterLibraryContent({
            draft: checkText,
            score: checkScore,
            summary: checkSummary,
            suggestions: checkSuggs,
            legacyResult,
          }),
          metadata: { title: 'Writer feedback', savedFrom: '/coach' },
        }),
      });
      setWriterSavedLib(true);
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast('Saved to Library', 'success');
    } catch { toast('Library sync failed', 'warning'); }
  });

  // ── Derived display ───────────────────────────────────────────────────────
  const draftWordCount  = countWords(reportResult);
  const writerWordCount = countWords(checkText);
  const writerCharCount = checkText.length;
  const sourceLabel     = fileName || '';
  const hasWriterResult = checkScore !== null || legacyResult.length > 0;
  const activeSuggs     = checkSuggs.filter(s => !dismissed.has(s.id));
  const writingStudioStats = [
    fileName ? `Source file: ${fileName}` : 'No source file loaded yet',
    `${selectedSources.length} source${selectedSources.length === 1 ? '' : 's'} selected`,
    `${outline?.length ?? 0} outline section${(outline?.length ?? 0) === 1 ? '' : 's'}`,
    `${activeSuggs.length} active suggestion${activeSuggs.length === 1 ? '' : 's'}`,
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.reportLayout}>

      <div className={styles.studioHero}>
        <div className={styles.studioHeroCopy}>
          <span className={styles.studioEyebrow}>Writing Studio</span>
          <h3>Build a report, then switch to editor mode.</h3>
          <p>Load a brief or draft, outline the report, then move into Write &amp; Check for feedback.</p>
        </div>
        <div className={styles.studioHeroMeta}>
          {writingStudioStats.slice(0, 2).map((item) => (
            <span key={item} className={styles.studioMetaPill}>{item}</span>
          ))}
          {(reportTopic || reportResult || checkText) && (
            <button
              className={styles.btnSecondary}
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => {
                setReportTopic(''); setReportType('essay'); setReportWordCount(1000);
                setReportKeyPoints(''); setOutline(null); setReportResult('');
                setCheckText(''); clearWriterResults(); setAssignText(''); setAssignResult('');
                localStorage.removeItem(DRAFT_KEY);
                toast('Draft cleared', 'info');
              }}
              title="Clear all work and start fresh"
            >
              Clear draft
            </button>
          )}
        </div>
      </div>

      {/* ── File input banner ── */}
      <AssignmentFileBanner
        fileInputRef={fileInputRef}
        filePanelOpen={filePanelOpen}
        fileLoading={fileLoading}
        fileName={fileName}
        fileWords={fileWords}
        fileError={fileError}
        wsSearch={wsSearch}
        wsLoading={wsLoading}
        wsPicking={wsPicking}
        filteredWsFiles={filteredWsFiles}
        onTogglePanel={(panelName) => setFilePanelOpen((prev) => (prev === panelName ? null : panelName))}
        onFileChange={(file) => handleFileSelected(file)}
        onWsSearchChange={setWsSearch}
        onPickWorkspaceFile={(file) => handlePickWorkspaceFile(file)}
        onClearFile={clearFile}
      />

      {/* ── Inner tab switcher ── */}
      <div className={styles.innerTabNav}>
        <button
          className={`${styles.studioTabBtn} ${innerTab === 'build' ? styles.studioTabBtnActive : ''}`}
          onClick={() => setInnerTab('build')}
        >
          <span>📋 Build Report</span>
          <small>Outline, cite, draft</small>
        </button>
        <button
          className={`${styles.studioTabBtn} ${innerTab === 'write' ? styles.studioTabBtnActive : ''}`}
          onClick={() => {
            setInnerTab('write');
            // Auto-fill editor from loaded file if it is empty
            if (fileText && !checkText) setCheckText(fileText.slice(0, 8000));
          }}
        >
          <span>✍️ Write &amp; Check</span>
          <small>Review, improve, export</small>
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
              <label className={styles.controlLabel} title="Pick the document structure — Outline + Draft will follow this format">Type</label>
              <div className={styles.segControl}>
                {REPORT_TYPES.map(t => (
                  <button
                    key={t.id}
                    className={`${styles.segBtn} ${reportType === t.id ? styles.segBtnActive : ''}`}
                    onClick={() => setReportType(t.id)}
                    title={t.desc}
                    aria-pressed={reportType === t.id}
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
              title={!reportTopic.trim() ? 'Enter a topic first' : 'Generate a section-by-section outline for this report'}
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

          {/* Steps hint — clarifies that Type / Topic / Outline / Draft are
              a sequential flow, not a set of independent buttons. The user
              feedback was: "do lit review essay and report even do anything
              in the first place" — the segment buttons only set the type,
              they don't trigger generation, which wasn't obvious. */}
          {!outline && !reportLoading && !outlineLoading && (
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-3)',
              padding: '6px 0 0',
              lineHeight: 1.5,
            }}>
              <strong>How it works:</strong>{' '}
              1) Pick a <em>Type</em> (Essay / Report / Lit Review).{' '}
              2) Type your topic and word count.{' '}
              3) Click <strong>📋 Outline</strong> to generate a section-by-section plan.{' '}
              4) Edit it if you like, then click <strong>✨ Write Draft</strong> for the full document.
            </div>
          )}

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
                <button className={styles.btnSecondary} onClick={() => onNavigateToResearch(reportTopic || fileName)}>
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
                      placeholder="Section heading (e.g. Counter-arguments)"
                      onChange={e => setOutline(prev => prev ? prev.map((s, j) => j === i ? { ...s, heading: e.target.value } : s) : prev)}
                    />
                    <textarea
                      className={styles.outlineSummaryInput}
                      rows={2}
                      value={section.summary}
                      placeholder="What this section should cover (the AI uses this to write the body)"
                      onChange={e => setOutline(prev => prev ? prev.map((s, j) => j === i ? { ...s, summary: e.target.value } : s) : prev)}
                    />
                  </div>
                  {/* Per-row controls — reorder up/down + remove. Cap the
                      total at 12 sections so a runaway click on Add doesn't
                      blow the AI's context budget when the draft fires. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'stretch', justifyContent: 'center' }}>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1, minHeight: 0 }}
                      title="Move section up"
                      disabled={i === 0}
                      onClick={() => setOutline(prev => {
                        if (!prev || i === 0) return prev;
                        const next = [...prev];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        return next;
                      })}
                    >▲</button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1, minHeight: 0 }}
                      title="Move section down"
                      disabled={i === outline.length - 1}
                      onClick={() => setOutline(prev => {
                        if (!prev || i === prev.length - 1) return prev;
                        const next = [...prev];
                        [next[i + 1], next[i]] = [next[i], next[i + 1]];
                        return next;
                      })}
                    >▼</button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1, minHeight: 0, color: 'var(--danger)' }}
                      title="Remove this section"
                      disabled={outline.length <= 2}
                      onClick={() => setOutline(prev => prev ? prev.filter((_, j) => j !== i) : prev)}
                    >✕</button>
                  </div>
                </div>
              ))}

              {/* Add a custom section. Capped at 12 to keep the eventual
                  draft request inside the model's context window. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', marginTop: 4 }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  {outline.length} section{outline.length === 1 ? '' : 's'} · drag with ▲▼ to reorder, ✕ to remove
                </span>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={outline.length >= 12}
                  onClick={() => setOutline(prev => prev ? [
                    ...prev,
                    { heading: 'New section', summary: 'Describe what this section should cover.' },
                  ] : prev)}
                  title={outline.length >= 12 ? 'Maximum 12 sections' : 'Add a custom section to the outline'}
                >
                  ➕ Add section
                </button>
              </div>
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
              {/*
                Render the AI-generated draft as HTML so markdown headings
                (## Introduction, ## Conclusion …) become real <h2>s and
                **bold** becomes real bold. Without this the user sees
                literal '##' tokens in the document body. mdToHtml escapes
                input first so injected tags can't cause XSS.
              */}
              <div
                className={styles.reportDoc}
                dangerouslySetInnerHTML={{ __html: mdToHtml(reportResult) }}
              />
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
                  {/* Same fix as the report draft above — render markdown
                      to HTML rather than dropping raw tokens into <pre>. */}
                  <div
                    className={styles.preText}
                    dangerouslySetInnerHTML={{ __html: mdToHtml(assignResult) }}
                  />
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
        <WriteCheckPanel
          checkLoading={checkLoading}
          checkText={checkText}
          hasWriterResult={hasWriterResult}
          writerSavedLib={writerSavedLib}
          activeSuggs={activeSuggs}
          sourceLabel={sourceLabel}
          writerWordCount={writerWordCount}
          writerCharCount={writerCharCount}
          checkScore={checkScore}
          checkSummary={checkSummary}
          checkSuggs={checkSuggs}
          suggFilter={suggFilter}
          legacyResult={legacyResult}
          onCheckTextChange={setCheckText}
          onCheckWork={() => void handleCheckWork()}
          onApplyAllSuggs={applyAllSuggs}
          onCopy={() => void navigator.clipboard.writeText(checkText).then(() => toast('Copied!', 'success'))}
          onExportWord={() => {
            void (async () => {
              try {
                const firstLine = checkText.trim().split('\n').find(l => l.trim()) ?? 'Essay';
                const { generateDocx } = await import('@/lib/export/docx');
                const blob = await generateDocx({ title: firstLine.slice(0, 60), content: checkText });
                const url = URL.createObjectURL(blob);
                Object.assign(document.createElement('a'), { href: url, download: 'essay.docx' }).click();
                URL.revokeObjectURL(url);
                toast('Word document downloaded', 'success');
              } catch {
                toast('Could not export to Word', 'error');
              }
            })();
          }}
          onSaveWriter={() => void handleSaveWriter()}
          onClearWriter={() => { setCheckText(''); clearWriterResults(); }}
          onSendDraftToBuild={sendDraftToBuild}
          onClearWriterResults={clearWriterResults}
          onDismissSuggestion={(id) => setDismissed(prev => new Set([...prev, id]))}
          onApplySuggestion={applySuggestion}
          onFilterChange={setSuggFilter}
          onAiAssist={(action, sel, s, e) => void handleAiAssist(action, sel, s, e)}
          assistLoading={assistLoading}
          wordCountGoal={wordCountGoal}
          onWordCountGoalChange={setWordCountGoal}
        />
      )}

    </div>
  );
}
