'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDecks, type SRSDeck } from '@/lib/srs/sm2';
import { buildImportedDeck, persistDeckLocally, syncDeckToCloud } from '@/lib/srs/deck-utils';
import { extractQuizletCards, extractQuizletTitle } from '@/lib/srs/quizlet-import';
import { useToast } from '@/providers/ToastProvider';
import styles from './page.module.css';

interface PublicDeck {
  id: string;
  shareId: string;
  shareToken: string;
  shareUrl: string;
  title: string;
  description: string;
  cardCount: number;
  content: string;
  createdAt: string;
}

type DeckTab = 'mine' | 'import' | 'public';
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
  { id: 'quizlet', label: '🔵 Quizlet' },
  { id: 'url', label: 'URL' },
  { id: 'csv', label: 'CSV' },
  { id: 'paste', label: 'Paste' },
  { id: 'anki', label: 'Anki' },
];

const TAB_COPY: Record<DeckTab, { title: string; description: string }> = {
  mine: {
    title: 'My Decks',
    description: 'Open a deck quickly, jump into study mode, and keep your private deck list tidy.',
  },
  import: {
    title: 'Import',
    description: 'Bring in decks from reliable sources, then route straight into the editor and study flow.',
  },
  public: {
    title: 'Public Library',
    description: 'Search shared decks, preview them, and import only what you want into your own workspace.',
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

export default function DeckLibraryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<DeckTab>('mine');
  const [query, setQuery] = useState('');
  const [decks, setDecks] = useState<PublicDeck[]>([]);
  const [myDecks, setMyDecks] = useState<SRSDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMine, setLoadingMine] = useState(true);
  const [importMode, setImportMode] = useState<ImportMode>('quizlet');
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

  function getDeckAccuracy(deck: SRSDeck) {
    const totalReviews = deck.cards.reduce((s, c) => s + c.totalReviews, 0);
    const totalCorrect = deck.cards.reduce((s, c) => s + c.correctReviews, 0);
    return totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : -1;
  }
  function getDeckDue(deck: SRSDeck) {
    return deck.cards.filter(c => c.nextReview && c.nextReview <= todayStr).length;
  }
  function getDeckMastered(deck: SRSDeck) {
    return deck.cards.filter(c => (c.interval ?? 0) >= 21).length;
  }

  const sortedMyDecks = useMemo(() => {
    return [...myDecks].sort((a, b) => {
      if (deckSort === 'name') return a.name.localeCompare(b.name);
      if (deckSort === 'due') return getDeckDue(b) - getDeckDue(a);
      if (deckSort === 'accuracy') {
        const accA = getDeckAccuracy(a); const accB = getDeckAccuracy(b);
        if (accA === -1 && accB === -1) return 0;
        if (accA === -1) return 1;
        if (accB === -1) return -1;
        return accA - accB; // lowest accuracy first (needs attention)
      }
      // default: recent
      return new Date(b.lastStudied ?? b.createdAt).getTime() - new Date(a.lastStudied ?? a.createdAt).getTime();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDecks, deckSort]);

  const localDeckCount = useMemo(() => myDecks.length, [myDecks]);
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
      // Local decks remain available even when the sync path is offline.
    } finally {
      setLoadingMine(false);
    }
  }, []);

  const loadDecksFromApi = useCallback(async (search = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/srs/library${search ? `?q=${encodeURIComponent(search)}` : ''}`, {
        cache: 'no-store',
      });
      const payload = res.ok ? await res.json() : [];
      setDecks(Array.isArray(payload) ? payload : []);
    } catch {
      setDecks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDecksFromApi();
    void refreshMyDecks();
  }, [loadDecksFromApi, refreshMyDecks]);

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

  async function finalizeImport(
    payload: ImportPayload,
    fallbackSource: { type: SRSDeck['sourceType']; label: string },
  ) {
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
    setActiveTab('mine');
    await refreshMyDecks();
    toast(
      synced ? `Imported "${deck.name}" (${cardCount} cards)` : `Imported "${deck.name}" locally (${cardCount} cards)`,
      synced ? 'success' : 'warning',
    );
    router.push(`/decks/${deck.id}?imported=1`);
  }

  async function requestImport(body: Record<string, unknown>, fallbackSource: { type: SRSDeck['sourceType']; label: string }) {
    try {
      const res = await fetch('/api/srs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Import failed');
      }

      await finalizeImport(payload as ImportPayload, fallbackSource);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error');
    }
  }

  async function importDeckFromQuizletHtml() {
    const html = quizletHtml.trim();
    if (!html) { toast('Paste the page source first.', 'warning'); return; }
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
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed', 'error');
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
        {
          kind: 'anki',
          base64,
          fileName: ankiFile.name,
          title: importTitle.trim() || undefined,
        },
        { type: 'anki', label: 'Anki import' },
      );
    } finally {
      setImportingMode(null);
    }
  }

  async function importPublicDeck(deck: PublicDeck) {
    try {
      await finalizeImport({
        title: deck.title,
        description: deck.description,
        content: deck.content,
        source: 'kivora-share',
        cardCount: deck.cardCount,
      }, {
        type: 'public-library',
        label: 'Kivora public deck',
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not parse this deck', 'error');
    }
  }

  const tabMeta: Array<{ id: DeckTab; label: string; count?: number }> = [
    { id: 'mine', label: 'My Decks', count: myDecks.length },
    { id: 'import', label: 'Import' },
    { id: 'public', label: 'Public Library', count: decks.length },
  ];

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarIntro}>
          <span className={styles.eyebrow}>Deck Workflow</span>
          <h1>Decks</h1>
          <p>Keep imports, study mode, and public sharing in one calmer workspace.</p>
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
            <span className={styles.metricLabel}>Private decks</span>
            <strong>{localDeckCount}</strong>
            <small>Study, quiz, and revise from your saved decks.</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Public decks</span>
            <strong>{decks.length}</strong>
            <small>Importable snapshots from the shared library.</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Import sources</span>
            <strong>Quizlet, CSV, Paste, Anki</strong>
            <small>Use the Import tab to bring everything into one deck system.</small>
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
            <button className={styles.primaryButton} onClick={() => setActiveTab('import')}>
              Import a deck
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push(myDecks[0] ? `/decks/${myDecks[0].id}` : '/workspace')}>
              {myDecks[0] ? 'Open latest deck' : 'Open workspace'}
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push('/analytics')}>
              View stats
            </button>
          </div>
        </section>

        {activeTab === 'mine' && (
        <section className={styles.libraryCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>My decks</h2>
              <p>Your personal flashcard decks, synced when you are signed in and always available locally.</p>
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
              <button className={styles.inlineAction} onClick={() => router.push(`/decks/${lastImported.deck.id}?imported=1`)}>
                Open deck
              </button>
            </div>
          )}

          {/* Sort controls */}
          {myDecks.length > 1 && (
            <div className={styles.sortRow}>
              <span className={styles.sortLabel}>Sort:</span>
              {(['recent', 'due', 'accuracy', 'name'] as const).map(opt => (
                <button
                  key={opt}
                  className={`${styles.sortChip} ${deckSort === opt ? styles.sortChipActive : ''}`}
                  onClick={() => setDeckSort(opt)}
                >
                  {opt === 'recent' ? 'Recent' : opt === 'due' ? '⏰ Due' : opt === 'accuracy' ? '🎯 Needs work' : 'A–Z'}
                </button>
              ))}
            </div>
          )}

          {loadingMine ? (
            <div className={styles.emptyState}>Loading your decks…</div>
          ) : myDecks.length === 0 ? (
            <div className={styles.emptyState}>
              No private decks yet. Import one from Quizlet, CSV, pasted notes, Anki, or a public Kivora deck to get started.
            </div>
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

                    {/* Accuracy bar */}
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
                      <button className={styles.primaryButton} onClick={() => router.push(`/decks/${deck.id}`)}>
                        Open deck
                      </button>
                      <button className={styles.secondaryButton} onClick={() => router.push(`/decks/${deck.id}?mode=review`)}>
                        {due > 0 ? `Review (${due})` : 'Study'}
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
              <p>Bring in flashcards from Quizlet, Kivora links, CSV, pasted notes, or Anki packages, then route straight into your deck viewer.</p>
            </div>
            {lastImported && (
              <button className={styles.inlineAction} onClick={() => router.push(`/decks/${lastImported.deck.id}?imported=1`)}>
                Open “{lastImported.deck.name}”
              </button>
            )}
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
            {importMode === 'quizlet' && (
              <>
                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  {[
                    { n: 1, label: 'Open set' },
                    { n: 2, label: 'Paste source' },
                  ].map(s => (
                    <button key={s.n} onClick={() => setQuizletStep(s.n as 1 | 2)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                        borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
                        fontWeight: quizletStep === s.n ? 700 : 400,
                        background: quizletStep === s.n ? 'var(--accent)' : 'var(--bg-elevated)',
                        color: quizletStep === s.n ? '#fff' : 'var(--text-secondary)',
                      }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700,
                        background: quizletStep === s.n ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)', color: 'inherit' }}>
                        {s.n}
                      </span>
                      {s.label}
                    </button>
                  ))}
                </div>

                {quizletStep === 1 && (
                  <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Open your Quizlet set</div>
                    <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      <li>Go to your Quizlet set in a browser tab.<br/>
                        <span style={{ fontSize: 12, opacity: 0.7 }}>e.g. quizlet.com/1154092943/flashcards</span>
                      </li>
                      <li>Press <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: 12 }}>Ctrl+U</kbd> (Windows/Linux) or <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: 12 }}>⌘+Option+U</kbd> (Mac) to open the page source.</li>
                      <li>Press <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: 12 }}>Ctrl+A</kbd> to select all, then <kbd style={{ padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', fontFamily: 'monospace', fontSize: 12 }}>Ctrl+C</kbd> to copy.</li>
                      <li>Click <strong>Next →</strong> below and paste.</li>
                    </ol>
                    <button className={styles.primaryButton} style={{ alignSelf: 'flex-start' }}
                      onClick={() => setQuizletStep(2)}>
                      Next → Paste source
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
                        className={styles.primaryButton}
                        onClick={importDeckFromQuizletHtml}
                        disabled={importingMode === 'quizlet' || !quizletHtml.trim()}
                      >
                        {importingMode === 'quizlet' ? 'Importing…' : 'Import cards'}
                      </button>
                    </div>
                    <textarea
                      value={quizletHtml}
                      onChange={(event) => setQuizletHtml(event.target.value)}
                      className={styles.textArea}
                      placeholder={'Paste the full Quizlet page source here (Ctrl+U → Ctrl+A → Ctrl+C)…\n\nThe importer looks for flashcard data inside the page — it works even on large sets.'}
                      style={{ minHeight: 160, fontFamily: 'monospace', fontSize: 12 }}
                    />
                    {quizletHtml.trim() && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -8 }}>
                        {quizletHtml.length.toLocaleString()} characters pasted
                        {quizletHtml.includes('__NEXT_DATA__') ? ' · ✓ Quizlet page detected' : ' · ⚠ No __NEXT_DATA__ found — make sure you copied the full source'}
                      </div>
                    )}
                    <button type="button" style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => setQuizletStep(1)}>
                      ← Back to instructions
                    </button>
                  </>
                )}
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
                    {importingMode === 'url' ? 'Importing…' : 'Import URL'}
                  </button>
                </div>
                <div style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: 'color-mix(in srgb, #f59e0b 8%, var(--bg-elevated))',
                  border: '1px solid color-mix(in srgb, #f59e0b 25%, transparent)',
                  fontSize: 13, lineHeight: 1.65, color: 'var(--text-secondary)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>💡</span> Importing from Quizlet?
                  </strong>
                  <span>
                    Quizlet loads cards via JavaScript and blocks automated import. The most reliable method is to <strong>export and paste</strong>:
                  </span>
                  <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Open the Quizlet set in your browser.</li>
                    <li>Click <strong>•••</strong> → <strong>Export</strong> and copy the exported text.</li>
                    <li>Switch to the <strong>Paste</strong> tab and paste — Kivora will parse the terms and definitions automatically.</li>
                  </ol>
                  <button
                    type="button"
                    onClick={() => setImportMode('paste')}
                    style={{
                      alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                      background: 'color-mix(in srgb, #f59e0b 18%, var(--bg-surface))',
                      border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
                      color: '#f59e0b', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Switch to Paste import →
                  </button>
                </div>
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
          </div>

          <div className={styles.helperGrid}>
            <article className={styles.helperCard}>
              <strong>Quizlet import</strong>
              <p>Fetch the set, convert terms + definitions into Kivora cards, then open the deck editor immediately.</p>
            </article>
            <article className={styles.helperCard}>
              <strong>Kivora shared deck</strong>
              <p>Import a published deck snapshot into your private study space without leaving the deck workflow.</p>
            </article>
            <article className={styles.helperCard}>
              <strong>CSV + paste</strong>
              <p>Bring in simple term/definition lists without depending on a third-party site staying scrape-friendly.</p>
            </article>
            <article className={styles.helperCard}>
              <strong>Anki packages</strong>
              <p>Import existing `.apkg` decks so Kivora becomes your universal flashcard workspace, not just a one-source importer.</p>
            </article>
          </div>
        </section>
      )}

      {activeTab === 'public' && (
        <section className={styles.libraryCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Public library</h2>
              <p>Search, preview, and import public decks without leaving the page.</p>
            </div>
            <div className={styles.searchRow}>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void loadDecksFromApi(query); }}
                placeholder="Search by title or topic…"
                className={styles.searchInput}
              />
              <button className={styles.primaryButton} onClick={() => void loadDecksFromApi(query)}>
                Search
              </button>
              {query && (
                <button className={styles.secondaryButton} onClick={() => { setQuery(''); void loadDecksFromApi(''); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading public decks…</div>
          ) : decks.length === 0 ? (
            <div className={styles.emptyState}>
              {query ? `No public decks found for "${query}". Try a different search term.` : 'No public decks found yet. Publish one from a personal deck to seed the library.'}
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {decks.length} deck{decks.length !== 1 ? 's' : ''} found{query ? ` for "${query}"` : ''}
              </p>
              <div className={styles.deckGrid}>
                {decks.map((deck) => (
                  <article key={deck.shareId} className={styles.deckCard}>
                    <div className={styles.deckTop}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <h3>{deck.title}</h3>
                        {deck.description && <p>{deck.description}</p>}
                      </div>
                      <span className={styles.countPill}>{deck.cardCount} cards</span>
                    </div>

                    <div className={styles.metaRow}>
                      <span>Published {formatDate(deck.createdAt)}</span>
                    </div>

                    {/* Card preview */}
                    <div className={styles.preview}>
                      {deck.content.split('\n').filter(l => l.trim()).slice(0, 2).map((line, index) => (
                        <div key={`${deck.shareId}-${index}`} style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line}</div>
                      ))}
                    </div>

                    <div className={styles.cardActions}>
                      <button className={styles.primaryButton} onClick={() => void importPublicDeck(deck)}>
                        Import deck
                      </button>
                      <button
                        className={styles.secondaryButton}
                        onClick={() => navigator.clipboard.writeText(deck.shareUrl).then(() => toast('Link copied', 'success'))}
                        title={deck.shareUrl}
                      >
                        Copy link
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
