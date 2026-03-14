const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 140;
export const RAG_EMBEDDING_VERSION = 'kivora-semantic-hash-v2';

export interface RAGChunk {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface RetrievedChunk extends RAGChunk {
  score: number;
  label: string;
  preview: string;
}

export interface IndexedRAGChunk extends RAGChunk {
  preview: string;
  vector: number[];
}

export interface RAGIndex {
  fileId: string;
  signature: string;
  embeddingVersion: string;
  chunkCount: number;
  updatedAt: string;
  persistedAt?: string;
  chunks: IndexedRAGChunk[];
}

const VECTOR_DIMENSIONS = 384;

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, '').replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').trim();
}

function splitParagraphs(text: string) {
  return text
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => normalizeWhitespace(block))
    .filter(Boolean);
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function makePreview(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function addWeightedFeature(target: Map<string, number>, feature: string, weight: number) {
  target.set(feature, (target.get(feature) ?? 0) + weight);
}

function buildFeatureWeights(text: string) {
  const weights = new Map<string, number>();
  const words = tokenize(text);

  for (const word of words) {
    addWeightedFeature(weights, `w:${word}`, 1);
  }

  for (let index = 0; index < words.length - 1; index += 1) {
    addWeightedFeature(weights, `b:${words[index]}_${words[index + 1]}`, 1.6);
  }

  for (const word of words) {
    if (word.length < 4) continue;
    for (let index = 0; index <= word.length - 3; index += 1) {
      addWeightedFeature(weights, `c:${word.slice(index, index + 3)}`, 0.35);
    }
  }

  const heading = tokenize(text.split('\n')[0] ?? '');
  for (const token of heading) {
    addWeightedFeature(weights, `h:${token}`, 1.35);
    addWeightedFeature(weights, `w:${token}`, 0.65);
  }

  return weights;
}

function buildVector(features: Map<string, number>) {
  const vector = Array(VECTOR_DIMENSIONS).fill(0) as number[];

  for (const [feature, rawWeight] of features) {
    const weight = 1 + Math.log1p(rawWeight);
    const primaryHash = hashToken(feature);
    const secondaryHash = hashToken(`mirror:${feature}`);

    const primaryIndex = primaryHash % VECTOR_DIMENSIONS;
    const secondaryIndex = secondaryHash % VECTOR_DIMENSIONS;
    const primarySign = (primaryHash & 1) === 0 ? 1 : -1;
    const secondarySign = (secondaryHash & 1) === 0 ? 1 : -1;

    vector[primaryIndex] += weight * primarySign;
    vector[secondaryIndex] += weight * 0.5 * secondarySign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(left: number[], right: number[]) {
  let score = 0;
  const size = Math.min(left.length, right.length);
  for (let i = 0; i < size; i += 1) {
    score += left[i] * right[i];
  }
  return score;
}

export function getDocumentSignature(text: string) {
  const normalized = normalizeWhitespace(text);
  const prefix = normalized.slice(0, 160);
  const suffix = normalized.slice(-160);
  return `${normalized.length}:${hashToken(`${prefix}::${suffix}`)}`;
}

export function isCompatibleRagIndex(index: RAGIndex | null | undefined, signature?: string): index is RAGIndex {
  if (!index) return false;
  if (index.embeddingVersion !== RAG_EMBEDDING_VERSION) return false;
  if (signature && index.signature !== signature) return false;
  return true;
}

export function chunkDocument(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP): RAGChunk[] {
  const source = text.replace(/\r/g, '').trim();
  if (!source) return [];

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) {
    return [{ id: 'chunk-1', text: source, start: 0, end: source.length }];
  }

  const chunks: RAGChunk[] = [];
  let cursor = 0;
  let buffer = '';
  let chunkStart = 0;

  const flush = (chunkText: string, start: number) => {
    const cleaned = chunkText.trim();
    if (!cleaned) return;
    const end = start + cleaned.length;
    chunks.push({
      id: `chunk-${chunks.length + 1}`,
      text: cleaned,
      start,
      end,
    });
  };

  for (const paragraph of paragraphs) {
    const nextBlock = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (nextBlock.length <= chunkSize || !buffer) {
      if (!buffer) chunkStart = cursor;
      buffer = nextBlock;
      cursor += paragraph.length + 2;
      continue;
    }

    flush(buffer, chunkStart);

    const overlapText = buffer.slice(Math.max(0, buffer.length - overlap)).trim();
    buffer = overlapText ? `${overlapText}\n\n${paragraph}` : paragraph;
    chunkStart = Math.max(0, cursor - overlapText.length);
    cursor += paragraph.length + 2;
  }

  flush(buffer, chunkStart);
  return chunks;
}

export function buildRagIndex(fileId: string, text: string): RAGIndex {
  const chunks = chunkDocument(text).map((chunk) => {
    return {
      ...chunk,
      preview: makePreview(chunk.text),
      vector: buildVector(buildFeatureWeights(chunk.text)),
    };
  });

  return {
    fileId,
    signature: getDocumentSignature(text),
    embeddingVersion: RAG_EMBEDDING_VERSION,
    chunkCount: chunks.length,
    updatedAt: new Date().toISOString(),
    chunks,
  };
}

function scoreChunk(chunk: RAGChunk, queryTokens: string[], queryText: string) {
  const haystack = chunk.text.toLowerCase();
  const chunkTokens = tokenize(chunk.text);
  const tokenCounts = new Map<string, number>();

  for (const token of chunkTokens) {
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  }

  let score = 0;
  let coveredTerms = 0;
  for (const token of queryTokens) {
    const hits = tokenCounts.get(token) ?? 0;
    if (hits > 0) {
      coveredTerms += 1;
      score += 3 + Math.min(hits, 4);
      const firstPosition = haystack.indexOf(token);
      if (firstPosition >= 0 && firstPosition < 120) score += 0.6;
    }
  }

  if (queryText.length > 12 && haystack.includes(queryText.toLowerCase())) {
    score += 8;
  }

  const firstLine = chunk.text.split('\n')[0]?.toLowerCase() ?? '';
  for (const token of queryTokens) {
    if (firstLine.includes(token)) score += 1.5;
  }

  if (queryTokens.length > 0) {
    score += (coveredTerms / queryTokens.length) * 4;
  }

  return score;
}

function scoreIndexedChunk(chunk: IndexedRAGChunk, queryTokens: string[], queryText: string, queryVector: number[]) {
  const lexicalScore = scoreChunk(chunk, queryTokens, queryText);
  const semanticScore = cosineSimilarity(chunk.vector, queryVector) * 12;
  return lexicalScore + semanticScore;
}

function selectDiverseChunks(
  scored: Array<{ chunk: IndexedRAGChunk; score: number }>,
  limit: number,
) {
  if (scored.length <= limit) return scored;

  const highestScore = Math.max(...scored.map(({ score }) => score), 1);
  const remaining = [...scored];
  const selected: Array<{ chunk: IndexedRAGChunk; score: number }> = [];

  while (remaining.length > 0 && selected.length < limit) {
    if (selected.length === 0) {
      selected.push(remaining.shift()!);
      continue;
    }

    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const normalizedScore = candidate.score / highestScore;
      const redundancy = Math.max(
        ...selected.map(({ chunk }) => cosineSimilarity(candidate.chunk.vector, chunk.vector)),
      );
      const mmrScore = normalizedScore * 0.82 - redundancy * 0.18;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = index;
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0]);
  }

  return selected;
}

