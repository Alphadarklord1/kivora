import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

test('parseCsvFlashcards supports header-based CSV imports', async () => {
  const mod = await import(`../lib/srs/importers.ts?t=${Date.now()}-${Math.random()}`);
  const cards = mod.parseCsvFlashcards([
    'Term,Definition',
    'Cell,Basic unit of life',
    'Mitochondria,Powerhouse of the cell',
  ].join('\n'));

  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], { front: 'Cell', back: 'Basic unit of life' });
});

test('parsePastedFlashcards supports separator-based and alternating-line imports', async () => {
  const mod = await import(`../lib/srs/importers.ts?t=${Date.now()}-${Math.random()}`);
  const separated = mod.parsePastedFlashcards('Vector :: Quantity with magnitude and direction\nMatrix :: Rectangular array of numbers');
  assert.equal(separated.length, 2);
  assert.equal(separated[1].front, 'Matrix');

  const alternating = mod.parsePastedFlashcards('Photosynthesis\nConverts light into chemical energy\nRespiration\nReleases energy from glucose');
  assert.equal(alternating.length, 2);
  assert.equal(alternating[0].back, 'Converts light into chemical energy');
});

test('cardsToDeckContent emits parseable block content', async () => {
  const mod = await import(`../lib/srs/importers.ts?t=${Date.now()}-${Math.random()}`);
  const content = mod.cardsToDeckContent([
    { front: 'Term 1', back: 'Definition 1' },
    { front: 'Term 2', back: 'Definition 2' },
  ]);

  assert.match(content, /Front: Term 1/);
  assert.match(content, /Back: Definition 2/);
  assert.match(content, /---/);
});

test('parseAnkiApkg extracts front/back cards from a simple package', async () => {
  const mod = await import(`../lib/srs/importers.ts?t=${Date.now()}-${Math.random()}`);
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
  });

  const db = new SQL.Database();
  db.run('CREATE TABLE col (decks text not null);');
  db.run('CREATE TABLE notes (flds text not null);');
  db.run('INSERT INTO col (decks) VALUES (?)', [JSON.stringify({ 1: { name: 'Biology Import' } })]);
  db.run('INSERT INTO notes (flds) VALUES (?)', [`Cell\u001fBasic unit of life`]);
  db.run('INSERT INTO notes (flds) VALUES (?)', [`ATP\u001fEnergy currency of the cell`]);

  const zip = new JSZip();
  zip.file('collection.anki2', Buffer.from(db.export()));
  zip.file('media', JSON.stringify({}));
  const apkg = await zip.generateAsync({ type: 'base64' });

  const imported = await mod.parseAnkiApkg(apkg, 'biology.apkg');

  assert.equal(imported.title, 'Biology Import');
  assert.equal(imported.cards.length, 2);
  assert.deepEqual(imported.cards[0], { front: 'Cell', back: 'Basic unit of life' });
});
