'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCard, loadDecks, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { parseFlashcards } from '@/lib/srs/parse';
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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function saveImportedDeck(title: string, description: string, content: string) {
  const cards = parseFlashcards(content);
  if (cards.length === 0) return null;

  const deck: SRSDeck = {
    id: `deck-${crypto.randomUUID().slice(0, 12)}`,
    name: title,
    description,
    cards: cards.map((card, index) =>
      createCard(`deck-card-${index}-${crypto.randomUUID().slice(0, 8)}`, card.front, card.back),
    ),
    createdAt: new Date().toISOString(),
  };

  saveDeck(deck);
  return deck;
}

export default function DeckLibraryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [decks, setDecks] = useState<PublicDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [lastImported, setLastImported] = useState<SRSDeck | null>(null);

  const localDeckCount = useMemo(() => loadDecks().length, [lastImported]);

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
  }, [loadDecksFromApi]);

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

      const deck = saveImportedDeck(
        String(payload.title ?? 'Imported deck'),
        String(payload.description ?? ''),
        String(payload.content ?? ''),
      );
      if (!deck) throw new Error('Could not parse deck cards');

      setLastImported(deck);
      toast(`Imported "${deck.name}"`, 'success');
      setImportUrl('');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Import failed', 'error');
    } finally {
      setImportingUrl(false);
    }
  }

  function importPublicDeck(deck: PublicDeck) {
    const imported = saveImportedDeck(deck.title, deck.description, deck.content);
    if (!imported) {
      toast('Could not parse this deck', 'error');
      return;
    }
    setLastImported(imported);
    toast(`Imported "${imported.name}"`, 'success');
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Deck Library</span>
          <h1>Browse public flashcard decks and import them into your study flow.</h1>
          <p>
            Use shared Kivora decks for inspiration, pull in a Quizlet set by URL,
            and save everything into your own private deck collection.
          </p>
          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={() => router.push('/workspace')}>
              Open workspace
            </button>
            <button className={styles.secondaryButton} onClick={() => router.push('/analytics')}>
              View stats
            </button>
          </div>
        </div>

        <div className={styles.heroPanel}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Public decks</span>
            <strong>{decks.length}</strong>
            <small>Searchable shared decks</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Your local decks</span>
            <strong>{localDeckCount}</strong>
            <small>Saved in this browser</small>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Quick import</span>
            <strong>Quizlet</strong>
            <small>Paste a set URL below</small>
          </div>
        </div>
      </section>

      <section className={styles.importCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Import from URL</h2>
            <p>Supports Quizlet set URLs and Kivora shared deck links.</p>
          </div>
          {lastImported && (
            <button className={styles.inlineAction} onClick={() => router.push('/workspace')}>
              Go study “{lastImported.name}”
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
      </section>

      <section className={styles.libraryCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2>Public decks</h2>
            <p>Search, preview, and import decks without leaving the page.</p>
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
            No public decks found yet. Publish one from flashcards to seed the library.
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
                  <button className={styles.primaryButton} onClick={() => importPublicDeck(deck)}>
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
    </div>
  );
}
