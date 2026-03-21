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
import { FlashcardView } from '@/components/workspace/views/FlashcardView';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { writeCoachHandoff } from '@/lib/coach/handoff';
import { buildCoachUrl } from '@/lib/coach/routes';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import {
  createCard,
  deleteDeck,
  loadDecks,
  saveDeck,
  type SRSDeck,
} from '@/lib/srs/sm2';
import {
  buildDeckQuizContent,
  buildImportedDeck,
  exportDeckApkg,
  exportDeckCsv,
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

type EditableCard = { id: string; front: string; back: string };

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
  const reviewRef = useRef<HTMLDivElement | null>(null);

  const selectedSetId = searchParams.get('set');
  const imported      = searchParams.get('imported') === '1';
  const panel         = searchParams.get('panel') === 'review' ? 'review'
                      : searchParams.get('panel') === 'manage' ? 'manage'
                      : null;

  const [output, setOutput] = useState<CoachOutput | null>(null);

  // ── D1: SRS review-set state & handlers ──────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  const [reviewSets,       setReviewSets]       = useState<SRSDeck[]>([]);
  const [loadingSets,      setLoadingSets]       = useState(true);
  const [savingSetState,   setSavingSetState]    = useState(false);
  const [explaining,       setExplaining]        = useState(false);
  const [generatingQuiz,   setGeneratingQuiz]    = useState(false);
  const [requestedPhase,   setRequestedPhase]    = useState<'review' | null>(null);
  const [nameDraft,        setNameDraft]         = useState('');
  const [descriptionDraft, setDescriptionDraft]  = useState('');
  const [cardDrafts,       setCardDrafts]        = useState<EditableCard[]>([]);

  const getSetDue = useCallback(
    (s: SRSDeck) => s.cards.filter(c => c.nextReview && c.nextReview <= today).length,
    [today],
  );

  const getSetAccuracy = useCallback((s: SRSDeck) => {
    const total   = s.cards.reduce((n, c) => n + c.totalReviews, 0);
    const correct = s.cards.reduce((n, c) => n + c.correctReviews, 0);
    return total > 0 ? Math.round((correct / total) * 100) : -1;
  }, []);

  const getSetMastered = useCallback(
    (s: SRSDeck) => s.cards.filter(c => (c.interval ?? 0) >= 21).length,
    [],
  );

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

  // Sync selected set -> editor drafts
  useEffect(() => {
    if (!selectedSet) {
      setNameDraft(''); setDescriptionDraft(''); setCardDrafts([]);
      return;
    }
    setNameDraft(selectedSet.name);
    setDescriptionDraft(selectedSet.description ?? '');
    setCardDrafts(selectedSet.cards.map(c => ({ id: c.id, front: c.front, back: c.back })));
  }, [selectedSet]);

  useEffect(() => {
    if (panel !== 'review' || !selectedSet) return;
    setRequestedPhase('review');
  }, [panel, selectedSet]);

  const openPanel = useCallback((setId: string, nextPanel: CoachPanel, importedFlag: boolean | null = null) => {
    router.push(buildCoachUrl({ setId, panel: nextPanel, imported: importedFlag, importUrl: null }), { scroll: false });
  }, [router]);

  const closePanel = useCallback(() => {
    router.push(buildCoachUrl({ setId: null, panel: null, imported: null, importUrl: null }), { scroll: false });
  }, [router]);

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

  async function applySetUpdate(next: SRSDeck, msg: string) {
    setSavingSetState(true);
    saveDeck(next);
    persistDeckLocally(next);
    setReviewSets(cur => {
      const exists  = cur.some(s => s.id === next.id);
      const updated = exists ? cur.map(s => s.id === next.id ? next : s) : [next, ...cur];
      return mergeSets(updated, []);
    });
    const synced = await syncDeckToCloud(next);
    refreshAnalytics();
    toast(synced ? msg : `${msg} (saved locally)`, synced ? 'success' : 'warning');
    setSavingSetState(false);
  }

  const addDraftCard = useCallback(() => {
    setCardDrafts(cur => [...cur, { id: `draft-${crypto.randomUUID().slice(0, 8)}`, front: '', back: '' }]);
  }, []);

  async function handleSaveSetEdits() {
    if (!selectedSet) return;
    const trimmedName  = nameDraft.trim();
    const trimmedCards = cardDrafts
      .map(c => ({ ...c, front: c.front.trim(), back: c.back.trim() }))
      .filter(c => c.front && c.back);

    if (!trimmedName)          { toast('Review set name cannot be empty', 'error'); return; }
    if (!trimmedCards.length)  { toast('Add at least one valid card', 'error'); return; }

    const nextSet: SRSDeck = {
      ...selectedSet,
      name:        trimmedName,
      description: descriptionDraft.trim(),
      cards: selectedSet.cards
        .map(existing => {
          const draft = trimmedCards.find(c => c.id === existing.id);
          return draft ? { ...existing, front: draft.front, back: draft.back } : null;
        })
        .filter(Boolean) as SRSDeck['cards'],
    };
    const newCards = trimmedCards.filter(c => !selectedSet.cards.some(e => e.id === c.id));
    nextSet.cards  = [...nextSet.cards, ...newCards.map(c => createCard(c.id, c.front, c.back))];
    await applySetUpdate(nextSet, 'Review set updated');
  }

  async function handleDeleteSet() {
    if (!selectedSet) return;
    if (!confirm(`Delete "${selectedSet.name}"?`)) return;
    deleteDeck(selectedSet.id);
    setReviewSets(cur => cur.filter(s => s.id !== selectedSet.id));
    try { await fetch(`/api/srs/${selectedSet.id}`, { method: 'DELETE' }); } catch { /* offline ok */ }
    refreshAnalytics();
    toast('Review set deleted', 'info');
    closePanel();
  }

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

  async function handleExplain(targetSet?: SRSDeck): Promise<string | null> {
    const set = targetSet ?? selectedSet;
    if (!set || explaining) return null;
    setExplaining(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: set.name,
          context: set.cards.slice(0, 24).map(c => `${c.front}: ${c.back}`).join('\n'),
          ai: loadAiRuntimePreferences(),
          privacyMode: loadClientAiDataMode(),
        }),
      });
      const payload = await res.json().catch(() => null);
      const text    = typeof payload?.explanation === 'string' ? payload.explanation.trim() : '';
      if (!text) throw new Error('No explanation returned');
      if (!selectedSet || selectedSet.id !== set.id) openPanel(set.id, 'manage');
      return text;
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Explain failed', 'error');
      return null;
    } finally { setExplaining(false); }
  }

  async function quizSet(targetSet?: SRSDeck) {
    const quiz = await handleGenerateQuiz(targetSet);
    if (!quiz) return;
    setOutput({ kind: 'quiz', title: `Quiz \u2014 ${(targetSet ?? selectedSet)?.name ?? ''}`, content: quiz.displayText, quiz, setId: (targetSet ?? selectedSet)?.id ?? '' });
    outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function explainSet(targetSet?: SRSDeck) {
    const text = await handleExplain(targetSet);
    if (!text) return;
    const set  = targetSet ?? selectedSet;
    setOutput({ kind: 'explanation', title: `Explain \u2014 ${set?.name ?? ''}`, content: text, setId: set?.id ?? '' });
    outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── D2: Source Brief state & handlers ────────────────────────────────────

  const [sourceUrl,          setSourceUrl]           = useState('');
  const [sourceBrief,        setSourceBrief]         = useState<SourceBrief | null>(null);
  const [sourceLoading,      setSourceLoading]       = useState(false);
  const [sourceActionLoading, setSourceActionLoading] = useState<SourceAction | null>(null);

  async function handleAnalyzeSource() {
    if (!sourceUrl.trim() || sourceLoading) return;
    setSourceLoading(true);
    try {
      const res = await fetch('/api/coach/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl.trim(), ai: loadAiRuntimePreferences(), privacyMode: loadClientAiDataMode() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Could not analyze this source');
      setSourceBrief(payload as SourceBrief);
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
          privacyMode: loadClientAiDataMode(),
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
        await refreshReviewSets();
        refreshAnalytics();
        toast(synced ? `Created review set "${set.name}"` : `Created "${set.name}" locally`, synced ? 'success' : 'warning');
        openPanel(set.id, 'manage', true);
        return;
      }

      const title = sourceBrief.title;
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

  // Scholar reading
  const [scholarTopic,    setScholarTopic]    = useState<string | null>(null);
  const [scholarArticles, setScholarArticles] = useState<ArticleSuggestion[]>([]);
  const [scholarLoading,  setScholarLoading]  = useState(false);

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

  async function fetchScholarArticles(topic: string) {
    if (scholarTopic === topic) { setScholarTopic(null); setScholarArticles([]); return; }
    setScholarTopic(topic);
    setScholarArticles([]);
    setScholarLoading(true);
    const privacyMode = loadClientAiDataMode();
    try {
      const res  = await fetch('/api/coach/articles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, privacyMode }),
      });
      const data = await res.json() as ArticleSuggestion[];
      setScholarArticles(Array.isArray(data) ? data : []);
      if (privacyMode === 'offline') {
        toast('Offline privacy mode is on, so Scholar Hub is only showing local reading links.', 'info');
      }
    } catch { toast('Could not load reading suggestions', 'error'); }
    finally   { setScholarLoading(false); }
  }

  async function handleAssignHelper() {
    if (!assignText.trim() || assignLoading) return;
    setAssignLoading(true); setAssignResult('');
    try {
      const res  = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: assignMode, text: assignText.trim(),
          options: { count: 5 }, ai: loadAiRuntimePreferences(), privacyMode: loadClientAiDataMode(),
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
        body: JSON.stringify({ text: checkText.trim(), ai: loadAiRuntimePreferences(), privacyMode: loadClientAiDataMode() }),
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
          ai: loadAiRuntimePreferences(), privacyMode: loadClientAiDataMode(),
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

  return (
    <div className={styles.page}>

      {/* Hero / Today's Mission */}
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{mission.eyebrow}</span>
          <h1>Scholar Hub</h1>
          <h2>{mission.title}</h2>
          <p>{mission.description}</p>
          <div className={styles.actions}>
            <button className={styles.primaryButton}   onClick={startMission}>{mission.actionLabel}</button>
            <button className={styles.secondaryButton} onClick={runMissionSecondary}>{mission.secondaryLabel}</button>
            <button className={styles.secondaryButton} onClick={() => void refreshReviewSets().then(() => refreshAnalytics())}>Refresh</button>
          </div>
        </div>
        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Due today</span>
            <strong>{analytics?.deckStats?.dueCardsTotal ?? dueReviewSets.reduce((n, s) => n + getSetDue(s), 0)}</strong>
            <small>Cards waiting in your review queue.</small>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Reviewed today</span>
            <strong>{analytics?.deckStats?.reviewedToday ?? 0}</strong>
            <small>Progress toward your daily review target.</small>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Streak</span>
            <strong>{analytics?.activity?.currentStreak ?? 0}</strong>
            <small>Consecutive active study days.</small>
          </article>
          <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Review sets</span>
            <strong>{reviewSets.length}</strong>
            <small>Your private spaced-repetition sets.</small>
          </article>
        </div>
      </section>

      {/* Panel (review / manage) */}
      {panel && (
        <section className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>{panel === 'review' ? 'Live Review' : 'Set Management'}</span>
              <h3>{selectedSet ? selectedSet.name : 'Review set not found'}</h3>
              <p>
                {selectedSet
                  ? panel === 'review'
                    ? 'Review the active cards first, then come back to manage or quiz this set.'
                    : 'Edit cards, launch quiz/explanation tools, and keep exports secondary here.'
                  : 'This review set is missing from local storage and synced records.'}
              </p>
            </div>
            <div className={styles.actions}>
              {selectedSet && panel === 'manage' && (
                <button className={styles.primaryButton} onClick={() => openPanel(selectedSet.id, 'review')}>Review</button>
              )}
              <button className={styles.secondaryButton} onClick={closePanel}>Close panel</button>
            </div>
          </div>

          {!selectedSet ? (
            <div className={styles.emptyState}>Select a review set from below, or import a new one to begin.</div>
          ) : panel === 'review' ? (
            <div ref={reviewRef}>
              <FlashcardView
                initialDeck={selectedSet}
                title={selectedSet.name}
                requestedPhase={requestedPhase}
                onRequestedPhaseHandled={() => setRequestedPhase(null)}
                onDeckChange={(next) => setReviewSets(cur => cur.map(s => s.id === next.id ? next : s))}
                showBrowseButton={false}
                showPublicActions={false}
              />
            </div>
          ) : (
            <>
              {imported && (
                <div className={styles.importedBanner}>
                  <div>
                    <strong>Review set imported &#x2713;</strong>
                    <p>{selectedSet.name} &mdash; {selectedSet.cards.length} cards added and ready for today&apos;s mission.</p>
                  </div>
                  <button className={styles.secondaryButton} onClick={() => openPanel(selectedSet.id, 'review', null)}>Start review</button>
                </div>
              )}

              <div className={styles.panelStats}>
                <article className={styles.infoChip}><strong>{selectedSet.cards.length}</strong><span>cards</span></article>
                <article className={styles.infoChip}><strong>{getSetDue(selectedSet)}</strong><span>due now</span></article>
                <article className={styles.infoChip}><strong>{getSetAccuracy(selectedSet) >= 0 ? `${getSetAccuracy(selectedSet)}%` : '\u2014'}</strong><span>accuracy</span></article>
                <article className={styles.infoChip}><strong>{getSetMastered(selectedSet)}</strong><span>mastered</span></article>
              </div>

              <div className={styles.actions} style={{ marginBottom: '1rem' }}>
                <button className={styles.primaryButton}   onClick={() => openPanel(selectedSet.id, 'review')}>Review</button>
                <button className={styles.secondaryButton} disabled={generatingQuiz} onClick={() => void quizSet(selectedSet)}>{generatingQuiz ? 'Generating\u2026' : 'Quiz'}</button>
                <button className={styles.secondaryButton} disabled={explaining}     onClick={() => void explainSet(selectedSet)}>{explaining ? 'Explaining\u2026' : 'Explain'}</button>
                <button className={styles.secondaryButton} onClick={() => exportDeckCsv(selectedSet)}>Export CSV</button>
                <button className={styles.secondaryButton} onClick={() => void exportDeckApkg(selectedSet).catch(() => toast('Anki export failed', 'error'))}>Export Anki</button>
                <button className={styles.dangerButton}    onClick={() => void handleDeleteSet()}>Delete</button>
              </div>

              <div className={styles.editorGrid}>
                <label className={styles.fieldBlock}>
                  <span>Review set name</span>
                  <input className={styles.textInput} value={nameDraft} onChange={e => setNameDraft(e.target.value)} />
                </label>
                <label className={styles.fieldBlock}>
                  <span>Description</span>
                  <textarea className={styles.textArea} rows={3} value={descriptionDraft} onChange={e => setDescriptionDraft(e.target.value)} />
                </label>
              </div>

              <div className={styles.sectionHeader}>
                <div>
                  <h3>Card editor</h3>
                  <p>Keep this set tight and readable before your next quiz or review block.</p>
                </div>
                <div className={styles.actions}>
                  <button className={styles.secondaryButton} onClick={addDraftCard}>Add card</button>
                  <button className={styles.primaryButton} disabled={savingSetState} onClick={() => void handleSaveSetEdits()}>{savingSetState ? 'Saving\u2026' : 'Save changes'}</button>
                </div>
              </div>

              <div className={styles.cardEditorList}>
                {cardDrafts.map((card, i) => (
                  <div key={card.id} className={styles.cardEditorRow}>
                    <div className={styles.cardOrdinal}>#{i + 1}</div>
                    <input    className={styles.textInput} value={card.front} placeholder="Front" onChange={e => setCardDrafts(cur => cur.map(d => d.id === card.id ? { ...d, front: e.target.value } : d))} />
                    <textarea className={styles.textArea}  rows={2} value={card.back} placeholder="Back"  onChange={e => setCardDrafts(cur => cur.map(d => d.id === card.id ? { ...d, back:  e.target.value } : d))} />
                    <button   className={styles.inlineAction} onClick={() => setCardDrafts(cur => cur.filter(d => d.id !== card.id))}>Delete</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* Generated output */}
      {output && (
        <section ref={outputRef} className={styles.outputCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>{output.title}</h3>
              <p>
                {output.kind === 'quiz'        ? 'A quick retrieval check generated from your selected review set.'
                 : output.kind === 'explanation' ? 'A focused explanation generated from your selected review set.'
                 : 'Generated from the source you analyzed in Scholar Hub.'}
              </p>
            </div>
            <button className={styles.inlineAction} onClick={() => setOutput(null)}>Close</button>
          </div>
          {output.kind === 'quiz'
            ? <InteractiveQuiz content={output.quiz} deckId={output.setId} onClose={() => setOutput(null)} />
            : <div className={styles.generatedText}>{output.content}</div>
          }
        </section>
      )}

      {/* Main content grid */}
      <div className={styles.contentGrid}>

        {/* Left column — due review + weak topic recovery */}
        <div className={styles.leftColumn}>

          {/* Due Review */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Due Review</span>
                <h3>Start with what is due now</h3>
                <p>Only review sets that need attention appear here.</p>
              </div>
            </div>
            {loadingSets ? (
              <div className={styles.emptyState}>Loading due review&hellip;</div>
            ) : dueReviewSets.length === 0 ? (
              <div className={styles.emptyState}>Nothing is due right now. Use Weak Topic Recovery to recover weak topics.</div>
            ) : (
              <div className={styles.listStack}>
                {dueReviewSets.map(set => {
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
                        <button className={styles.primaryButton}   onClick={() => openPanel(set.id, 'review')}>Review</button>
                        <button className={styles.secondaryButton} onClick={() => openPanel(set.id, 'manage')}>Quick manage</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Weak Topic Recovery */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Weak Topic Recovery</span>
                <h3>Fix the weakest concepts next</h3>
                <p>These come from your analytics, so Scholar Hub can guide the next useful session.</p>
              </div>
            </div>
            {analyticsLoading ? (
              <div className={styles.emptyState}>Loading weak-topic data&hellip;</div>
            ) : topWeakAreas.length === 0 ? (
              <div className={styles.emptyState}>No weak topics detected yet. Complete quizzes or review sets and the coach will start surfacing recovery work here.</div>
            ) : (
              <div className={styles.listStack}>
                {topWeakAreas.map(area => {
                  const isOpen = scholarTopic === area.topic;
                  const pct    = Math.round(area.accuracy);
                  const aColor = pct < 40 ? '#ef4444' : pct < 65 ? '#f97316' : '#22c55e';
                  return (
                    <article key={area.topic} className={styles.listCard} style={{ overflow: 'hidden' }}>
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
                        <button className={styles.primaryButton}   onClick={() => launchWeakTopic(area, 'quiz')}>Practice</button>
                        <button className={styles.secondaryButton} onClick={() => launchWeakTopic(area, 'explain')}>Explain</button>
                        <button className={`${styles.secondaryButton} ${isOpen ? styles.modeButtonActive : ''}`} onClick={() => void fetchScholarArticles(area.topic)}>
                          {isOpen ? '\uD83D\uDCDA Hide reading' : '\uD83D\uDCDA Scholar reading'}
                        </button>
                      </div>
                      {isOpen && (
                        <div style={{ marginTop: '0.75rem', borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent)', paddingTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
                          {scholarLoading ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem' }}>Finding articles&hellip;</div>
                          ) : scholarArticles.length === 0 ? (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0.5rem' }}>No articles found.</div>
                          ) : (
                            <>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Further reading</div>
                              {scholarArticles.map(art => (
                                <a key={art.url} href={art.url} target="_blank" rel="noopener noreferrer"
                                   style={{ display: 'grid', gap: '0.3rem', padding: '0.75rem 0.9rem', borderRadius: '0.9rem', textDecoration: 'none', border: '1px solid color-mix(in srgb, var(--border-subtle) 55%, transparent)', background: 'color-mix(in srgb, var(--bg-2) 60%, transparent)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{art.title}</span>
                                    <span style={{ fontSize: '0.7rem', padding: '2px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--primary) 15%, transparent)', color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{art.source}</span>
                                  </div>
                                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{art.excerpt}</p>
                                  <div style={{ display: 'flex', gap: 10, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    <span>~{art.readingMinutes} min read</span>
                                    <span style={{ textTransform: 'capitalize' }}>{art.type}</span>
                                    <span style={{ marginLeft: 'auto', color: 'var(--primary)' }}>Open &#x2197;</span>
                                  </div>
                                </a>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column — production tools */}
        <div className={styles.rightColumn}>

          {/* Source Brief */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Source Brief</span>
                <h3>Understand a source before you study it</h3>
                <p>Paste a web link and Scholar Hub will explain what the source is about, summarize it, and help turn it into study material.</p>
              </div>
            </div>
            <div className={styles.importBlock}>
              <div className={styles.actions}>
                <input
                  className={styles.textInput}
                  value={sourceUrl}
                  onChange={e => setSourceUrl(e.target.value)}
                  placeholder="Paste a source URL to analyze"
                  onKeyDown={e => e.key === 'Enter' && void handleAnalyzeSource()}
                />
                <button className={styles.primaryButton} disabled={sourceLoading || !sourceUrl.trim()} onClick={() => void handleAnalyzeSource()}>
                  {sourceLoading ? 'Analyzing\u2026' : 'Analyze source'}
                </button>
              </div>
              <div className={styles.noticeBox}>
                <strong>Manual, source-first workflow</strong>
                <p>This is designed for article or study links you want to understand first, then convert into notes, quizzes, or review sets.</p>
              </div>
              {sourceBrief && (
                <article className={styles.sourceBriefCard}>
                  <div className={styles.listTop}>
                    <div>
                      <h4>{sourceBrief.title}</h4>
                      <p>{sourceBrief.summary}</p>
                    </div>
                    <span className={styles.countPill}>{Math.max(1, Math.ceil(sourceBrief.wordCount / 220))} min read</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span>{sourceBrief.siteName ?? 'Web source'}</span>
                    <span>{sourceBrief.wordCount} words</span>
                    <span>{safeHostname(sourceBrief.url)}</span>
                  </div>
                  {sourceBrief.description && (
                    <div className={styles.noticeBox}>
                      <strong>Source description</strong>
                      <p>{sourceBrief.description}</p>
                    </div>
                  )}
                  <div className={styles.sourcePoints}>
                    {sourceBrief.keyPoints.map(pt => (
                      <article key={pt} className={styles.helperCard}>
                        <strong>Key idea</strong>
                        <p>{pt}</p>
                      </article>
                    ))}
                  </div>
                  <div className={styles.actions}>
                    <button className={styles.primaryButton}   disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('notes')}>{sourceActionLoading === 'notes'      ? 'Creating notes\u2026'  : 'Create notes'}</button>
                    <button className={styles.secondaryButton} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('quiz')}>{sourceActionLoading === 'quiz'       ? 'Creating quiz\u2026'   : 'Create quiz'}</button>
                    <button className={styles.secondaryButton} disabled={sourceActionLoading !== null} onClick={() => void handleSourceAction('flashcards')}>{sourceActionLoading === 'flashcards' ? 'Creating set\u2026'    : 'Create review set'}</button>
                  </div>
                </article>
              )}
            </div>
          </section>

          {/* Assignment Helper */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Assignment Helper</span>
                <h3>Get help with your work</h3>
                <p>Rephrase, explain, summarise or break down any assignment text instantly.</p>
              </div>
            </div>
            <div className={styles.modeBar}>
              {ASSIGN_MODES.map(m => (
                <button key={m.id} className={`${styles.modeButton} ${assignMode === m.id ? styles.modeButtonActive : ''}`} onClick={() => setAssignMode(m.id)}>
                  <span>{m.label}</span><small>{m.desc}</small>
                </button>
              ))}
            </div>
            <div className={styles.importBlock}>
              <textarea className={styles.textArea} rows={5} value={assignText} onChange={e => setAssignText(e.target.value)} placeholder="Paste your assignment, question, or notes here\u2026" />
              <div className={styles.actions}>
                <button className={styles.primaryButton} disabled={assignLoading || !assignText.trim()} onClick={() => void handleAssignHelper()}>
                  {assignLoading ? 'Working\u2026' : ASSIGN_MODES.find(m => m.id === assignMode)?.label ?? 'Run'}
                </button>
                {assignResult && <button className={styles.secondaryButton} onClick={() => { setAssignResult(''); setAssignText(''); }}>Clear</button>}
              </div>
              {assignResult && <div className={styles.generatedText}>{assignResult}</div>}
            </div>
          </section>

          {/* Work Checker */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Work Checker</span>
                <h3>Grammar, tone and clarity feedback</h3>
                <p>Paste your draft and get feedback on grammar, spelling, academic tone, sentence clarity and logical flow.</p>
              </div>
            </div>
            <div className={styles.importBlock}>
              <textarea className={styles.textArea} rows={7} value={checkText} onChange={e => setCheckText(e.target.value)} placeholder="Paste your essay, report or answer here\u2026" />
              <div className={styles.actions}>
                <button className={styles.primaryButton} disabled={checkLoading || !checkText.trim()} onClick={() => void handleWorkChecker()}>
                  {checkLoading ? 'Checking\u2026' : '\u270F Check my work'}
                </button>
                {checkResult && <button className={styles.secondaryButton} onClick={() => { setCheckResult(''); setCheckText(''); }}>Clear</button>}
              </div>
              {checkResult && <div className={styles.generatedText}>{checkResult}</div>}
            </div>
          </section>

          {/* Report Builder */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Report Builder</span>
                <h3>Generate a full essay or report draft</h3>
                <p>Give Scholar Hub a topic, type and length and it will write a structured draft you can copy or download.</p>
              </div>
            </div>
            <div className={styles.modeBar}>
              {REPORT_TYPES.map(t => (
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
                  {reportLoading ? 'Building\u2026' : '\uD83D\uDCDD Build draft'}
                </button>
                {reportResult && <button className={styles.secondaryButton} onClick={() => { setReportResult(''); setReportTopic(''); setReportKeyPoints(''); }}>Clear</button>}
              </div>
              {reportResult && (
                <div>
                  <div className={styles.generatedText}>{reportResult}</div>
                  <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
                    <button className={styles.secondaryButton} onClick={() => void navigator.clipboard.writeText(reportResult).then(() => toast('Copied!', 'success'))}>&#x1F4CB; Copy</button>
                    <button className={styles.secondaryButton} onClick={() => {
                      const blob = new Blob([reportResult], { type: 'text/plain' });
                      const a    = document.createElement('a');
                      a.href     = URL.createObjectURL(blob);
                      a.download = `${reportTopic.slice(0, 40).replace(/[^a-z0-9]/gi, '_')}_draft.txt`;
                      a.click();
                    }}>&#x2B07; Download .txt</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Review Sets (secondary) */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Review Sets</span>
                <h3>Your private spaced-repetition sets</h3>
                <p>These are secondary here &mdash; Scholar Hub focuses on today&apos;s best next action, not library browsing.</p>
              </div>
            </div>
            {loadingSets ? (
              <div className={styles.emptyState}>Loading review sets&hellip;</div>
            ) : sortedReviewSets.length === 0 ? (
              <div className={styles.emptyState}>No review sets yet. Import one above to start using Scholar Hub.</div>
            ) : (
              <div className={styles.listStack}>
                {sortedReviewSets.slice(0, 8).map(set => {
                  const accuracy = getSetAccuracy(set);
                  const due      = getSetDue(set);
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
                        <button className={styles.primaryButton}   onClick={() => openPanel(set.id, 'review')}>Review</button>
                        <button className={styles.secondaryButton} onClick={() => void quizSet(set)}>Quiz</button>
                        <button className={styles.secondaryButton} onClick={() => openPanel(set.id, 'manage')}>Manage</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
