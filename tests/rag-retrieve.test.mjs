import test from 'node:test';
import assert from 'node:assert/strict';

test('retrieveRelevantChunks ranks matching chunks first', async () => {
  const mod = await import(`../lib/rag/retrieve.ts?t=${Date.now()}-${Math.random()}`);
  const text = [
    'Chapter 1\nPhotosynthesis converts light energy into chemical energy in plants.',
    'Chapter 2\nCellular respiration breaks down glucose to release ATP.',
    'Chapter 3\nMitosis produces two genetically identical daughter cells.',
  ].join('\n\n');

  const results = mod.retrieveRelevantChunks(text, 'How does photosynthesis work?', 2);

  assert.ok(results.length >= 1);
  assert.match(results[0].text, /Photosynthesis/i);
  assert.equal(results[0].label, 'S1');
});

test('buildBalancedDocumentContext samples across a long document', async () => {
  const mod = await import(`../lib/rag/retrieve.ts?t=${Date.now()}-${Math.random()}`);
  const text = Array.from(
    { length: 12 },
    (_, index) => `Section ${index + 1}\n${`This is content block number ${index + 1}. It contains study material and supporting detail. `.repeat(18)}`,
  ).join('\n\n');

  const sources = mod.buildBalancedDocumentContext(text, 4);

  assert.equal(sources.length, 4);
  assert.equal(sources[0].label, 'S1');
  assert.match(sources[0].text, /Section 1/);
  assert.match(sources.at(-1).text, /Section 12/);
});

test('buildRagIndex and retrieveFromIndex support reusable retrieval', async () => {
  const mod = await import(`../lib/rag/retrieve.ts?t=${Date.now()}-${Math.random()}`);
  const text = [
    'Kinematics studies motion, displacement, velocity, and acceleration.',
    'Dynamics explains forces, Newton laws, and interactions between bodies.',
    'Thermodynamics studies heat, energy transfer, and entropy.',
  ].join('\n\n');

  const index = mod.buildRagIndex('physics', text);
  const results = mod.retrieveFromIndex(index, 'What is acceleration in kinematics?', 2);

  assert.equal(index.fileId, 'physics');
  assert.ok(index.signature.length > 0);
  assert.equal(index.embeddingVersion, mod.RAG_EMBEDDING_VERSION);
  assert.ok(results.length >= 1);
  assert.match(results[0].text, /Kinematics/i);
});

test('retrieveFromIndex supports Arabic document queries', async () => {
  const mod = await import(`../lib/rag/retrieve.ts?t=${Date.now()}-${Math.random()}`);
  const text = [
    'الفصل الأول\nالتمثيل الضوئي يحول الطاقة الضوئية إلى طاقة كيميائية داخل النبات.',
    'الفصل الثاني\nالتنفس الخلوي يطلق الطاقة من الجلوكوز لإنتاج ATP.',
  ].join('\n\n');

  const index = mod.buildRagIndex('arabic-biology', text);
  const results = mod.retrieveFromIndex(index, 'كيف يعمل التمثيل الضوئي؟', 2);

  assert.ok(results.length >= 1);
  assert.match(results[0].text, /التمثيل الضوئي/);
});
