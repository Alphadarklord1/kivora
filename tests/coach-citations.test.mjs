import test from 'node:test';
import assert from 'node:assert/strict';

async function loadCitations() {
  return import(`../lib/coach/citations.ts?t=${Date.now()}-${Math.random()}`);
}

// ── APA ──────────────────────────────────────────────────────────────────────

test('APA: web article with author and year', async () => {
  const { formatApa } = await loadCitations();
  const out = formatApa({
    title: 'How photosynthesis works',
    url: 'https://example.com/photo',
    source: 'Khan Academy',
    type: 'educational',
    authors: ['Jane Doe'],
    year: 2024,
  });
  assert.match(out, /Doe, J\./);
  assert.match(out, /\(2024\)/);
  assert.match(out, /How photosynthesis works/);
  assert.match(out, /https:\/\/example\.com\/photo/);
});

test('APA: web article without author falls back to source as publisher', async () => {
  const { formatApa } = await loadCitations();
  const out = formatApa({
    title: 'French Revolution',
    url: 'https://en.wikipedia.org/wiki/French_Revolution',
    source: 'Wikipedia',
    type: 'encyclopedia',
  });
  // No author → leads with source name + (n.d.) date.
  assert.match(out, /Wikipedia\.\s*\(n\.d\.\)/);
  assert.match(out, /French Revolution/);
});

test('APA: journal article uses doi when present', async () => {
  const { formatApa } = await loadCitations();
  const out = formatApa({
    title: 'Quantum entanglement at scale',
    url: 'https://doi.org/10.1234/abcd',
    source: 'Nature',
    journal: 'Nature',
    volume: '612',
    issue: '7938',
    pages: '45-52',
    doi: '10.1234/abcd',
    type: 'academic',
    authors: ['Aiden Smith', 'Bao Lin'],
    year: 2023,
  });
  assert.match(out, /Smith, A\.\s*&\s*Lin, B\./);
  assert.match(out, /Nature/);
  assert.match(out, /612\(7938\)/);
  assert.match(out, /45-52/);
  assert.match(out, /https:\/\/doi\.org\/10\.1234\/abcd/);
});

// ── MLA ──────────────────────────────────────────────────────────────────────

test('MLA: web article surname-firsts the lead author', async () => {
  const { formatMla } = await loadCitations();
  const out = formatMla({
    title: 'How photosynthesis works',
    url: 'https://example.com/photo',
    source: 'Khan Academy',
    type: 'educational',
    authors: ['Jane Doe', 'Aiden Smith'],
    year: 2024,
  });
  // Lead author surname-first; second author normal.
  assert.match(out, /Doe, Jane,?\s+and\s+Aiden Smith/);
  assert.match(out, /"How photosynthesis works\."/);
  assert.match(out, /\*Khan Academy\*/);
  assert.match(out, /Accessed/);
});

test('MLA: encyclopedia entry without author', async () => {
  const { formatMla } = await loadCitations();
  const out = formatMla({
    title: 'French Revolution',
    url: 'https://en.wikipedia.org/wiki/French_Revolution',
    source: 'Wikipedia',
    type: 'encyclopedia',
  });
  // No author block — starts with the title in quotes.
  assert.match(out, /^"French Revolution\."/);
  assert.match(out, /\*Wikipedia\*/);
  assert.match(out, /Accessed/);
});

// ── Chicago ──────────────────────────────────────────────────────────────────

test('Chicago: journal article includes vol, issue, year, pages', async () => {
  const { formatChicago } = await loadCitations();
  const out = formatChicago({
    title: 'Quantum entanglement at scale',
    url: 'https://doi.org/10.1234/abcd',
    source: 'Nature',
    journal: 'Nature',
    volume: '612',
    issue: '7938',
    pages: '45-52',
    doi: '10.1234/abcd',
    type: 'academic',
    authors: ['Aiden Smith'],
    year: 2023,
  });
  assert.match(out, /Smith, Aiden\./);
  assert.match(out, /\*Nature\*/);
  assert.match(out, /612, no\. 7938/);
  assert.match(out, /\(2023\)/);
  assert.match(out, /: 45-52/);
});

test('Chicago: web article without author uses long-form accessed date', async () => {
  const { formatChicago } = await loadCitations();
  const out = formatChicago({
    title: 'French Revolution',
    url: 'https://en.wikipedia.org/wiki/French_Revolution',
    source: 'Wikipedia',
    type: 'encyclopedia',
    accessedDate: '2026-04-25',
  });
  // April 25, 2026 — Chicago uses month name spelled out.
  assert.match(out, /April 25, 2026/);
  assert.match(out, /\*Wikipedia\*/);
});

// ── formatAll convenience ────────────────────────────────────────────────────

test('formatAll returns all three styles in one call', async () => {
  const { formatAll } = await loadCitations();
  const result = formatAll({
    title: 'Test source',
    url: 'https://example.com',
    source: 'Example',
    type: 'educational',
  });
  assert.equal(typeof result.apa, 'string');
  assert.equal(typeof result.mla, 'string');
  assert.equal(typeof result.chicago, 'string');
  assert.ok(result.apa.length > 0);
  assert.ok(result.mla.length > 0);
  assert.ok(result.chicago.length > 0);
});

// ── toCitationInput adapter ──────────────────────────────────────────────────

test('toCitationInput preserves all ResearchSource fields', async () => {
  const { toCitationInput } = await loadCitations();
  const source = {
    id: 's1',
    title: 'Photosynthesis',
    url: 'https://example.com',
    source: 'Khan Academy',
    type: 'educational',
    excerpt: '...',
    readingMinutes: 5,
    origin: 'automatic',
    keyPoints: [],
    confidenceLabel: 'High',
    confidenceScore: 0.9,
    citationLabel: 'S1',
  };
  const out = toCitationInput(source);
  assert.equal(out.title, 'Photosynthesis');
  assert.equal(out.url, 'https://example.com');
  assert.equal(out.source, 'Khan Academy');
  assert.equal(out.type, 'educational');
});

test('toCitationInput merges author/year extras when provided', async () => {
  const { toCitationInput } = await loadCitations();
  const out = toCitationInput(
    {
      id: 's1',
      title: 't',
      url: 'u',
      source: 's',
      type: 'academic',
      excerpt: '',
      readingMinutes: 1,
      origin: 'automatic',
      keyPoints: [],
      confidenceLabel: 'Medium',
      confidenceScore: 0.5,
      citationLabel: 'S1',
    },
    { authors: ['A. Test'], year: 2020, doi: '10.1/2' },
  );
  assert.deepEqual(out.authors, ['A. Test']);
  assert.equal(out.year, 2020);
  assert.equal(out.doi, '10.1/2');
});
