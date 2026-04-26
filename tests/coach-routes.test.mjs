import test from 'node:test';
import assert from 'node:assert/strict';

// These tests exercise the pure helpers behind the coach routes — URL
// normalization, SSRF guards (via URL constructor + isPrivate checks),
// fallback brief building, source metadata extraction, and the citation
// adapter. Full route handler tests would need a Next.js test runner
// and mocked AI calls; the helpers below cover the logic that's most
// likely to silently break.

async function loadSourceBrief() {
  return import(`../lib/coach/source-brief.ts?t=${Date.now()}-${Math.random()}`);
}

async function loadCitations() {
  return import(`../lib/coach/citations.ts?t=${Date.now()}-${Math.random()}`);
}

async function loadWebSearch() {
  return import(`../lib/coach/web-search.ts?t=${Date.now()}-${Math.random()}`);
}

// ── normalizeSourceBriefUrl ──────────────────────────────────────────────────

test('normalizeSourceBriefUrl: accepts a fully-qualified https URL', async () => {
  const { normalizeSourceBriefUrl } = await loadSourceBrief();
  const url = normalizeSourceBriefUrl('https://example.com/article');
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'example.com');
});

test('normalizeSourceBriefUrl: rejects empty input and bare hostnames', async () => {
  const { normalizeSourceBriefUrl } = await loadSourceBrief();
  assert.throws(() => normalizeSourceBriefUrl(''));
  assert.throws(() => normalizeSourceBriefUrl('   '));
  // The function intentionally requires the protocol prefix; this guards
  // against accidentally treating typed search queries as URLs.
  assert.throws(() => normalizeSourceBriefUrl('example.com/article'));
});

test('normalizeSourceBriefUrl: rejects non-http(s) protocols', async () => {
  const { normalizeSourceBriefUrl } = await loadSourceBrief();
  assert.throws(() => normalizeSourceBriefUrl('ftp://example.com/file.txt'));
  assert.throws(() => normalizeSourceBriefUrl('javascript:alert(1)'));
});

test('normalizeSourceBriefUrl: rejects private/loopback hostnames (SSRF guard)', async () => {
  const { normalizeSourceBriefUrl } = await loadSourceBrief();
  assert.throws(() => normalizeSourceBriefUrl('http://localhost/admin'));
  assert.throws(() => normalizeSourceBriefUrl('http://127.0.0.1/'));
  assert.throws(() => normalizeSourceBriefUrl('http://10.0.0.5/'));
  assert.throws(() => normalizeSourceBriefUrl('http://192.168.1.1/'));
  assert.throws(() => normalizeSourceBriefUrl('http://service.internal/'));
});

test('normalizeSourceBriefUrl: preserves query strings and paths', async () => {
  const { normalizeSourceBriefUrl } = await loadSourceBrief();
  const url = normalizeSourceBriefUrl('https://example.com/a/b?x=1&y=2');
  assert.equal(url.pathname, '/a/b');
  assert.equal(url.search, '?x=1&y=2');
});

// ── extractSourceMetaFromText / extractSourceMetaFromHtml ────────────────────
//
// Both helpers enforce a 40-word minimum so that callers can't pass a stub
// that would generate misleading AI summaries. Test inputs need to clear
// that bar.

const LONG_PASSAGE = `Photosynthesis is the biochemical process by which green plants,
algae, and certain bacteria convert sunlight, water, and carbon dioxide into glucose
and oxygen. It begins in the chloroplasts of plant cells, where chlorophyll absorbs
light energy. The light-dependent reactions split water molecules to release oxygen
and produce ATP and NADPH, which then drive the Calvin cycle to synthesise sugars
from carbon dioxide. This process underpins most of life on Earth by anchoring the
food chain and balancing atmospheric carbon and oxygen levels.`;

test('extractSourceMetaFromText: extracts text and exposes a word count', async () => {
  const { extractSourceMetaFromText } = await loadSourceBrief();
  const meta = extractSourceMetaFromText(LONG_PASSAGE, '');
  assert.ok(meta.wordCount >= 40, `expected ≥40 words, got ${meta.wordCount}`);
  assert.ok(meta.title.length > 0);
  assert.match(meta.extractedText, /Photosynthesis/);
});

test('extractSourceMetaFromText: explicit title overrides text-derived one', async () => {
  const { extractSourceMetaFromText } = await loadSourceBrief();
  const meta = extractSourceMetaFromText(LONG_PASSAGE, 'Custom Title');
  assert.equal(meta.title, 'Custom Title');
});

test('extractSourceMetaFromText: rejects too-short input with a clear error', async () => {
  const { extractSourceMetaFromText } = await loadSourceBrief();
  // The 40-word minimum is the contract that protects downstream summarisers
  // from being asked to summarise nothing — confirm it actually throws.
  assert.throws(() => extractSourceMetaFromText('Too short.', ''), /short article|study passage/i);
});

