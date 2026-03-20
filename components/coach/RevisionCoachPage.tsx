'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useAnalytics, type WeakArea } from '@/hooks/useAnalytics';
import { createCard, deleteDeck, loadDecks, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import {
  buildDeckQuizContent,
  buildImportedDeck,
  exportDeckApkg,
  exportDeckCsv,
  persistDeckLocally,
  syncDeckToCloud,
} from '@/lib/srs/deck-utils';
import { extractQuizletCards, extractQuizletTitle } from '@/lib/srs/quizlet-import';
import { FlashcardView } from '@/components/workspace/views/FlashcardView';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { writeCoachHandoff } from '@/lib/coach/handoff';
import { buildCoachUrl } from '@/lib/coach/routes';
import type { GeneratedContent } from '@/lib/offline/generate';
import type { SourceBrief } from '@/lib/coach/source-brief';
import styles from '@/app/(dashboard)/coach/page.module.css';

type CoachPanel = 'review' | 'manage';
type ImportMode = 'paste' | 'csv' | 'anki' | 'url' | 'quizlet';
type EditableCard = { id: string; front: string; back: string };
type ImportPayload = {
  title?: string;
  description?: string;
  content?: string;
  cards?: Array<{ front: string; back: string }>;
  source?: string;
  cardCount?: number;
};

type CoachOutput =
  | { kind: 'quiz'; title: string; content: string; quiz: GeneratedContent; setId: string }
  | { kind: 'explanation'; title: string; content: string; setId: string }
  | { kind: 'generated'; title: string; content: string };

const IMPORT_SOURCE_META = {
  quizlet: { type: 'quizlet', label: 'Quizlet import' },
  'kivora-share': { type: 'kivora-share', label: 'Kivora shared review set' },
  csv: { type: 'csv', label: 'CSV import' },
  paste: { type: 'paste', label: 'Pasted cards' },
  anki: { type: 'anki', label: 'Anki import' },
} satisfies Partial<Record<NonNullable<ImportPayload['source']>, { type: SRSDeck['sourceType']; label: string }>>;

const IMPORT_MODE_OPTIONS: Array<{ id: ImportMode; label: string; description: string }> = [
  { id: 'paste', label: 'Paste', description: 'Best for Quizlet exports and quick copied cards.' },
  { id: 'csv', label: 'CSV', description: 'Import a spreadsheet-style front/back list.' },
  { id: 'anki', label: 'Anki', description: 'Use a `.apkg` package from Anki.' },
  { id: 'url', label: 'Kivora link', description: 'Import from a Kivora share link only.' },
];

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function mergeSets(local: SRSDeck[], remote: SRSDeck[]) {
  const byId = new Map<string, SRSDeck>();
  for (const set of local) byId.set(set.id, set);
  for (const set of remote) byId.set(set.id, set);
  return Array.from(byId.values()).sort((left, right) => {
    const leftDate = new Date(left.lastStudied ?? left.createdAt).getTime();
    const rightDate = new Date(right.lastStudied ?? right.createdAt).getTime();
    return rightDate - leftDate;
  });
}

export function RevisionCoachPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { data: analytics, loading: analyticsLoading, refresh: refreshAnalytics } = useAnalytics(30);
  const importRef = useRef<HTMLDivElement | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);

  const [reviewSets, setReviewSets] = useState<SRSDeck[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [requestedPhase, setRequestedPhase] = useState<'review' | null>(null);
  const [output, setOutput] = useState<CoachOutput | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [savingSetState, setSavingSetState] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('paste');
  const [importTitle, setImportTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [ankiFile, setAnkiFile] = useState<File | null>(null);
  const [quizletHtml, setQuizletHtml] = useState('');
  const [importingMode, setImportingMode] = useState<ImportMode | null>(null);
  const [lastImported, setLastImported] = useState<{ set: SRSDeck; cardCount: number } | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceBrief, setSourceBrief] = useState<SourceBrief | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceActionLoading, setSourceActionLoading] = useState<'notes' | 'quiz' | 'flashcards' | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [cardDrafts, setCardDrafts] = useState<EditableCard[]>([]);

  const selectedSetId = searchParams.get('set');
  const imported = searchParams.get('imported') === '1';
  const panel = searchParams.get('panel') === 'review'
    ? 'review'
    : searchParams.get('panel') === 'manage'
      ? 'manage'
      : null;

  const today = new Date().toISOString().slice(0, 10);

  const getSetDue = useCallback((set: SRSDeck) => (
    set.cards.filter((card) => card.nextReview && card.nextReview <= today).length
  ), [today]);

  const getSetAccuracy = useCallback((set: SRSDeck) => {
    const totalReviews = set.cards.reduce((sum, card) => sum + card.totalReviews, 0);
    const totalCorrect = set.cards.reduce((sum, card) => sum + card.correctReviews, 0);
    return totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : -1;
  }, []);

  const getSetMastered = useCallback((set: SRSDeck) => (
    set.cards.filter((card) => (card.interval ?? 0) >= 21).length
  ), []);

  const sortedReviewSets = useMemo(() => {
    return [...reviewSets].sort((left, right) => {
      const dueDelta = getSetDue(right) - getSetDue(left);
      if (dueDelta !== 0) return dueDelta;
      return new Date(right.lastStudied ?? right.createdAt).getTime() - new Date(left.lastStudied ?? left.createdAt).getTime();
    });
  }, [getSetDue, reviewSets]);

  const dueReviewSets = useMemo(() => sortedReviewSets.filter((set) => getSetDue(set) > 0), [getSetDue, sortedReviewSets]);
  const selectedSet = useMemo(() => sortedReviewSets.find((set) => set.id === selectedSetId) ?? null, [selectedSetId, sortedReviewSets]);
  const topWeakAreas = useMemo(() => analytics?.weakAreas?.slice(0, 3) ?? [], [analytics?.weakAreas]);

  const mission = useMemo(() => {
    if (dueReviewSets[0]) {
      const set = dueReviewSets[0];
      return {
        eyebrow: 'Today’s Mission',
        title: `Review ${getSetDue(set)} due card${getSetDue(set) === 1 ? '' : 's'} in ${set.name}`,
        description: 'Start with the review set that is already waiting, then move on to recovery work if you still have time.',
        actionLabel: 'Start today’s mission',
        secondaryLabel: 'Quick manage',
        kind: 'review' as const,
        setId: set.id,
      };
    }
    if (topWeakAreas[0]) {
      const area = topWeakAreas[0];
      return {
        eyebrow: 'Today’s Mission',
        title: `Recover ${area.topic}`,
        description: `${Math.round(area.accuracy)}% accuracy right now — a short focused practice run is the best next move.`,
        actionLabel: 'Start today’s mission',
        secondaryLabel: 'Explain it',
        kind: 'weak' as const,
        weakArea: area,
      };
    }
    if ((analytics?.planStats?.activePlans ?? 0) > 0 && (analytics?.planStats?.averageProgress ?? 100) < 60) {
      return {
        eyebrow: 'Today’s Mission',
        title: 'Catch up on your active study plan',
        description: `${analytics?.planStats?.averageProgress ?? 0}% average progress across active plans. Bring today back under control first.`,
        actionLabel: 'Start today’s mission',
        secondaryLabel: 'Open planner',
        kind: 'plan' as const,
      };
    }
    if (reviewSets.length === 0) {
      return {
        eyebrow: 'Today’s Mission',
        title: 'Import your first review set',
        description: 'Bring in a reliable source and let Revision Coach guide the next steps after import.',
        actionLabel: 'Start today’s mission',
        secondaryLabel: 'See import options',
        kind: 'import' as const,
      };
    }
    const set = sortedReviewSets[0];
    return {
      eyebrow: 'Today’s Mission',
      title: `Open ${set?.name ?? 'your latest review set'}`,
      description: 'Nothing urgent is due right now, so use this session to tidy, test, or strengthen your newest set.',
      actionLabel: 'Start today’s mission',
      secondaryLabel: 'Quick manage',
      kind: 'manage' as const,
      setId: set?.id,
    };
  }, [analytics?.planStats?.activePlans, analytics?.planStats?.averageProgress, dueReviewSets, getSetDue, reviewSets.length, sortedReviewSets, topWeakAreas]);

  const refreshReviewSets = useCallback(async () => {
    setLoadingSets(true);
    const localSets = loadDecks();
    setReviewSets(localSets);
    try {
      const response = await fetch('/api/srs', { cache: 'no-store' });
      if (response.ok) {
        const remoteSets = await response.json() as SRSDeck[];
        remoteSets.forEach((set) => persistDeckLocally(set));
        setReviewSets(mergeSets(localSets, remoteSets));
      }
    } catch {
      // Offline/local mode keeps the coach usable.
    } finally {
      setLoadingSets(false);
    }
  }, []);

  useEffect(() => {
    void refreshReviewSets();
  }, [refreshReviewSets]);

  useEffect(() => {
    const sharedImportUrl = searchParams.get('importUrl');
    if (!sharedImportUrl) return;
    setImportMode('url');
    setImportUrl(sharedImportUrl);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedSet) {
      setNameDraft('');
      setDescriptionDraft('');
      setCardDrafts([]);
      return;
    }
    setNameDraft(selectedSet.name);
    setDescriptionDraft(selectedSet.description ?? '');
    setCardDrafts(selectedSet.cards.map((card) => ({ id: card.id, front: card.front, back: card.back })));
  }, [selectedSet]);

  useEffect(() => {
    if (panel !== 'review' || !selectedSet) return;
    setRequestedPhase('review');
  }, [panel, selectedSet]);

  function openPanel(setId: string, nextPanel: CoachPanel, importedFlag: boolean | null = null) {
    router.push(buildCoachUrl({ setId, panel: nextPanel, imported: importedFlag, importUrl: null }), { scroll: false });
  }

  function closePanel() {
    router.push(buildCoachUrl({ setId: null, panel: null, imported: null, importUrl: null }), { scroll: false });
  }

  async function saveSetOutput(set: SRSDeck, content: string) {
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'quiz',
          content,
          metadata: {
            title: `Quiz — ${set.name}`,
            sourceDeckId: set.id,
            sourceDeckName: set.name,
            savedFrom: `/coach?set=${set.id}&panel=manage`,
          },
        }),
      });
    } catch {
      toast('Quiz generated, but Library sync failed', 'warning');
    }
  }

  function resetImportInputs() {
    setImportTitle('');
    setPasteText('');
    setCsvText('');
    setImportUrl('');
    setAnkiFile(null);
    setQuizletHtml('');
  }

  async function handleAnalyzeSource() {
    if (!sourceUrl.trim() || sourceLoading) return;
    setSourceLoading(true);
    try {
      const response = await fetch('/api/coach/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: sourceUrl.trim(),
          ai: loadAiRuntimePreferences(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not analyze this source');
      }
      setSourceBrief(payload as SourceBrief);
      toast('Source brief ready', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not analyze this source', 'error');
    } finally {
      setSourceLoading(false);
    }
  }

  async function handleSourceAction(mode: 'notes' | 'quiz' | 'flashcards') {
    if (!sourceBrief || sourceActionLoading) return;
    setSourceActionLoading(mode);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: sourceBrief.extractedText,
          options: { count: mode === 'quiz' ? 8 : 10 },
          ai: loadAiRuntimePreferences(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.content !== 'string') {
        throw new Error(typeof payload?.error === 'string' ? payload.error : `Could not create ${mode}`);
      }

      if (mode === 'flashcards') {
        const set = buildImportedDeck({
          title: sourceBrief.title,
          description: sourceBrief.summary,
          content: payload.content,
          sourceType: 'manual',
          sourceLabel: 'Source Brief import',
          creatorName: 'You',
        });
        if (!set) {
          throw new Error('Could not turn this source into review cards.');
        }
        persistDeckLocally(set);
        const synced = await syncDeckToCloud(set);
        setLastImported({ set, cardCount: set.cards.length });
        await refreshReviewSets();
        void refreshAnalytics();
        toast(synced ? `Created review set "${set.name}"` : `Created "${set.name}" locally`, synced ? 'success' : 'warning');
        openPanel(set.id, 'manage', true);
        return;
      }

      setOutput({
        kind: 'generated',
        title: mode === 'quiz' ? `Quiz — ${sourceBrief.title}` : `Notes — ${sourceBrief.title}`,
        content: payload.content,
      });
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast(error instanceof Error ? error.message : `Could not create ${mode}`, 'error');
    } finally {
      setSourceActionLoading(null);
    }
  }

  async function finalizeImport(payload: ImportPayload, fallbackSource: { type: SRSDeck['sourceType']; label: string }) {
    const sourceMeta = typeof payload.source === 'string' && payload.source in IMPORT_SOURCE_META
      ? IMPORT_SOURCE_META[payload.source as keyof typeof IMPORT_SOURCE_META]
      : undefined;

    const set = buildImportedDeck({
      title: String(payload.title ?? 'Imported review set'),
      description: String(payload.description ?? ''),
      content: String(payload.content ?? ''),
      cards: payload.cards,
      sourceType: sourceMeta?.type ?? fallbackSource.type,
      sourceLabel: sourceMeta?.label ?? fallbackSource.label,
      creatorName: 'You',
    });

    if (!set) {
      throw new Error('Could not parse review set cards');
    }

    persistDeckLocally(set);
    const synced = await syncDeckToCloud(set);
    setLastImported({ set, cardCount: payload.cardCount ?? set.cards.length });
    resetImportInputs();
    await refreshReviewSets();
    void refreshAnalytics();
    toast(
      synced ? `Imported "${set.name}" (${payload.cardCount ?? set.cards.length} cards)` : `Imported "${set.name}" locally (${payload.cardCount ?? set.cards.length} cards)`,
      synced ? 'success' : 'warning',
    );
    openPanel(set.id, 'manage', true);
  }

  async function requestImport(body: Record<string, unknown>, fallbackSource: { type: SRSDeck['sourceType']; label: string }) {
    try {
      const response = await fetch('/api/srs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? 'Import failed');
      await finalizeImport(payload as ImportPayload, fallbackSource);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error');
    }
  }

  async function importFromPaste() {
    if (!pasteText.trim()) return;
    setImportingMode('paste');
    try {
      await requestImport(
        { kind: 'paste', text: pasteText.trim(), title: importTitle.trim() || undefined },
        { type: 'paste', label: 'Pasted cards' },
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function importFromCsv() {
    if (!csvText.trim()) return;
    setImportingMode('csv');
    try {
      await requestImport(
        { kind: 'csv', text: csvText.trim(), title: importTitle.trim() || undefined },
        { type: 'csv', label: 'CSV import' },
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function importFromAnki() {
    if (!ankiFile) return;
    setImportingMode('anki');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : '';
          const encoded = result.includes(',') ? result.split(',')[1] ?? '' : result;
          if (!encoded) {
            reject(new Error('Could not read the Anki package'));
            return;
          }
          resolve(encoded);
        };
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the Anki package'));
        reader.readAsDataURL(ankiFile);
      });

      await requestImport(
        { kind: 'anki', base64, fileName: ankiFile.name, title: importTitle.trim() || undefined },
        { type: 'anki', label: 'Anki import' },
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function importFromKivoraLink() {
    if (!importUrl.trim()) return;
    setImportingMode('url');
    try {
      const normalizedUrl = importUrl.trim().startsWith('/')
        ? new URL(importUrl.trim(), window.location.origin).toString()
        : importUrl.trim();
      await requestImport(
        { kind: 'url', url: normalizedUrl },
        { type: 'manual', label: 'Kivora link import' },
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function importFromLegacyQuizletSource() {
    const html = quizletHtml.trim();
    if (!html) {
      toast('Paste the page source first.', 'warning');
      return;
    }
    setImportingMode('quizlet');
    try {
      const cards = extractQuizletCards(html);
      if (!cards.length) {
        toast('No flashcards found in the pasted source.', 'error');
        return;
      }
      const title = extractQuizletTitle(html);
      await finalizeImport(
        {
          source: 'quizlet',
          title: importTitle.trim() || title,
          description: `Imported from Quizlet (${cards.length} cards)`,
          cards,
          cardCount: cards.length,
        },
        IMPORT_SOURCE_META.quizlet,
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function applySetUpdate(nextSet: SRSDeck, successMessage: string) {
    setSavingSetState(true);
    saveDeck(nextSet);
    persistDeckLocally(nextSet);
    setReviewSets((current) => {
      const exists = current.some((set) => set.id === nextSet.id);
      const next = exists ? current.map((set) => set.id === nextSet.id ? nextSet : set) : [nextSet, ...current];
      return mergeSets(next, []);
    });
    const synced = await syncDeckToCloud(nextSet);
    void refreshAnalytics();
    toast(synced ? successMessage : `${successMessage} (saved locally)`, synced ? 'success' : 'warning');
    setSavingSetState(false);
  }

  async function handleSaveSetEdits() {
    if (!selectedSet) return;
    const trimmedName = nameDraft.trim();
    const trimmedCards = cardDrafts
      .map((card) => ({ ...card, front: card.front.trim(), back: card.back.trim() }))
      .filter((card) => card.front && card.back);

    if (!trimmedName) {
      toast('Review set name cannot be empty', 'error');
      return;
    }
    if (trimmedCards.length === 0) {
      toast('Add at least one valid card', 'error');
      return;
    }

    const nextSet: SRSDeck = {
      ...selectedSet,
      name: trimmedName,
      description: descriptionDraft.trim(),
      cards: selectedSet.cards
        .map((existing) => {
          const draft = trimmedCards.find((card) => card.id === existing.id);
          return draft ? { ...existing, front: draft.front, back: draft.back } : null;
        })
        .filter(Boolean) as SRSDeck['cards'],
    };

    const newCards = trimmedCards.filter((card) => !selectedSet.cards.some((existing) => existing.id === card.id));
    nextSet.cards = [
      ...nextSet.cards,
      ...newCards.map((card) => createCard(card.id, card.front, card.back)),
    ];

    await applySetUpdate(nextSet, 'Review set updated');
  }

  async function handleDeleteSet() {
    if (!selectedSet) return;
    if (!confirm(`Delete "${selectedSet.name}"?`)) return;
    deleteDeck(selectedSet.id);
    setReviewSets((current) => current.filter((set) => set.id !== selectedSet.id));
    try {
      await fetch(`/api/srs/${selectedSet.id}`, { method: 'DELETE' });
    } catch {
      // Local delete keeps the app responsive offline.
    }
    void refreshAnalytics();
    toast('Review set deleted', 'info');
    closePanel();
  }

  function addDraftCard() {
    setCardDrafts((current) => [
      ...current,
      { id: `draft-${crypto.randomUUID().slice(0, 8)}`, front: '', back: '' },
    ]);
  }

  async function handleGenerateQuiz(targetSet?: SRSDeck) {
    const set = targetSet ?? selectedSet;
    if (!set || generatingQuiz) return;
    setGeneratingQuiz(true);
    try {
      const quiz = buildDeckQuizContent(set, 10);
      setOutput({
        kind: 'quiz',
        title: `Quiz — ${set.name}`,
        content: quiz.displayText,
        quiz,
        setId: set.id,
      });
      await saveSetOutput(set, quiz.displayText);
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!selectedSet || selectedSet.id !== set.id) {
        openPanel(set.id, 'manage');
      }
    } finally {
      setGeneratingQuiz(false);
    }
  }

  async function handleExplain(targetSet?: SRSDeck) {
    const set = targetSet ?? selectedSet;
    if (!set || explaining) return;
    setExplaining(true);
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: set.name,
          context: set.cards.slice(0, 24).map((card) => `${card.front}: ${card.back}`).join('\n'),
        }),
      });
      const payload = await response.json().catch(() => null);
      const explanation = typeof payload?.explanation === 'string' ? payload.explanation.trim() : '';
      if (!explanation) throw new Error('No explanation returned');
      setOutput({
        kind: 'explanation',
        title: `Explain — ${set.name}`,
        content: explanation,
        setId: set.id,
      });
      outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (!selectedSet || selectedSet.id !== set.id) {
        openPanel(set.id, 'manage');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Explain failed', 'error');
    } finally {
      setExplaining(false);
    }
  }

  function launchWeakTopic(area: WeakArea, preferredTool: 'quiz' | 'mcq' | 'flashcards' | 'summarize' | 'explain') {
    writeCoachHandoff({
      type: 'weak-topic',
      topic: area.topic,
      preferredTool,
    });
    toast(`"${area.topic}" is ready in Workspace`, 'success');
    router.push('/workspace');
  }

  function startMission() {
    if (mission.kind === 'review' && mission.setId) {
      openPanel(mission.setId, 'review');
      return;
    }
    if (mission.kind === 'manage' && mission.setId) {
      openPanel(mission.setId, 'manage');
      return;
    }
    if (mission.kind === 'weak' && mission.weakArea) {
      launchWeakTopic(mission.weakArea, 'quiz');
      return;
    }
    if (mission.kind === 'plan') {
      router.push('/planner');
      return;
    }
    importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function runMissionSecondary() {
    if (mission.kind === 'review' && mission.setId) {
      openPanel(mission.setId, 'manage');
      return;
    }
    if (mission.kind === 'manage' && mission.setId) {
      openPanel(mission.setId, 'manage');
      return;
    }
    if (mission.kind === 'weak' && mission.weakArea) {
      launchWeakTopic(mission.weakArea, 'explain');
      return;
    }
    if (mission.kind === 'plan') {
      router.push('/planner');
      return;
    }
    importRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{mission.eyebrow}</span>
          <h1>Revision Coach</h1>
          <h2>{mission.title}</h2>
          <p>{mission.description}</p>
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={startMission}>
              {mission.actionLabel}
            </button>
            <button className={styles.secondaryButton} onClick={runMissionSecondary}>
              {mission.secondaryLabel}
            </button>
            <button className={styles.secondaryButton} onClick={() => void refreshReviewSets().then(() => refreshAnalytics())}>
              Refresh
            </button>
          </div>
        </div>

        <div className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <span className={styles.metricLabel}>Due today</span>
            <strong>{analytics?.deckStats?.dueCardsTotal ?? dueReviewSets.reduce((sum, set) => sum + getSetDue(set), 0)}</strong>
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
                <button className={styles.primaryButton} onClick={() => openPanel(selectedSet.id, 'review')}>
                  Review
                </button>
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
                onDeckChange={(nextSet) => {
                  setReviewSets((current) => current.map((set) => set.id === nextSet.id ? nextSet : set));
                }}
                showBrowseButton={false}
                showPublicActions={false}
              />
            </div>
          ) : (
            <>
              {imported && (
                <div className={styles.importedBanner}>
                  <div>
                    <strong>Review set imported ✓</strong>
                    <p>{selectedSet.name} — {selectedSet.cards.length} cards added and ready for today’s mission.</p>
                  </div>
                  <button className={styles.secondaryButton} onClick={() => openPanel(selectedSet.id, 'review', null)}>
                    Start review
                  </button>
                </div>
              )}

              <div className={styles.panelStats}>
                <article className={styles.infoChip}><strong>{selectedSet.cards.length}</strong><span>cards</span></article>
                <article className={styles.infoChip}><strong>{getSetDue(selectedSet)}</strong><span>due now</span></article>
                <article className={styles.infoChip}><strong>{getSetAccuracy(selectedSet) >= 0 ? `${getSetAccuracy(selectedSet)}%` : '—'}</strong><span>accuracy</span></article>
                <article className={styles.infoChip}><strong>{getSetMastered(selectedSet)}</strong><span>mastered</span></article>
              </div>

              <div className={styles.actions} style={{ marginBottom: '1rem' }}>
                <button className={styles.primaryButton} onClick={() => openPanel(selectedSet.id, 'review')}>Review</button>
                <button className={styles.secondaryButton} disabled={generatingQuiz} onClick={() => void handleGenerateQuiz(selectedSet)}>
                  {generatingQuiz ? 'Generating…' : 'Quiz'}
                </button>
                <button className={styles.secondaryButton} disabled={explaining} onClick={() => void handleExplain(selectedSet)}>
                  {explaining ? 'Explaining…' : 'Explain'}
                </button>
                <button className={styles.secondaryButton} onClick={() => exportDeckCsv(selectedSet)}>Export CSV</button>
                <button className={styles.secondaryButton} onClick={() => { void exportDeckApkg(selectedSet).catch(() => toast('Anki export failed', 'error')); }}>Export Anki</button>
                <button className={styles.dangerButton} onClick={() => void handleDeleteSet()}>Delete</button>
              </div>

              <div className={styles.editorGrid}>
                <label className={styles.fieldBlock}>
                  <span>Review set name</span>
                  <input className={styles.textInput} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
                </label>
                <label className={styles.fieldBlock}>
                  <span>Description</span>
                  <textarea className={styles.textArea} rows={3} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} />
                </label>
              </div>

              <div className={styles.sectionHeader}>
                <div>
                  <h3>Card editor</h3>
                  <p>Keep this set tight and readable before your next quiz or review block.</p>
                </div>
                <div className={styles.actions}>
                  <button className={styles.secondaryButton} onClick={addDraftCard}>Add card</button>
                  <button className={styles.primaryButton} disabled={savingSetState} onClick={() => void handleSaveSetEdits()}>
                    {savingSetState ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>

              <div className={styles.cardEditorList}>
                {cardDrafts.map((card, index) => (
                  <div key={card.id} className={styles.cardEditorRow}>
                    <div className={styles.cardOrdinal}>#{index + 1}</div>
                    <input
                      className={styles.textInput}
                      value={card.front}
                      onChange={(event) => setCardDrafts((current) => current.map((draft) => draft.id === card.id ? { ...draft, front: event.target.value } : draft))}
                      placeholder="Front"
                    />
                    <textarea
                      className={styles.textArea}
                      rows={2}
                      value={card.back}
                      onChange={(event) => setCardDrafts((current) => current.map((draft) => draft.id === card.id ? { ...draft, back: event.target.value } : draft))}
                      placeholder="Back"
                    />
                    <button className={styles.inlineAction} onClick={() => setCardDrafts((current) => current.filter((draft) => draft.id !== card.id))}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </>
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
                    : 'Generated from the source you analyzed in Revision Coach.'}
              </p>
            </div>
            <button className={styles.inlineAction} onClick={() => setOutput(null)}>Close</button>
          </div>

          {output.kind === 'quiz' ? (
            <InteractiveQuiz content={output.quiz} deckId={output.setId} onClose={() => setOutput(null)} />
          ) : (
            <div className={styles.generatedText}>{output.content}</div>
          )}
        </section>
      )}

      <div className={styles.contentGrid}>
        <div className={styles.leftColumn}>
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Due Review</span>
                <h3>Start with what is due now</h3>
                <p>Only review sets that need attention appear here.</p>
              </div>
            </div>

            {loadingSets ? (
              <div className={styles.emptyState}>Loading due review…</div>
            ) : dueReviewSets.length === 0 ? (
              <div className={styles.emptyState}>Nothing is due right now. Use Weak Topic Recovery or import a new review set.</div>
            ) : (
              <div className={styles.listStack}>
                {dueReviewSets.map((set) => {
                  const accuracy = getSetAccuracy(set);
                  return (
                    <article key={set.id} className={styles.listCard}>
                      <div className={styles.listTop}>
                        <div>
                          <h4>{set.name}</h4>
                          <p>{set.description || 'Private review set'}</p>
                        </div>
                        <span className={styles.countPill}>{getSetDue(set)} due</span>
                      </div>
                      <div className={styles.metaRow}>
                        <span>{set.cards.length} cards</span>
                        <span>{accuracy >= 0 ? `${accuracy}% accuracy` : 'No accuracy yet'}</span>
                        <span>{formatDate(set.lastStudied ?? set.createdAt)}</span>
                      </div>
                      <div className={styles.actions}>
                        <button className={styles.primaryButton} onClick={() => openPanel(set.id, 'review')}>Review</button>
                        <button className={styles.secondaryButton} onClick={() => openPanel(set.id, 'manage')}>Quick manage</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Weak Topic Recovery</span>
                <h3>Fix the weakest concepts next</h3>
                <p>These come from your analytics, so the coach can guide the next useful session.</p>
              </div>
            </div>

            {analyticsLoading ? (
              <div className={styles.emptyState}>Loading weak-topic data…</div>
            ) : topWeakAreas.length === 0 ? (
              <div className={styles.emptyState}>No weak topics detected yet. Complete quizzes or review sets and the coach will start surfacing recovery work here.</div>
            ) : (
              <div className={styles.listStack}>
                {topWeakAreas.map((area) => (
                  <article key={area.topic} className={styles.listCard}>
                    <div className={styles.listTop}>
                      <div>
                        <h4>{area.topic}</h4>
                        <p>{area.suggestion}</p>
                      </div>
                      <span className={styles.countPill}>{Math.round(area.accuracy)}%</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span>{area.attempts} attempts</span>
                      <span>{area.totalQuestions} questions</span>
                      <span>~{area.estimatedMinutes} min recovery</span>
                    </div>
                    <div className={styles.actions}>
                      <button className={styles.primaryButton} onClick={() => launchWeakTopic(area, 'quiz')}>Practice</button>
                      <button className={styles.secondaryButton} onClick={() => launchWeakTopic(area, 'explain')}>Explain</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className={styles.rightColumn}>
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Source Brief</span>
                <h3>Understand a source before you study it</h3>
                <p>Paste a web link and Coach will explain what the source is about, summarize it, and help turn it into study material.</p>
              </div>
            </div>

            <div className={styles.importBlock}>
              <div className={styles.actions}>
                <input
                  className={styles.textInput}
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="Paste a source URL to analyze"
                />
                <button className={styles.primaryButton} onClick={() => void handleAnalyzeSource()} disabled={sourceLoading || !sourceUrl.trim()}>
                  {sourceLoading ? 'Analyzing…' : 'Analyze source'}
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
                    <span>{new URL(sourceBrief.url).hostname.replace(/^www\./, '')}</span>
                  </div>

                  {sourceBrief.description && (
                    <div className={styles.noticeBox}>
                      <strong>Source description</strong>
                      <p>{sourceBrief.description}</p>
                    </div>
                  )}

                  <div className={styles.sourcePoints}>
                    {sourceBrief.keyPoints.map((point) => (
                      <article key={point} className={styles.helperCard}>
                        <strong>Key idea</strong>
                        <p>{point}</p>
                      </article>
                    ))}
                  </div>

                  <div className={styles.actions}>
                    <button className={styles.primaryButton} onClick={() => void handleSourceAction('notes')} disabled={sourceActionLoading !== null}>
                      {sourceActionLoading === 'notes' ? 'Creating notes…' : 'Create notes'}
                    </button>
                    <button className={styles.secondaryButton} onClick={() => void handleSourceAction('quiz')} disabled={sourceActionLoading !== null}>
                      {sourceActionLoading === 'quiz' ? 'Creating quiz…' : 'Create quiz'}
                    </button>
                    <button className={styles.secondaryButton} onClick={() => void handleSourceAction('flashcards')} disabled={sourceActionLoading !== null}>
                      {sourceActionLoading === 'flashcards' ? 'Creating set…' : 'Create review set'}
                    </button>
                  </div>
                </article>
              )}
            </div>
          </section>

          <section ref={importRef} className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Quick Import</span>
                <h3>Bring in reliable review sources</h3>
                <p>Quizlet works best as export → paste. Direct scraping stays hidden as legacy fallback only.</p>
              </div>
              {lastImported && (
                <button className={styles.inlineAction} onClick={() => openPanel(lastImported.set.id, 'manage', true)}>
                  Open “{lastImported.set.name}”
                </button>
              )}
            </div>

            <div className={styles.helperSteps}>
              <article className={styles.helperCard}>
                <strong>1. Export from Quizlet</strong>
                <p>Copy the term/definition text from Quizlet export instead of relying on direct URLs.</p>
              </article>
              <article className={styles.helperCard}>
                <strong>2. Paste into Coach</strong>
                <p>Use the Paste mode below so your import stays predictable and clean.</p>
              </article>
              <article className={styles.helperCard}>
                <strong>3. Review immediately</strong>
                <p>Coach routes the new set straight into manage or review mode after import.</p>
              </article>
            </div>

            <div className={styles.modeBar}>
              {IMPORT_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.id}
                  className={`${styles.modeButton} ${importMode === mode.id ? styles.modeButtonActive : ''}`}
                  onClick={() => setImportMode(mode.id)}
                >
                  <span>{mode.label}</span>
                  <small>{mode.description}</small>
                </button>
              ))}
            </div>

            {importMode === 'paste' && (
              <div className={styles.importBlock}>
                <div className={styles.actions}>
                  <input
                    className={styles.textInput}
                    value={importTitle}
                    onChange={(event) => setImportTitle(event.target.value)}
                    placeholder="Optional review set title"
                  />
                  <button className={styles.primaryButton} onClick={importFromPaste} disabled={importingMode === 'paste' || !pasteText.trim()}>
                    {importingMode === 'paste' ? 'Importing…' : 'Import pasted cards'}
                  </button>
                </div>
                <textarea
                  className={styles.textArea}
                  rows={10}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={'Quizlet export example:\nPhotosynthesis\tConverts light into chemical energy\nMitochondria\tPowerhouse of the cell\n\nAlso works with :: or — separators.'}
                />
              </div>
            )}

            {importMode === 'csv' && (
              <div className={styles.importBlock}>
                <div className={styles.actions}>
                  <input
                    className={styles.textInput}
                    value={importTitle}
                    onChange={(event) => setImportTitle(event.target.value)}
                    placeholder="Optional review set title"
                  />
                  <button className={styles.primaryButton} onClick={importFromCsv} disabled={importingMode === 'csv' || !csvText.trim()}>
                    {importingMode === 'csv' ? 'Importing…' : 'Import CSV'}
                  </button>
                </div>
                <textarea
                  className={styles.textArea}
                  rows={8}
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  placeholder={'Front,Back\nPhotosynthesis,Converts light into chemical energy\nMitochondria,Powerhouse of the cell'}
                />
              </div>
            )}

            {importMode === 'anki' && (
              <div className={styles.importBlock}>
                <div className={styles.actions}>
                  <input
                    className={styles.textInput}
                    value={importTitle}
                    onChange={(event) => setImportTitle(event.target.value)}
                    placeholder="Optional review set title override"
                  />
                  <button className={styles.primaryButton} onClick={importFromAnki} disabled={importingMode === 'anki' || !ankiFile}>
                    {importingMode === 'anki' ? 'Importing…' : 'Import Anki'}
                  </button>
                </div>
                <label className={styles.uploadCard}>
                  <span>Select an `.apkg` file</span>
                  <input type="file" accept=".apkg" className={styles.fileInput} onChange={(event) => setAnkiFile(event.target.files?.[0] ?? null)} />
                  <small>{ankiFile ? ankiFile.name : 'The importer extracts the first front/back fields from the package.'}</small>
                </label>
              </div>
            )}

            {importMode === 'url' && (
              <div className={styles.importBlock}>
                <div className={styles.actions}>
                  <input
                    className={styles.textInput}
                    value={importUrl}
                    onChange={(event) => setImportUrl(event.target.value)}
                    placeholder="Paste a Kivora share link (/share/... or /shared/...)"
                  />
                  <button className={styles.primaryButton} onClick={importFromKivoraLink} disabled={importingMode === 'url' || !importUrl.trim()}>
                    {importingMode === 'url' ? 'Importing…' : 'Import link'}
                  </button>
                </div>
                <div className={styles.noticeBox}>
                  <strong>Kivora links only</strong>
                  <p>Use this for Kivora share links. If your source is Quizlet, export it and use Paste instead.</p>
                </div>
              </div>
            )}

            <details className={styles.legacyBox}>
              <summary>Legacy / advanced Quizlet page-source importer</summary>
              <p>This is kept only as a fallback. It is not part of the normal Revision Coach workflow.</p>
              <div className={styles.actions}>
                <input
                  className={styles.textInput}
                  value={importTitle}
                  onChange={(event) => setImportTitle(event.target.value)}
                  placeholder="Optional review set title override"
                />
                <button className={styles.secondaryButton} onClick={importFromLegacyQuizletSource} disabled={importingMode === 'quizlet' || !quizletHtml.trim()}>
                  {importingMode === 'quizlet' ? 'Importing…' : 'Import source'}
                </button>
              </div>
              <textarea
                className={styles.codeArea}
                rows={10}
                value={quizletHtml}
                onChange={(event) => setQuizletHtml(event.target.value)}
                placeholder="Paste the full Quizlet page source here…"
              />
            </details>
          </section>

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <span className={styles.eyebrow}>Review Sets</span>
                <h3>Your private spaced-repetition sets</h3>
                <p>These are secondary here — Revision Coach focuses on today’s best next action, not library browsing.</p>
              </div>
            </div>

            {loadingSets ? (
              <div className={styles.emptyState}>Loading review sets…</div>
            ) : sortedReviewSets.length === 0 ? (
              <div className={styles.emptyState}>No review sets yet. Import one above to start using Revision Coach.</div>
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
                        <button className={styles.primaryButton} onClick={() => openPanel(set.id, 'review')}>Review</button>
                        <button className={styles.secondaryButton} onClick={() => void handleGenerateQuiz(set)}>Quiz</button>
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
