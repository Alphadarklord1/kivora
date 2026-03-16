import path from 'node:path';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';

export type ImportedCard = { front: string; back: string };

const BLOCK_SEPARATOR = '\n---\n';
const ANKI_FIELD_SEPARATOR = '\u001f';
const HEADER_FRONT_KEYS = ['front', 'term', 'question', 'prompt', 'concept'];
const HEADER_BACK_KEYS = ['back', 'definition', 'answer', 'response', 'meaning', 'explanation'];

function decodeEntities(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function normalizeText(value: string) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueCards(cards: ImportedCard[]) {
  const unique = new Map<string, ImportedCard>();
  for (const card of cards) {
    const front = normalizeText(card.front);
    const back = normalizeText(card.back);
    if (!front || !back) continue;
    unique.set(`${front}:::${back}`, { front, back });
  }
  return Array.from(unique.values()).slice(0, 5000);
}

function parseStructuredFlashcards(content: string): ImportedCard[] {
  const pipeLines = content
    .split(/\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
    .filter((line) => /front:/i.test(line) && /back:/i.test(line));

  if (pipeLines.length > 0) {
    return uniqueCards(
      pipeLines.map((line) => ({
        front: (line.match(/front:\s*(.*?)(?:\s*\|\s*back:|$)/i)?.[1] ?? '').trim(),
        back: (line.match(/back:\s*(.*?)$/i)?.[1] ?? '').trim(),
      })),
    );
  }

  return uniqueCards(
    content
      .split(/---+/)
      .map((block) => ({
        front: block.match(/\*?\*?Front:\*?\*?\s*([\s\S]*?)(?=\*?\*?Back:|$)/i)?.[1]?.trim() ?? '',
        back: block.match(/\*?\*?Back:\*?\*?\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '',
      })),
  );
}

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^\uFEFF/, '').trim());
}

function detectDelimiter(lines: string[]) {
  const samples = lines.filter((line) => line.trim()).slice(0, 6);
  const delimiters = [',', '\t', ';', '|'];
  let winner = ',';
  let bestScore = -1;

  for (const delimiter of delimiters) {
    const score = samples.reduce((sum, line) => sum + Math.max(splitCsvLine(line, delimiter).length - 1, 0), 0);
    if (score > bestScore) {
      bestScore = score;
      winner = delimiter;
    }
  }

  return winner;
}

function headerIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((value) => candidates.some((candidate) => value.includes(candidate)));
}

export function cardsToDeckContent(cards: ImportedCard[]) {
  return uniqueCards(cards)
    .map((card) => `Front: ${card.front}\nBack: ${card.back}`)
    .join(BLOCK_SEPARATOR);
}

export function inferDeckTitle(title: string | null | undefined, fallback: string) {
  const cleaned = normalizeText(title ?? '');
  return cleaned || fallback;
}

export function parseCsvFlashcards(text: string) {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines);
  const rows = lines.map((line) => splitCsvLine(line, delimiter)).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length === 0) return [];

  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const frontColumn = headerIndex(headers, HEADER_FRONT_KEYS);
  const backColumn = headerIndex(headers, HEADER_BACK_KEYS);

  const hasHeaders = frontColumn >= 0 && backColumn >= 0;
  const records = hasHeaders ? rows.slice(1) : rows;
  const firstColumn = frontColumn >= 0 ? frontColumn : 0;
  const secondColumn = backColumn >= 0 ? backColumn : 1;

  return uniqueCards(records.map((row) => ({
    front: row[firstColumn] ?? '',
    back: row[secondColumn] ?? '',
  })));
}

export function parsePastedFlashcards(text: string) {
  const structured = parseStructuredFlashcards(text);
  if (structured.length > 0) return structured;

  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const delimitedCards: ImportedCard[] = [];
  for (const line of lines) {
    const tabParts = line.split('\t').map((part) => part.trim()).filter(Boolean);
    if (tabParts.length >= 2) {
      delimitedCards.push({ front: tabParts[0], back: tabParts.slice(1).join(' ') });
      continue;
    }

    const separatorPatterns = [
      /\s*::\s*/,
      /\s+\|\s+/,
      /\s+—\s+/,
      /\s+–\s+/,
      /\s+-\s+/,
    ];

    for (const pattern of separatorPatterns) {
      const pieces = line.split(pattern).map((part) => part.trim()).filter(Boolean);
      if (pieces.length >= 2) {
        delimitedCards.push({ front: pieces[0], back: pieces.slice(1).join(' ') });
        break;
      }
    }
  }

  if (delimitedCards.length > 0) return uniqueCards(delimitedCards);

  if (lines.length % 2 === 0) {
    const alternatingCards: ImportedCard[] = [];
    for (let index = 0; index < lines.length; index += 2) {
      alternatingCards.push({ front: lines[index], back: lines[index + 1] });
    }
    return uniqueCards(alternatingCards);
  }

  return [];
}

function fileNameToTitle(fileName: string | undefined, fallback: string) {
  const trimmed = (fileName ?? '').trim();
  if (!trimmed) return fallback;
  return inferDeckTitle(trimmed.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), fallback);
}

export async function parseAnkiApkg(base64: string, fileName?: string) {
  const cleanBase64 = base64.replace(/^data:.*?;base64,/, '').trim();
  if (!cleanBase64) return { title: fileNameToTitle(fileName, 'Imported Anki deck'), cards: [] as ImportedCard[] };

  const zip = await JSZip.loadAsync(Buffer.from(cleanBase64, 'base64'));
  const collectionFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collectionFile) throw new Error('Could not find an Anki collection inside this .apkg file');

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
  });

  const sqliteBytes = await collectionFile.async('uint8array');
  const db = new SQL.Database(sqliteBytes);

  const notesResult = (db as unknown as {
    exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  }).exec('SELECT flds FROM notes');

  const cards = uniqueCards(
    (notesResult[0]?.values ?? [])
      .map((row) => String(row[0] ?? ''))
      .map((fields) => fields.split(ANKI_FIELD_SEPARATOR))
      .filter((fields) => fields.length >= 2)
      .map((fields) => ({
        front: fields[0] ?? '',
        back: fields[1] ?? '',
      })),
  );

  const deckMetaResult = (db as unknown as {
    exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  }).exec('SELECT decks FROM col LIMIT 1');

  let deckTitle = fileNameToTitle(fileName, 'Imported Anki deck');
  const deckJson = deckMetaResult[0]?.values?.[0]?.[0];
  if (typeof deckJson === 'string') {
    try {
      const parsed = JSON.parse(deckJson) as Record<string, { name?: string }>;
      const candidate = Object.values(parsed)
        .map((deck) => normalizeText(deck?.name ?? ''))
        .find((name) => name && name !== 'Default');
      if (candidate) deckTitle = candidate;
    } catch {
      // Keep the filename-based title when deck metadata cannot be parsed.
    }
  }

  return {
    title: deckTitle,
    cards,
  };
}
