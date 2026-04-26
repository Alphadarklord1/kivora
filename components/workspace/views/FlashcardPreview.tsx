'use client';
import { useMemo, useState } from 'react';
import { parseFlashcards } from '@/lib/srs/parse';
import { mdToHtml } from '@/lib/utils/md';
import { createCard, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

// Lightweight preview the generate flow renders inline after the AI emits a
// flashcard set. Lets the student flip through cards before committing them
// as a deck — distinct from the full FlashcardView review experience on the
// dedicated 🃏 Flashcards tab.

export function FlashcardPreview({ content, title }: { content: string; title?: string }) {
  const cards = useMemo(() => parseFlashcards(content), [content]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [savedDeckId, setSavedDeckId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (cards.length === 0) {
    return <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(content) }} />;
  }

  const card = cards[idx];

  function go(delta: number) {
    setFlipped(false);
    setIdx((i) => Math.min(cards.length - 1, Math.max(0, i + delta)));
  }

  async function saveAsDeck() {
    if (saving || savedDeckId) return;
    setSaving(true);
    try {
      const deckId = `deck-${Date.now().toString(36)}`;
      const deckName = (title?.trim() || 'Flashcards') + ` (${cards.length} cards)`;
      const deck: SRSDeck = {
        id: deckId,
        name: deckName,
        cards: cards.map((c, i) => createCard(`${deckId}-${i}`, c.front, c.back)),
        createdAt: new Date().toISOString(),
      };
      saveDeck(deck);
      setSavedDeckId(deck.id);
      broadcastInvalidate(LIBRARY_CHANNEL);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
        <span>Card {idx + 1} of {cards.length}</span>
        <span>{flipped ? 'Back' : 'Front'} — click to flip</span>
      </div>

      <button
        onClick={() => setFlipped((f) => !f)}
        style={{
          minHeight: 220,
          padding: '32px 28px',
          borderRadius: 16,
          border: '1.5px solid var(--border-2)',
          background: flipped
            ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))'
            : 'var(--surface-2)',
          color: 'var(--text)',
          fontSize: 'var(--text-lg)',
          lineHeight: 1.55,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'background-color 0.18s ease, border-color 0.18s ease',
        }}
        aria-label={flipped ? 'Show front' : 'Show back'}
      >
        {flipped ? card.back : card.front}
      </button>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => go(-1)} disabled={idx === 0}>← Prev</button>
          <button className="btn btn-sm btn-ghost" onClick={() => go(1)} disabled={idx >= cards.length - 1}>Next →</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setFlipped((f) => !f)}>↻ Flip</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {savedDeckId ? (
            <span className="badge badge-success" style={{ fontSize: 'var(--text-xs)' }}>✓ Saved as deck</span>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={saveAsDeck} disabled={saving}>
              {saving ? 'Saving…' : '💾 Save as deck'}
            </button>
          )}
        </div>
      </div>

      <details style={{ marginTop: 6, fontSize: 'var(--text-sm)' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--text-3)', padding: '6px 0' }}>Show all {cards.length} cards</summary>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cards.map((c, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 600 }}>{c.front}</div>
              <div style={{ marginTop: 4, color: 'var(--text-2)' }}>{c.back}</div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
