'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadDecks, type SRSDeck } from '@/lib/srs/sm2';
import { buildImportedDeck, persistDeckLocally, syncDeckToCloud } from '@/lib/srs/deck-utils';
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
  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [lastImported, setLastImported] = useState<{ deck: SRSDeck; cardCount: number } | null>(null);

  const localDeckCount = useMemo(() => myDecks.length, [myDecks]);

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

  async function finalizeImport(
    payload: { title?: string; description?: string; content?: string; source?: string; cardCount?: number },
    fallbackSource: { type: SRSDeck['sourceType']; label: string },
  ) {
    const deck = buildImportedDeck({
      title: String(payload.title ?? 'Imported deck'),
      description: String(payload.description ?? ''),
      content: String(payload.content ?? ''),
      sourceType: payload.source === 'quizlet'
        ? 'quizlet'
        : payload.source === 'kivora-share'
          ? 'kivora-share'
          : fallbackSource.type,
      sourceLabel: payload.source === 'quizlet'
        ? 'Quizlet import'
        : payload.source === 'kivora-share'
          ? 'Kivora shared deck'
          : fallbackSource.label,
      creatorName: 'You',
    });

    if (!deck) throw new Error('Could not parse deck cards');

    persistDeckLocally(deck);
    const synced = await syncDeckToCloud(deck);
    const cardCount = payload.cardCount ?? deck.cards.length;
    setLastImported({ deck, cardCount });
    setImportUrl('');
    setActiveTab('mine');
    await refreshMyDecks();
    toast(
      synced ? `Imported "${deck.name}" (${cardCount} cards)` : `Imported "${deck.name}" locally (${cardCount} cards)`,
      synced ? 'success' : 'warning',
    );
    router.push(`/decks/${deck.id}?imported=1`);
  }

  async function importDeckFromUrl() {
    if (!importUrl.trim()) return;
    setImportingUrl(true);
    try {
      const res = await fetch('/api/srs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Import failed');
      }

      await finalizeImport(payload as { title?: string; description?: string; content?: string; source?: string; cardCount?: number }, {
        type: 'manual',
        label: 'Deck import',
      });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error');
    } finally {
      setImportingUrl(false);
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
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Deck Workflow</span>
          <h1>Import, open, edit, and publish decks from one streamlined workspace.</h1>
          <p>
            Private decks stay at the center of study mode, quiz generation, explanations, and public sharing.
          </p>
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
        </div>

        <div className={styles.heroPanel}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Private decks</span>
            <strong>{localDeckCount}</strong>
            <small>Personal study decks</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Public decks</span>
            <strong>{decks.length}</strong>
            <small>Searchable shared decks</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Import source</span>
            <strong>Quizlet + Kivora</strong>
            <small>URL import with direct deck handoff</small>
          </div>
        </div>
      </section>

      <section className={styles.tabBar}>
        {tabMeta.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' ? <small>{tab.count}</small> : null}
          </button>
        ))}
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

          {loadingMine ? (
            <div className={styles.emptyState}>Loading your decks…</div>
          ) : myDecks.length === 0 ? (
            <div className={styles.emptyState}>
              No private decks yet. Import one from Quizlet or a public Kivora deck to get started.
            </div>
          ) : (
            <div className={styles.deckGrid}>
              {myDecks.map((deck) => (
                <article key={deck.id} className={styles.deckCard}>
                  <div className={styles.deckTop}>
                    <div>
                      <h3>{deck.name}</h3>
                      {deck.description && <p>{deck.description}</p>}
                    </div>
                    <span className={styles.countPill}>{deck.cards.length} cards</span>
                  </div>

                  <div className={styles.metaRow}>
                    <span>{deck.sourceLabel ?? 'Private deck'}</span>
                    <span>{formatDate(deck.lastStudied ?? deck.createdAt)}</span>
                  </div>

                  <div className={styles.preview}>
                    {deck.cards.slice(0, 3).map((card) => (
                      <div key={card.id}><strong>{card.front}</strong> — {card.back}</div>
                    ))}
                  </div>

                  <div className={styles.cardActions}>
                    <button className={styles.primaryButton} onClick={() => router.push(`/decks/${deck.id}`)}>
                      Open deck
                    </button>
                    <button className={styles.secondaryButton} onClick={() => router.push(`/decks/${deck.id}?imported=1`)}>
                      Study
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'import' && (
        <section className={styles.importCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Import from URL</h2>
              <p>Supports Quizlet set URLs and Kivora shared deck links, then routes straight into your personal deck viewer.</p>
            </div>
            {lastImported && (
              <button className={styles.inlineAction} onClick={() => router.push(`/decks/${lastImported.deck.id}?imported=1`)}>
                Open “{lastImported.deck.name}”
              </button>
            )}
          </div>
          <div className={styles.importRow}>
            <input
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              placeholder="Paste Quizlet or Kivora deck URL"
              className={styles.searchInput}
            />
            <button className={styles.primaryButton} onClick={importDeckFromUrl} disabled={importingUrl || !importUrl.trim()}>
              {importingUrl ? 'Importing…' : 'Import URL'}
            </button>
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
                placeholder="Search public decks"
                className={styles.searchInput}
              />
              <button className={styles.secondaryButton} onClick={() => void loadDecksFromApi(query)}>
                Search
              </button>
            </div>
          </div>

          {loading ? (
            <div className={styles.emptyState}>Loading public decks…</div>
          ) : decks.length === 0 ? (
            <div className={styles.emptyState}>
              No public decks found yet. Publish one from a personal deck to seed the library.
            </div>
          ) : (
            <div className={styles.deckGrid}>
              {decks.map((deck) => (
                <article key={deck.shareId} className={styles.deckCard}>
                  <div className={styles.deckTop}>
                    <div>
                      <h3>{deck.title}</h3>
                      {deck.description && <p>{deck.description}</p>}
                    </div>
                    <span className={styles.countPill}>{deck.cardCount} cards</span>
                  </div>

                  <div className={styles.metaRow}>
                    <span>{formatDate(deck.createdAt)}</span>
                    <span>{deck.shareToken.slice(0, 8)}</span>
                  </div>

                  <div className={styles.preview}>
                    {deck.content.split('\n').slice(0, 4).map((line, index) => (
                      <div key={`${deck.shareId}-${index}`}>{line}</div>
                    ))}
                  </div>

                  <div className={styles.cardActions}>
                    <button className={styles.primaryButton} onClick={() => void importPublicDeck(deck)}>
                      Import deck
                    </button>
                    <button
                      className={styles.secondaryButton}
                      onClick={() => navigator.clipboard.writeText(deck.shareUrl).then(() => toast('Link copied', 'success'))}
                    >
                      Copy link
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
