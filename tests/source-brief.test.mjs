import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeSourceBriefUrl,
  extractSourceMetaFromHtml,
  buildFallbackSourceBrief,
} = await import('../lib/coach/source-brief.ts');

test('normalizes a public http url and rejects local hosts', () => {
  const url = normalizeSourceBriefUrl('https://example.com/article');
  assert.equal(url.hostname, 'example.com');

  assert.throws(() => normalizeSourceBriefUrl('http://localhost:3000/test'));
  assert.throws(() => normalizeSourceBriefUrl('http://192.168.1.10/test'));
});

test('extracts useful source metadata and readable text from html', () => {
  const html = `
    <html>
      <head>
        <title>Vector Basics</title>
        <meta name="description" content="An introduction to vector operations for students." />
        <meta property="og:site_name" content="Math Notes" />
      </head>
      <body>
        <main>
          <article>
            <h1>Vector Basics</h1>
            <p>Vectors help describe magnitude and direction in physics and mathematics. Students use them to model motion, force, and geometry problems in a structured way.</p>
            <p>The dot product compares how much two vectors point in the same direction, while the cross product is useful for area and orientation in three dimensions.</p>
            <p>Understanding components, magnitude, and direction makes later topics like projections and mechanics much easier.</p>
          </article>
        </main>
      </body>
    </html>
  `;

  const meta = extractSourceMetaFromHtml(html, new URL('https://example.com/vectors'));
  assert.equal(meta.title, 'Vector Basics');
  assert.equal(meta.siteName, 'Math Notes');
  assert.match(meta.description ?? '', /introduction to vector operations/i);
  assert.match(meta.extractedText, /dot product compares/i);
  assert.ok(meta.wordCount > 40);

  const brief = buildFallbackSourceBrief(meta, 'https://example.com/vectors');
  assert.equal(brief.url, 'https://example.com/vectors');
  assert.ok(brief.summary.length > 20);
  assert.ok(brief.keyPoints.length >= 1);
});
