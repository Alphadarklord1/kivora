import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeSourceBriefUrl,
  extractSourceMetaFromHtml,
  extractSourceMetaFromText,
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
  assert.equal(brief.sourceType, 'url');
  assert.ok(brief.summary.length > 20);
  assert.ok(brief.keyPoints.length >= 1);
});

test('builds usable source metadata from pasted manual text', () => {
  const meta = extractSourceMetaFromText(
    'Photosynthesis is the process plants use to convert light energy into chemical energy. ' +
    'Students usually study chloroplasts, chlorophyll, the role of carbon dioxide, and the glucose produced during the process. ' +
    'It matters because it supports food chains and oxygen production in ecosystems.',
    'Photosynthesis basics',
  );

  assert.equal(meta.title, 'Photosynthesis basics');
  assert.equal(meta.siteName, 'Manual text');
  assert.ok(meta.wordCount >= 30);

  const brief = buildFallbackSourceBrief(meta, 'manual://text', 'manual-text');
  assert.equal(brief.sourceType, 'manual-text');
  assert.equal(brief.sourceLabel, 'Manual text');
  assert.match(brief.summary, /Photosynthesis/i);
});

test('preserves uploaded file provenance when building a source brief', () => {
  const meta = extractSourceMetaFromText(
    'The assignment sheet explains the report brief, expected structure, required sources, and the marking criteria the student needs to address. ' +
    'It also tells the student how the conclusion should connect back to the evidence and how references should be presented.',
    'Assignment brief',
  );

  const brief = buildFallbackSourceBrief(meta, 'file:///assignment-brief.pdf', 'file', 'assignment-brief.pdf');
  assert.equal(brief.sourceType, 'file');
  assert.equal(brief.sourceLabel, 'assignment-brief.pdf');
  assert.match(brief.summary, /assignment/i);
});
