'use client';

import { useCallback, useEffect, useState } from 'react';
import { generateSmartContent, type Flashcard, type GeneratedQuestion, type ToolMode, type GeneratedContent } from '@/lib/offline/generate';
import type { ExamPrepData } from '@/components/tools/ExamSimulator';
import { useI18n } from '@/lib/i18n/useI18n';
import {
  createCard, gradeCard, getDueCards, getDeckStats, saveDeck, loadDecks, deleteDeck,
  type SRSCard, type SRSDeck,
} from '@/lib/srs/sm2';

// ─── Props ────────────────────────────────────────────────────────────────────

interface FlashcardSRSProps {
  inputText?: string;
  onInputChange: (value: string) => void;
  manualInputEnabled?: boolean;
  prepData?: ExamPrepData | null;
  autoGenerate?: boolean;
  onResult?: (title: string, content: string) => void;
  generateContent?: (mode: ToolMode, text: string) => Promise<GeneratedContent>;
}

// ─── Grade labels ─────────────────────────────────────────────────────────────

const GRADES = [
  { grade: 0 as const, label: 'Again', color: '#ef4444', hint: '< 1 day' },
  { grade: 1 as const, label: 'Hard',  color: '#f97316', hint: '~1–2 days' },
  { grade: 2 as const, label: 'Good',  color: '#22c55e', hint: '~few days' },
  { grade: 3 as const, label: 'Easy',  color: '#6366f1', hint: '~1 week+' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function FlashcardSRS({
  inputText = '',
  onInputChange,
  manualInputEnabled = true,
  prepData,
  autoGenerate = false,
  onResult,
  generateContent,
}: FlashcardSRSProps) {
  const { t } = useI18n({
    'General': 'عام',
    'SRS Deck': 'مجموعة SRS',
    'Deck ready: {count} cards': 'المجموعة جاهزة: {count} بطاقات',
    'Flashcard SRS': 'بطاقات SRS',
  });

  // View: 'setup' | 'decks' | 'study'
  const [view, setView] = useState<'setup' | 'decks' | 'study'>('setup');
  const [decks, setDecks] = useState<SRSDeck[]>([]);
  const [activeDeck, setActiveDeck] = useState<SRSDeck | null>(null);
  const [dueCards, setDueCards] = useState<SRSCard[]>([]);
  const [studyIdx, setStudyIdx] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0, total: 0 });
  const [sessionDone, setSessionDone] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiExplain, setAiExplain] = useState<string | null>(null);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);

  // Load saved decks
  useEffect(() => {
    const saved = loadDecks();
    setDecks(saved);
    if (saved.length > 0) setView('decks');
  }, []);

  // Convert Flashcard[] to SRSCard[]
  const flashcardsToSRS = useCallback((cards: Flashcard[]): SRSCard[] =>
    cards.map(c => createCard(c.id, c.front, c.back, c.category ?? t('General'))),
  [t]);

  const buildDeckFromQuestions = useCallback((questions: GeneratedQuestion[]): Flashcard[] =>
    questions.map(q => ({
      id: q.id,
      front: q.question,
      back: q.correctAnswer,
      category: q.topic ?? q.keywords?.[0] ?? t('General'),
      difficulty: q.difficulty,
      keywords: q.keywords ?? [],
    })),
  [t]);

  // Generate new deck
  const handleGenerate = useCallback(async (source: 'text' | 'prep') => {
    setGenerating(true);
    try {
      let rawCards: Flashcard[] = [];
      if (source === 'prep' && prepData) {
        rawCards = prepData.questionBank?.length
          ? buildDeckFromQuestions(prepData.questionBank)
          : generateSmartContent('flashcards', inputText).flashcards ?? [];
      } else {
        const content = generateContent
          ? await generateContent('flashcards', inputText)
          : generateSmartContent('flashcards', inputText);
        rawCards = content.flashcards ?? [];
      }

      if (!rawCards.length) { setGenerating(false); return; }

      const deckId = `deck_${Date.now()}`;
      const newDeck: SRSDeck = {
        id: deckId,
        name: `Deck ${new Date().toLocaleDateString()}`,
        cards: flashcardsToSRS(rawCards),
        createdAt: new Date().toISOString(),
      };
      saveDeck(newDeck);
      const updated = loadDecks();
      setDecks(updated);
      onResult?.(t('SRS Deck'), t('Deck ready: {count} cards', { count: rawCards.length }));
      startStudy(newDeck);
    } finally {
      setGenerating(false);
    }
  }, [inputText, prepData, generateContent, buildDeckFromQuestions, flashcardsToSRS, onResult, t]);

  // Auto-generate
  useEffect(() => {
    if (!autoGenerate || !prepData || decks.length || generating) return;
    handleGenerate('prep');
  }, [autoGenerate, prepData, decks.length, generating, handleGenerate]);

  // Start study session
  const startStudy = useCallback((deck: SRSDeck) => {
    const due = getDueCards(deck);
    const toStudy = due.length > 0 ? due : deck.cards.slice(0, 10); // if nothing due, show first 10
    setActiveDeck(deck);
    setDueCards(toStudy);
    setStudyIdx(0);
    setShowBack(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0, total: 0 });
    setSessionDone(false);
    setAiExplain(null);
    setView('study');
  }, []);

  // Grade a card
  const handleGrade = useCallback((grade: 0 | 1 | 2 | 3) => {
    if (!activeDeck || studyIdx >= dueCards.length) return;
    const card = dueCards[studyIdx];
    const updated = gradeCard(card, grade);

    // Update deck
    const updatedDeck: SRSDeck = {
      ...activeDeck,
      lastStudied: new Date().toISOString(),
      cards: activeDeck.cards.map(c => c.id === card.id ? updated : c),
    };
    saveDeck(updatedDeck);
    setActiveDeck(updatedDeck);
    setDecks(loadDecks());

    // Track session stats
    const gradeKey = grade === 0 ? 'again' : grade === 1 ? 'hard' : grade === 2 ? 'good' : 'easy';
    setSessionStats(s => ({ ...s, [gradeKey]: s[gradeKey] + 1, total: s.total + 1 }));

    const nextIdx = studyIdx + 1;
    if (nextIdx >= dueCards.length) {
      setSessionDone(true);
    } else {
      setStudyIdx(nextIdx);
      setShowBack(false);
      setAiExplain(null);
    }
  }, [activeDeck, studyIdx, dueCards]);

  // AI explain button
  const handleExplain = useCallback(async () => {
    if (!activeDeck || studyIdx >= dueCards.length) return;
    const card = dueCards[studyIdx];
    setAiExplainLoading(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: card.front,
          userAnswer: '(not answered)',
          correctAnswer: card.back,
          context: 'flashcard review',
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json();
      setAiExplain(data.explanation ?? null);
    } catch {
      setAiExplain(null);
    } finally {
      setAiExplainLoading(false);
    }
  }, [activeDeck, studyIdx, dueCards]);

  const handleDeleteDeck = useCallback((deckId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteDeck(deckId);
    const updated = loadDecks();
    setDecks(updated);
    if (updated.length === 0) setView('setup');
  }, []);

  // ── Views ────────────────────────────────────────────────────────────────────

  // Setup view (no decks yet)
  if (view === 'setup') {
    return (
      <div className="srs-shell">
        <div className="srs-empty-state">
          <div className="srs-empty-icon">🃏</div>
          <h3>Spaced Repetition Flashcards</h3>
          <p>Generate a flashcard deck from your study material. Kivora uses the SM-2 algorithm to show you cards at the optimal time — right before you forget them.</p>
        </div>

        {manualInputEnabled && (
          <div className="srs-input-block">
            <label>Study material</label>
            <textarea
              value={inputText}
              onChange={e => onInputChange(e.target.value)}
              rows={5}
              placeholder="Paste your notes, lecture slides, or any study material…"
            />
          </div>
        )}

        <div className="srs-actions">
          <button className="srs-btn primary" onClick={() => handleGenerate('text')} disabled={generating || !inputText.trim()}>
            {generating ? '⟳ Generating…' : '✨ Generate Deck'}
          </button>
          {prepData && (
            <button className="srs-btn secondary" onClick={() => handleGenerate('prep')} disabled={generating}>
              📋 Use Exam Prep
            </button>
          )}
        </div>

        {!inputText.trim() && !prepData && (
          <p className="srs-hint">Upload a file or paste text in the workspace to generate flashcards.</p>
        )}

        <style jsx>{SRS_STYLES}</style>
      </div>
    );
  }

  // Decks list view
  if (view === 'decks') {
    return (
      <div className="srs-shell">
        <div className="srs-decks-header">
          <h3>Your Decks</h3>
          <button className="srs-btn-sm" onClick={() => setView('setup')}>+ New Deck</button>
        </div>

        <div className="srs-deck-list">
          {decks.map(deck => {
            const stats = getDeckStats(deck);
            return (
              <div key={deck.id} className="srs-deck-card" onClick={() => startStudy(deck)}>
                <div className="srs-deck-name">{deck.name}</div>
                <div className="srs-deck-stats">
                  <span className="srs-stat due">{stats.due} due</span>
                  <span className="srs-stat new">{stats.new} new</span>
                  <span className="srs-stat learn">{stats.learning} learning</span>
                  <span className="srs-stat mature">{stats.mature} mature</span>
                </div>
                <div className="srs-deck-meta">
                  {stats.total} cards · {stats.accuracy > 0 ? `${stats.accuracy.toFixed(0)}% accuracy` : 'not started'}
                  {deck.lastStudied && ` · last studied ${new Date(deck.lastStudied).toLocaleDateString()}`}
                </div>
                <button className="srs-deck-delete" onClick={e => handleDeleteDeck(deck.id, e)} title="Delete deck">✕</button>
              </div>
            );
          })}
        </div>

        {manualInputEnabled && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            <textarea
              value={inputText}
              onChange={e => onInputChange(e.target.value)}
              rows={3}
              placeholder="Paste new material to create another deck…"
              style={{ marginBottom: 8 }}
            />
            <button className="srs-btn primary" onClick={() => handleGenerate('text')} disabled={generating || !inputText.trim()}>
              {generating ? '⟳ Generating…' : '+ Generate New Deck'}
            </button>
          </div>
        )}

        <style jsx>{SRS_STYLES}</style>
      </div>
    );
  }

  // Study view
  if (sessionDone || studyIdx >= dueCards.length) {
    const pct = sessionStats.total > 0
      ? Math.round(((sessionStats.good + sessionStats.easy) / sessionStats.total) * 100)
      : 0;
    return (
      <div className="srs-shell">
        <div className="srs-done">
          <div className="srs-done-icon">{pct >= 70 ? '🎉' : pct >= 40 ? '💪' : '📖'}</div>
          <h3>Session Complete!</h3>
          <p>You reviewed {sessionStats.total} cards.</p>
          <div className="srs-done-stats">
            {GRADES.map(g => {
              const key = g.label.toLowerCase() as keyof typeof sessionStats;
              return (
                <div key={g.grade} className="srs-done-stat">
                  <div className="srs-done-stat-val" style={{ color: g.color }}>
                    {sessionStats[key]}
                  </div>
                  <div className="srs-done-stat-lbl">{g.label}</div>
                </div>
              );
            })}
          </div>
          {activeDeck && (
            <div className="srs-done-accuracy">
              {pct}% recalled correctly
              <div className="srs-acc-bar">
                <div className="srs-acc-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          <div className="srs-done-actions">
            <button className="srs-btn primary" onClick={() => activeDeck && startStudy(activeDeck)}>
              Review Again
            </button>
            <button className="srs-btn secondary" onClick={() => setView('decks')}>
              Back to Decks
            </button>
          </div>
        </div>
        <style jsx>{SRS_STYLES}</style>
      </div>
    );
  }

  const card = dueCards[studyIdx];
  const progress = ((studyIdx) / dueCards.length) * 100;

  return (
    <div className="srs-shell">
      {/* Progress bar */}
      <div className="srs-progress-bar">
        <div className="srs-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div className="srs-study-header">
        <button className="srs-back-btn" onClick={() => setView('decks')}>← Decks</button>
        <span className="srs-counter">{studyIdx + 1} / {dueCards.length}</span>
        {card.category && <span className="srs-category">{card.category}</span>}
      </div>

      {/* Card */}
      <div className={`srs-card${showBack ? ' flipped' : ''}`} onClick={() => { setShowBack(s => !s); setAiExplain(null); }}>
        <div className="srs-card-side srs-card-front">
          <div className="srs-card-label">Question</div>
          <div className="srs-card-content">{card.front}</div>
          <div className="srs-card-hint">Tap to reveal answer</div>
        </div>
        <div className="srs-card-side srs-card-back">
          <div className="srs-card-label">Answer</div>
          <div className="srs-card-content">{card.back}</div>
        </div>
      </div>

      {/* AI explain button — shows after card is flipped */}
      {showBack && (
        <div className="srs-ai-row">
          {!aiExplain && !aiExplainLoading && (
            <button className="srs-explain-btn" onClick={handleExplain}>
              🤖 Explain this
            </button>
          )}
          {aiExplainLoading && (
            <div className="srs-explain-loading">🤖 AI thinking…</div>
          )}
          {aiExplain && (
            <div className="srs-explain-box">
              <span className="srs-explain-label">🤖 AI Tutor</span>
              {aiExplain}
            </div>
          )}
        </div>
      )}

      {/* Grade buttons */}
      {showBack ? (
        <div className="srs-grades">
          {GRADES.map(g => (
            <button
              key={g.grade}
              className="srs-grade-btn"
              style={{ '--grade-color': g.color } as React.CSSProperties}
              onClick={() => handleGrade(g.grade)}
            >
              <span className="srs-grade-label">{g.label}</span>
              <span className="srs-grade-hint">{g.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="srs-show-hint">Rate yourself after you recall the answer</div>
      )}

      {/* Interval info */}
      {card.repetitions > 0 && (
        <div className="srs-card-meta">
          Current interval: {card.interval}d · Next review: {card.nextReview} · Ease: {card.easeFactor.toFixed(1)}
        </div>
      )}

      <style jsx>{SRS_STYLES}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const SRS_STYLES = `
  .srs-shell { display: flex; flex-direction: column; gap: 12px; }

  /* Empty state */
  .srs-empty-state { text-align: center; padding: 16px 8px; }
  .srs-empty-icon { font-size: 42px; margin-bottom: 8px; }
  .srs-empty-state h3 { font-size: 16px; font-weight: 700; margin: 0 0 6px; }
  .srs-empty-state p { font-size: 13px; color: var(--text-muted); margin: 0; line-height: 1.6; }
  .srs-input-block { display: flex; flex-direction: column; gap: 6px; }
  .srs-input-block label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
  .srs-input-block textarea { padding: 10px 12px; border: 1.5px solid var(--border-subtle); border-radius: 10px; background: var(--bg-surface); color: var(--text-primary); font-size: 13px; resize: vertical; outline: none; }
  .srs-input-block textarea:focus { border-color: var(--primary); }
  .srs-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .srs-hint { font-size: 12px; color: var(--text-muted); margin: 0; text-align: center; }

  /* Buttons */
  .srs-btn { padding: 10px 18px; border-radius: 10px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.12s; }
  .srs-btn.primary { background: var(--primary); color: white; box-shadow: 0 2px 8px color-mix(in srgb, var(--primary) 30%, transparent); }
  .srs-btn.primary:hover:not(:disabled) { opacity: 0.88; }
  .srs-btn.primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .srs-btn.secondary { background: var(--bg-elevated); border: 1.5px solid var(--border-subtle); color: var(--text-secondary); }
  .srs-btn.secondary:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
  .srs-btn-sm { padding: 6px 12px; border-radius: 8px; border: 1.5px solid var(--border-subtle); background: transparent; color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.1s; }
  .srs-btn-sm:hover { border-color: var(--primary); color: var(--primary); }

  /* Deck list */
  .srs-decks-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .srs-decks-header h3 { font-size: 15px; font-weight: 700; margin: 0; }
  .srs-deck-list { display: flex; flex-direction: column; gap: 8px; }
  .srs-deck-card { position: relative; padding: 12px 14px; border-radius: 12px; border: 1.5px solid var(--border-subtle); background: var(--bg-elevated); cursor: pointer; transition: all 0.12s; }
  .srs-deck-card:hover { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 4%, var(--bg-elevated)); }
  .srs-deck-name { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .srs-deck-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .srs-stat { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
  .srs-stat.due    { background: color-mix(in srgb, #ef4444 12%, transparent); color: #ef4444; }
  .srs-stat.new    { background: color-mix(in srgb, #6366f1 12%, transparent); color: #6366f1; }
  .srs-stat.learn  { background: color-mix(in srgb, #f97316 12%, transparent); color: #f97316; }
  .srs-stat.mature { background: color-mix(in srgb, #22c55e 12%, transparent); color: #22c55e; }
  .srs-deck-meta { font-size: 11px; color: var(--text-muted); }
  .srs-deck-delete { position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; padding: 2px 6px; border-radius: 6px; }
  .srs-deck-delete:hover { color: #ef4444; background: color-mix(in srgb, #ef4444 10%, transparent); }

  /* Progress bar */
  .srs-progress-bar { height: 4px; background: var(--border-subtle); border-radius: 4px; overflow: hidden; }
  .srs-progress-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width 0.4s ease; }

  /* Study header */
  .srs-study-header { display: flex; align-items: center; gap: 8px; }
  .srs-back-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 4px 8px; border-radius: 6px; }
  .srs-back-btn:hover { color: var(--primary); }
  .srs-counter { font-size: 12px; color: var(--text-muted); margin-left: auto; }
  .srs-category { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); }

  /* Flashcard */
  .srs-card {
    min-height: 160px; border-radius: 16px; cursor: pointer;
    perspective: 800px; position: relative;
    transition: transform 0.05s; user-select: none;
  }
  .srs-card:active { transform: scale(0.985); }
  .srs-card-side {
    border-radius: 16px; padding: 24px 20px;
    border: 1.5px solid var(--border-subtle);
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 8px; text-align: center;
    min-height: 160px;
  }
  .srs-card-front { background: var(--bg-elevated); display: flex; }
  .srs-card-back { background: color-mix(in srgb, var(--primary) 6%, var(--bg-elevated)); border-color: color-mix(in srgb, var(--primary) 30%, var(--border-subtle)); display: none; }
  .srs-card.flipped .srs-card-front { display: none; }
  .srs-card.flipped .srs-card-back { display: flex; }
  .srs-card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
  .srs-card-content { font-size: 16px; font-weight: 600; color: var(--text-primary); line-height: 1.5; }
  .srs-card-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

  /* AI explain */
  .srs-ai-row { display: flex; flex-direction: column; gap: 6px; }
  .srs-explain-btn { padding: 7px 14px; border-radius: 9px; border: 1.5px solid color-mix(in srgb, #a78bfa 40%, var(--border-subtle)); background: color-mix(in srgb, #a78bfa 8%, var(--bg-surface)); color: #a78bfa; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.12s; align-self: flex-start; }
  .srs-explain-btn:hover { background: color-mix(in srgb, #a78bfa 14%, var(--bg-surface)); }
  .srs-explain-loading { font-size: 12px; color: var(--text-muted); padding: 4px 0; animation: srs-pulse 1s infinite; }
  @keyframes srs-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .srs-explain-box { padding: 10px 14px; border-radius: 10px; background: color-mix(in srgb, #a78bfa 8%, var(--bg-elevated)); border: 1px solid color-mix(in srgb, #a78bfa 25%, var(--border-subtle)); font-size: 13px; color: var(--text-secondary); line-height: 1.65; }
  .srs-explain-label { display: block; font-size: 10px; font-weight: 700; color: #a78bfa; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }

  /* Grade buttons */
  .srs-grades { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
  .srs-grade-btn { padding: 8px 4px; border-radius: 10px; border: 1.5px solid color-mix(in srgb, var(--grade-color) 30%, var(--border-subtle)); background: color-mix(in srgb, var(--grade-color) 8%, var(--bg-surface)); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.1s; }
  .srs-grade-btn:hover { background: color-mix(in srgb, var(--grade-color) 16%, var(--bg-surface)); border-color: var(--grade-color); }
  .srs-grade-label { font-size: 12px; font-weight: 700; color: var(--grade-color); }
  .srs-grade-hint { font-size: 10px; color: var(--text-muted); }
  .srs-show-hint { font-size: 12px; color: var(--text-muted); text-align: center; padding: 8px 0; }
  .srs-card-meta { font-size: 10px; color: var(--text-muted); text-align: center; }

  /* Done screen */
  .srs-done { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 8px; text-align: center; }
  .srs-done-icon { font-size: 48px; }
  .srs-done h3 { font-size: 18px; font-weight: 700; margin: 0; }
  .srs-done p { font-size: 13px; color: var(--text-muted); margin: 0; }
  .srs-done-stats { display: flex; gap: 16px; }
  .srs-done-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .srs-done-stat-val { font-size: 24px; font-weight: 700; }
  .srs-done-stat-lbl { font-size: 11px; color: var(--text-muted); }
  .srs-done-accuracy { font-size: 13px; color: var(--text-secondary); display: flex; flex-direction: column; gap: 6px; align-items: center; width: 100%; max-width: 200px; }
  .srs-acc-bar { width: 100%; height: 8px; background: var(--border-subtle); border-radius: 4px; overflow: hidden; }
  .srs-acc-fill { height: 100%; background: #22c55e; border-radius: 4px; transition: width 0.6s ease; }
  .srs-done-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
`;
