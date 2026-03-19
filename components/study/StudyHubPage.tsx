'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDecks, type SRSDeck } from '@/lib/srs/sm2';
import { buildImportedDeck, persistDeckLocally, syncDeckToCloud } from '@/lib/srs/deck-utils';
import { extractQuizletCards, extractQuizletTitle } from '@/lib/srs/quizlet-import';
import { useToast } from '@/providers/ToastProvider';
import styles from '@/app/(dashboard)/decks/page.module.css';

type StudyTab = 'overview' | 'review' | 'decks' | 'import';
type ImportMode = 'url' | 'csv' | 'paste' | 'anki' | 'quizlet';
type ImportPayload = {
  title?: string;
  description?: string;
  content?: string;
  cards?: Array<{ front: string; back: string }>;
  source?: string;
  cardCount?: number;
};

const IMPORT_SOURCE_META = {
  quizlet: { type: 'quizlet', label: 'Quizlet import' },
  'kivora-share': { type: 'kivora-share', label: 'Kivora shared deck' },
  csv: { type: 'csv', label: 'CSV import' },
  paste: { type: 'paste', label: 'Pasted cards' },
  anki: { type: 'anki', label: 'Anki import' },
} satisfies Partial<Record<NonNullable<ImportPayload['source']>, { type: SRSDeck['sourceType']; label: string }>>;

const IMPORT_MODE_OPTIONS: Array<{ id: ImportMode; label: string }> = [
  { id: 'paste', label: 'Recommended: Paste' },
  { id: 'csv', label: 'CSV' },
  { id: 'anki', label: 'Anki' },
  { id: 'url', label: 'Kivora link' },
];

