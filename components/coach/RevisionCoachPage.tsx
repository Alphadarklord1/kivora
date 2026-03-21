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
import type { GeneratedContent } from '@/lib/offline/generate';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { ArticleSuggestion } from '@/lib/coach/articles';
import styles from '@/app/(dashboard)/coach/page.module.css';

// ── SECTION B: Types & constants ──────────────────────────────────────────────

type CoachPanel   = 'review' | 'manage';
type AssignMode   = 'rephrase' | 'explain' | 'summarize' | 'assignment';
type ReportType   = 'essay' | 'report' | 'literature_review';
type SourceAction = 'notes' | 'quiz' | 'flashcards';
type SourceInputMode = 'url' | 'text';
type LibraryItem = {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};
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
  const sourceRef = useRef<HTMLElement | null>(null);
  const convertRef = useRef<HTMLElement | null>(null);
  const relatedReadingRef = useRef<HTMLElement | null>(null);
  const studioRef = useRef<HTMLElement | null>(null);
  const recoveryRef = useRef<HTMLElement | null>(null);
  const setsRef = useRef<HTMLElement | null>(null);

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
  const [sourceBrief,          setSourceBrief]           = useState<SourceBrief | null>(null);
  const [sourceLoading,        setSourceLoading]         = useState(false);
  const [sourceActionLoading,  setSourceActionLoading]   = useState<SourceAction | null>(null);
  const [recentSourceOutputs,  setRecentSourceOutputs]   = useState<LibraryItem[]>([]);
  const [sourceOutputSummary,  setSourceOutputSummary]   = useState<SourceOutputSummary | null>(null);

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

  const refreshSourceOutputs = useCallback(async () => {
    try {
      const res = await fetch('/api/library', { cache: 'no-store' });
      if (!res.ok) return;
      const items = await res.json() as LibraryItem[];
      setRecentSourceOutputs(
        items.filter((item) => {
          const metadata = (item.metadata ?? {}) as Record<string, unknown>;
          return metadata.savedFrom === '/coach' && (metadata.sourceType === 'url' || metadata.sourceType === 'manual-text');
        }).slice(0, 5),
      );
    } catch {
      setRecentSourceOutputs([]);
    }
  }, []);

  useEffect(() => {
    void refreshSourceOutputs();
  }, [refreshSourceOutputs]);

  const saveSourceOutputToLibrary = useCallback(async (mode: SourceAction | 'source-brief', content: string) => {
    if (!sourceBrief) return null;
    try {
      const metadata = {
        title: `${mode === 'quiz' ? 'Quiz' : mode === 'flashcards' ? 'Review set' : mode === 'source-brief' ? 'Source brief' : 'Notes'} — ${sourceBrief.title}`,
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
      await refreshSourceOutputs();
      return item;
    } catch {
      toast('Saved locally, but Library sync failed', 'warning');
      return null;
    }
  }, [refreshSourceOutputs, sourceBrief, toast]);

  async function handleAnalyzeSource() {
    if (sourceLoading) return;
    if (sourceMode === 'url' && !sourceUrl.trim()) return;
    if (sourceMode === 'text' && !sourceText.trim()) return;
    setSourceLoading(true);
    try {
      const res = await fetch('/api/coach/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          sourceMode === 'url'
            ? { url: sourceUrl.trim(), ai: loadAiRuntimePreferences(), privacyMode: currentPrivacyMode }
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
  const [assignMode,    setAssignMode]    = useState<AssignMode>('rephrase');
  const [assignResult,  setAssignResult]  = useState('');
  const [assignLoading, setAssignLoading] = useState(false);

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
      if (shouldScroll) relatedReadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function openSourceInWorkspace(preferredTool: 'quiz' | 'summarize') {
    if (!sourceBrief) return;
    writeCoachHandoff({
      type: 'source-output',
      title: sourceBrief.title,
      sourceText: sourceBrief.extractedText,
      preferredTool,
    });
    router.push('/workspace');
  }

  // ── D5: Render ────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Scholar Hub</span>
          <h1>Understand a source, then turn it into study material.</h1>
          <h2>Analyze a URL or pasted text first. Then convert it into notes, quick quizzes, and Workspace-ready study material.</h2>
          <p>Scholar Hub is now source-first: bring in a source, understand it, keep reading if needed, then hand off longer-term review-set work to Workspace.</p>
          <div className={styles.heroNav}>
            <button className={styles.navChip} onClick={() => sourceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Source Brief</button>
            <button className={styles.navChip} onClick={() => convertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Convert</button>
            <button className={styles.navChip} onClick={() => relatedReadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Related Reading</button>
            <button className={styles.navChip} onClick={() => studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Writing Studio</button>
            <button className={styles.navChip} onClick={() => recoveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Recovery</button>
            <button className={styles.navChip} onClick={() => setsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Review Sets</button>
          </div>
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={() => sourceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Open Source Brief</button>
            <button className={styles.secondaryButton} onClick={() => convertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Convert source</button>
            <button className={styles.secondaryButton} onClick={() => recoveryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Today&apos;s recovery</button>
            <button className={styles.secondaryButton} onClick={() => void refreshReviewSets().then(() => refreshAnalytics()).then(() => refreshSourceOutputs())}>Refresh</button>
          </div>
        </div>
        <div className={styles.heroRail}>
          <div className={styles.workflowCard}>
            <span className={styles.metricLabel}>Workflow</span>
            <ol className={styles.workflowList}>
              <li>Understand a source</li>
              <li>Convert it into study material</li>
              <li>Read deeper only if needed</li>
              <li>Hand off review-set work to Workspace</li>
            </ol>
          </div>
          <div className={styles.summaryGrid}>
            <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Due today</span>
            <strong>{analytics?.deckStats?.dueCardsTotal ?? dueReviewSets.reduce((n, s) => n + getSetDue(s), 0)}</strong>
            <small>Cards waiting in your review queue.</small>
            </article>
            <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Recent source outputs</span>
            <strong>{recentSourceOutputs.length}</strong>
            <small>Saved notes, quizzes, and source-derived material.</small>
            </article>
            <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Weak topics</span>
            <strong>{topWeakAreas.length}</strong>
            <small>Recovery targets currently worth attention.</small>
            </article>
            <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Review sets</span>
            <strong>{reviewSets.length}</strong>
            <small>Your private spaced-repetition support layer.</small>
            </article>
          </div>
        </div>
      </section>

      {panel && (
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>{panel === 'review' ? 'Workspace Review' : 'Workspace Review Set Manager'}</span>
              <h3>{selectedSet ? selectedSet.name : 'Review set not found'}</h3>
              <p>
                {selectedSet
                  ? 'Full flashcard review, editing, and review-set management now happen in Workspace so Scholar Hub can stay source-first.'
                  : 'This review set is missing from local storage and synced records.'}
              </p>
            </div>
            <div className={styles.actions}>
              {selectedSet && (
                <button className={styles.primaryButton} onClick={() => openPanel(selectedSet.id, panel === 'review' ? 'review' : 'manage')}>
                  Open in Workspace
                </button>
              )}
              <button className={styles.secondaryButton} onClick={closePanel}>Stay in Scholar Hub</button>
            </div>
          </div>

          {!selectedSet ? (
            <div className={styles.emptyState}>Select a review set below, or create one from a source first.</div>
          ) : (
            <div className={styles.importedBanner}>
              <div>
                <strong>{imported ? 'Review set imported ✓' : 'Review set ready'}</strong>
                <p>
                  {selectedSet.name} &mdash; {selectedSet.cards.length} cards, {getSetDue(selectedSet)} due now, {getSetAccuracy(selectedSet) >= 0 ? `${getSetAccuracy(selectedSet)}% accuracy` : 'no accuracy yet'}.
                </p>
              </div>
              <button className={styles.secondaryButton} onClick={() => openPanel(selectedSet.id, panel === 'review' ? 'review' : 'manage', imported ? true : null)}>
                Open in Workspace
              </button>
            </div>
          )}
        </section>
      )}

      {output && (
        <section ref={outputRef} className={styles.outputCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>{output.title}</h3>
              <p>
                {output.kind === 'quiz'
                  ? 'A quick retrieval check generated from your selected review set.'
                  : output.kind === 'explanation'
                    ? 'A focused explanation generated from your selected review set.'
                    : 'Generated from the source you analyzed in Scholar Hub.'}
              </p>
            </div>
            <button className={styles.inlineAction} onClick={() => setOutput(null)}>Close</button>
          </div>
          {output.kind === 'quiz'
            ? <InteractiveQuiz content={output.quiz} deckId={output.setId} onClose={() => setOutput(null)} />
            : <div className={styles.generatedText}>{output.content}</div>}
        </section>
      )}

      <div className={styles.coachStack}>
        <section ref={sourceRef} className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Source Brief</span>
              <h3>Understand a source before you turn it into study material</h3>
              <p>Start with either a public URL or pasted text. Scholar Hub explains what it is about, surfaces the key ideas, and keeps the provenance visible.</p>
            </div>
          </div>
          <div className={styles.sourceWorkspace}>
            <div className={styles.sourceComposer}>
              <div className={styles.modeBar}>
                <button className={`${styles.modeButton} ${sourceMode === 'url' ? styles.modeButtonActive : ''}`} onClick={() => setSourceMode('url')}>
                  <span>Analyze URL</span>
                  <small>Fetch and summarize a readable web source.</small>
                </button>
                <button className={`${styles.modeButton} ${sourceMode === 'text' ? styles.modeButtonActive : ''}`} onClick={() => setSourceMode('text')}>
                  <span>Paste text</span>
                  <small>Work directly from copied study material or notes.</small>
                </button>
              </div>

              <div className={styles.importBlock}>
                {sourceMode === 'url' ? (
                  <>
                    <input
                      className={styles.textInput}
                      value={sourceUrl}
                      onChange={e => setSourceUrl(e.target.value)}
                      placeholder="Paste a source URL to analyze"
                      onKeyDown={e => e.key === 'Enter' && void handleAnalyzeSource()}
                    />
                    <div className={styles.helperSteps}>
                      <span className={styles.countPill}>1. Fetch source</span>
                      <span className={styles.countPill}>2. Explain the key ideas</span>
                      <span className={styles.countPill}>3. Convert it into study material</span>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.primaryButton} disabled={sourceLoading || !sourceUrl.trim()} onClick={() => void handleAnalyzeSource()}>
                        {sourceLoading ? 'Analyzing\u2026' : 'Analyze source'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      className={styles.textInput}
                      value={sourceTitleDraft}
                      onChange={e => setSourceTitleDraft(e.target.value)}
                      placeholder="Optional title for this pasted text"
                    />
                    <textarea
                      className={styles.textArea}
                      rows={10}
                      value={sourceText}
                      onChange={e => setSourceText(e.target.value)}
                      placeholder="Paste article text, textbook notes, or a study passage here\u2026"
                    />
                    <div className={styles.helperSteps}>
                      <span className={styles.countPill}>No fetch needed</span>
                      <span className={styles.countPill}>Works in offline mode</span>
                      <span className={styles.countPill}>Ready for notes, quiz, or Workspace handoff</span>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.primaryButton} disabled={sourceLoading || !sourceText.trim()} onClick={() => void handleAnalyzeSource()}>
                        {sourceLoading ? 'Analyzing\u2026' : 'Analyze pasted text'}
                      </button>
                    </div>
                  </>
                )}

                <div className={styles.noticeBox}>
                  <strong>Privacy mode: {currentPrivacyMode === 'offline' ? 'Offline only' : currentPrivacyMode === 'metadata-only' ? 'Metadata-only' : 'Full AI access'}</strong>
                  <p>Pasted text works without fetches. URL mode keeps the current safety checks, and offline mode skips external reading lookups later in the flow.</p>
                </div>
              </div>
            </div>

            <div className={styles.sourcePreviewPane}>
              {!sourceBrief ? (
                <div className={styles.emptyState}>Your brief will appear here with provenance, reading time, and key ideas once you analyze a source.</div>
              ) : (
                <article className={styles.sourceBriefCard}>
                  <div className={styles.listTop}>
                    <div>
                      <h4>{sourceBrief.title}</h4>
                      <p>{sourceBrief.summary}</p>
                    </div>
                    <span className={styles.countPill}>{Math.max(1, Math.ceil(sourceBrief.wordCount / 220))} min read</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>{sourceBrief.sourceLabel}</span>
                    <span>{sourceBrief.wordCount} words</span>
                    <span>{sourceBrief.sourceType === 'manual-text' ? 'Manual text' : safeHostname(sourceBrief.url)}</span>
                    <span>{currentPrivacyMode === 'offline' ? 'Offline privacy' : currentPrivacyMode === 'metadata-only' ? 'Metadata only' : 'AI enabled'}</span>
                  </div>
                  {sourceBrief.description && (
                    <div className={styles.noticeBox}>
                      <strong>What this source seems to cover</strong>
                      <p>{sourceBrief.description}</p>
                    </div>
                  )}
                  <div className={styles.sourcePoints}>
                    {sourceBrief.keyPoints.map((pt) => (
                      <article key={pt} className={styles.helperCard}>
                        <strong>Key idea</strong>
                        <p>{pt}</p>
                      </article>
                    ))}
                  </div>
                </article>
              )}
            </div>
          </div>
        </section>

        <section ref={convertRef} className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Convert to Study Material</span>
              <h3>Turn the source into notes, a quiz, or a Workspace review set</h3>
              <p>Create outputs from the current source and keep the next action clear instead of bouncing between separate tools.</p>
            </div>
          </div>
          {!sourceBrief ? (
            <div className={styles.emptyState}>Analyze a source first. Then Scholar Hub can create notes, a quiz, or send it into Workspace as a review set with source metadata attached.</div>
          ) : (
            <div className={styles.importBlock}>
              <div className={styles.noticeBox}>
                <strong>Current source</strong>
                <p>{sourceBrief.title} &mdash; {sourceBrief.sourceType === 'manual-text' ? 'manual text' : safeHostname(sourceBrief.url)}</p>
              </div>
              <div className={styles.conversionGrid}>
                <article className={styles.conversionCard}>
                  <span className={styles.metricLabel}>Notes</span>
                  <h4>Build revision notes</h4>
                  <p>Best when you want a concise study sheet before anything else.</p>
                  <button className={styles.primaryButton} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('notes')}>
                    {sourceActionLoading === 'notes' ? 'Creating notes\u2026' : 'Create notes'}
                  </button>
                </article>
                <article className={styles.conversionCard}>
                  <span className={styles.metricLabel}>Quiz</span>
                  <h4>Test your understanding</h4>
                  <p>Generate a quick retrieval check directly from the current source.</p>
                  <button className={styles.secondaryButton} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('quiz')}>
                    {sourceActionLoading === 'quiz' ? 'Creating quiz\u2026' : 'Create quiz'}
                  </button>
                </article>
                <article className={styles.conversionCard}>
                  <span className={styles.metricLabel}>Review Set</span>
                  <h4>Send it to Workspace as a review set</h4>
                  <p>Create a reusable review set and continue the full flashcard workflow in Workspace.</p>
                  <button className={styles.secondaryButton} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('flashcards')}>
                    {sourceActionLoading === 'flashcards' ? 'Creating set\u2026' : 'Create Workspace review set'}
                  </button>
                </article>
              </div>

              {sourceOutputSummary && (
                <div className={styles.nextStepStrip}>
                  <div>
                    <strong>Next step ready</strong>
                    <p>
                      {sourceOutputSummary.mode === 'flashcards'
                        ? `Review set "${sourceOutputSummary.title}" is ready.`
                        : `${sourceOutputSummary.title} is saved and ready for the next study step.`}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.primaryButton} disabled={!sourceOutputSummary.setId} onClick={() => sourceOutputSummary.setId && openPanel(sourceOutputSummary.setId, 'review')}>
                      Review in Workspace
                    </button>
                    <button className={styles.secondaryButton} onClick={() => openSourceInWorkspace(sourceOutputSummary.mode === 'quiz' ? 'quiz' : 'summarize')}>
                      Open in Workspace
                    </button>
                    <button className={styles.secondaryButton} onClick={() => relatedReadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                      Keep reading
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.sectionHeader}>
                <div>
                  <h3>Recent source outputs</h3>
                  <p>Saved through Library metadata so you can return without adding a new schema.</p>
                </div>
              </div>
              {recentSourceOutputs.length === 0 ? (
                <div className={styles.emptyState}>No source-derived outputs yet. Create notes or a quiz from the current source to start building this list.</div>
              ) : (
                <div className={styles.listStack}>
                  {recentSourceOutputs.map((item) => {
                    const metadata = (item.metadata ?? {}) as Record<string, unknown>;
                    const sourceLabel = metadata.sourceType === 'manual-text' ? 'Manual text' : String(metadata.sourceUrl ?? metadata.sourceTitle ?? 'Web source');
                    return (
                      <article key={item.id} className={styles.compactSetCard}>
                        <div>
                          <h4>{String(metadata.title ?? item.mode)}</h4>
                          <p>{String(metadata.sourceTitle ?? 'Source output')}</p>
                        </div>
                        <div className={styles.metaRow}>
                          <span>{item.mode}</span>
                          <span>{sourceLabel}</span>
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <section ref={relatedReadingRef} className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Related Reading</span>
              <h3>Keep reading without losing the main source flow</h3>
              <p>Scholar Hub reuses the same reading panel for source follow-up and weak-topic recovery, instead of scattering reading suggestions around the page.</p>
            </div>
            {sourceBrief && readingSourceLabel !== 'source' && (
              <button className={styles.secondaryButton} onClick={() => void loadRelatedReading(sourceBrief.title, 'source', false)}>
                Back to source reading
              </button>
            )}
          </div>
          {currentPrivacyMode === 'offline' && (
            <div className={styles.noticeBox}>
              <strong>Offline privacy mode is active</strong>
              <p>External lookups are skipped here, so you will only see manual/static study links until you switch privacy mode.</p>
            </div>
          )}
          {!readingTopic ? (
            <div className={styles.emptyState}>Analyze a source or choose a weak topic below to load related reading.</div>
          ) : readingLoading ? (
            <div className={styles.emptyState}>Loading reading suggestions for {readingTopic}&hellip;</div>
          ) : (
            <div className={styles.importBlock}>
              <div className={styles.noticeBox}>
                <strong>{readingSourceLabel === 'weak-topic' ? 'Weak-topic follow-up' : 'Current source follow-up'}</strong>
                <p>{readingTopic}</p>
              </div>
              {readingArticles.length === 0 ? (
                <div className={styles.emptyState}>No related reading suggestions are available right now.</div>
              ) : (
                <div className={styles.listStack}>
                  {readingArticles.map((art) => (
                    <a
                      key={art.url}
                      href={art.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.readingCard}
                    >
                      <div className={styles.listTop}>
                        <div>
                          <h4>{art.title}</h4>
                          <p>{art.excerpt}</p>
                        </div>
                        <span className={styles.countPill}>{art.source}</span>
                      </div>
                      <div className={styles.metaRow}>
                        <span>~{art.readingMinutes} min read</span>
                        <span style={{ textTransform: 'capitalize' }}>{art.type}</span>
                        <span>Open &#x2197;</span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section ref={studioRef} className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Writing Studio</span>
              <h3>Use source context to understand, draft, and check your writing</h3>
              <p>These tools stay in Scholar Hub, but now they sit under one writing workflow: understand the task, build a draft, then check your own work.</p>
            </div>
          </div>
          {sourceBrief && (
            <div className={styles.noticeBox}>
              <strong>Current source context is attached</strong>
              <p>{sourceBrief.title} will be used as optional background context for the writing tools below.</p>
            </div>
          )}
          <div className={styles.roleRow}>
            <span className={styles.roleChip}>Assignment Helper = understand the task</span>
            <span className={styles.roleChip}>Report Builder = draft the answer</span>
            <span className={styles.roleChip}>Work Checker = review your own writing</span>
          </div>

          <div className={styles.studioGrid}>
            <article className={styles.studioCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Assignment Helper</span>
                  <h3>Understand or reframe the task</h3>
                  <p>Use this before writing when you need the assignment broken down, clarified, explained, or simplified.</p>
                </div>
              </div>
              <div className={styles.modeBar}>
                {ASSIGN_MODES.map((m) => (
                  <button key={m.id} className={`${styles.modeButton} ${assignMode === m.id ? styles.modeButtonActive : ''}`} onClick={() => setAssignMode(m.id)}>
                    <span>{m.label}</span><small>{m.desc}</small>
                  </button>
                ))}
              </div>
              <div className={styles.importBlock}>
                <textarea className={styles.textArea} rows={5} value={assignText} onChange={e => setAssignText(e.target.value)} placeholder="Paste your assignment, question, or notes here\u2026" />
                <div className={styles.actions}>
                  <button className={styles.primaryButton} disabled={assignLoading || !assignText.trim()} onClick={() => void handleAssignHelper()}>
                    {assignLoading ? 'Working\u2026' : ASSIGN_MODES.find((m) => m.id === assignMode)?.label ?? 'Run'}
                  </button>
                  {assignResult && <button className={styles.secondaryButton} onClick={() => { setAssignResult(''); setAssignText(''); }}>Clear</button>}
                </div>
                {assignResult && <div className={styles.generatedText}>{assignResult}</div>}
              </div>
            </article>

            <article className={styles.studioCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Report Builder</span>
                  <h3>Draft a structured essay or report</h3>
                  <p>Use this after you understand the source and the assignment. It turns your topic and key points into a structured first draft.</p>
                </div>
              </div>
              <div className={styles.modeBar}>
                {REPORT_TYPES.map((t) => (
                  <button key={t.id} className={`${styles.modeButton} ${reportType === t.id ? styles.modeButtonActive : ''}`} onClick={() => setReportType(t.id)}>
                    <span>{t.label}</span><small>{t.desc}</small>
                  </button>
                ))}
              </div>
              <div className={styles.importBlock}>
                <div className={styles.editorGrid}>
                  <label className={styles.fieldBlock}>
                    <span>Topic</span>
                    <input className={styles.textInput} value={reportTopic} onChange={e => setReportTopic(e.target.value)} placeholder="e.g. The causes of World War I" />
                  </label>
                  <label className={styles.fieldBlock}>
                    <span>Word count</span>
                    <input className={styles.textInput} type="number" min={300} max={5000} step={100} value={reportWordCount} onChange={e => setReportWordCount(Math.max(300, Math.min(5000, +e.target.value)))} />
                  </label>
                </div>
                <label className={styles.fieldBlock} style={{ marginTop: '0.75rem' }}>
                  <span>Key points to cover (optional)</span>
                  <textarea className={styles.textArea} rows={3} value={reportKeyPoints} onChange={e => setReportKeyPoints(e.target.value)} placeholder="e.g. Alliance system, nationalism, assassination\u2026" />
                </label>
                <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
                  <button className={styles.primaryButton} disabled={reportLoading || !reportTopic.trim()} onClick={() => void handleReportBuilder()}>
                    {reportLoading ? 'Building\u2026' : 'Build draft'}
                  </button>
                  {reportResult && <button className={styles.secondaryButton} onClick={() => { setReportResult(''); setReportTopic(''); setReportKeyPoints(''); }}>Clear</button>}
                </div>
                {reportResult && (
                  <div>
                    <div className={styles.generatedText}>{reportResult}</div>
                    <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
                      <button className={styles.secondaryButton} onClick={() => void navigator.clipboard.writeText(reportResult).then(() => toast('Copied!', 'success'))}>Copy</button>
                      <button className={styles.secondaryButton} onClick={() => {
                        const blob = new Blob([reportResult], { type: 'text/plain' });
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `${reportTopic.slice(0, 40).replace(/[^a-z0-9]/gi, '_')}_draft.txt`;
                        a.click();
                      }}>Download .txt</button>
                    </div>
                  </div>
                )}
              </div>
            </article>

            <article className={styles.studioCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.eyebrow}>Work Checker</span>
                  <h3>Review what you wrote</h3>
                  <p>Use this after drafting. It checks grammar, tone, clarity, and logical flow while optionally comparing against the current source context.</p>
                </div>
              </div>
              <div className={styles.importBlock}>
                <textarea className={styles.textArea} rows={7} value={checkText} onChange={e => setCheckText(e.target.value)} placeholder="Paste your essay, report, or answer here\u2026" />
                <div className={styles.actions}>
                  <button className={styles.primaryButton} disabled={checkLoading || !checkText.trim()} onClick={() => void handleWorkChecker()}>
                    {checkLoading ? 'Checking\u2026' : 'Check my work'}
                  </button>
                  {checkResult && <button className={styles.secondaryButton} onClick={() => { setCheckResult(''); setCheckText(''); }}>Clear</button>}
                </div>
                {checkResult && <div className={styles.generatedText}>{checkResult}</div>}
              </div>
            </article>
          </div>
        </section>

        <section ref={recoveryRef} className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Today&apos;s Recovery</span>
              <h3>Keep coaching useful, but secondary</h3>
              <p>Recovery work still matters here, but it supports your source workflow instead of defining the whole page.</p>
            </div>
          </div>

          <div className={styles.recoveryGrid}>
            <article className={styles.noticeBox}>
              <strong>{mission.title}</strong>
              <p>{mission.description}</p>
              <div className={styles.actions}>
                <button className={styles.primaryButton} onClick={startMission}>{mission.actionLabel}</button>
                <button className={styles.secondaryButton} onClick={runMissionSecondary}>{mission.secondaryLabel}</button>
              </div>
            </article>

            <article className={styles.helperCard}>
              <strong>Due Review</strong>
              <p>Only sets that are due right now appear here.</p>
              {loadingSets ? (
                <div className={styles.emptyState}>Loading due review&hellip;</div>
              ) : dueReviewSets.length === 0 ? (
                <div className={styles.emptyState}>Nothing is due right now.</div>
              ) : (
                <div className={styles.listStack}>
                  {dueReviewSets.slice(0, 4).map((set) => {
                    const accuracy = getSetAccuracy(set);
                    return (
                      <article key={set.id} className={styles.listCard}>
                        <div className={styles.listTop}>
                          <div><h4>{set.name}</h4><p>{set.description || 'Private review set'}</p></div>
                          <span className={styles.countPill}>{getSetDue(set)} due</span>
                        </div>
                        <div className={styles.metaRow}>
                          <span>{set.cards.length} cards</span>
                          <span>{accuracy >= 0 ? `${accuracy}% accuracy` : 'No accuracy yet'}</span>
                          <span>{formatDate(set.lastStudied ?? set.createdAt)}</span>
                        </div>
                        <div className={styles.actions}>
                          <button className={styles.primaryButton} onClick={() => openPanel(set.id, 'review')}>Review</button>
                          <button className={styles.secondaryButton} onClick={() => openPanel(set.id, 'manage')}>Open in Workspace</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>

            <article className={styles.helperCard}>
              <strong>Weak Topic Recovery</strong>
              <p>These come from analytics so Scholar Hub can point you toward the next useful fix.</p>
              {analyticsLoading ? (
                <div className={styles.emptyState}>Loading weak-topic data&hellip;</div>
              ) : topWeakAreas.length === 0 ? (
                <div className={styles.emptyState}>No weak topics detected yet.</div>
              ) : (
                <div className={styles.listStack}>
                  {topWeakAreas.map((area) => {
                    const pct = Math.round(area.accuracy);
                    const aColor = pct < 40 ? '#ef4444' : pct < 65 ? '#f97316' : '#22c55e';
                    return (
                      <article key={area.topic} className={styles.listCard}>
                        <div className={styles.listTop}>
                          <div><h4>{area.topic}</h4><p>{area.suggestion}</p></div>
                          <span className={styles.countPill} style={{ background: `${aColor}18`, borderColor: `${aColor}40`, color: aColor }}>{pct}%</span>
                        </div>
                        <div className={styles.metaRow}>
                          <span>{area.attempts} attempts</span>
                          <span>{area.totalQuestions} questions</span>
                          <span>~{area.estimatedMinutes} min recovery</span>
                        </div>
                        <div className={styles.actions}>
                          <button className={styles.primaryButton} onClick={() => launchWeakTopic(area, 'quiz')}>Practice</button>
                          <button className={styles.secondaryButton} onClick={() => launchWeakTopic(area, 'explain')}>Explain</button>
                          <button className={styles.secondaryButton} onClick={() => void loadRelatedReading(area.topic, 'weak-topic', true)}>Related reading</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        </section>

        <section ref={setsRef} className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Review Sets</span>
              <h3>Your private spaced-repetition support layer</h3>
              <p>Review sets stay available, but they now support the source workflow instead of defining it.</p>
            </div>
          </div>
          {loadingSets ? (
            <div className={styles.emptyState}>Loading review sets&hellip;</div>
          ) : sortedReviewSets.length === 0 ? (
            <div className={styles.emptyState}>No review sets yet. Create one from a source above to get started.</div>
          ) : (
            <div className={styles.listStack}>
              {sortedReviewSets.slice(0, 8).map((set) => {
                const accuracy = getSetAccuracy(set);
                const due = getSetDue(set);
                return (
                  <article key={set.id} className={styles.compactSetCard}>
                    <div>
                      <h4>{set.name}</h4>
                      <p>{set.description || set.sourceLabel || 'Private review set'}</p>
                    </div>
                    <div className={styles.metaRow}>
                      <span>{set.cards.length} cards</span>
                      <span>{due} due</span>
                      <span>{accuracy >= 0 ? `${accuracy}% accuracy` : 'No accuracy yet'}</span>
                    </div>
                      <div className={styles.actions}>
                        <button className={styles.primaryButton} onClick={() => openPanel(set.id, 'review')}>Review in Workspace</button>
                        <button className={styles.secondaryButton} onClick={() => void quizSet(set)}>Quiz</button>
                        <button className={styles.secondaryButton} onClick={() => openPanel(set.id, 'manage')}>Open in Workspace</button>
                      </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