test('extractSourceMetaFromHtml: strips scripts, styles, and tags', async () => {
  const { extractSourceMetaFromHtml } = await loadSourceBrief();
  const html = `
    <html>
      <head><title>My Article</title></head>
      <body>
        <script>alert('hi')</script>
        <style>body{}</style>
        <h1>Heading</h1>
        <p>${LONG_PASSAGE}</p>
      </body>
    </html>`;
  const meta = extractSourceMetaFromHtml(html, new URL('https://example.com/post'));
  assert.equal(meta.title, 'My Article');
  assert.match(meta.extractedText, /Photosynthesis/);
  assert.doesNotMatch(meta.extractedText, /alert/);
  assert.doesNotMatch(meta.extractedText, /body\{\}/);
});

// ── estimateReadingMinutes ────────────────────────────────────────────────────

test('estimateReadingMinutes: caps at minimum 1 for short text', async () => {
  const { estimateReadingMinutes } = await loadSourceBrief();
  assert.equal(estimateReadingMinutes(0), 1);
  assert.equal(estimateReadingMinutes(50), 1);
});

test('estimateReadingMinutes: scales with word count', async () => {
  const { estimateReadingMinutes } = await loadSourceBrief();
  // Roughly 200 words/minute is the standard convention.
  const tenMinutes = estimateReadingMinutes(2000);
  assert.ok(tenMinutes >= 8 && tenMinutes <= 12, `expected ~10 minutes, got ${tenMinutes}`);
});

// ── Citations: smoke test the adapter chain ──────────────────────────────────

test('citations: ResearchSource → CitationInput → APA produces a usable string', async () => {
  const { toCitationInput, formatApa } = await loadCitations();
  const source = {
    id: 's1',
    title: 'Photosynthesis Explained',
    url: 'https://khanacademy.org/photosynthesis',
    source: 'Khan Academy',
    type: 'educational',
    excerpt: '',
    readingMinutes: 5,
    origin: 'automatic',
    keyPoints: [],
    confidenceLabel: 'High',
    confidenceScore: 0.9,
    citationLabel: 'S1',
  };
  const apa = formatApa(toCitationInput(source));
  assert.match(apa, /Khan Academy/);
  assert.match(apa, /Photosynthesis Explained/);
  assert.match(apa, /https:\/\/khanacademy\.org/);
});

test('citations: formatAll returns three non-empty strings', async () => {
  const { formatAll } = await loadCitations();
  const set = formatAll({
    title: 'Test',
    url: 'https://example.com',
    source: 'Example',
    type: 'educational',
  });
  assert.ok(set.apa.length > 10);
  assert.ok(set.mla.length > 10);
  assert.ok(set.chicago.length > 10);
});

// ── Web search adapter: graceful no-op without API key ───────────────────────

test('searchWeb: returns [] when TAVILY_API_KEY is not set', async () => {
  const original = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    const { searchWeb, isWebSearchConfigured } = await loadWebSearch();
    assert.equal(isWebSearchConfigured(), false);
    const results = await searchWeb('photosynthesis');
    assert.deepEqual(results, []);
  } finally {
    if (original !== undefined) process.env.TAVILY_API_KEY = original;
  }
});

test('searchWeb: returns [] for empty query even when configured', async () => {
  const original = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = 'tvly-fake-key-for-test';
  try {
    const { searchWeb } = await loadWebSearch();
    const results = await searchWeb('   ');
    assert.deepEqual(results, []);
  } finally {
    if (original === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = original;
  }
});

// ── Coach session payload size cap ──────────────────────────────────────────
//
// The POST/PATCH handlers must reject jsonb payloads that exceed the
// 256 KB ceiling so a buggy or malicious client can't fill storage.

async function loadCoachSessionsRoute() {
  return import(`../app/api/coach/sessions/route.ts?t=${Date.now()}-${Math.random()}`);
}

test('payloadTooLarge: small payload is accepted', async () => {
  const { payloadTooLarge, MAX_COACH_PAYLOAD_BYTES } = await loadCoachSessionsRoute();
  assert.equal(payloadTooLarge({ topic: 'test', sources: [] }), false);
  assert.ok(MAX_COACH_PAYLOAD_BYTES === 256 * 1024);
});

test('payloadTooLarge: payload over the cap is rejected', async () => {
  const { payloadTooLarge } = await loadCoachSessionsRoute();
  // Build a string that obviously exceeds 256 KB once JSON-serialised.
  const huge = { blob: 'x'.repeat(300 * 1024) };
  assert.equal(payloadTooLarge(huge), true);
});

test('payloadTooLarge: circular references are rejected', async () => {
  const { payloadTooLarge } = await loadCoachSessionsRoute();
  const circular: Record<string, unknown> = { a: 1 };
  circular.self = circular;
  // JSON.stringify throws on cycles; the helper should treat that as
  // "don't accept this" rather than crash the route.
  assert.equal(payloadTooLarge(circular), true);
});
