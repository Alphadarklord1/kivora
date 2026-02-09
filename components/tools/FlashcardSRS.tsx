'use client';

import { useEffect, useState } from 'react';
import { generateSmartContent, Flashcard, GeneratedQuestion, type ToolMode, type GeneratedContent } from '@/lib/offline/generate';
import type { ExamPrepData } from '@/components/tools/ExamSimulator';

interface FlashcardSRSProps {
  inputText?: string;
  onInputChange: (value: string) => void;
  manualInputEnabled?: boolean;
  prepData?: ExamPrepData | null;
  autoGenerate?: boolean;
  onResult?: (title: string, content: string) => void;
  generateContent?: (mode: ToolMode, text: string) => Promise<GeneratedContent>;
}

export function FlashcardSRS({
  inputText = '',
  onInputChange,
  manualInputEnabled = true,
  prepData,
  autoGenerate = false,
  onResult,
  generateContent,
}: FlashcardSRSProps) {
  const [deck, setDeck] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const buildDeckFromQuestions = (questions: GeneratedQuestion[]) =>
    questions.map(q => ({
      id: q.id,
      front: q.question,
      back: q.correctAnswer,
      category: q.topic || q.keywords?.[0] || 'General',
      difficulty: q.difficulty,
      keywords: q.keywords || [],
    }));

  const buildDeckFromPrep = (prep: ExamPrepData) => {
    if (prep.questionBank?.length) {
      return buildDeckFromQuestions(prep.questionBank);
    }
    if (inputText.trim()) {
      const content = generateSmartContent('flashcards', inputText);
      return content.flashcards || [];
    }
    return [];
  };

  const generateDeck = async () => {
    const content = generateContent
      ? await generateContent('flashcards', inputText)
      : generateSmartContent('flashcards', inputText);
    const cards = content.flashcards || [];
    setDeck(cards);
    setIndex(0);
    setShowBack(false);
    setSavedId(null);
    if (cards.length) {
      onResult?.('SRS Deck', `Deck ready: ${cards.length} cards`);
    }
  };

  const generateFromPrep = () => {
    if (!prepData) return;
    const cards = buildDeckFromPrep(prepData);
    setDeck(cards);
    setIndex(0);
    setShowBack(false);
    setSavedId(null);
    if (cards.length) {
      onResult?.('SRS Deck', `Deck ready: ${cards.length} cards`);
    }
  };

  useEffect(() => {
    if (!autoGenerate || !prepData || deck.length) return;
    const cards = buildDeckFromPrep(prepData);
    if (cards.length) {
      setDeck(cards);
      setIndex(0);
      setShowBack(false);
      setSavedId(null);
      onResult?.('SRS Deck', `Deck ready: ${cards.length} cards`);
    }
  }, [autoGenerate, prepData, deck.length, inputText, onResult]);

  const rate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    const next = Math.min(deck.length - 1, index + 1);
    setIndex(next);
    setShowBack(false);

    if (savedId) {
      await fetch(`/api/library/${savedId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          metadata: { lastRating: rating, updatedAt: new Date().toISOString() },
        }),
      });
    }
  };

  const saveDeck = async () => {
    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        mode: 'srs',
        content: `Flashcard deck (${deck.length} cards)`,
        metadata: { deck },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSavedId(data.id);
    }
  };

  if (!deck.length) {
    return (
      <div className="srs">
        <h3>Flashcard SRS</h3>
        <p>Generate spaced‑repetition flashcards from your notes.</p>
        {manualInputEnabled && (
          <div className="input-block">
            <label>SRS source text</label>
            <textarea
              value={inputText}
              onChange={(e) => onInputChange(e.target.value)}
              rows={6}
              placeholder="Paste study material for flashcards..."
            />
          </div>
        )}
        <div className="actions">
          <button className="btn" onClick={generateDeck} disabled={!inputText.trim()}>
            Generate Deck
          </button>
          {prepData && (
            <button className="btn secondary" onClick={generateFromPrep}>
              Use Exam Prep
            </button>
          )}
        </div>
        {!inputText.trim() && !prepData && (
          <div className="empty">
            {manualInputEnabled ? 'Add text or generate Exam Prep first.' : 'Select a file or generate Exam Prep first.'}
          </div>
        )}
        <style jsx>{`
          .srs { display: grid; gap: var(--space-3); }
          p { color: var(--text-muted); font-size: var(--font-meta); margin: 0; }
          .input-block { display: grid; gap: var(--space-2); }
          .input-block label { font-size: var(--font-meta); color: var(--text-secondary); }
          textarea { padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--bg-surface); }
          .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
          .empty { padding: var(--space-3); background: var(--bg-inset); border-radius: var(--radius-md); color: var(--text-muted); }
        `}</style>
      </div>
    );
  }

  const card = deck[index];
  return (
    <div className="srs">
      <div className="card" onClick={() => setShowBack(prev => !prev)}>
        <div className="label">{showBack ? 'Back' : 'Front'}</div>
        <div className="content">{showBack ? card.back : card.front}</div>
      </div>
      <div className="actions">
        <button className="btn secondary" onClick={() => rate('again')}>Again</button>
        <button className="btn secondary" onClick={() => rate('hard')}>Hard</button>
        <button className="btn" onClick={() => rate('good')}>Good</button>
        <button className="btn" onClick={() => rate('easy')}>Easy</button>
        <button className="btn secondary" onClick={saveDeck} disabled={!!savedId}>
          {savedId ? 'Saved' : 'Save Deck'}
        </button>
      </div>
      <div className="meta">Card {index + 1} of {deck.length}</div>
      <style jsx>{`
        .srs { display: grid; gap: var(--space-3); }
        .card { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 16px; padding: var(--space-5); text-align: center; cursor: pointer; }
        .label { font-size: var(--font-tiny); color: var(--text-muted); margin-bottom: var(--space-2); }
        .content { font-size: var(--font-lg); font-weight: 600; }
        .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
        .meta { font-size: var(--font-meta); color: var(--text-muted); }
      `}</style>
    </div>
  );
}
