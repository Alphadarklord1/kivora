'use client';

/**
 * components/coach/RevisionCoachPage.tsx
 *
 * Scholar Hub page — all state and handlers live here, organised into
 * clearly-marked sections so any section is easy to find and edit.
 *
 *  SECTION A: Imports
 *  SECTION B: Types & constants
 *  SECTION C: Pure helpers
 *  SECTION D: Component
 *    D1 – SRS review-set state & handlers
 *    D2 – Source Brief state & handlers
 *    D3 – Scholar Tools state & handlers
 *    D4 – Today's Mission derivation
 *    D5 – Render
 */

// ── SECTION A: Imports ────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useAnalytics, type WeakArea } from '@/hooks/useAnalytics';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { writeCoachHandoff } from '@/lib/coach/handoff';
import { buildCoachUrl } from '@/lib/coach/routes';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import {
  loadDecks,
  type SRSDeck,
} from '@/lib/srs/sm2';
import {
  buildDeckQuizContent,
  buildImportedDeck,
  persistDeckLocally,
  syncDeckToCloud,
} from '@/lib/srs/deck-utils';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import type { GeneratedContent } from '@/lib/offline/generate';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import styles from '@/app/(dashboard)/coach/page.module.css';

// ── SECTION B: Types & constants ──────────────────────────────────────────────

type CoachPanel   = 'review' | 'manage';
type AssignMode   = 'rephrase' | 'explain' | 'summarize' | 'assignment';
type ReportType   = 'essay' | 'report' | 'literature_review';
type SourceAction = 'notes' | 'quiz' | 'flashcards';
type SourceInputMode = 'url' | 'text' | 'file';
type CoachSection = 'brief' | 'report' | 'deep-dive' | 'check-work' | 'recovery' | 'sets';
type SourceOutputSummary = {
  mode: SourceAction;
  title: string;
  setId?: string;
};

type CoachOutput =
  | { kind: 'quiz';        title: string; content: string; quiz: GeneratedContent; setId: string }
  | { kind: 'explanation'; title: string; content: string; setId: string }
  | { kind: 'generated';   title: string; content: string };

const ASSIGN_MODES = [
  { id: 'rephrase'   as const, label: 'Rephrase',   desc: 'Rewrite in clearer language.' },
  { id: 'explain'    as const, label: 'Explain',    desc: 'Detailed explanation.' },
  { id: 'summarize'  as const, label: 'Summarise',  desc: 'Condense to key points.' },
  { id: 'assignment' as const, label: 'Break down', desc: 'Step-by-step task guide.' },
] as const;

const REPORT_TYPES = [
  { id: 'essay'             as const, label: 'Essay',      desc: 'Argumentative academic essay.' },
  { id: 'report'            as const, label: 'Report',     desc: 'Structured report with sections.' },
  { id: 'literature_review' as const, label: 'Lit Review', desc: 'Review of academic sources.' },
] as const;

// ── SECTION C: Pure helpers ───────────────────────────────────────────────────

function formatDate(iso?: string) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function displaySourceOrigin(source: Pick<SourceBrief, 'sourceType' | 'sourceLabel' | 'url'>): string {
  if (source.sourceType === 'manual-text') return 'Manual text';
  if (source.sourceType === 'file') return source.sourceLabel || 'Uploaded file';
  return safeHostname(source.url);
}

function titleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return stem || 'Uploaded file';
}

function mergeSets(local: SRSDeck[], remote: SRSDeck[]): SRSDeck[] {
  const byId = new Map<string, SRSDeck>();
  for (const s of local)  byId.set(s.id, s);
  for (const s of remote) byId.set(s.id, s);
  return Array.from(byId.values()).sort((a, b) => {
    const aT = new Date(a.lastStudied ?? a.createdAt).getTime();
    const bT = new Date(b.lastStudied ?? b.createdAt).getTime();
    return bT - aT;
  });
}

// ── SECTION D: Component ──────────────────────────────────────────────────────

