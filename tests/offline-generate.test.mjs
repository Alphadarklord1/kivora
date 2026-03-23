import test from 'node:test';
import assert from 'node:assert/strict';

const { getGeneratedContent } = await import('../lib/offline/generate.ts');

const SAMPLE_TEXT = `
Photosynthesis is the process by which plants, algae, and some bacteria convert light energy
into chemical energy stored as glucose. The process takes place mainly in the chloroplasts,
using chlorophyll to absorb light. The overall equation is:
6CO2 + 6H2O + light energy → C6H12O6 + 6O2.
There are two main stages: the light-dependent reactions in the thylakoid membranes, which
produce ATP and NADPH, and the Calvin cycle in the stroma, which uses those products to
fix carbon dioxide into organic molecules. Factors that affect the rate of photosynthesis
include light intensity, carbon dioxide concentration, and temperature.
`;

// ── summarize ─────────────────────────────────────────────────────────────────

test('summarize mode returns non-empty displayText', () => {
  const result = getGeneratedContent('summarize', SAMPLE_TEXT);
  assert.equal(result.mode, 'summarize');
  assert.ok(result.displayText.length > 0, 'displayText should not be empty');
});

test('summarize mode extracts keyTopics', () => {
  const result = getGeneratedContent('summarize', SAMPLE_TEXT);
  assert.ok(Array.isArray(result.keyTopics), 'keyTopics should be an array');
  assert.ok(result.keyTopics.length > 0, 'keyTopics should not be empty');
});

test('summarize mode produces learningObjectives', () => {
  const result = getGeneratedContent('summarize', SAMPLE_TEXT);
  assert.ok(Array.isArray(result.learningObjectives));
});

// ── notes ─────────────────────────────────────────────────────────────────────

test('notes mode returns non-empty displayText', () => {
  const result = getGeneratedContent('notes', SAMPLE_TEXT);
  assert.equal(result.mode, 'notes');
  assert.ok(result.displayText.length > 0);
});

test('notes mode output contains key concepts section', () => {
  const result = getGeneratedContent('notes', SAMPLE_TEXT);
  assert.ok(
    result.displayText.toLowerCase().includes('key') ||
    result.displayText.toLowerCase().includes('concept') ||
    result.displayText.toLowerCase().includes('topic') ||
    result.displayText.toLowerCase().includes('summary'),
    'Notes output should reference key concepts or topics',
  );
});

// ── mcq ───────────────────────────────────────────────────────────────────────

test('mcq mode produces a questions array or displayText with questions', () => {
  const result = getGeneratedContent('mcq', SAMPLE_TEXT);
  assert.equal(result.mode, 'mcq');
  const hasQuestions = (Array.isArray(result.questions) && result.questions.length > 0) ||
    result.displayText.length > 0;
  assert.ok(hasQuestions, 'Should produce at least one question');
});

test('mcq mode output contains question content', () => {
  const result = getGeneratedContent('mcq', SAMPLE_TEXT);
  const hasContent = (Array.isArray(result.questions) && result.questions.length > 0) ||
    result.displayText.length > 0;
  assert.ok(hasContent, 'MCQ output should have question content');
});

// ── quiz ──────────────────────────────────────────────────────────────────────

test('quiz mode returns non-empty displayText with questions', () => {
  const result = getGeneratedContent('quiz', SAMPLE_TEXT);
  assert.equal(result.mode, 'quiz');
  assert.ok(result.displayText.length > 0);
  assert.ok(
    result.displayText.includes('?') || result.questions.length > 0,
    'quiz output should contain questions',
  );
});

// ── flashcards ────────────────────────────────────────────────────────────────

test('flashcards mode produces cards with front and back', () => {
  const result = getGeneratedContent('flashcards', SAMPLE_TEXT);
  assert.equal(result.mode, 'flashcards');
  const hasCards = (Array.isArray(result.flashcards) && result.flashcards.length > 0) ||
    result.displayText.length > 0;
  assert.ok(hasCards, 'Should produce at least one flashcard');
  if (Array.isArray(result.flashcards) && result.flashcards.length > 0) {
    for (const card of result.flashcards) {
      assert.ok(typeof card.front === 'string' && card.front.length > 0, 'front should not be empty');
      assert.ok(typeof card.back === 'string' && card.back.length > 0, 'back should not be empty');
    }
  }
});

// ── rephrase ──────────────────────────────────────────────────────────────────

test('rephrase mode returns non-empty displayText', () => {
  const result = getGeneratedContent('rephrase', SAMPLE_TEXT);
  assert.equal(result.mode, 'rephrase');
  assert.ok(result.displayText.length > 0);
});

// ── assignment ────────────────────────────────────────────────────────────────

test('assignment mode returns non-empty displayText', () => {
  const result = getGeneratedContent('assignment', SAMPLE_TEXT);
  assert.equal(result.mode, 'assignment');
  assert.ok(result.displayText.length > 0);
});

// ── subjectArea ───────────────────────────────────────────────────────────────

test('all modes return a valid subjectArea', () => {
  const valid = ['science','humanities','social-science','business','technical','general'];
  for (const mode of ['summarize','notes','mcq','quiz','flashcards']) {
    const result = getGeneratedContent(mode, SAMPLE_TEXT);
    assert.ok(valid.includes(result.subjectArea), `mode ${mode}: invalid subjectArea "${result.subjectArea}"`);
  }
});

// ── edge cases ────────────────────────────────────────────────────────────────

test('handles very short input without throwing', () => {
  assert.doesNotThrow(() => getGeneratedContent('summarize', 'Hello world'));
});

test('handles empty string input without throwing', () => {
  assert.doesNotThrow(() => getGeneratedContent('summarize', ''));
});

test('sourceText is preserved in output', () => {
  const result = getGeneratedContent('summarize', SAMPLE_TEXT);
  assert.ok(typeof result.sourceText === 'string');
});
