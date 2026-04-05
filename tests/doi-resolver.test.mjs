/**
 * Tests for lib/coach/doi.ts
 * Covers: normalizeArxivId, resolveDoi, resolveArxiv, resolveIdentifier.
 * Network calls are mocked — no actual HTTP requests are made.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── normalizeArxivId (pure — no mock needed) ─────────────────────────────────

const { normalizeArxivId } = await import('../lib/coach/doi.ts');

test('normalizeArxivId: bare numeric ID', () => {
  assert.equal(normalizeArxivId('2301.07041'), '2301.07041');
});

test('normalizeArxivId: arxiv: prefix', () => {
  assert.equal(normalizeArxivId('arxiv:2301.07041'), '2301.07041');
});

test('normalizeArxivId: arXiv: prefix case-insensitive', () => {
  assert.equal(normalizeArxivId('arXiv:2301.07041v2'), '2301.07041');
});

test('normalizeArxivId: strips version suffix', () => {
  assert.equal(normalizeArxivId('2301.07041v3'), '2301.07041');
});

test('normalizeArxivId: arxiv.org abs URL', () => {
  assert.equal(normalizeArxivId('https://arxiv.org/abs/2301.07041'), '2301.07041');
});

test('normalizeArxivId: arxiv.org pdf URL', () => {
  assert.equal(normalizeArxivId('https://arxiv.org/pdf/2301.07041'), '2301.07041');
});

test('normalizeArxivId: plain DOI returns null', () => {
  assert.equal(normalizeArxivId('10.1038/nature12345'), null);
});

test('normalizeArxivId: empty string returns null', () => {
  assert.equal(normalizeArxivId(''), null);
});

// ── resolveDoi — fetch mocked ─────────────────────────────────────────────────

const crossRefPayload = {
  message: {
    title: ['Attention Is All You Need'],
    author: [
      { family: 'Vaswani', given: 'Ashish' },
      { family: 'Shazeer', given: 'Noam' },
    ],
    'container-title': ['Advances in Neural Information Processing Systems'],
    published: { 'date-parts': [[2017]] },
    URL: 'https://doi.org/10.5555/3295222.3295349',
    abstract: '<jats:p>The dominant sequence transduction models...</jats:p>',
  },
};

test('resolveDoi: maps CrossRef response to ResolvedPaper', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => crossRefPayload,
  }));

  const { resolveDoi } = await import('../lib/coach/doi.ts');
  const paper = await resolveDoi('10.5555/3295222.3295349');

  assert.equal(paper.title, 'Attention Is All You Need');
  assert.equal(paper.authors, 'Vaswani, Ashish; Shazeer, Noam');
  assert.equal(paper.journal, 'Advances in Neural Information Processing Systems');
  assert.equal(paper.year, 2017);
  assert.equal(paper.sourceType, 'doi');
  assert.equal(paper.doi, '10.5555/3295222.3295349');
  // abstract should have jats tags stripped
  assert.ok(!paper.abstract.includes('<jats:'));
});

test('resolveDoi: strips doi.org URL prefix before fetch', async (t) => {
  let capturedUrl = '';
  t.mock.method(globalThis, 'fetch', async (url) => {
    capturedUrl = url;
    return { ok: true, json: async () => crossRefPayload };
  });

  const { resolveDoi } = await import('../lib/coach/doi.ts');
  await resolveDoi('https://doi.org/10.5555/3295222.3295349');
  assert.ok(capturedUrl.includes('10.5555'));
  assert.ok(!capturedUrl.includes('doi.org/10.5555/doi.org'));
});

test('resolveDoi: throws on non-OK response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  const { resolveDoi } = await import('../lib/coach/doi.ts');
  await assert.rejects(() => resolveDoi('10.9999/bad'), /DOI not found/);
});

// ── resolveArxiv — fetch mocked ───────────────────────────────────────────────

const arxivXml = `<?xml version="1.0"?>
<feed>
  <entry>
    <title>BERT: Pre-training of Deep Bidirectional Transformers</title>
    <author><name>Jacob Devlin</name></author>
    <author><name>Ming-Wei Chang</name></author>
    <summary>We introduce BERT...</summary>
    <published>2018-10-11T00:00:00Z</published>
  </entry>
</feed>`;

test('resolveArxiv: parses Atom XML response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    text: async () => arxivXml,
  }));

  const { resolveArxiv } = await import('../lib/coach/doi.ts');
  const paper = await resolveArxiv('1810.04805');

  assert.equal(paper.title, 'BERT: Pre-training of Deep Bidirectional Transformers');
  assert.equal(paper.authors, 'Jacob Devlin; Ming-Wei Chang');
  assert.equal(paper.year, 2018);
  assert.equal(paper.journal, 'arXiv');
  assert.equal(paper.sourceType, 'arxiv');
  assert.equal(paper.doi, null);
  assert.ok(paper.url.includes('1810.04805'));
});

test('resolveArxiv: throws on invalid arXiv ID', async () => {
  const { resolveArxiv } = await import('../lib/coach/doi.ts');
  await assert.rejects(() => resolveArxiv('not-an-arxiv-id'), /valid arXiv/);
});

// ── resolveIdentifier: dispatch logic ─────────────────────────────────────────

test('resolveIdentifier: routes arXiv ID to resolveArxiv', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    text: async () => arxivXml,
  }));

  const { resolveIdentifier } = await import('../lib/coach/doi.ts');
  const paper = await resolveIdentifier('1810.04805');
  assert.equal(paper.sourceType, 'arxiv');
});

test('resolveIdentifier: routes DOI to resolveDoi', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => crossRefPayload,
  }));

  const { resolveIdentifier } = await import('../lib/coach/doi.ts');
  const paper = await resolveIdentifier('10.5555/3295222.3295349');
  assert.equal(paper.sourceType, 'doi');
});
