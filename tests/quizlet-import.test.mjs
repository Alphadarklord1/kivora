import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuizletCandidateUrls,
  extractQuizletCards,
  extractQuizletTitle,
  looksLikeQuizletBlocked,
} from '../lib/srs/quizlet-import.ts';

test('extracts cards from word/definition JSON pairs', () => {
  const html = `
    <html><head><title>Biology Terms | Quizlet</title></head><body>
    <script>{"word":"Photosynthesis","definition":"Converts light into chemical energy"}</script>
    <script>{"word":"Mitochondria","definition":"Powerhouse of the cell"}</script>
    </body></html>
  `;
  const cards = extractQuizletCards(html);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].front, 'Photosynthesis');
  assert.equal(cards[0].back, 'Converts light into chemical energy');
  assert.equal(extractQuizletTitle(html), 'Biology Terms');
});

test('extracts cards from JSON-LD fallback', () => {
  const html = `
    <script type="application/ld+json">{
      "hasPart": [
        {"name": "Vector", "description": "Quantity with magnitude and direction"},
        {"name": "Matrix", "description": "Rectangular array of numbers"}
      ]
    }</script>
  `;
  const cards = extractQuizletCards(html);
  assert.equal(cards.length, 2);
  assert.equal(cards[1].front, 'Matrix');
});

test('builds stable candidate URLs for quizlet imports', () => {
  const urls = buildQuizletCandidateUrls(new URL('https://quizlet.com/123456789/biology-chapter-5-flash-cards/?x=1#foo'));
  assert.ok(urls.includes('https://quizlet.com/123456789/biology-chapter-5-flash-cards'));
  assert.ok(urls.includes('https://quizlet.com/123456789/flash-cards/'));
  assert.ok(urls.includes('https://quizlet.com/123456789'));
});

test('detects blocked quizlet pages', () => {
  assert.equal(looksLikeQuizletBlocked('<html>Please verify you are human</html>'), true);
  assert.equal(looksLikeQuizletBlocked('<html>normal study set page</html>'), false);
});
