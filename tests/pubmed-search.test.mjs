/**
 * Tests for PubMed article search parsing.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

const fetchCalls = [];
const originalFetch = global.fetch;

test('searchPubMed returns structured PubMed suggestions', async () => {
  fetchCalls.length = 0;
  global.fetch = mock.fn(async (url) => {
    fetchCalls.push(String(url));
    if (String(url).includes('esearch.fcgi')) {
      return new Response(JSON.stringify({
        esearchresult: { idlist: ['12345'] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      result: {
        '12345': {
          title: 'A biomarker paper',
          authors: [{ name: 'A. Author' }, { name: 'B. Author' }],
          fulljournalname: 'Journal of Testing',
          pubdate: '2025 Jan',
          articleids: [{ idtype: 'pubmed', value: '12345' }],
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const { searchPubMed } = await import('../lib/coach/articles.ts');
  const results = await searchPubMed('biomarkers', 1);

  assert.equal(results.length, 1);
  assert.equal(results[0].source, 'PubMed');
  assert.match(results[0].url, /pubmed\.ncbi\.nlm\.nih\.gov/);
  assert.match(results[0].title, /A biomarker paper/);
  assert.ok(fetchCalls.some((url) => url.includes('esearch.fcgi')));
  assert.ok(fetchCalls.some((url) => url.includes('esummary.fcgi')));
});

test.after(() => {
  global.fetch = originalFetch;
});

