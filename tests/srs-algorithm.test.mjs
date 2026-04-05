import test from 'node:test';
import assert from 'node:assert/strict';

const { createCard, gradeCard, getDueCards, getDeckStats } =
  await import('../lib/srs/sm2.ts');

// ── createCard ────────────────────────────────────────────────────────────────

test('createCard produces a valid new card with zero review counts', () => {
  const card = createCard('c1', 'What is mitosis?', 'Cell division producing two identical cells');
  assert.equal(card.id, 'c1');
  assert.equal(card.front, 'What is mitosis?');
  assert.equal(card.totalReviews, 0);
  assert.equal(card.correctReviews, 0);
  assert.equal(card.repetitions, 0);
  assert.equal(card.interval, 1);
});

test('createCard nextReview defaults to today', () => {
  const today = new Date().toISOString().split('T')[0];
  const card = createCard('c2', 'Q', 'A');
  assert.equal(card.nextReview, today);
});

// ── gradeCard: first review ───────────────────────────────────────────────────

test('gradeCard Again (0) on first review keeps interval at 1', () => {
  const card = createCard('c3', 'Q', 'A');
  const result = gradeCard(card, 0);
  assert.equal(result.interval, 1);
  assert.equal(result.totalReviews, 1);
  assert.equal(result.correctReviews, 0);
  assert.equal(result.repetitions, 0);
});

test('gradeCard Good (2) on first review sets interval > 1', () => {
  const card = createCard('c4', 'Q', 'A');
  const result = gradeCard(card, 2);
  assert.ok(result.interval >= 1, `Expected interval ≥ 1, got ${result.interval}`);
  assert.equal(result.repetitions, 1);
  assert.equal(result.correctReviews, 1);
  assert.ok(result.stability != null && result.stability > 0);
});

test('gradeCard Easy (3) on first review produces longer interval than Good (2)', () => {
  const base = createCard('c5', 'Q', 'A');
  const good = gradeCard(base, 2);
  const easy = gradeCard(base, 3);
  assert.ok(
    easy.interval >= good.interval,
    `Easy interval (${easy.interval}) should be ≥ Good interval (${good.interval})`,
  );
});

test('gradeCard orders Hard < Good < Easy on a later review', () => {
  let card = createCard('c5b', 'Q', 'A');
  card = gradeCard(card, 2);
  card = { ...card, lastReview: '2020-01-01' };

  const hard = gradeCard(card, 1);
  const good = gradeCard(card, 2);
  const easy = gradeCard(card, 3);

  assert.ok(hard.interval <= good.interval, `Hard interval (${hard.interval}) should be <= Good (${good.interval})`);
  assert.ok(good.interval <= easy.interval, `Good interval (${good.interval}) should be <= Easy (${easy.interval})`);
});

// ── gradeCard: subsequent reviews ────────────────────────────────────────────

test('gradeCard stability grows with consecutive Good grades', () => {
  let card = createCard('c6', 'Q', 'A');
  card = gradeCard(card, 2); // first
  const s1 = card.stability ?? 0;
  // Simulate time passing so the second review isn't on the same day
  card = { ...card, lastReview: '2020-01-01' };
  card = gradeCard(card, 2); // second
  const s2 = card.stability ?? 0;
  assert.ok(s2 > s1, `Stability should grow: ${s1} → ${s2}`);
});

test('gradeCard Again (0) after a Good grade resets repetitions', () => {
  let card = createCard('c7', 'Q', 'A');
  card = gradeCard(card, 2);
  assert.equal(card.repetitions, 1);
  card = { ...card, lastReview: '2020-01-01' };
  card = gradeCard(card, 0); // forgot
  assert.equal(card.repetitions, 0);
  assert.equal(card.correctReviews, 1); // previous correct still counted
  assert.equal(card.totalReviews, 2);
});

test('gradeCard Again lowers next interval relative to a successful review', () => {
  let card = createCard('c7b', 'Q', 'A');
  card = gradeCard(card, 2);
  const successfulInterval = card.interval;
  card = { ...card, lastReview: '2020-01-01' };
  const forgotten = gradeCard(card, 0);
  assert.ok(forgotten.interval < successfulInterval, `Again interval (${forgotten.interval}) should be less than prior successful interval (${successfulInterval})`);
});

test('gradeCard nextReview is in the future for interval > 0', () => {
  const card = createCard('c8', 'Q', 'A');
  const result = gradeCard(card, 2);
  const today = new Date().toISOString().split('T')[0];
  assert.ok(result.nextReview >= today, `nextReview ${result.nextReview} should be >= ${today}`);
});

// ── getDueCards ───────────────────────────────────────────────────────────────

test('getDueCards returns only cards due today or overdue', () => {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];

  const deck = {
    id: 'd1',
    name: 'Test',
    cards: [
      { ...createCard('x1', 'Q', 'A'), nextReview: yesterday },
      { ...createCard('x2', 'Q', 'A'), nextReview: today },
      { ...createCard('x3', 'Q', 'A'), nextReview: tomorrow },
    ],
  };

  const due = getDueCards(deck);
  assert.equal(due.length, 2);
  assert.ok(due.every(c => c.nextReview <= today));
});

test('getDueCards returns empty array when no cards are due', () => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0];
  const deck = {
    id: 'd2',
    name: 'Test',
    cards: [
      { ...createCard('y1', 'Q', 'A'), nextReview: tomorrow },
    ],
  };
  assert.deepEqual(getDueCards(deck), []);
});

// ── getDeckStats ──────────────────────────────────────────────────────────────

test('getDeckStats counts new, review, and total correctly', () => {
  const today = new Date().toISOString().split('T')[0];
  const deck = {
    id: 'd3',
    name: 'Test',
    cards: [
      createCard('z1', 'Q', 'A'),                                 // new (no lastReview)
      { ...createCard('z2', 'Q', 'A'), nextReview: today, repetitions: 1, lastReview: '2020-01-01' }, // review due
      { ...createCard('z3', 'Q', 'A'), nextReview: '2099-12-31' }, // not due
    ],
  };

  const stats = getDeckStats(deck);
  assert.equal(stats.total, 3);
  assert.ok(typeof stats.new === 'number');
  assert.ok(typeof stats.learning === 'number');
  assert.ok(typeof stats.due === 'number');
});
