import { getGeneratedContent, type GeneratedContent, type GeneratedQuestion } from '@/lib/offline/generate';
import { createCard, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { parseFlashcards } from '@/lib/srs/parse';

type ImportedDeckSource = {
  title: string;
  description?: string;
  content: string;
  sourceType?: SRSDeck['sourceType'];
  sourceLabel?: string;
  creatorName?: string;
};

function makeDeckQuestion(cardId: string, front: string, back: string, distractors: string[], index: number): GeneratedQuestion {
  const options = [back, ...distractors].slice(0, 4).sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(back);

  return {
    id: `deck-question-${cardId}-${index}`,
    question: front,
    options,
    correctAnswer: back,
    correctIndex,
    type: 'mcq',
    sourceSentence: `${front} ${back}`,
    keywords: front.split(/\s+/).slice(0, 4),
    topic: 'deck',
    difficulty: 'intermediate',
    bloomLevel: 'remember',
  };
}

export function deckToContent(deck: SRSDeck): string {
  return deck.cards.map((card) => `Front: ${card.front} | Back: ${card.back}`).join('\n');
}

export function buildImportedDeck({
  title,
  description = '',
  content,
  sourceType = 'manual',
  sourceLabel = 'Manual deck',
  creatorName = 'You',
}: ImportedDeckSource): SRSDeck | null {
  const cards = parseFlashcards(content);
  if (cards.length === 0) return null;

  return {
    id: `deck-${crypto.randomUUID().slice(0, 12)}`,
    name: title,
    description,
    sourceType,
    sourceLabel,
    creatorName,
    cards: cards.map((card, index) =>
      createCard(`deck-card-${index}-${crypto.randomUUID().slice(0, 8)}`, card.front, card.back),
    ),
    createdAt: new Date().toISOString(),
  };
}

export function persistDeckLocally(deck: SRSDeck): SRSDeck {
  saveDeck(deck);
  return deck;
}

export async function syncDeckToCloud(deck: SRSDeck): Promise<void> {
  try {
    await fetch('/api/srs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deck }),
    });
  } catch {
    // Leave local deck storage as the fallback source of truth for this session.
  }
}

export function buildDeckQuizContent(deck: SRSDeck, count = 10): GeneratedContent {
  const shuffled = [...deck.cards].sort(() => Math.random() - 0.5).slice(0, Math.max(1, Math.min(count, deck.cards.length)));
  const allBacks = deck.cards.map((card) => card.back);

  const questions = shuffled.map((card, index) => {
    const distractors = allBacks.filter((value) => value !== card.back).sort(() => Math.random() - 0.5).slice(0, 3);
    while (distractors.length < 3) distractors.push(`Option ${distractors.length + 1}`);
    return makeDeckQuestion(card.id, card.front, card.back, distractors, index);
  });

  const displayText = questions.map((question, index) => {
    const options = question.options.map((option, optionIndex) => {
      const letter = String.fromCharCode(65 + optionIndex);
      const suffix = question.correctIndex === optionIndex ? ' ✓' : '';
      return `${letter}) ${option}${suffix}`;
    }).join('\n');
    return `Q${index + 1}. ${question.question}\n${options}\nAnswer: ${question.correctAnswer}`;
  }).join('\n\n');

  const fallback = getGeneratedContent('quiz', deckToContent(deck));
  return {
    ...fallback,
    mode: 'quiz',
    displayText,
    questions,
    flashcards: [],
    keyTopics: deck.cards.slice(0, 6).map((card) => card.front),
    sourceText: deckToContent(deck),
  };
}
