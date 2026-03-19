'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createCard, deleteDeck, loadDecks, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { getDeckStudyPhaseFromMode, type DeckStudyPhase } from '@/lib/srs/deck-route';
import {
  buildDeckQuizContent,
  deckToContent,
  exportDeckApkg,
  exportDeckCsv,
  persistDeckLocally,
  syncDeckToCloud,
} from '@/lib/srs/deck-utils';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import type { GeneratedContent } from '@/lib/offline/generate';
import { FlashcardView } from '@/components/workspace/views/FlashcardView';
import { InteractiveQuiz } from '@/components/workspace/InteractiveQuiz';
import { useToast } from '@/providers/ToastProvider';
import styles from './page.module.css';

type DeckOutput =
  | { kind: 'quiz'; title: string; content: string; quiz: GeneratedContent }
  | { kind: 'summarize' | 'exam' | 'explanation'; title: string; content: string };

type EditableCard = { id: string; front: string; back: string };

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DeckDetailPage() {
  const params = useParams<{ deckId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const studyRef = useRef<HTMLDivElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const deckId = params.deckId;
  const imported = searchParams.get('imported') === '1';
  const requestedMode = getDeckStudyPhaseFromMode(searchParams.get('mode'));

  const [deck, setDeck] = useState<SRSDeck | null>(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requestedPhase, setRequestedPhase] = useState<DeckStudyPhase | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [explaining, setExplaining] = useState(false);
  const [generating, setGenerating] = useState<'quiz' | 'summarize' | 'exam' | null>(null);
  const [output, setOutput] = useState<DeckOutput | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [savingDeckState, setSavingDeckState] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [cardDrafts, setCardDrafts] = useState<EditableCard[]>([]);

  const deckContent = useMemo(() => (deck ? deckToContent(deck) : ''), [deck]);

  const hydrateDrafts = useCallback((nextDeck: SRSDeck | null) => {
    setNameDraft(nextDeck?.name ?? '');
    setDescriptionDraft(nextDeck?.description ?? '');
    setCardDrafts((nextDeck?.cards ?? []).map((card) => ({ id: card.id, front: card.front, back: card.back })));
  }, []);

  const loadDeck = useCallback(async () => {
    setLoading(true);
    const localDeck = loadDecks().find((candidate) => candidate.id === deckId) ?? null;
    if (localDeck) {
      setDeck(localDeck);
      hydrateDrafts(localDeck);
      setMissing(false);
    }

    try {
      const res = await fetch(`/api/srs/${deckId}`, { cache: 'no-store' });
      if (res.ok) {
        const remoteDeck = await res.json() as SRSDeck;
        persistDeckLocally(remoteDeck);
        setDeck(remoteDeck);
        hydrateDrafts(remoteDeck);
        setMissing(false);
      } else if (!localDeck && res.status === 404) {
        setMissing(true);
      }
    } catch {
      if (!localDeck) setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [deckId, hydrateDrafts]);

  useEffect(() => {
    void loadDeck();
  }, [loadDeck]);

  useEffect(() => {
    if (!requestedMode) return;
    setRequestedPhase(requestedMode);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('mode');
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `/decks/${deckId}?${nextQuery}` : `/decks/${deckId}`, { scroll: false });
  }, [deckId, requestedMode, router, searchParams]);

  async function applyDeckUpdate(nextDeck: SRSDeck, successMessage: string) {
    setSavingDeckState(true);
    saveDeck(nextDeck);
    setDeck(nextDeck);
    hydrateDrafts(nextDeck);
    const synced = await syncDeckToCloud(nextDeck);
    toast(synced ? successMessage : `${successMessage} (saved locally)`, synced ? 'success' : 'warning');
    setSavingDeckState(false);
  }

  async function saveDeckOutput(mode: 'quiz' | 'summarize' | 'exam', content: string) {
    if (!deck) return;
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          content,
          metadata: {
            title: `${mode === 'quiz' ? 'Quiz' : mode === 'exam' ? 'Exam Prep' : 'Summary'} — ${deck.name}`,
            sourceDeckId: deck.id,
            sourceDeckName: deck.name,
            savedFrom: `/decks/${deck.id}`,
          },
        }),
      });
      toast('Saved to Library', 'success');
    } catch {
      toast('Generated output is ready, but Library sync failed', 'warning');
    }
  }

  function openStudy(mode: DeckStudyPhase) {
    setRequestedPhase(mode);
    studyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handlePublish() {
    if (!deck || publishing) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/srs/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: deck.name,
          description: deck.description ?? '',
          cardCount: deck.cards.length,
          content: deckContent,
          sourceDeckId: deck.id,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Publish failed');
      setPublicUrl(payload?.shareUrl ?? '');
      toast('Deck published', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Publish failed', 'error');
    } finally {
      setPublishing(false);
    }
  }

  async function handleExplain() {
    if (!deck || explaining) return;
    setExplaining(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concept: deck.name,
          context: deckContent.slice(0, 4000),
        }),
      });
      const payload = await res.json().catch(() => null);
      const explanation = typeof payload?.explanation === 'string' ? payload.explanation.trim() : '';
      if (!explanation) throw new Error('No explanation returned');
      setOutput({ kind: 'explanation', title: `Explain — ${deck.name}`, content: explanation });
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Explain failed', 'error');
    } finally {
      setExplaining(false);
    }
  }

  async function handleGenerateQuiz() {
    if (!deck || generating) return;
    setGenerating('quiz');
    try {
      const quiz = buildDeckQuizContent(deck, 10);
      setOutput({
        kind: 'quiz',
        title: `Quiz — ${deck.name}`,
        content: quiz.displayText,
        quiz,
      });
      await saveDeckOutput('quiz', quiz.displayText);
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setGenerating(null);
    }
  }

  async function handleGenerate(mode: 'summarize' | 'exam') {
    if (!deck || generating) return;
    setGenerating(mode);
    try {
      const ai = loadAiRuntimePreferences();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: deckContent,
          deckId: deck.id,
          deckTitle: deck.name,
          deckContent,
          options: mode === 'exam' ? { count: 8 } : undefined,
          ai,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || typeof payload?.content !== 'string') {
        throw new Error(payload?.error ?? `Failed to generate ${mode}`);
      }

      setOutput({
        kind: mode,
        title: `${mode === 'exam' ? 'Exam Prep' : 'Summary'} — ${deck.name}`,
        content: payload.content,
      });
      await saveDeckOutput(mode, payload.content);
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      toast(error instanceof Error ? error.message : `Failed to generate ${mode}`, 'error');
    } finally {
      setGenerating(null);
    }
  }

  async function handleDeleteDeck() {
    if (!deck) return;
    if (!confirm(`Delete "${deck.name}"?`)) return;
    deleteDeck(deck.id);
    try {
      await fetch(`/api/srs/${deck.id}`, { method: 'DELETE' });
    } catch {
      // Local delete is enough to keep the app responsive in offline mode.
    }
    toast('Deck deleted', 'info');
    router.push('/decks');
  }

  async function handleSaveDeckEdits() {
    if (!deck) return;
    const trimmedName = nameDraft.trim();
    const trimmedCards = cardDrafts
      .map((card) => ({ ...card, front: card.front.trim(), back: card.back.trim() }))
      .filter((card) => card.front && card.back);

    if (!trimmedName) {
      toast('Deck name cannot be empty', 'error');
      return;
    }
    if (trimmedCards.length === 0) {
      toast('Add at least one valid card', 'error');
      return;
    }

    const nextDeck: SRSDeck = {
      ...deck,
      name: trimmedName,
      description: descriptionDraft.trim(),
      cards: deck.cards
        .map((existing) => {
          const draft = trimmedCards.find((card) => card.id === existing.id);
          return draft ? { ...existing, front: draft.front, back: draft.back } : null;
        })
        .filter(Boolean) as SRSDeck['cards'],
    };

    const newCards = trimmedCards.filter((card) => !deck.cards.some((existing) => existing.id === card.id));
    nextDeck.cards = [
      ...nextDeck.cards,
      ...newCards.map((card) => createCard(card.id, card.front, card.back)),
    ];

    await applyDeckUpdate(nextDeck, 'Deck updated');
    setEditingMeta(false);
  }

  function addDraftCard() {
    setCardDrafts((current) => [
      ...current,
      { id: `draft-${crypto.randomUUID().slice(0, 8)}`, front: '', back: '' },
    ]);
  }

  if (loading && !deck) {
    return <div className={styles.emptyState}>Loading deck…</div>;
  }

  if (!deck || missing) {
    return (
      <div className={styles.emptyState}>
        <h2>Deck not found</h2>
        <p>This deck is no longer available in local storage or your synced decks.</p>
        <button className={styles.primaryButton} onClick={() => router.push('/decks')}>
          Back to decks
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Deck Viewer</p>
          {editingMeta ? (
            <div className={styles.editorMeta}>
              <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className={styles.metaInput} />
              <textarea value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} className={styles.metaTextarea} rows={3} />
            </div>
          ) : (
            <>
              <h1>{deck.name}</h1>
              <p className={styles.description}>
                {deck.description || 'Open the deck, review cards with FSRS study modes, and generate quiz, summary, and exam outputs from the same source material.'}
              </p>
            </>
          )}

          <div className={styles.metaList}>
            <span>{deck.cards.length} cards</span>
            <span>{deck.creatorName ?? 'You'}</span>
            <span>{deck.sourceLabel ?? 'Private deck'}</span>
            <span>Created {formatDate(deck.createdAt)}</span>
            <span>Last studied {formatDate(deck.lastStudied)}</span>
          </div>

          <div className={styles.actionGroups}>
            <div className={styles.actionGroup}>
              <span className={styles.groupLabel}>Study</span>
              <div className={styles.actions}>
                <button className={styles.primaryButton} onClick={() => openStudy('review')}>Study deck</button>
                <button className={styles.secondaryButton} onClick={() => openStudy('learn')}>Learn</button>
                <button className={styles.secondaryButton} onClick={() => openStudy('test')}>Test</button>
              </div>
            </div>
            <div className={styles.actionGroup}>
              <span className={styles.groupLabel}>Tools</span>
              <div className={styles.actions}>
                <button className={styles.secondaryButton} disabled={!!generating} onClick={() => void handleGenerateQuiz()}>{generating === 'quiz' ? 'Generating…' : 'Quiz'}</button>
                <button className={styles.secondaryButton} disabled={!!generating} onClick={() => void handleGenerate('summarize')}>{generating === 'summarize' ? 'Generating…' : 'Summary'}</button>
                <button className={styles.secondaryButton} disabled={!!generating} onClick={() => void handleGenerate('exam')}>{generating === 'exam' ? 'Generating…' : 'Exam'}</button>
                <button className={styles.secondaryButton} disabled={explaining} onClick={() => void handleExplain()}>{explaining ? 'Explaining…' : 'Explain'}</button>
              </div>
            </div>
            <div className={styles.actionGroup}>
              <span className={styles.groupLabel}>Publish & Export</span>
              <div className={styles.actions}>
                <button className={styles.secondaryButton} disabled={publishing} onClick={() => void handlePublish()}>{publishing ? 'Publishing…' : 'Publish'}</button>
                <button className={styles.secondaryButton} onClick={() => exportDeckCsv(deck)}>Export CSV</button>
                <button className={styles.secondaryButton} onClick={() => { void exportDeckApkg(deck).catch(() => toast('Anki export failed', 'error')); }}>Export Anki</button>
                <button className={styles.secondaryButton} onClick={() => setEditingMeta((current) => !current)}>{editingMeta ? 'Close edit' : 'Edit deck'}</button>
                <button className={styles.dangerButton} onClick={() => void handleDeleteDeck()}>Delete</button>
              </div>
            </div>
          </div>

          {publicUrl && (
            <div className={styles.publicUrl}>
              <span>{publicUrl}</span>
              <button className={styles.inlineAction} onClick={() => navigator.clipboard.writeText(publicUrl).then(() => toast('Link copied', 'success'))}>
                Copy link
              </button>
            </div>
          )}
        </div>

        <div className={styles.previewCard}>
          <h2>Quick preview</h2>
          <div className={styles.previewList}>
            {deck.cards.slice(0, 5).map((card) => (
              <div key={card.id} className={styles.previewRow}>
                <strong>{card.front}</strong>
                <span>{card.back}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {imported && (
        <section className={styles.successBanner}>
          <div>
            <strong>Deck imported ✓</strong>
            <p>{deck.name} — {deck.cards.length} cards added</p>
          </div>
          <div className={styles.bannerActions}>
            <button className={styles.primaryButton} onClick={() => openStudy('review')}>Study deck</button>
            <button className={styles.secondaryButton} onClick={() => void handleGenerateQuiz()}>Generate quiz</button>
            <button className={styles.secondaryButton} onClick={() => setEditingMeta(true)}>Edit deck</button>
          </div>
        </section>
      )}

      {output && (
        <section ref={resultRef} className={styles.outputCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{output.title}</h2>
              <p>Saved to Library with deck metadata for later review.</p>
            </div>
            <button className={styles.inlineAction} onClick={() => navigator.clipboard.writeText(output.content).then(() => toast('Copied', 'success'))}>
              Copy
            </button>
          </div>

          {output.kind === 'quiz' ? (
            <InteractiveQuiz content={output.quiz} deckId={deck.id} onClose={() => setOutput(null)} />
          ) : (
            <div className={styles.generatedText}>{output.content}</div>
          )}
        </section>
      )}

      <section className={styles.editorCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Deck editor</h2>
            <p>Rename the deck, revise the description, and edit cards inline before jumping into study mode.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondaryButton} onClick={addDraftCard}>Add card</button>
            <button className={styles.primaryButton} disabled={savingDeckState} onClick={() => void handleSaveDeckEdits()}>
              {savingDeckState ? 'Saving…' : 'Save deck'}
            </button>
          </div>
        </div>

        <div className={styles.editorFields}>
          <div>
            <label className={styles.fieldLabel}>Deck name</label>
            <input className={styles.metaInput} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Description</label>
            <textarea className={styles.metaTextarea} rows={3} value={descriptionDraft} onChange={(event) => setDescriptionDraft(event.target.value)} />
          </div>
        </div>

        <div className={styles.cardEditorList}>
          {cardDrafts.map((card, index) => (
            <div key={card.id} className={styles.cardEditorRow}>
              <div className={styles.cardOrdinal}>#{index + 1}</div>
              <input
                className={styles.cardInput}
                value={card.front}
                onChange={(event) => setCardDrafts((current) => current.map((draft) => draft.id === card.id ? { ...draft, front: event.target.value } : draft))}
                placeholder="Front"
              />
              <textarea
                className={styles.cardTextarea}
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
      </section>

      <section ref={studyRef} className={styles.studyCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Study deck</h2>
            <p>Use the same review, write, test, match, and stats modes as the rest of the SRS system.</p>
          </div>
          <button className={styles.inlineAction} onClick={() => void syncDeckToCloud(deck).then((ok) => toast(ok ? 'Deck synced' : 'Deck saved locally only', ok ? 'success' : 'warning'))}>
            Sync now
          </button>
        </div>

        <FlashcardView
          initialDeck={deck}
          title={deck.name}
          requestedPhase={requestedPhase}
          onRequestedPhaseHandled={() => setRequestedPhase(null)}
          onDeckChange={(nextDeck) => {
            setDeck(nextDeck);
            hydrateDrafts(nextDeck);
          }}
          showBrowseButton={false}
        />
      </section>
    </div>
  );
}
