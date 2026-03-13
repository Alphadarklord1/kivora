/**
 * SM-2 Spaced Repetition Algorithm
 * Grade scale: 0=Again, 1=Hard, 2=Good, 3=Easy
 */

export interface SRSCard {
  id: string;
  front: string;
  back: string;
  category?: string;
  difficulty?: string;
  // SRS scheduling
  repetitions: number;   // number of successful reviews
  easeFactor: number;    // ease factor (>= 1.3), starts at 2.5
  interval: number;      // days until next review
  nextReview: string;    // ISO date string
  lastReview?: string;   // ISO date string
  totalReviews: number;
  correctReviews: number;
}

export interface SRSDeck {
  id: string;
  name: string;
  cards: SRSCard[];
  createdAt: string;
  lastStudied?: string;
}

export function createCard(id: string, front: string, back: string, category?: string): SRSCard {
  return {
    id, front, back, category,
    repetitions: 0,
    easeFactor: 2.5,
    interval: 1,
    nextReview: new Date().toISOString().split('T')[0],
    totalReviews: 0,
    correctReviews: 0,
  };
}

export function gradeCard(card: SRSCard, grade: 0 | 1 | 2 | 3): SRSCard {
  const today = new Date().toISOString().split('T')[0];
  const updated = { ...card, lastReview: today, totalReviews: card.totalReviews + 1 };

  if (grade === 0) {
    // Again: reset repetitions, short interval
    updated.repetitions = 0;
    updated.interval = 1;
    updated.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
  } else if (grade === 1) {
    // Hard: repeat soon
    updated.interval = Math.max(1, Math.round(card.interval * 1.2));
    updated.easeFactor = Math.max(1.3, card.easeFactor - 0.15);
    updated.repetitions = Math.max(0, card.repetitions - 1);
  } else if (grade === 2) {
    // Good: normal SM-2 progression
    updated.correctReviews++;
    if (card.repetitions === 0) {
      updated.interval = 1;
    } else if (card.repetitions === 1) {
      updated.interval = 6;
    } else {
      updated.interval = Math.round(card.interval * card.easeFactor);
    }
    updated.repetitions++;
  } else {
    // Easy: accelerate
    updated.correctReviews++;
    if (card.repetitions === 0) {
      updated.interval = 4;
    } else {
      updated.interval = Math.round(card.interval * card.easeFactor * 1.3);
    }
    updated.easeFactor = Math.min(4.0, card.easeFactor + 0.15);
    updated.repetitions++;
  }

  // Set next review date
  const next = new Date();
  next.setDate(next.getDate() + updated.interval);
  updated.nextReview = next.toISOString().split('T')[0];

  return updated;
}

export function getDueCards(deck: SRSDeck): SRSCard[] {
  const today = new Date().toISOString().split('T')[0];
  return deck.cards.filter(c => c.nextReview <= today);
}

export function getDeckStats(deck: SRSDeck) {
  const today = new Date().toISOString().split('T')[0];
  const due = deck.cards.filter(c => c.nextReview <= today).length;
  const new_ = deck.cards.filter(c => c.repetitions === 0).length;
  const learning = deck.cards.filter(c => c.repetitions > 0 && c.interval < 21).length;
  const mature = deck.cards.filter(c => c.interval >= 21).length;
  const accuracy = deck.cards.reduce((sum, c) => sum + c.totalReviews, 0) === 0 ? 0
    : deck.cards.reduce((sum, c) => sum + c.correctReviews, 0) /
      deck.cards.reduce((sum, c) => sum + c.totalReviews, 0) * 100;

  return { due, new: new_, learning, mature, total: deck.cards.length, accuracy };
}

// localStorage helpers
const STORAGE_KEY = 'kivora-srs-decks';

export function loadDecks(): SRSDeck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDeck(deck: SRSDeck): void {
  try {
    const decks = loadDecks();
    const idx = decks.findIndex(d => d.id === deck.id);
    if (idx >= 0) decks[idx] = deck; else decks.push(deck);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch { /* noop */ }
}

export function deleteDeck(deckId: string): void {
  try {
    const decks = loadDecks().filter(d => d.id !== deckId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch { /* noop */ }
}