export function RevisionCoachPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { toast }    = useToast();

  const { data: analytics, loading: analyticsLoading, refresh: refreshAnalytics } = useAnalytics(30);

  const outputRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<CoachSection>('brief');

  const selectedSetId = searchParams.get('set');
  const imported      = searchParams.get('imported') === '1';
  const panel         = searchParams.get('panel') === 'review' ? 'review'
                      : searchParams.get('panel') === 'manage' ? 'manage'
                      : null;

  const [output, setOutput] = useState<CoachOutput | null>(null);

  // ── D1: SRS review-set state & handlers ──────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  const [reviewSets,       setReviewSets]       = useState<SRSDeck[]>([]);
  const [loadingSets,      setLoadingSets]      = useState(true);
  const [generatingQuiz,   setGeneratingQuiz]   = useState(false);

  const getSetDue = useCallback(
    (s: SRSDeck) => s.cards.filter(c => c.nextReview && c.nextReview <= today).length,
    [today],
  );

  const getSetAccuracy = useCallback((s: SRSDeck) => {
    const total   = s.cards.reduce((n, c) => n + c.totalReviews, 0);
    const correct = s.cards.reduce((n, c) => n + c.correctReviews, 0);
    return total > 0 ? Math.round((correct / total) * 100) : -1;
  }, []);

  const sortedReviewSets = useMemo(
    () => [...reviewSets].sort((a, b) => {
      const dd = getSetDue(b) - getSetDue(a);
      if (dd !== 0) return dd;
      return new Date(b.lastStudied ?? b.createdAt).getTime()
           - new Date(a.lastStudied ?? a.createdAt).getTime();
    }),
    [reviewSets, getSetDue],
  );

  const dueReviewSets = useMemo(
    () => sortedReviewSets.filter(s => getSetDue(s) > 0),
    [sortedReviewSets, getSetDue],
  );

  const selectedSet = useMemo(
    () => sortedReviewSets.find(s => s.id === selectedSetId) ?? null,
    [sortedReviewSets, selectedSetId],
  );

  const openPanel = useCallback((setId: string, nextPanel: CoachPanel, importedFlag: boolean | null = null) => {
    writeCoachHandoff({
      type: importedFlag ? 'import-success' : 'review-set',
      setId,
      panel: nextPanel,
    });
    router.push('/workspace');
  }, [router]);

  const closePanel = useCallback(() => {
    router.push(buildCoachUrl({ setId: null, panel: null, imported: null, importUrl: null }), { scroll: false });
  }, [router]);

  useEffect(() => {
    if (!selectedSetId || !panel) return;
    writeCoachHandoff({
      type: imported ? 'import-success' : 'review-set',
      setId: selectedSetId,
      panel,
    });
    router.replace('/workspace');
  }, [imported, panel, router, selectedSetId]);

  const refreshReviewSets = useCallback(async () => {
    setLoadingSets(true);
    const local = loadDecks();
    setReviewSets(local);
    try {
      const res = await fetch('/api/srs', { cache: 'no-store' });
      if (res.ok) {
        const remote = await res.json() as SRSDeck[];
        remote.forEach(s => persistDeckLocally(s));
        setReviewSets(mergeSets(local, remote));
      }
    } catch { /* offline — local decks still shown */ }
    finally { setLoadingSets(false); }
  }, []);

  useEffect(() => { void refreshReviewSets(); }, [refreshReviewSets]);

  async function handleGenerateQuiz(targetSet?: SRSDeck): Promise<GeneratedContent | null> {
    const set = targetSet ?? selectedSet;
    if (!set || generatingQuiz) return null;
    setGeneratingQuiz(true);
    try {
      const quiz = buildDeckQuizContent(set, 10);
      if (!selectedSet || selectedSet.id !== set.id) openPanel(set.id, 'manage');
      try {
        await fetch('/api/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'quiz', content: quiz.displayText,
            metadata: { title: `Quiz \u2014 ${set.name}`, sourceDeckId: set.id, sourceDeckName: set.name },
          }),
        });
      } catch { toast('Quiz generated, but Library sync failed', 'warning'); }
      return quiz;
    } finally { setGeneratingQuiz(false); }
  }

  async function quizSet(targetSet?: SRSDeck) {
    const quiz = await handleGenerateQuiz(targetSet);
    if (!quiz) return;
    setOutput({ kind: 'quiz', title: `Quiz \u2014 ${(targetSet ?? selectedSet)?.name ?? ''}`, content: quiz.displayText, quiz, setId: (targetSet ?? selectedSet)?.id ?? '' });
    outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── D2: Source Brief state & handlers ────────────────────────────────────

  const [sourceMode,           setSourceMode]            = useState<SourceInputMode>('url');
  const [sourceUrl,            setSourceUrl]             = useState('');
  const [sourceText,           setSourceText]            = useState('');
  const [sourceTitleDraft,     setSourceTitleDraft]      = useState('');
  const [sourceFileName,       setSourceFileName]        = useState('');
  const [sourceFileText,       setSourceFileText]        = useState('');
  const [sourceFileWordCount,  setSourceFileWordCount]   = useState(0);
  const [sourceFileLoading,    setSourceFileLoading]     = useState(false);
  const [sourceFileError,      setSourceFileError]       = useState('');
  const [sourceBrief,          setSourceBrief]           = useState<SourceBrief | null>(null);
  const [sourceLoading,        setSourceLoading]         = useState(false);
  const [sourceActionLoading,  setSourceActionLoading]   = useState<SourceAction | null>(null);
  const [sourceOutputSummary,  setSourceOutputSummary]   = useState<SourceOutputSummary | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);

  const currentPrivacyMode = loadClientAiDataMode();
  const sourceContextText = useMemo(() => {
    if (!sourceBrief) return '';
    return [
      `Title: ${sourceBrief.title}`,
      `Summary: ${sourceBrief.summary}`,
      sourceBrief.keyPoints.length
        ? `Key ideas:\n${sourceBrief.keyPoints.map((pt) => `- ${pt}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n');
  }, [sourceBrief]);

  const handleSourceFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setSourceFileLoading(true);
    setSourceFileError('');
    setSourceFileName(file.name);
    setSourceFileText('');
    setSourceFileWordCount(0);
    try {
      const extracted = await extractTextFromBlob(file, file.name);
      if (extracted.error) throw new Error(extracted.error);
      if (!extracted.text.trim()) throw new Error('No readable text was found in this file.');
      setSourceFileText(extracted.text);
      setSourceFileWordCount(extracted.wordCount);
      toast(`Loaded ${file.name}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read this file.';
      setSourceFileError(message);
      toast(message, 'error');
    } finally {
      setSourceFileLoading(false);
    }
  }, [toast]);

  const saveSourceOutputToLibrary = useCallback(async (mode: SourceAction, content: string) => {
    if (!sourceBrief) return null;
    try {
      const metadata = {
        title: `${mode === 'quiz' ? 'Quiz' : mode === 'flashcards' ? 'Review set' : 'Notes'} — ${sourceBrief.title}`,
        savedFrom: '/coach',
        sourceType: sourceBrief.sourceType,
        sourceTitle: sourceBrief.title,
        ...(sourceBrief.sourceType === 'url' ? { sourceUrl: sourceBrief.url } : {}),
      };
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, content, metadata }),
      });
      if (!res.ok) throw new Error();
      const item = await res.json();
      return item;
    } catch {
      toast('Saved locally, but Library sync failed', 'warning');
      return null;
    }
  }, [sourceBrief, toast]);

  async function handleAnalyzeSource() {
    if (sourceLoading) return;
    if (sourceMode === 'url' && !sourceUrl.trim()) return;
    if (sourceMode === 'text' && !sourceText.trim()) return;
    if (sourceMode === 'file' && !sourceFileText.trim()) return;
    setSourceLoading(true);
    try {
      const res = await fetch('/api/coach/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sourceMode === 'url'
            ? { url: sourceUrl.trim(), ai: loadAiRuntimePreferences(), privacyMode: currentPrivacyMode }
            : sourceMode === 'file'
              ? {
                  text: sourceFileText.trim(),
                  title: titleFromFilename(sourceFileName),
                  sourceType: 'file',
                  sourceLabel: sourceFileName,
                  ai: loadAiRuntimePreferences(),
                  privacyMode: currentPrivacyMode,
                }
              : { text: sourceText.trim(), title: sourceTitleDraft.trim(), ai: loadAiRuntimePreferences(), privacyMode: currentPrivacyMode },
        ),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Could not analyze this source');
      setSourceBrief(payload as SourceBrief);
      setSourceOutputSummary(null);
      setOutput(null);
      toast('Source brief ready', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not analyze this source', 'error');
    } finally { setSourceLoading(false); }
  }

  async function handleCopySourceForMyBib() {
    if (!sourceBrief) return;
    const referenceText = sourceBrief.sourceType === 'url'
      ? `${sourceBrief.title}\n${sourceBrief.url}`
      : `${sourceBrief.title}\n${sourceBrief.sourceLabel}`;
    try {
      await navigator.clipboard.writeText(referenceText);
      toast('Source details copied for MyBib', 'success');
    } catch {
      toast('Could not copy the source details', 'warning');
    }
  }

  async function handleSourceAction(mode: SourceAction) {
    if (!sourceBrief || sourceActionLoading) return;
    setSourceActionLoading(mode);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, text: sourceBrief.extractedText,
          options: { count: mode === 'quiz' ? 8 : 10 },
          ai: loadAiRuntimePreferences(),
          privacyMode: currentPrivacyMode,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || typeof payload?.content !== 'string')
        throw new Error(payload?.error ?? `Could not create ${mode}`);

      if (mode === 'flashcards') {
        const set = buildImportedDeck({
          title: sourceBrief.title, description: sourceBrief.summary,
          content: payload.content, sourceType: 'manual',
          sourceLabel: 'Source Brief import', creatorName: 'You',
        });
        if (!set) throw new Error('Could not turn this source into review cards.');
        persistDeckLocally(set);
        const synced = await syncDeckToCloud(set);
        await saveSourceOutputToLibrary('flashcards', payload.content);
        await refreshReviewSets();
        refreshAnalytics();
        setSourceOutputSummary({ mode: 'flashcards', title: set.name, setId: set.id });
        toast(synced ? `Created review set "${set.name}"` : `Created "${set.name}" locally`, synced ? 'success' : 'warning');
        openPanel(set.id, 'manage', true);
        return;
      }

      const title = sourceBrief.title;
      await saveSourceOutputToLibrary(mode, payload.content);
      setSourceOutputSummary({ mode, title });
      setOutput({
        kind: 'generated',
        title: mode === 'quiz' ? `Quiz \u2014 ${title}` : `Notes \u2014 ${title}`,
        content: payload.content,
      });
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast(err instanceof Error ? err.message : `Could not create ${mode}`, 'error');
    } finally { setSourceActionLoading(null); }
  }

  // ── D3: Scholar Tools state & handlers ───────────────────────────────────

  // Related reading
  const [readingTopic,         setReadingTopic]         = useState<string | null>(null);
  const [readingArticles,      setReadingArticles]      = useState<ArticleSuggestion[]>([]);
  const [readingLoading,       setReadingLoading]       = useState(false);
  const [readingSourceLabel,   setReadingSourceLabel]   = useState<'source' | 'weak-topic' | null>(null);

  // Assignment helper
  const [assignText,    setAssignText]    = useState('');
  const [assignMode,    setAssignMode]    = useState<AssignMode>('assignment');
  const [assignResult,  setAssignResult]  = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

  // Deep dive
  const [deepDiveQuestion, setDeepDiveQuestion] = useState('');
  const [deepDiveResult,   setDeepDiveResult]   = useState('');
  const [deepDiveLoading,  setDeepDiveLoading]  = useState(false);

  // Work checker
  const [checkText,    setCheckText]    = useState('');
  const [checkResult,  setCheckResult]  = useState('');
  const [checkLoading, setCheckLoading] = useState(false);

  // Report builder
  const [reportTopic,     setReportTopic]     = useState('');
  const [reportType,      setReportType]      = useState<ReportType>('essay');
  const [reportWordCount, setReportWordCount] = useState(1000);
  const [reportKeyPoints, setReportKeyPoints] = useState('');
  const [reportResult,    setReportResult]    = useState('');
  const [reportLoading,   setReportLoading]   = useState(false);

  const loadRelatedReading = useCallback(async (topic: string, source: 'source' | 'weak-topic', shouldScroll = false) => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;
    setReadingTopic(trimmedTopic);
    setReadingSourceLabel(source);
    setReadingArticles([]);
    setReadingLoading(true);
    try {
      const res  = await fetch('/api/coach/articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: trimmedTopic, privacyMode: currentPrivacyMode }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error((payload as { error?: string } | null)?.error ?? 'Could not load reading suggestions');
      const data = payload as ArticleSuggestion[];
      setReadingArticles(Array.isArray(data) ? data : []);
      if (currentPrivacyMode === 'offline') {
        toast('Offline privacy mode is on, so Scholar Hub is only showing local reading links.', 'info');
      }
    } catch { toast('Could not load reading suggestions', 'error'); }
    finally   {
      setReadingLoading(false);
      if (shouldScroll) setActiveSection('deep-dive');
    }
  }, [currentPrivacyMode, toast]);

  useEffect(() => {
    if (!sourceBrief?.title) return;
    void loadRelatedReading(sourceBrief.title, 'source');
  }, [loadRelatedReading, sourceBrief?.title]);

  async function handleAssignHelper() {
    if (!assignText.trim() || assignLoading) return;
    setAssignLoading(true); setAssignResult('');
    try {
      const text = sourceBrief
        ? `Reference source:\n${sourceContextText}\n\nStudent request:\n${assignText.trim()}`
        : assignText.trim();
      const res  = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: assignMode, text,
          options: { count: 5 }, ai: loadAiRuntimePreferences(), privacyMode: currentPrivacyMode,
        }),
      });
      const data = await res.json() as { content?: string; result?: string; error?: string };
      const result = data.content ?? data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No result returned');
      setAssignResult(result);
    } catch (err) { toast(err instanceof Error ? err.message : 'Assignment helper failed', 'error'); }
    finally       { setAssignLoading(false); }
  }

  async function handleDeepDive() {
    if (!deepDiveQuestion.trim() || deepDiveLoading) return;
    setDeepDiveLoading(true);
    setDeepDiveResult('');
    try {
      const prompt = sourceBrief
        ? `Source context:
${sourceContextText}

Student question:
${deepDiveQuestion.trim()}`
        : deepDiveQuestion.trim();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'explain',
          text: prompt,
          ai: loadAiRuntimePreferences(),
          privacyMode: currentPrivacyMode,
        }),
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

  async function handleWorkChecker() {
    if (!checkText.trim() || checkLoading) return;
    setCheckLoading(true); setCheckResult('');
    try {
      const res  = await fetch('/api/coach/check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: checkText.trim(),
          context: sourceContextText || undefined,
          ai: loadAiRuntimePreferences(),
          privacyMode: currentPrivacyMode,
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      const result = data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No feedback returned');
      setCheckResult(result);
    } catch (err) { toast(err instanceof Error ? err.message : 'Work checker failed', 'error'); }
    finally       { setCheckLoading(false); }
  }

  async function handleReportBuilder() {
    if (!reportTopic.trim() || reportLoading) return;
    setReportLoading(true); setReportResult('');
    try {
      const res  = await fetch('/api/coach/report', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: reportTopic.trim(), type: reportType,
          wordCount: reportWordCount, keyPoints: reportKeyPoints.trim(),
          context: sourceContextText || undefined,
          ai: loadAiRuntimePreferences(), privacyMode: currentPrivacyMode,
        }),
      });
      const data = await res.json() as { result?: string; error?: string };
      const result = data.result ?? '';
      if (!result) throw new Error(data.error ?? 'No content returned');
      setReportResult(result);
    } catch (err) { toast(err instanceof Error ? err.message : 'Report builder failed', 'error'); }
    finally       { setReportLoading(false); }
  }

  // ── D4: Today's Mission ───────────────────────────────────────────────────

  const topWeakAreas = useMemo(() => analytics?.weakAreas?.slice(0, 3) ?? [], [analytics?.weakAreas]);

  const mission = useMemo(() => {
    if (dueReviewSets[0]) {
      const set = dueReviewSets[0];
      const due = getSetDue(set);
      return {
        eyebrow:        "Today\u2019s Mission",
        title:          `Review ${due} due card${due === 1 ? '' : 's'} in ${set.name}`,
        description:    'Start with the review set that is already waiting, then move on to recovery work if you still have time.',
        actionLabel:    "Start today\u2019s mission",
        secondaryLabel: 'Quick manage',
        kind:           'review' as const,
        setId:          set.id,
      };
    }
    if (topWeakAreas[0]) {
      const area = topWeakAreas[0];
      return {
        eyebrow:        "Today\u2019s Mission",
        title:          `Recover ${area.topic}`,
        description:    `${Math.round(area.accuracy)}% accuracy right now \u2014 a short focused practice run is the best next move.`,
        actionLabel:    "Start today\u2019s mission",
        secondaryLabel: 'Explain it',
        kind:           'weak' as const,
        weakArea:       area,
      };
    }
    if ((analytics?.planStats?.activePlans ?? 0) > 0 && (analytics?.planStats?.averageProgress ?? 100) < 60) {
      return {
        eyebrow:        "Today\u2019s Mission",
        title:          'Catch up on your active study plan',
        description:    `${analytics?.planStats?.averageProgress ?? 0}% average progress across active plans.`,
        actionLabel:    "Start today\u2019s mission",
        secondaryLabel: 'Open planner',
        kind:           'plan' as const,
      };
    }
    if (reviewSets.length === 0) {
      return {
        eyebrow:        "Today\u2019s Mission",
        title:          'Import your first review set',
        description:    'Bring in a reliable source and let Scholar Hub guide the next steps after import.',
        actionLabel:    "Start today\u2019s mission",
        secondaryLabel: 'View review sets',
        kind:           'import' as const,
      };
    }
    const set = sortedReviewSets[0];
    return {
      eyebrow:        "Today\u2019s Mission",
      title:          `Open ${set?.name ?? 'your latest review set'}`,
      description:    'Nothing urgent is due right now \u2014 use this session to tidy, test, or strengthen your newest set.',
      actionLabel:    "Start today\u2019s mission",
      secondaryLabel: 'Quick manage',
      kind:           'manage' as const,
      setId:          set?.id,
    };
  }, [analytics, dueReviewSets, reviewSets, sortedReviewSets, topWeakAreas, getSetDue]);

  function launchWeakTopic(area: WeakArea, tool: 'quiz' | 'mcq' | 'flashcards' | 'summarize' | 'explain') {
    writeCoachHandoff({ type: 'weak-topic', topic: area.topic, preferredTool: tool });
    toast(`"${area.topic}" is ready in Workspace`, 'success');
    router.push('/workspace');
  }

  function startMission() {
    if (mission.kind === 'review' && mission.setId)    { openPanel(mission.setId, 'review'); return; }
    if (mission.kind === 'manage' && mission.setId)    { openPanel(mission.setId, 'manage'); return; }
    if (mission.kind === 'weak'   && mission.weakArea) { launchWeakTopic(mission.weakArea, 'quiz'); return; }
    if (mission.kind === 'plan')                       { router.push('/planner'); return; }
  }

  function runMissionSecondary() {
    if (mission.kind === 'review' && mission.setId)    { openPanel(mission.setId, 'manage'); return; }
    if (mission.kind === 'manage' && mission.setId)    { openPanel(mission.setId, 'manage'); return; }
    if (mission.kind === 'weak'   && mission.weakArea) { launchWeakTopic(mission.weakArea, 'explain'); return; }
    if (mission.kind === 'plan')                       { router.push('/planner'); return; }
  }

  // ── D5: Render ────────────────────────────────────────────────────────────

  const TAB_LABELS: Record<CoachSection, { label: string; icon: string }> = {
    'brief':      { label: 'Source',      icon: '\U0001f4c4' },
    'report':     { label: 'Report',      icon: '\U0001f4dd' },
    'check-work': { label: 'Writer',      icon: '\u270d\ufe0f' },
    'deep-dive':  { label: 'Deep Dive',   icon: '\U0001f50d' },
    'recovery':   { label: 'Recovery',    icon: '\U0001f4ca' },
    'sets':       { label: 'Review Sets', icon: '\U0001f4da' },
  };

  const writerWordCount = checkText.trim() ? checkText.trim().split(/\s+/).length : 0;
  const writerCharCount = checkText.length;
  const writerStatus    = checkLoading ? 'Checking\u2026' : checkResult ? 'Feedback ready' : 'Ready';

  return (
    <div className={styles.page}>

      {/* ── App Header ─────────────────────────────────────────────────── */}
      <header className={styles.appHeader}>
        <div className={styles.brand}>
          <span className={styles.brandGlyph}>\U0001f393</span>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Scholar Hub</span>
            {sourceBrief && (
              <span className={styles.sourceIndicator}>\U0001f4c4 {sourceBrief.title.slice(0, 45)}{sourceBrief.title.length > 45 ? '\u2026' : ''}</span>
            )}
          </div>
        </div>
        <nav className={styles.tabNav}>
          {(['brief', 'report', 'check-work', 'deep-dive', 'recovery', 'sets'] as CoachSection[]).map(id => (
            <button
              key={id}
              className={`${styles.tabBtn} ${activeSection === id ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveSection(id)}
            >
              <span>{TAB_LABELS[id].icon}</span>
              {TAB_LABELS[id].label}
            </button>
          ))}
        </nav>
        <button
          className={styles.refreshBtn}
          title="Refresh all data"
          onClick={() => void refreshReviewSets().then(() => refreshAnalytics())}
        >
          \u21bb
        </button>
      </header>

      {/* ── Panel / output overlays ────────────────────────────────────── */}
      {panel && selectedSet && (
        <div className={styles.overlayBanner}>
          <div className={styles.overlayInfo}>
            <strong>{selectedSet.name}</strong>
            <span>{selectedSet.cards.length} cards &middot; {getSetDue(selectedSet)} due &middot; {getSetAccuracy(selectedSet) >= 0 ? `${getSetAccuracy(selectedSet)}% accuracy` : 'no accuracy yet'}</span>
          </div>
          <div className={styles.overlayActions}>
            <button className={styles.btnPrimary} onClick={() => openPanel(selectedSet.id, panel === 'review' ? 'review' : 'manage', imported ? true : null)}>Open in Workspace</button>
            <button className={styles.btnSecondary} onClick={closePanel}>Stay here</button>
          </div>
        </div>
      )}

      {output && (
        <div className={styles.outputPanel} ref={outputRef}>
          <div className={styles.outputPanelHead}>
            <strong>{output.title}</strong>
            <button className={styles.iconBtn} onClick={() => setOutput(null)}>\u2715</button>
          </div>
          {output.kind === 'quiz'
            ? <InteractiveQuiz content={output.quiz} deckId={output.setId} onClose={() => setOutput(null)} />
            : <pre className={styles.preText}>{output.content}</pre>
          }
        </div>
      )}

      {/* ── Tab content ───────────────────────────────────────────────── */}
      <div className={styles.tabContent}>

        {/* ═══ SOURCE TAB ══════════════════════════════════════════════ */}
        {activeSection === 'brief' && (
          <div className={styles.sourceLayout}>

            {/* Left: input */}
            <div className={styles.inputPanel}>
              <div className={styles.panelHead}>
                <h2>Source Brief</h2>
                <p>Analyze any URL, pasted text, or uploaded file to extract its key ideas.</p>
              </div>

              {/* Compact mode toggle */}
              <div className={styles.modeToggle}>
                {(['url', 'text', 'file'] as SourceInputMode[]).map(m => (
                  <button
                    key={m}
                    className={`${styles.modeToggleBtn} ${sourceMode === m ? styles.modeToggleBtnActive : ''}`}
                    onClick={() => setSourceMode(m)}
                  >
                    {m === 'url' ? '\U0001f517\ufe0f URL' : m === 'text' ? '\U0001f4cb Paste' : '\U0001f4c1 File'}
                  </button>
                ))}
              </div>

              {/* Input area */}
              <div className={styles.inputArea}>
                {sourceMode === 'url' && (
                  <div className={styles.inputRow}>
                    <input
                      className={styles.textInput}
                      value={sourceUrl}
                      onChange={e => setSourceUrl(e.target.value)}
                      placeholder="https://example.com/article"
                      onKeyDown={e => e.key === 'Enter' && void handleAnalyzeSource()}
                    />
                    <button className={styles.btnPrimary} disabled={sourceLoading || !sourceUrl.trim()} onClick={() => void handleAnalyzeSource()}>
                      {sourceLoading ? '\u2026' : 'Analyze'}
                    </button>
                  </div>
                )}
                {sourceMode === 'text' && (
                  <>
                    <input className={styles.textInput} value={sourceTitleDraft} onChange={e => setSourceTitleDraft(e.target.value)} placeholder="Title (optional)" />
                    <textarea className={styles.textArea} rows={7} value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder="Paste article, textbook passage, or study notes\u2026" />
                    <button className={styles.btnPrimary} disabled={sourceLoading || !sourceText.trim()} onClick={() => void handleAnalyzeSource()}>
                      {sourceLoading ? 'Analyzing\u2026' : 'Analyze text'}
                    </button>
                  </>
                )}
                {sourceMode === 'file' && (
                  <>
                    <button className={styles.uploadZone} type="button" onClick={() => sourceFileInputRef.current?.click()}>
                      <span className={styles.uploadIcon}>\U0001f4c1</span>
                      <strong>{sourceFileName || 'Choose PDF, image, or document'}</strong>
                      <small>PDF \u00b7 DOCX \u00b7 PPTX \u00b7 images &mdash; click to browse</small>
                    </button>
                    <input ref={sourceFileInputRef} type="file" accept=".pdf,.txt,.docx,.pptx,image/*" className={styles.hiddenInput} onChange={e => void handleSourceFileSelected(e.target.files?.[0] ?? null)} />
                    {sourceFileLoading && <div className={styles.statusNote}>\u23f3 Reading file\u2026</div>}
                    {sourceFileError && <div className={styles.errorNote}>\u26a0\ufe0f {sourceFileError}</div>}
                    {sourceFileText && !sourceFileLoading && <div className={styles.successNote}>\u2713 {sourceFileWordCount.toLocaleString()} words ready from {sourceFileName}</div>}
                    <button className={styles.btnPrimary} disabled={sourceLoading || sourceFileLoading || !sourceFileText.trim()} onClick={() => void handleAnalyzeSource()}>
                      {sourceLoading ? 'Analyzing\u2026' : 'Analyze file'}
                    </button>
                  </>
                )}
              </div>

              {/* Source-derived actions */}
              {sourceBrief && (
                <div className={styles.sourceActions}>
                  <span className={styles.sectionLabel}>From this source</span>
                  <div className={styles.chipRow}>
                    <button className={`${styles.actionChip} ${sourceActionLoading === 'notes' ? styles.actionChipBusy : ''}`} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('notes')}>
                      \U0001f4dd {sourceActionLoading === 'notes' ? 'Creating\u2026' : 'Notes'}
                    </button>
                    <button className={`${styles.actionChip} ${sourceActionLoading === 'quiz' ? styles.actionChipBusy : ''}`} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('quiz')}>
                      \U0001f9ea {sourceActionLoading === 'quiz' ? 'Creating\u2026' : 'Quiz'}
                    </button>
                    <button className={`${styles.actionChip} ${sourceActionLoading === 'flashcards' ? styles.actionChipBusy : ''}`} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('flashcards')}>
                      \U0001f5c2\ufe0f {sourceActionLoading === 'flashcards' ? 'Creating\u2026' : 'Review Set'}
                    </button>
                    <button className={styles.actionChip} onClick={() => void handleCopySourceForMyBib()}>
                      \U0001f4ce Copy for MyBib
                    </button>
                  </div>
                  {sourceOutputSummary && (
                    <div className={styles.successStrip}>
                      <span>\u2713 {sourceOutputSummary.mode === 'flashcards' ? `Review set \u201c${sourceOutputSummary.title}\u201d created` : `${sourceOutputSummary.title} saved`}</span>
                      {sourceOutputSummary.setId && (
                        <button className={styles.stripLink} onClick={() => openPanel(sourceOutputSummary.setId!, 'review')}>Review now \u2192</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: brief output */}
            <div className={styles.briefPanel}>
              {!sourceBrief ? (
                <div className={styles.emptyBrief}>
                  <div className={styles.emptyIcon}>\U0001f4c4</div>
                  <strong>Brief appears here</strong>
                  <p>Analyze a URL, paste text, or upload a file to see key ideas, summary, and provenance.</p>
                </div>
              ) : (
                <div className={styles.briefCard}>
                  <div className={styles.briefCardHead}>
                    <h3>{sourceBrief.title}</h3>
                    <span className={styles.readPill}>{Math.max(1, Math.ceil(sourceBrief.wordCount / 220))} min read</span>
                  </div>
                  <p className={styles.briefSummary}>{sourceBrief.summary}</p>
                  <div className={styles.metaTagRow}>
                    <span className={styles.metaTag}>{displaySourceOrigin(sourceBrief)}</span>
                    <span className={styles.metaTag}>{sourceBrief.wordCount.toLocaleString()} words</span>
                    <span className={styles.metaTag}>{sourceBrief.sourceLabel}</span>
                  </div>
                  {sourceBrief.description && (
                    <div className={styles.briefDescription}>
                      <strong>What this covers</strong>
                      <p>{sourceBrief.description}</p>
                    </div>
                  )}
                  <div className={styles.keyPointsList}>
                    <span className={styles.sectionLabel}>Key ideas</span>
                    {sourceBrief.keyPoints.map((pt, i) => (
                      <div key={i} className={styles.keyPoint}>
                        <span className={styles.keyPointNum}>{i + 1}</span>
                        <p>{pt}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ REPORT TAB ══════════════════════════════════════════════ */}
        {activeSection === 'report' && (
          <div className={styles.reportLayout}>
            <div className={styles.panelHead}>
              <h2>Report Builder</h2>
              <p>Generate a model report or essay to use as a reference while you write your own.</p>
            </div>

            {/* Single-row control bar */}
            <div className={styles.reportControls}>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Type</label>
                <div className={styles.segControl}>
                  {REPORT_TYPES.map(t => (
                    <button key={t.id} className={`${styles.segBtn} ${reportType === t.id ? styles.segBtnActive : ''}`} onClick={() => setReportType(t.id)}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div className={styles.controlGroup} style={{ flex: 2 }}>
                <label className={styles.controlLabel}>Topic</label>
                <input className={styles.textInput} value={reportTopic} onChange={e => setReportTopic(e.target.value)} placeholder="e.g. The causes of World War I" onKeyDown={e => e.key === 'Enter' && !reportLoading && reportTopic.trim() ? void handleReportBuilder() : undefined} />
              </div>
              <div className={styles.controlGroup}>
                <label className={styles.controlLabel}>Words</label>
                <select className={styles.selectInput} value={reportWordCount} onChange={e => setReportWordCount(+e.target.value)}>
                  {[500, 750, 1000, 1500, 2000, 3000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
                </select>
              </div>
              <button className={styles.btnPrimary} style={{ alignSelf: 'flex-end' }} disabled={reportLoading || !reportTopic.trim()} onClick={() => void handleReportBuilder()}>
                {reportLoading ? 'Generating\u2026' : '\u2728 Generate'}
              </button>
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>Key points to cover <span className={styles.optional}>(optional)</span></label>
              <textarea className={styles.textArea} rows={2} value={reportKeyPoints} onChange={e => setReportKeyPoints(e.target.value)} placeholder="e.g. Alliance system, nationalism, assassination of Franz Ferdinand\u2026" />
            </div>

            {sourceBrief && (
              <div className={styles.contextBanner}>
                <span>\U0001f4c4 Using source: <strong>{sourceBrief.title}</strong></span>
                <div className={styles.bannerActions}>
                  <a className={styles.btnSecondary} href="https://www.mybib.com/" target="_blank" rel="noopener noreferrer">MyBib \u2197</a>
                  <button className={styles.btnSecondary} onClick={() => void handleCopySourceForMyBib()}>Copy citation</button>
                </div>
              </div>
            )}

            {reportResult && (
              <div className={styles.reportOutput}>
                <div className={styles.reportOutputHead}>
                  <strong>{reportTopic} \u2014 {REPORT_TYPES.find(t => t.id === reportType)?.label}</strong>
                  <div className={styles.reportOutputActions}>
                    <button className={styles.btnSecondary} onClick={() => void navigator.clipboard.writeText(reportResult).then(() => toast('Copied!', 'success'))}>\U0001f4cb Copy</button>
                    <button className={styles.btnSecondary} onClick={() => {
                      const blob = new Blob([reportResult], { type: 'text/plain' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = `${reportTopic.slice(0, 40).replace(/[^a-z0-9]/gi, '_')}_draft.txt`;
                      a.click();
                    }}>\U0001f4be Download</button>
                    <button className={styles.btnSecondary} onClick={() => setReportResult('')}>Clear</button>
                  </div>
                </div>
                <div className={styles.reportDoc}>{reportResult}</div>
              </div>
            )}

            <details className={styles.detailsBlock}>
              <summary className={styles.detailsSummary}>\U0001f50d Assignment Helper &mdash; decode a confusing prompt</summary>
              <div className={styles.detailsBody}>
                <div className={styles.segControl} style={{ marginBottom: '0.75rem' }}>
                  {ASSIGN_MODES.map(m => (
                    <button key={m.id} className={`${styles.segBtn} ${assignMode === m.id ? styles.segBtnActive : ''}`} onClick={() => setAssignMode(m.id)}>{m.label}</button>
                  ))}
                </div>
                <div className={styles.inputRow}>
                  <textarea className={styles.textArea} rows={3} value={assignText} onChange={e => setAssignText(e.target.value)} placeholder="Paste the assignment prompt here\u2026" style={{ flex: 1 }} />
                  <button className={styles.btnPrimary} disabled={assignLoading || !assignText.trim()} onClick={() => void handleAssignHelper()} style={{ alignSelf: 'flex-end' }}>
                    {assignLoading ? '\u2026' : 'Go'}
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
        )}

        {/* ═══ WRITER TAB (MS Word-like) ══════════════════════════════ */}
        {activeSection === 'check-work' && (
          <div className={styles.wordApp}>

            {/* Ribbon */}
            <div className={styles.wordRibbon}>
              <div className={styles.ribbonGroup}>
                <span className={styles.ribbonLabel}>REVIEW</span>
                <button
                  className={`${styles.ribbonBtn} ${styles.ribbonBtnPrimary}`}
                  disabled={checkLoading || !checkText.trim()}
                  onClick={() => void handleWorkChecker()}
                >
                  {checkLoading
                    ? <><span className={styles.ribbonIcon}>\u23f3</span>Checking\u2026</>
                    : <><span className={styles.ribbonIcon}>\u2714</span>Check Writing</>
                  }
                </button>
              </div>
              <div className={styles.ribbonDivider} />
              <div className={styles.ribbonGroup}>
                <span className={styles.ribbonLabel}>DOCUMENT</span>
                <button className={styles.ribbonBtn} disabled={!checkText} onClick={() => void navigator.clipboard.writeText(checkText).then(() => toast('Copied!', 'success'))}>
                  <span className={styles.ribbonIcon}>\U0001f4cb</span>Copy
                </button>
                <button className={styles.ribbonBtn} disabled={!checkText} onClick={() => { setCheckText(''); setCheckResult(''); }}>
                  <span className={styles.ribbonIcon}>\U0001f5d1\ufe0f</span>Clear
                </button>
              </div>
              {sourceBrief && (
                <>
                  <div className={styles.ribbonDivider} />
                  <div className={styles.ribbonGroup}>
                    <span className={styles.ribbonLabel}>SOURCE</span>
                    <span className={styles.ribbonContext}>\U0001f4c4 {sourceBrief.title.slice(0, 32)}{sourceBrief.title.length > 32 ? '\u2026' : ''}</span>
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
                    placeholder="Paste or type your essay, report, or paragraph here\u2026&#10;&#10;Scholar Hub will check grammar, clarity, flow, and paragraph structure."
                    spellCheck
                  />
                </div>
              </div>

              {/* Feedback panel */}
              {checkResult && (
                <div className={styles.wordFeedback}>
                  <div className={styles.feedbackHead}>
                    <strong>\u2714 Writing Feedback</strong>
                    <button className={styles.iconBtn} onClick={() => setCheckResult('')}>\u2715</button>
                  </div>
                  <div className={styles.feedbackBody}>
                    <pre className={styles.feedbackText}>{checkResult}</pre>
                  </div>
                  {sourceBrief && (
                    <div className={styles.feedbackFooter}>
                      <span className={styles.sectionLabel}>Save from source</span>
                      <div className={styles.chipRow}>
                        <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('notes')}>\U0001f4dd Notes</button>
                        <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('quiz')}>\U0001f9ea Quiz</button>
                        <button className={styles.actionChip} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('flashcards')}>\U0001f5c2\ufe0f Review Set</button>
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
                {checkLoading ? '\u23f3 ' : checkResult ? '\u2714 ' : '\u25cf '}{writerStatus}
              </span>
              {sourceBrief && (
                <>
                  <span className={styles.statusPipe}>|</span>
                  <span className={styles.statusItem}>Source: <strong>{sourceBrief.title.slice(0, 28)}{sourceBrief.title.length > 28 ? '\u2026' : ''}</strong></span>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══ DEEP DIVE TAB ══════════════════════════════════════════ */}
        {activeSection === 'deep-dive' && (
          <div className={styles.deepDiveLayout}>
            <div className={styles.panelHead}>
              <h2>Deep Dive</h2>
              <p>Ask follow-up questions and explore related reading to build a fuller understanding.</p>
            </div>

            <div className={styles.questionBox}>
              <div className={styles.inputRow}>
                <textarea
                  className={styles.textArea}
                  rows={3}
                  value={deepDiveQuestion}
                  onChange={e => setDeepDiveQuestion(e.target.value)}
                  placeholder={sourceBrief ? `Ask anything about \u201c${sourceBrief.title}\u201d\u2026` : 'Ask a follow-up question about any topic\u2026'}
                  style={{ flex: 1 }}
                />
                <button className={styles.btnPrimary} disabled={deepDiveLoading || !deepDiveQuestion.trim()} onClick={() => void handleDeepDive()} style={{ alignSelf: 'flex-end' }}>
                  {deepDiveLoading ? '\u2026' : 'Ask'}
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

            <div className={styles.readingSection}>
              <div className={styles.readingSectionHead}>
                <h3>Related Reading</h3>
                {readingTopic && <span className={styles.metaTag}>Topic: {readingTopic}</span>}
                {sourceBrief && readingSourceLabel !== 'source' && (
                  <button className={styles.btnSecondary} onClick={() => void loadRelatedReading(sourceBrief.title, 'source')}>Back to source</button>
                )}
              </div>
              {!readingTopic ? (
                <div className={styles.emptyBrief}>
                  <div className={styles.emptyIcon}>\U0001f4da</div>
                  <strong>Related reading appears here</strong>
                  <p>Analyze a source to auto-load articles, or ask a question above.</p>
                </div>
              ) : readingLoading ? (
                <div className={styles.loadingNote}>\u23f3 Loading suggestions for <em>{readingTopic}</em>\u2026</div>
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
                      <span className={styles.articleLink}>Open article \u2197</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ RECOVERY TAB ════════════════════════════════════════════ */}
        {activeSection === 'recovery' && (
          <div className={styles.recoveryLayout}>
            <div className={styles.panelHead}>
              <h2>Recovery</h2>
              <p>Due review and weak-area guidance in one place.</p>
            </div>

            <div className={styles.missionCard}>
              <div className={styles.missionBody}>
                <span className={styles.eyebrowPill}>Today&apos;s Mission</span>
                <h3>{mission.title}</h3>
                <p>{mission.description}</p>
              </div>
              <div className={styles.missionActions}>
                <button className={styles.btnPrimary} onClick={startMission}>{mission.actionLabel}</button>
                <button className={styles.btnSecondary} onClick={runMissionSecondary}>{mission.secondaryLabel}</button>
              </div>
            </div>

            <div className={styles.recoveryColumns}>
              <div className={styles.recoveryCol}>
                <h4>Due Review</h4>
                {loadingSets ? (
                  <div className={styles.emptyBrief}><strong>Loading\u2026</strong></div>
                ) : dueReviewSets.length === 0 ? (
                  <div className={styles.emptyBrief}><strong>Nothing due right now \u2714</strong></div>
                ) : (
                  <div className={styles.setList}>
                    {dueReviewSets.slice(0, 5).map(set => (
                      <div key={set.id} className={styles.setRow}>
                        <div className={styles.setRowInfo}>
                          <strong>{set.name}</strong>
                          <span>{set.cards.length} cards &middot; {getSetDue(set)} due &middot; {getSetAccuracy(set) >= 0 ? `${getSetAccuracy(set)}% accuracy` : 'no accuracy'}</span>
                        </div>
                        <div className={styles.setRowActions}>
                          <button className={styles.btnPrimary} onClick={() => openPanel(set.id, 'review')}>Review</button>
                          <button className={styles.btnSecondary} onClick={() => openPanel(set.id, 'manage')}>Manage</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.recoveryCol}>
                <h4>Weak Topics</h4>
                {analyticsLoading ? (
                  <div className={styles.emptyBrief}><strong>Loading\u2026</strong></div>
                ) : topWeakAreas.length === 0 ? (
                  <div className={styles.emptyBrief}><strong>No weak topics detected \u2714</strong></div>
                ) : (
                  <div className={styles.setList}>
                    {topWeakAreas.map(area => {
                      const pct = Math.round(area.accuracy);
                      const col = pct < 40 ? '#ef4444' : pct < 65 ? '#f97316' : '#22c55e';
                      return (
                        <div key={area.topic} className={styles.setRow}>
                          <div className={styles.setRowInfo}>
                            <strong>{area.topic}</strong>
                            <span style={{ color: col }}>{pct}% accuracy &middot; {area.attempts} attempts &middot; ~{area.estimatedMinutes} min to recover</span>
                            <small>{area.suggestion}</small>
                          </div>
                          <div className={styles.setRowActions}>
                            <button className={styles.btnPrimary} onClick={() => launchWeakTopic(area, 'quiz')}>Practice</button>
                            <button className={styles.btnSecondary} onClick={() => launchWeakTopic(area, 'explain')}>Explain</button>
                            <button className={styles.btnSecondary} onClick={() => void loadRelatedReading(area.topic, 'weak-topic', true)}>Reading</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ SETS TAB ════════════════════════════════════════════════ */}
        {activeSection === 'sets' && (
          <div className={styles.setsLayout}>
            <div className={styles.panelHead}>
              <h2>Review Sets</h2>
              <p>Your spaced-repetition decks, managed in Workspace and accessible here.</p>
            </div>
            {loadingSets ? (
              <div className={styles.emptyBrief}><strong>Loading\u2026</strong></div>
            ) : sortedReviewSets.length === 0 ? (
              <div className={styles.emptyBrief}>
                <div className={styles.emptyIcon}>\U0001f5c2\ufe0f</div>
                <strong>No review sets yet</strong>
                <p>Analyze a source on the Source tab and click &ldquo;Review Set&rdquo; to create your first deck.</p>
              </div>
            ) : (
              <div className={styles.setList}>
                {sortedReviewSets.map(set => {
                  const accuracy = getSetAccuracy(set);
                  const due      = getSetDue(set);
                  return (
                    <div key={set.id} className={styles.setRow}>
                      <div className={styles.setRowInfo}>
                        <strong>{set.name}</strong>
                        <span>
                          {set.cards.length} cards &middot; {due > 0 ? `${due} due` : 'nothing due'} &middot; {accuracy >= 0 ? `${accuracy}% accuracy` : 'no accuracy'} &middot; {formatDate(set.lastStudied ?? set.createdAt)}
                        </span>
                        {set.description && <small>{set.description}</small>}
                      </div>
                      <div className={styles.setRowActions}>
                        <button className={styles.btnPrimary} onClick={() => openPanel(set.id, 'review')}>Review</button>
                        <button className={styles.btnSecondary} disabled={generatingQuiz} onClick={() => void quizSet(set)}>Quiz</button>
                        <button className={styles.btnSecondary} onClick={() => openPanel(set.id, 'manage')}>Manage</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