const TAB_COPY: Record<StudyTab, { title: string; description: string }> = {
  overview: {
    title: 'Overview',
    description: 'See what needs review first, open your latest deck, and keep studying from one private workspace.',
  },
  review: {
    title: 'Review Queue',
    description: 'Only the decks that are due now, so you can jump straight into active review.',
  },
  decks: {
    title: 'My Decks',
    description: 'Your private decks, compact and ready to open, review, quiz, or edit.',
  },
  import: {
    title: 'Import',
    description: 'Bring in reliable flashcard sources, then route straight into study mode.',
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function mergeDecks(local: SRSDeck[], remote: SRSDeck[]) {
  const byId = new Map<string, SRSDeck>();
  for (const deck of local) byId.set(deck.id, deck);
  for (const deck of remote) byId.set(deck.id, deck);
  return Array.from(byId.values()).sort((left, right) => {
    const leftDate = new Date(left.lastStudied ?? left.createdAt).getTime();
    const rightDate = new Date(right.lastStudied ?? right.createdAt).getTime();
    return rightDate - leftDate;
  });
}

export function StudyHubPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<StudyTab>('overview');
  const [myDecks, setMyDecks] = useState<SRSDeck[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [importMode, setImportMode] = useState<ImportMode>('paste');
  const [importUrl, setImportUrl] = useState('');
  const [importTitle, setImportTitle] = useState('');
  const [csvText, setCsvText] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [ankiFile, setAnkiFile] = useState<File | null>(null);
  const [quizletHtml, setQuizletHtml] = useState('');
  const [quizletStep, setQuizletStep] = useState<1 | 2>(1);
  const [importingMode, setImportingMode] = useState<ImportMode | null>(null);
  const [lastImported, setLastImported] = useState<{ deck: SRSDeck; cardCount: number } | null>(null);
  const [deckSort, setDeckSort] = useState<'recent' | 'name' | 'due' | 'accuracy'>('recent');

  const todayStr = new Date().toISOString().slice(0, 10);

  const getDeckAccuracy = useCallback((deck: SRSDeck) => {
    const totalReviews = deck.cards.reduce((sum, card) => sum + card.totalReviews, 0);
    const totalCorrect = deck.cards.reduce((sum, card) => sum + card.correctReviews, 0);
    return totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : -1;
  }, []);

  const getDeckDue = useCallback((deck: SRSDeck) => (
    deck.cards.filter((card) => card.nextReview && card.nextReview <= todayStr).length
  ), [todayStr]);

  const getDeckMastered = useCallback((deck: SRSDeck) => (
    deck.cards.filter((card) => (card.interval ?? 0) >= 21).length
  ), []);

  const sortedMyDecks = useMemo(() => {
    return [...myDecks].sort((a, b) => {
      if (deckSort === 'name') return a.name.localeCompare(b.name);
      if (deckSort === 'due') return getDeckDue(b) - getDeckDue(a);
      if (deckSort === 'accuracy') {
        const accA = getDeckAccuracy(a);
        const accB = getDeckAccuracy(b);
        if (accA === -1 && accB === -1) return 0;
        if (accA === -1) return 1;
        if (accB === -1) return -1;
        return accA - accB;
      }
      return new Date(b.lastStudied ?? b.createdAt).getTime() - new Date(a.lastStudied ?? a.createdAt).getTime();
    });
  }, [deckSort, getDeckAccuracy, getDeckDue, myDecks]);

  const recentDecks = useMemo(() => sortedMyDecks.slice(0, 3), [sortedMyDecks]);
  const dueDecks = useMemo(() => sortedMyDecks.filter((deck) => getDeckDue(deck) > 0), [getDeckDue, sortedMyDecks]);
  const totalCards = useMemo(() => myDecks.reduce((sum, deck) => sum + deck.cards.length, 0), [myDecks]);
  const totalDue = useMemo(() => myDecks.reduce((sum, deck) => sum + getDeckDue(deck), 0), [getDeckDue, myDecks]);
  const totalMastered = useMemo(() => myDecks.reduce((sum, deck) => sum + getDeckMastered(deck), 0), [getDeckMastered, myDecks]);
  const averageAccuracy = useMemo(() => {
    const accuracies = myDecks.map(getDeckAccuracy).filter((value) => value >= 0);
    if (accuracies.length === 0) return null;
    return Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length);
  }, [getDeckAccuracy, myDecks]);
  const activeCopy = TAB_COPY[activeTab];

  const refreshMyDecks = useCallback(async () => {
    setLoadingMine(true);
    const localDecks = loadDecks();
    setMyDecks(localDecks);

    try {
      const res = await fetch('/api/srs', { cache: 'no-store' });
      if (res.ok) {
        const remoteDecks = await res.json() as SRSDeck[];
        remoteDecks.forEach((deck) => persistDeckLocally(deck));
        setMyDecks(mergeDecks(localDecks, remoteDecks));
      }
    } catch {
      // Local decks remain available even if sync is offline.
    } finally {
      setLoadingMine(false);
    }
  }, []);

  useEffect(() => {
    void refreshMyDecks();
  }, [refreshMyDecks]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sharedImportUrl = new URLSearchParams(window.location.search).get('importUrl');
    if (!sharedImportUrl) return;

    setActiveTab('import');
    setImportMode('url');
    setImportUrl(sharedImportUrl);
  }, []);

  function resetImportInputs() {
    setImportUrl('');
    setImportTitle('');
    setQuizletHtml('');
    setQuizletStep(1);
    setCsvText('');
    setPasteText('');
    setAnkiFile(null);
  }

  async function finalizeImport(payload: ImportPayload, fallbackSource: { type: SRSDeck['sourceType']; label: string }) {
    const sourceMeta = typeof payload.source === 'string' && payload.source in IMPORT_SOURCE_META
      ? IMPORT_SOURCE_META[payload.source as keyof typeof IMPORT_SOURCE_META]
      : undefined;
    const sourceType = sourceMeta?.type ?? fallbackSource.type;
    const sourceLabel = sourceMeta?.label ?? fallbackSource.label;

    const deck = buildImportedDeck({
      title: String(payload.title ?? 'Imported deck'),
      description: String(payload.description ?? ''),
      content: String(payload.content ?? ''),
      cards: payload.cards,
      sourceType,
      sourceLabel,
      creatorName: 'You',
    });

    if (!deck) throw new Error('Could not parse deck cards');

    persistDeckLocally(deck);
    const synced = await syncDeckToCloud(deck);
    const cardCount = payload.cardCount ?? deck.cards.length;
    setLastImported({ deck, cardCount });
    resetImportInputs();
    setActiveTab('decks');
    await refreshMyDecks();
    toast(
      synced ? `Imported "${deck.name}" (${cardCount} cards)` : `Imported "${deck.name}" locally (${cardCount} cards)`,
      synced ? 'success' : 'warning',
    );
    router.push(`/study/${deck.id}?imported=1`);
  }

  async function requestImport(body: Record<string, unknown>, fallbackSource: { type: SRSDeck['sourceType']; label: string }) {
    try {
      const res = await fetch('/api/srs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error ?? 'Import failed');
      await finalizeImport(payload as ImportPayload, fallbackSource);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error');
    }
  }

  async function importDeckFromPaste() {
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

  async function importDeckFromCsv() {
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

  async function importDeckFromAnki() {
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

  async function importDeckFromUrl() {
    if (!importUrl.trim()) return;
    setImportingMode('url');
    try {
      const normalizedUrl = importUrl.trim().startsWith('/')
        ? new URL(importUrl.trim(), window.location.origin).toString()
        : importUrl.trim();
      await requestImport(
        { kind: 'url', url: normalizedUrl },
        { type: 'manual', label: 'Deck import' },
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function importDeckFromQuizletHtml() {
    const html = quizletHtml.trim();
    if (!html) {
      toast('Paste the page source first.', 'warning');
      return;
    }

    setImportingMode('quizlet');
    try {
      const cards = extractQuizletCards(html);
      if (!cards.length) {
        toast('No flashcards found in the pasted source. Make sure you copied the full page source (Ctrl+U → Ctrl+A → Ctrl+C).', 'error');
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

  const tabMeta: Array<{ id: StudyTab; label: string; count?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'review', label: 'Review Queue', count: totalDue },
    { id: 'decks', label: 'My Decks', count: myDecks.length },
    { id: 'import', label: 'Import' },
  ];

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarIntro}>
          <span className={styles.eyebrow}>Private Study</span>
          <h1>Study Hub</h1>
          <p>Review due cards, manage your decks, and import reliable sources without the old public-library clutter.</p>
        </div>

        <nav className={styles.sidebarNav}>
          {tabMeta.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.navButton} ${activeTab === tab.id ? styles.navButtonActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' ? <small>{tab.count}</small> : null}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarPanel}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Due now</span>
            <strong>{totalDue}</strong>
            <small>{totalDue > 0 ? 'Cards ready for review today.' : 'Nothing is waiting right now.'}</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Total cards</span>
            <strong>{totalCards}</strong>
            <small>All private prompts across your saved decks.</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Reliable imports</span>
            <strong>Paste, CSV, Anki, Kivora link</strong>
            <small>Quizlet page-source import remains hidden as a legacy fallback only.</small>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <section className={styles.headerCard}>
          <div>
            <h2>{activeCopy.title}</h2>
            <p>{activeCopy.description}</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={() => setActiveTab(totalDue > 0 ? 'review' : 'import')}>
              {totalDue > 0 ? 'Review due' : 'Import a deck'}
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push(myDecks[0] ? `/study/${myDecks[0].id}` : '/workspace')}>
              {myDecks[0] ? 'Open latest deck' : 'Open workspace'}
            </button>
            <button className={styles.secondaryButton} onClick={() => setActiveTab('import')}>
              Import
            </button>
          </div>
        </section>

        {activeTab === 'overview' && (
          <section className={styles.libraryCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Study snapshot</h2>
                <p>Your private study status, quick actions, and the next decks worth opening.</p>
              </div>
              <button className={styles.secondaryButton} onClick={() => void refreshMyDecks()}>
                Refresh
              </button>
            </div>

            <div className={styles.helperGrid}>
              <article className={styles.helperCard}>
                <strong>Decks</strong>
                <p>{myDecks.length} private deck{myDecks.length !== 1 ? 's' : ''}</p>
              </article>
              <article className={styles.helperCard}>
                <strong>Due today</strong>
                <p>{totalDue} card{totalDue !== 1 ? 's' : ''} waiting for review</p>
              </article>
              <article className={styles.helperCard}>
                <strong>Mastered</strong>
                <p>{totalMastered} card{totalMastered !== 1 ? 's' : ''} on long review intervals</p>
              </article>
              <article className={styles.helperCard}>
                <strong>Average accuracy</strong>
                <p>{averageAccuracy === null ? 'No study data yet' : `${averageAccuracy}% across studied decks`}</p>
              </article>
            </div>

            <div className={styles.importedBanner}>
              <div>
                <strong>Quick actions</strong>
                <p>{totalDue > 0 ? 'Start with due review, then open a deck or import a new one.' : 'Nothing is due right now — open a deck or import a new source.'}</p>
              </div>
              <div className={styles.actions}>
                <button className={styles.primaryButton} onClick={() => setActiveTab(totalDue > 0 ? 'review' : 'import')}>
                  {totalDue > 0 ? 'Review due' : 'Import'}
                </button>
                {myDecks[0] && (
                  <button className={styles.secondaryButton} onClick={() => router.push(`/study/${myDecks[0].id}`)}>
                    Open latest
                  </button>
                )}
              </div>
            </div>

            <div className={styles.deckGrid}>
              {recentDecks.length === 0 ? (
                <div className={styles.emptyState}>No private decks yet. Import one to start building your study hub.</div>
              ) : recentDecks.map((deck) => {
                const due = getDeckDue(deck);
                const accuracy = getDeckAccuracy(deck);
                return (
                  <article key={deck.id} className={styles.deckCard}>
                    <div className={styles.deckTop}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3>{deck.name}</h3>
                        {deck.description && <p>{deck.description}</p>}
                      </div>
                      <span className={styles.countPill}>{deck.cards.length} cards</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span>{due} due</span>
                      <span>{accuracy >= 0 ? `${accuracy}% accuracy` : 'No accuracy yet'}</span>
                      <span>{formatDate(deck.lastStudied ?? deck.createdAt)}</span>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.primaryButton} onClick={() => router.push(`/study/${deck.id}`)}>
                        Open
                      </button>
                      <button className={styles.secondaryButton} onClick={() => router.push(`/study/${deck.id}?mode=review`)}>
                        Review
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === 'review' && (
          <section className={styles.libraryCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Review queue</h2>
                <p>Only decks with due cards appear here, so you can start the right review session immediately.</p>
              </div>
            </div>

            {loadingMine ? (
              <div className={styles.emptyState}>Loading review queue…</div>
            ) : dueDecks.length === 0 ? (
              <div className={styles.emptyState}>No cards are due right now. You can still open a deck manually or import something new.</div>
            ) : (
              <div className={styles.deckGrid}>
                {dueDecks.map((deck) => (
                  <article key={deck.id} className={styles.deckCard}>
                    <div className={styles.deckTop}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3>{deck.name}</h3>
                        {deck.description && <p>{deck.description}</p>}
                      </div>
                      <span className={styles.countPill}>{getDeckDue(deck)} due</span>
                    </div>
                    <div className={styles.metaRow}>
                      <span>{deck.cards.length} cards</span>
                      <span>{getDeckAccuracy(deck) >= 0 ? `${getDeckAccuracy(deck)}% accuracy` : 'No accuracy yet'}</span>
                      <span>{formatDate(deck.lastStudied ?? deck.createdAt)}</span>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.primaryButton} onClick={() => router.push(`/study/${deck.id}?mode=review`)}>
                        Start review
                      </button>
                      <button className={styles.secondaryButton} onClick={() => router.push(`/study/${deck.id}`)}>
                        Open deck
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'decks' && (
          <section className={styles.libraryCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>My decks</h2>
                <p>Your private flashcard decks, synced when you are signed in and always available locally.</p>
              </div>
              <button className={styles.secondaryButton} onClick={() => void refreshMyDecks()}>
                Refresh
              </button>
            </div>

            {lastImported && (
              <div className={styles.importedBanner}>
                <div>
                  <strong>Last imported</strong>
                  <p>{lastImported.deck.name} — {lastImported.cardCount} cards added</p>
                </div>
                <button className={styles.inlineAction} onClick={() => router.push(`/study/${lastImported.deck.id}?imported=1`)}>
                  Open deck
                </button>
              </div>
            )}

            {myDecks.length > 1 && (
              <div className={styles.actions} style={{ marginBottom: '1rem' }}>
                {(['recent', 'due', 'accuracy', 'name'] as const).map((option) => (
                  <button
                    key={option}
                    className={styles.secondaryButton}
                    onClick={() => setDeckSort(option)}
                    style={deckSort === option ? { borderColor: 'color-mix(in srgb, var(--primary) 32%, transparent)', color: 'var(--primary-text)' } : undefined}
                  >
                    {option === 'recent' ? 'Recent' : option === 'due' ? 'Due' : option === 'accuracy' ? 'Needs work' : 'A–Z'}
                  </button>
                ))}
              </div>
            )}

            {loadingMine ? (
              <div className={styles.emptyState}>Loading your decks…</div>
            ) : myDecks.length === 0 ? (
              <div className={styles.emptyState}>No private decks yet. Use Import to add one from pasted text, CSV, Anki, or a Kivora share link.</div>
            ) : (
              <div className={styles.deckGrid}>
                {sortedMyDecks.map((deck) => {
                  const accuracy = getDeckAccuracy(deck);
                  const due = getDeckDue(deck);
                  const mastered = getDeckMastered(deck);
                  const accColor = accuracy < 0 ? 'var(--text-muted)' : accuracy >= 80 ? '#52b788' : accuracy >= 60 ? '#4f86f7' : '#e05252';
                  return (
                    <article key={deck.id} className={styles.deckCard}>
                      <div className={styles.deckTop}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h3>{deck.name}</h3>
                          {deck.description && <p>{deck.description}</p>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <span className={styles.countPill}>{deck.cards.length} cards</span>
                          {due > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'color-mix(in srgb, #f59e0b 15%, transparent)', color: '#b45309', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)' }}>
                              {due} due
                            </span>
                          )}
                        </div>
                      </div>

                      {accuracy >= 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 54 }}>Accuracy</span>
                          <div style={{ flex: 1, height: 5, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${accuracy}%`, background: accColor, borderRadius: 3, transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: accColor, minWidth: 32, textAlign: 'right' }}>{accuracy}%</span>
                        </div>
                      )}

                      <div className={styles.metaRow}>
                        <span>{deck.sourceLabel ?? 'Private deck'}</span>
                        <span style={{ display: 'flex', gap: 8 }}>
                          {mastered > 0 && <span style={{ color: '#52b788', fontWeight: 600 }}>🏆 {mastered} mastered</span>}
                          <span>{formatDate(deck.lastStudied ?? deck.createdAt)}</span>
                        </span>
                      </div>

                      <div className={styles.preview}>
                        {deck.cards.slice(0, 2).map((card) => (
                          <div key={card.id}><strong>{card.front}</strong> — {card.back}</div>
                        ))}
                      </div>

                      <div className={styles.cardActions}>
                        <button className={styles.primaryButton} onClick={() => router.push(`/study/${deck.id}`)}>
                          Open
                        </button>
                        <button className={styles.secondaryButton} onClick={() => router.push(`/study/${deck.id}?mode=review`)}>
                          {due > 0 ? `Review (${due})` : 'Review'}
                        </button>
                        <button className={styles.secondaryButton} onClick={() => router.push(`/study/${deck.id}`)}>
                          Edit
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'import' && (
          <section className={styles.importCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Import a deck</h2>
                <p>Reliable paths first: pasted exports, CSV, Anki, and Kivora links. Quizlet-specific scraping is no longer a normal path.</p>
              </div>
              {lastImported && (
                <button className={styles.inlineAction} onClick={() => router.push(`/study/${lastImported.deck.id}?imported=1`)}>
                  Open “{lastImported.deck.name}”
                </button>
              )}
            </div>

            <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 14, background: 'color-mix(in srgb, #4f86f7 8%, var(--bg-elevated))', border: '1px solid color-mix(in srgb, #4f86f7 22%, transparent)', display: 'grid', gap: 6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>Best path for Quizlet: export and paste</strong>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                Direct Quizlet URL import is unreliable because Quizlet often serves captcha or JS-protected pages. Export from Quizlet, then paste the terms here.
              </p>
            </div>

            <div className={styles.helperGrid} style={{ marginBottom: '1rem' }}>
              <article className={styles.helperCard}>
                <strong>Step 1</strong>
                <p>Open your Quizlet set, choose Export, and copy the term/definition text.</p>
              </article>
              <article className={styles.helperCard}>
                <strong>Step 2</strong>
                <p>Use the Paste tab below and drop the exported text in directly.</p>
              </article>
              <article className={styles.helperCard}>
                <strong>Step 3</strong>
                <p>Import the parsed deck and continue in your private study flow.</p>
              </article>
            </div>

            <div className={styles.modeBar}>
              {IMPORT_MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.id}
                  className={`${styles.modeButton} ${importMode === mode.id ? styles.modeButtonActive : ''}`}
                  onClick={() => setImportMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className={styles.formStack}>
              {importMode === 'paste' && (
                <>
                  <div className={styles.importRow}>
                    <input
                      value={importTitle}
                      onChange={(event) => setImportTitle(event.target.value)}
                      placeholder="Optional deck title"
                      className={styles.searchInput}
                    />
                    <button className={styles.primaryButton} onClick={importDeckFromPaste} disabled={importingMode === 'paste' || !pasteText.trim()}>
                      {importingMode === 'paste' ? 'Importing…' : 'Import pasted cards'}
                    </button>
                  </div>
                  <textarea
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    className={styles.textArea}
                    placeholder={'Paste cards in any of these formats:\n\n• Quizlet export (tab-separated):\nPhotosynthesis\tConverts light into energy\nMitochondria\tPowerhouse of the cell\n\n• Separated with :: or —\nCell :: Basic unit of life\nVector — Quantity with magnitude and direction\n\n• Alternating lines:\nOsmosis\nMovement of water through a membrane'}
                  />
                </>
              )}

              {importMode === 'csv' && (
                <>
                  <div className={styles.importRow}>
                    <input
                      value={importTitle}
                      onChange={(event) => setImportTitle(event.target.value)}
                      placeholder="Optional deck title"
                      className={styles.searchInput}
                    />
                    <button className={styles.primaryButton} onClick={importDeckFromCsv} disabled={importingMode === 'csv' || !csvText.trim()}>
                      {importingMode === 'csv' ? 'Importing…' : 'Import CSV'}
                    </button>
                  </div>
                  <textarea
                    value={csvText}
                    onChange={(event) => setCsvText(event.target.value)}
                    className={styles.textArea}
                    placeholder={'Front,Back\nPhotosynthesis,Converts light into chemical energy\nMitochondria,Powerhouse of the cell'}
                  />
                </>
              )}

              {importMode === 'anki' && (
                <>
                  <div className={styles.importRow}>
                    <input
                      value={importTitle}
                      onChange={(event) => setImportTitle(event.target.value)}
                      placeholder="Optional deck title override"
                      className={styles.searchInput}
                    />
                    <button className={styles.primaryButton} onClick={importDeckFromAnki} disabled={importingMode === 'anki' || !ankiFile}>
                      {importingMode === 'anki' ? 'Importing…' : 'Import Anki'}
                    </button>
                  </div>
                  <label className={styles.uploadCard}>
                    <span>Select a `.apkg` file</span>
                    <input
                      type="file"
                      accept=".apkg"
                      className={styles.fileInput}
                      onChange={(event) => setAnkiFile(event.target.files?.[0] ?? null)}
                    />
                    <small>{ankiFile ? ankiFile.name : 'The importer extracts the first front/back fields from the package.'}</small>
                  </label>
                </>
              )}

              {importMode === 'url' && (
                <>
                  <div className={styles.importRow}>
                    <input
                      value={importUrl}
                      onChange={(event) => setImportUrl(event.target.value)}
                      placeholder="Paste a Kivora shared-deck URL (e.g. /share/... or /shared/...)"
                      className={styles.searchInput}
                    />
                    <button className={styles.primaryButton} onClick={importDeckFromUrl} disabled={importingMode === 'url' || !importUrl.trim()}>
                      {importingMode === 'url' ? 'Importing…' : 'Import link'}
                    </button>
                  </div>
                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'color-mix(in srgb, #f59e0b 8%, var(--bg-elevated))', border: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)', fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)', display: 'grid', gap: 8 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Kivora link import only</strong>
                    <span>Use this for Kivora share links. If the source is Quizlet, switch back to Paste and import the exported text instead.</span>
                  </div>
                </>
              )}

              <details className={styles.helperCard}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>Legacy / advanced Quizlet source importer</summary>
                <p>This is kept only as a future fallback. It is not part of the main Study Hub workflow.</p>
                <div className={styles.actions} style={{ marginBottom: 12 }}>
                  {[{ n: 1, label: 'Open set' }, { n: 2, label: 'Paste source' }].map((step) => (
                    <button
                      key={step.n}
                      className={styles.secondaryButton}
                      onClick={() => setQuizletStep(step.n as 1 | 2)}
                    >
                      {step.n}. {step.label}
                    </button>
                  ))}
                </div>
                {quizletStep === 1 && (
                  <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    <p>Open the Quizlet set, view page source, copy all, then paste it below.</p>
                    <button className={styles.secondaryButton} onClick={() => setQuizletStep(2)}>
                      Next: paste source
                    </button>
                  </div>
                )}
                {quizletStep === 2 && (
                  <>
                    <div className={styles.importRow}>
                      <input
                        value={importTitle}
                        onChange={(event) => setImportTitle(event.target.value)}
                        placeholder="Optional deck title override"
                        className={styles.searchInput}
                      />
                      <button
                        className={styles.secondaryButton}
                        onClick={importDeckFromQuizletHtml}
                        disabled={importingMode === 'quizlet' || !quizletHtml.trim()}
                      >
                        {importingMode === 'quizlet' ? 'Importing…' : 'Import source'}
                      </button>
                    </div>
                    <textarea
                      value={quizletHtml}
                      onChange={(event) => setQuizletHtml(event.target.value)}
                      className={styles.textArea}
                      placeholder={'Paste the full Quizlet page source here (Ctrl+U → Ctrl+A → Ctrl+C)…'}
                      style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </>
                )}
              </details>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