export function retrieveFromIndex(index: RAGIndex, query: string, limit = 5): RetrievedChunk[] {
  const normalizedQuery = normalizeWhitespace(query);
  const queryTokens = tokenize(normalizedQuery);
  const queryVector = buildVector(buildFeatureWeights(normalizedQuery));

  const scored = selectDiverseChunks(index.chunks
    .map((chunk) => ({
      chunk,
      score: queryTokens.length > 0 ? scoreIndexedChunk(chunk, queryTokens, normalizedQuery, queryVector) : 0,
    }))
    .sort((a, b) => b.score - a.score || a.chunk.start - b.chunk.start), limit)
    .map(({ chunk, score }, indexPosition) => ({
      id: chunk.id,
      text: chunk.text,
      start: chunk.start,
      end: chunk.end,
      preview: chunk.preview,
      score,
      label: `S${indexPosition + 1}`,
    }));

  return scored;
}

export function retrieveRelevantChunks(text: string, query: string, limit = 5): RetrievedChunk[] {
  const index = buildRagIndex('ad-hoc', text);
  const scored = retrieveFromIndex(index, query, limit).filter(({ score }) => score > 0);

  if (scored.length > 0) return scored;

  return index.chunks.slice(0, Math.min(limit, index.chunks.length)).map((chunk, indexPosition) => ({
    ...chunk,
    score: 0,
    label: `S${indexPosition + 1}`,
  }));
}

export function buildRagContext(sources: RetrievedChunk[]) {
  return sources
    .map((source) => `[${source.label}] ${source.text}`)
    .join('\n\n');
}

export function buildBalancedDocumentContext(text: string, limit = 6) {
  const index = buildRagIndex('balanced', text);
  if (index.chunks.length <= limit) {
    return index.chunks.map((chunk, indexPosition) => ({
      ...chunk,
      score: 0,
      label: `S${indexPosition + 1}`,
    }));
  }

  const picked: RetrievedChunk[] = [];
  const indexes = new Set<number>([0, index.chunks.length - 1]);
  const step = (index.chunks.length - 1) / Math.max(1, limit - 1);

  for (let i = 1; i < limit - 1; i += 1) {
    indexes.add(Math.min(index.chunks.length - 1, Math.round(i * step)));
  }

  Array.from(indexes)
    .sort((a, b) => a - b)
    .slice(0, limit)
    .forEach((chunkIndex, idx) => {
      const chunk = index.chunks[chunkIndex];
      picked.push({
        ...chunk,
        score: 0,
        label: `S${idx + 1}`,
        preview: makePreview(chunk.text),
      });
    });

  return picked;
}
