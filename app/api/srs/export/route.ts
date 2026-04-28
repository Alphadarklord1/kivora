import { NextRequest } from 'next/server';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import initSqlJs from 'sql.js';
import JSZip from 'jszip';

type ExportCard = {
  id: string;
  front: string;
  back: string;
};

function toGuid() {
  return randomBytes(8).toString('base64url');
}

function checksum(value: string) {
  const hex = createHash('sha1').update(value).digest('hex');
  return parseInt(hex.slice(0, 8), 16);
}

function sanitizeFilename(value: string, ext: string) {
  const base = value.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'deck';
  return `${base}.${ext}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    deckName?: string;
    description?: string;
    cards?: ExportCard[];
  } | null;

  if (!body?.deckName || !Array.isArray(body.cards) || body.cards.length === 0) {
    return new Response(JSON.stringify({ error: 'deckName and cards are required' }), { status: 400 });
  }

  // sql.js needs its wasm file at runtime. node_modules path works in
  // local dev and traditional deploys but Vercel serverless can't always
  // see node_modules at runtime — the bundler may not include it. Fall
  // back to the public CDN if the local path fails so .apkg export keeps
  // working in production.
  let SQL;
  try {
    SQL = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
    });
  } catch {
    SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
  }

  const db = new SQL.Database();
  db.run(`
    CREATE TABLE col (
      id integer primary key,
      crt integer not null,
      mod integer not null,
      scm integer not null,
      ver integer not null,
      dty integer not null,
      usn integer not null,
      ls integer not null,
      conf text not null,
      models text not null,
      decks text not null,
      dconf text not null,
      tags text not null
    );
    CREATE TABLE notes (
      id integer primary key,
      guid text not null,
      mid integer not null,
      mod integer not null,
      usn integer not null,
      tags text not null,
      flds text not null,
      sfld integer not null,
      csum integer not null,
      flags integer not null,
      data text not null
    );
    CREATE TABLE cards (
      id integer primary key,
      nid integer not null,
      did integer not null,
      ord integer not null,
      mod integer not null,
      usn integer not null,
      type integer not null,
      queue integer not null,
      due integer not null,
      ivl integer not null,
      factor integer not null,
      reps integer not null,
      lapses integer not null,
      left integer not null,
      odue integer not null,
      odid integer not null,
      flags integer not null,
      data text not null
    );
    CREATE TABLE revlog (
      id integer primary key,
      cid integer not null,
      usn integer not null,
      ease integer not null,
      ivl integer not null,
      lastIvl integer not null,
      factor integer not null,
      time integer not null,
      type integer not null
    );
    CREATE TABLE graves (
      usn integer not null,
      oid integer not null,
      type integer not null
    );
    CREATE INDEX ix_notes_usn on notes (usn);
    CREATE INDEX ix_cards_usn on cards (usn);
    CREATE INDEX ix_revlog_usn on revlog (usn);
    CREATE INDEX ix_cards_nid on cards (nid);
    CREATE INDEX ix_cards_sched on cards (did, queue, due);
  `);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const nowMillis = Date.now();
  const modelId = 1607392319;
  const deckId = 1;

  const models = {
    [modelId]: {
      id: modelId,
      name: 'Kivora Basic',
      type: 0,
      mod: nowSeconds,
      usn: 0,
      sortf: 0,
      did: deckId,
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}<hr id="answer">{{Back}}',
        },
      ],
      flds: [
        { name: 'Front', ord: 0, sticky: false, rtl: false, font: 'Arial', size: 20 },
        { name: 'Back', ord: 1, sticky: false, rtl: false, font: 'Arial', size: 20 },
      ],
      css: '.card { font-family: Arial; font-size: 20px; text-align: left; color: black; background-color: white; }',
      latexPre: '',
      latexPost: '',
      latexsvg: false,
      req: [[0, 'all', [0]]],
    },
  };

  const decks = {
    [deckId]: {
      id: deckId,
      name: body.deckName,
      desc: body.description ?? '',
      mod: nowSeconds,
      usn: 0,
      collapsed: false,
      browserCollapsed: false,
      newToday: [0, 0],
      revToday: [0, 0],
      lrnToday: [0, 0],
      timeToday: [0, 0],
      dyn: 0,
      extendNew: 0,
      extendRev: 0,
      conf: 1,
      descPlain: body.description ?? '',
    },
  };

  db.run(
    `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
     VALUES (?, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, '')`,
    [
      1,
      nowSeconds,
      nowSeconds,
      nowMillis,
      JSON.stringify({ nextPos: 1 }),
      JSON.stringify(models),
      JSON.stringify(decks),
      JSON.stringify({}),
    ],
  );

  const noteStmt = db.prepare(`
    INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
    VALUES (?, ?, ?, ?, 0, '', ?, ?, ?, 0, '')
  `);
  const cardStmt = db.prepare(`
    INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
    VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 2500, 0, 0, 0, 0, 0, 0, '')
  `);

  body.cards.forEach((card, index) => {
    const noteId = nowMillis + index * 2 + 1;
    const cardId = nowMillis + index * 2 + 2;
    const front = card.front.trim();
    const back = card.back.trim();
    const fields = `${front}\u001f${back}`;
    noteStmt.run([noteId, toGuid(), modelId, nowSeconds, fields, front, checksum(front)]);
    cardStmt.run([cardId, noteId, deckId, nowSeconds, index + 1]);
  });

  noteStmt.free();
  cardStmt.free();

  try {
    const zip = new JSZip();
    zip.file('collection.anki2', Buffer.from(db.export()));
    zip.file('media', JSON.stringify({}));
    const apkg = await zip.generateAsync({ type: 'uint8array' });
    const filename = sanitizeFilename(body.deckName, 'apkg');
    const bodyBuffer = Buffer.from(apkg);

    return new Response(bodyBuffer, {
      headers: {
        'Content-Type': 'application/apkg',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Last-mile zip failure — return JSON so the client's catch path
    // shows a helpful toast instead of a generic 500 with empty body.
    console.error('[srs/export] zip build failed', err);
    return new Response(
      JSON.stringify({ error: 'Failed to package the .apkg file. Try CSV export instead.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
