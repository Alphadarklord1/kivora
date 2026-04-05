'use client';

import { useEffect, useMemo, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Node {
  id: string;
  label: string;
  size: number;
  tfidf: number;
  tier: 0 | 1 | 2;
  /** Library item ids that contain this concept (for tooltip) */
  sourceItemIds: string[];
}

interface Edge {
  from: string;
  to: string;
  coCount: number;
  /** AI-derived label shown at midpoint (only for AI mode) */
  label?: string;
  isAiDerived: boolean;
}

interface LibraryItem {
  id: string;
  content: string;
  mode: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'about','after','also','another','because','been','before','being','between',
  'come','could','does','done','down','each','even','every','from','have','here',
  'just','know','like','make','many','more','most','much','must','need','never',
  'only','other','over','same','some','such','than','that','their','them','then',
  'there','these','they','thing','think','this','those','through','time','under',
  'very','want','well','were','what','when','where','which','while','will','with',
  'would','your','into','from','will','should','shall','using','used','use',
  'also','both','each','either','given','hence','might','often','said','seem',
  'since','still','though','thus','until','upon','whether','within','without',
]);

const TIER_FILL: Record<number, string> = {
  0: 'rgba(99,102,241,0.35)',
  1: 'rgba(16,185,129,0.25)',
  2: 'rgba(245,158,11,0.18)',
};

// ── TF-IDF fallback ───────────────────────────────────────────────────────────

function buildTfidfGraph(items: LibraryItem[]): { nodes: Node[]; edges: Edge[] } {
  const totalItems = items.length;
  const df = new Map<string, number>();
  const tf = new Map<string, number>();
  const coCount = new Map<string, number>();
  const wordItemIds = new Map<string, string[]>();

  // Sliding-window co-occurrence (window = 5 sentences) to avoid spurious
  // edges between words that only share the same long document.
  const WINDOW = 5;

  for (const item of items) {
    // TF-IDF: count unique terms per document
    const docWords = item.content.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const unique   = Array.from(new Set(docWords.filter(w => !STOP_WORDS.has(w))));

    for (const w of unique) {
      df.set(w, (df.get(w) ?? 0) + 1);
      tf.set(w, (tf.get(w) ?? 0) + 1);
      const existing = wordItemIds.get(w) ?? [];
      if (!existing.includes(item.id)) existing.push(item.id);
      wordItemIds.set(w, existing);
    }

    // Co-occurrence: slide a window over sentences, not the whole document
    const itemSentences = item.content.match(/[^.!?\n]+[.!?\n]+/g) ?? [item.content];
    for (let si = 0; si < itemSentences.length; si++) {
      const windowText  = itemSentences.slice(si, si + WINDOW).join(' ').toLowerCase();
      const windowWords = Array.from(
        new Set((windowText.match(/[a-z]{5,}/g) ?? []).filter(w => !STOP_WORDS.has(w))),
      );
      for (let i = 0; i < windowWords.length; i++) {
        for (let j = i + 1; j < windowWords.length; j++) {
          const key = windowWords[i] < windowWords[j]
            ? `${windowWords[i]}|${windowWords[j]}`
            : `${windowWords[j]}|${windowWords[i]}`;
          coCount.set(key, (coCount.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const tfidfMap = new Map<string, number>();
  for (const [word, docCount] of df) {
    const termFreq = (tf.get(word) ?? 0) / Math.max(totalItems, 1);
    const idf = Math.log(Math.max(totalItems, 1) / docCount);
    tfidfMap.set(word, termFreq * idf);
  }

  const top = Array.from(tfidfMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14);

  const topIds = new Set(top.map(([w]) => w));

  const nodes: Node[] = top.map(([label, score], idx) => {
    const tier: 0 | 1 | 2 = idx < 4 ? 0 : idx < 9 ? 1 : 2;
    return {
      id: label,
      label,
      tfidf: score,
      size: Math.min(28, 11 + score * 8),
      tier,
      sourceItemIds: wordItemIds.get(label) ?? [],
    };
  });

  const edges: Edge[] = [];
  for (const [key, count] of coCount) {
    if (count < 2) continue; // require co-occurrence in ≥2 windows to form an edge
    const [a, b] = key.split('|');
    if (!topIds.has(a) || !topIds.has(b)) continue;
    edges.push({ from: a, to: b, coCount: count, isAiDerived: false });
    if (edges.length >= 20) break;
  }

  return { nodes, edges };
}

// ── AI-enhanced graph builder ─────────────────────────────────────────────────

interface AiContent {
  keyTopics?: unknown;
  learningObjectives?: unknown;
}

interface AiApiResponse {
  content?: AiContent;
  fallback?: boolean;
}

function safeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function wordsOf(s: string): string[] {
  return s.toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !STOP_WORDS.has(w)) ?? [];
}

function sharedWords(a: string, b: string): string[] {
  const setA = new Set(wordsOf(a));
  return wordsOf(b).filter(w => setA.has(w));
}

function buildAiGraph(
  keyTopics: string[],
  learningObjectives: string[],
  items: LibraryItem[],
): { nodes: Node[]; edges: Edge[] } {
  // Tier 0 — learning objectives (up to 3, centred)
  // Tier 1 — key topics (up to 8)
  // Tier 2 — sub-words derived from multi-word topic phrases (up to 12)

  const objNodes: string[] = learningObjectives.slice(0, 3);
  const topicNodes: string[] = keyTopics.slice(0, 8);

  // Derive sub-words from multi-word topics not already present as their own node
  const allPrimaryLabels = new Set([...objNodes, ...topicNodes]);
  const subWordCandidates = new Map<string, string[]>(); // subword → parent topics
  for (const topic of topicNodes) {
    const parts = wordsOf(topic).filter(w => w.length >= 5 && !allPrimaryLabels.has(w));
    for (const p of parts) {
      const parents = subWordCandidates.get(p) ?? [];
      parents.push(topic);
      subWordCandidates.set(p, parents);
    }
  }

  // Keep up to 12 sub-words that appear in at least one item's text
  const combinedText = items.map(i => i.content).join(' ').toLowerCase();
  const tier2Labels: string[] = [];
  for (const [sw] of subWordCandidates) {
    if (combinedText.includes(sw) && !allPrimaryLabels.has(sw)) {
      tier2Labels.push(sw);
      if (tier2Labels.length >= 12) break;
    }
  }

  // Build sourceItemIds for each node
  function itemIdsForLabel(label: string): string[] {
    const lower = label.toLowerCase();
    return items
      .filter(item => item.content.toLowerCase().includes(lower))
      .map(item => item.id);
  }

  const nodes: Node[] = [
    ...objNodes.map((label, idx) => ({
      id: `obj_${idx}`,
      label,
      tfidf: 1,
      size: 26,
      tier: 0 as const,
      sourceItemIds: itemIdsForLabel(label),
    })),
    ...topicNodes.map((label, idx) => ({
      id: `topic_${idx}`,
      label,
      tfidf: 0.7,
      size: 20,
      tier: 1 as const,
      sourceItemIds: itemIdsForLabel(label),
    })),
    ...tier2Labels.map((label, idx) => ({
      id: `sub_${idx}`,
      label,
      tfidf: 0.3,
      size: 14,
      tier: 2 as const,
      sourceItemIds: itemIdsForLabel(label),
    })),
  ];

  // Edges
  const edges: Edge[] = [];

  // (a) obj → topic edges via shared words
  for (const objNode of nodes.filter(n => n.tier === 0)) {
    for (const topicNode of nodes.filter(n => n.tier === 1)) {
      const shared = sharedWords(objNode.label, topicNode.label);
      const coOcc = items.filter(
        item =>
          item.content.toLowerCase().includes(objNode.label.toLowerCase().split(' ')[0]) &&
          item.content.toLowerCase().includes(topicNode.label.toLowerCase().split(' ')[0]),
      ).length;
      if (shared.length > 0 || coOcc >= 1) {
        const edgeLabel = shared.length > 0 ? shared[0] : undefined;
        edges.push({
          from: objNode.id,
          to: topicNode.id,
          coCount: coOcc + shared.length,
          label: edgeLabel,
          isAiDerived: true,
        });
      }
    }
  }

  // (b) topic → sub-word edges
  for (const subNode of nodes.filter(n => n.tier === 2)) {
    const parents = subWordCandidates.get(subNode.label) ?? [];
    for (const parentLabel of parents) {
      const parentNode = nodes.find(n => n.tier === 1 && n.label === parentLabel);
      if (parentNode) {
        edges.push({
          from: parentNode.id,
          to: subNode.id,
          coCount: 1,
          label: subNode.label,
          isAiDerived: true,
        });
      }
    }
  }

  // (c) topic → topic co-occurrence edges (max 8)
  const topicArr = nodes.filter(n => n.tier === 1);
  let topicEdgeCount = 0;
  for (let i = 0; i < topicArr.length && topicEdgeCount < 8; i++) {
    for (let j = i + 1; j < topicArr.length && topicEdgeCount < 8; j++) {
      const a = topicArr[i];
      const b = topicArr[j];
      const shared = sharedWords(a.label, b.label);
      const coOcc = items.filter(
        item =>
          item.content.toLowerCase().includes(a.label.toLowerCase().split(' ')[0]) &&
          item.content.toLowerCase().includes(b.label.toLowerCase().split(' ')[0]),
      ).length;
      if (shared.length > 0 || coOcc >= 2) {
        edges.push({
          from: a.id,
          to: b.id,
          coCount: coOcc + shared.length,
          label: shared[0],
          isAiDerived: true,
        });
        topicEdgeCount++;
      }
    }
  }

  return { nodes, edges };
}

// ── Force-directed layout ─────────────────────────────────────────────────────

/** Seeded LCG pseudo-random — same nodes always produce the same layout. */
function seededRng(seed: number): () => number {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= (s >>> 16);
    return (s >>> 0) / 0xffffffff;
  };
}

function computePositions(
  nodes: Node[],
  edges: Edge[],
): Record<string, { x: number; y: number }> {
  if (!nodes.length) return {};

  // Deterministic seed from sorted node IDs so the same graph always produces the same layout
  const seed = nodes.map(n => n.id).sort().join('').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = seededRng(seed);

  // Initialize positions in the center 40% of the canvas
  const state: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
  for (const node of nodes) {
    state[node.id] = { x: 30 + rng() * 40, y: 30 + rng() * 40, vx: 0, vy: 0 };
  }

  const ITERATIONS = 180;
  const REPULSION  = 600;
  const SPRING     = 0.04;
  const IDEAL_DIST = 22;
  const GRAVITY    = 0.012;
  const DAMPING    = 0.82;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const cooling = 1 - iter / ITERATIONS;

    // Dampen velocities
    for (const id of Object.keys(state)) {
      state[id].vx *= DAMPING;
      state[id].vy *= DAMPING;
    }

    // Repulsion between every pair
    const ids = Object.keys(state);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = state[ids[i]], b = state[ids[j]];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (REPULSION / (dist * dist)) * cooling;
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Spring attraction along edges
    for (const edge of edges) {
      const a = state[edge.from], b = state[edge.to];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = SPRING * (dist - IDEAL_DIST);
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Gravity toward center (50, 50)
    for (const id of Object.keys(state)) {
      state[id].vx += (50 - state[id].x) * GRAVITY;
      state[id].vy += (50 - state[id].y) * GRAVITY;
    }

    // Apply and clamp inside [6, 94]
    for (const id of Object.keys(state)) {
      state[id].x = Math.max(6, Math.min(94, state[id].x + state[id].vx));
      state[id].y = Math.max(6, Math.min(94, state[id].y + state[id].vy));
    }
  }

  return Object.fromEntries(Object.keys(state).map(id => [id, { x: state[id].x, y: state[id].y }]));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KnowledgeMap() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [libItems, setLibItems] = useState<LibraryItem[]>([]);
  const [selectedNode, setSelectedNode] = useState<{
    label: string;
    sourceItemIds: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/library?limit=30', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then(async (items: LibraryItem[]) => {
        if (cancelled) return;
        setLibItems(items);
        if (items.length === 0) {
          setNodes([]);
          setEdges([]);
          setLoading(false);
          return;
        }

        // Build combined text for AI call (first 3000 chars)
        const combinedText = items
          .map(i => i.content)
          .join('\n\n')
          .slice(0, 3000);

        let usedAi = false;

        try {
          const aiRes = await fetch('/api/llm/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ text: combinedText, mode: 'notes' }),
          });

          if (aiRes.ok) {
            const aiData = (await aiRes.json()) as AiApiResponse;
            const content = aiData?.content;

            if (content) {
              const keyTopics = safeStringArray(content.keyTopics);
              const learningObjectives = safeStringArray(content.learningObjectives);

              if (keyTopics.length >= 2) {
                const { nodes: n, edges: e } = buildAiGraph(keyTopics, learningObjectives, items);
                if (!cancelled) {
                  setNodes(n);
                  setEdges(e);
                  setAiEnhanced(true);
                  setLoading(false);
                  usedAi = true;
                }
              }
            }
          }
        } catch {
          // fall through to TF-IDF
        }

        if (!usedAi && !cancelled) {
          const { nodes: n, edges: e } = buildTfidfGraph(items);
          setNodes(n);
          setEdges(e);
          setAiEnhanced(false);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNodes([]);
          setEdges([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const positions = useMemo(() => computePositions(nodes, edges), [nodes, edges]);

  const maxCoCount = useMemo(
    () => edges.reduce((m, e) => Math.max(m, e.coCount), 1),
    [edges],
  );

  // Truncate a label for SVG text to avoid overflow
  function truncate(label: string, maxLen: number): string {
    return label.length > maxLen ? label.slice(0, maxLen - 1) + '…' : label;
  }

  return (
    <div className="map">
      <div className="header-row">
        <div>
          <h3>Knowledge Map</h3>
          <p>
            {aiEnhanced
              ? 'Concept clusters inferred from your saved library.'
              : 'Key concepts from your saved library, grouped by repeated co-occurrence.'}
          </p>
          <p style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            This is a high-level study map, not a full semantic graph.
          </p>
        </div>
        {aiEnhanced && (
          <span className="ai-badge" aria-label="AI assisted map">AI-assisted</span>
        )}
      </div>

      <div className="canvas" onClick={() => setSelectedNode(null)}>
        {loading ? (
          <div className="empty">Building map…</div>
        ) : nodes.length === 0 ? (
          <div className="empty">Save some outputs to Library to see your knowledge map.</div>
        ) : (
          <>
            <svg viewBox="0 0 100 100" aria-label="Knowledge map">
              {/* Edges */}
              {edges.map((edge, i) => {
                const from = positions[edge.from];
                const to = positions[edge.to];
                if (!from || !to) return null;
                const opacity = 0.12 + (edge.coCount / maxCoCount) * 0.38;
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                return (
                  <g key={i}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="currentColor"
                      strokeOpacity={opacity}
                      strokeWidth={edge.isAiDerived ? '0.4' : '0.3'}
                      strokeDasharray={edge.isAiDerived ? undefined : '1,0.5'}
                    />
                    {edge.isAiDerived && edge.label && (
                      <text
                        x={mx}
                        y={my}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="1.8"
                        fill="currentColor"
                        fillOpacity={0.45}
                        style={{ pointerEvents: 'none' }}
                      >
                        {truncate(edge.label, 10)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map(node => {
                const pos = positions[node.id];
                if (!pos) return null;
                const fill = TIER_FILL[node.tier];
                const r = node.size / 10;
                return (
                  <g
                    key={node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={ev => {
                      ev.stopPropagation();
                      setSelectedNode(s =>
                        s?.label === node.label
                          ? null
                          : { label: node.label, sourceItemIds: node.sourceItemIds },
                      );
                    }}
                  >
                    <circle cx={pos.x} cy={pos.y} r={r} fill={fill} />
                    <text
                      x={pos.x}
                      y={pos.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={node.tier === 0 ? '3' : node.tier === 1 ? '2.6' : '2.2'}
                      fill="currentColor"
                      style={{ pointerEvents: 'none' }}
                    >
                      {truncate(node.label, node.tier === 0 ? 14 : 12)}
                    </text>
                  </g>
                );
              })}

              {/* Selected node highlight ring */}
              {selectedNode && nodes.map(node => {
                if (node.label !== selectedNode.label) return null;
                const pos = positions[node.id];
                if (!pos) return null;
                const r = node.size / 10;
                return (
                  <circle
                    key={`sel-${node.id}`}
                    cx={pos.x} cy={pos.y} r={r + 1.2}
                    fill="none"
                    stroke="var(--primary, #6366f1)"
                    strokeWidth="0.6"
                    strokeDasharray="2,1"
                    style={{ pointerEvents: 'none' }}
                  />
                );
              })}
            </svg>

            <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              Stronger lines mean concepts appeared together more often across your saved material.
            </div>

            {/* Legend */}
            <div className="legend">
              <span className="legend-item tier0">Core Objectives</span>
              <span className="legend-item tier1">Key Topics</span>
              <span className="legend-item tier2">Related Terms</span>
            </div>
          </>
        )}
      </div>

      {/* ── Content panel ─────────────────────────────────────── */}
      {selectedNode && (() => {
        const matchingItems = selectedNode.sourceItemIds.length > 0
          ? libItems.filter(item => selectedNode.sourceItemIds.includes(item.id))
          : libItems.filter(item =>
              item.content.toLowerCase().includes(selectedNode.label.toLowerCase()),
            ).slice(0, 5);

        function highlight(text: string, term: string): string {
          const idx = text.toLowerCase().indexOf(term.toLowerCase());
          if (idx === -1) return text.slice(0, 220);
          const start = Math.max(0, idx - 80);
          const end = Math.min(text.length, idx + term.length + 140);
          return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
        }

        return (
          <div className="content-panel">
            <div className="content-panel-header">
              <span className="content-panel-title">{selectedNode.label}</span>
              <span className="content-panel-count">
                {matchingItems.length} {matchingItems.length === 1 ? 'item' : 'items'}
              </span>
              <button
                className="content-panel-close"
                onClick={() => setSelectedNode(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {matchingItems.length === 0 ? (
              <p className="content-panel-empty">No saved content references this concept yet.</p>
            ) : (
              <div className="content-panel-list">
                {matchingItems.map(item => {
                  const snippet = highlight(item.content, selectedNode.label);
                  const termIdx = snippet.toLowerCase().indexOf(selectedNode.label.toLowerCase());
                  return (
                    <div key={item.id} className="content-card">
                      <div className="content-card-mode">{item.mode}</div>
                      <p className="content-card-snippet">
                        {termIdx >= 0 ? (
                          <>
                            {snippet.slice(0, termIdx)}
                            <mark className="content-mark">
                              {snippet.slice(termIdx, termIdx + selectedNode.label.length)}
                            </mark>
                            {snippet.slice(termIdx + selectedNode.label.length)}
                          </>
                        ) : snippet}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      <style jsx>{`
        .map {
          display: grid;
          gap: var(--space-3, 12px);
        }
        .header-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-3, 12px);
        }
        h3 {
          margin: 0 0 2px;
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary, #0f172a);
        }
        p {
          color: var(--text-muted, #64748b);
          font-size: 0.82rem;
          margin: 0;
        }
        .ai-badge {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: var(--radius-md, 8px);
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          background: var(--primary-500, #6366f1);
          color: #fff;
          white-space: nowrap;
          height: fit-content;
        }
        .canvas {
          position: relative;
          background: var(--bg-surface, #f8fafc);
          border: 1px solid var(--border-subtle, #e2e8f0);
          border-radius: 16px;
          padding: 12px;
          min-height: 160px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .empty {
          font-size: 0.82rem;
          color: var(--text-muted, #64748b);
          text-align: center;
        }
        svg {
          width: 100%;
          height: 320px;
          color: var(--text-primary, #0f172a);
        }
        .legend {
          display: flex;
          gap: var(--space-3, 12px);
          flex-wrap: wrap;
          justify-content: center;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle, #e2e8f0);
          width: 100%;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.72rem;
          color: var(--text-muted, #64748b);
        }
        .legend-item::before {
          content: '';
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .legend-item.tier0::before {
          background: rgba(99, 102, 241, 0.55);
        }
        .legend-item.tier1::before {
          background: rgba(16, 185, 129, 0.5);
        }
        .legend-item.tier2::before {
          background: rgba(245, 158, 11, 0.45);
        }

        /* ── Content panel ──────────────────────────────────── */
        .content-panel {
          border: 1px solid var(--border-subtle, #e2e8f0);
          border-radius: 14px;
          background: var(--bg-surface, #f8fafc);
          overflow: hidden;
        }
        .content-panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--border-subtle, #e2e8f0);
          background: var(--surface, #fff);
        }
        .content-panel-title {
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--text-primary, #0f172a);
          flex: 1;
        }
        .content-panel-count {
          font-size: 0.75rem;
          color: var(--text-muted, #64748b);
          background: var(--bg-surface, #f1f5f9);
          padding: 2px 8px;
          border-radius: 999px;
          flex-shrink: 0;
        }
        .content-panel-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted, #94a3b8);
          font-size: 0.75rem;
          padding: 2px 4px;
          border-radius: 4px;
          flex-shrink: 0;
        }
        .content-panel-close:hover {
          color: var(--text-primary, #0f172a);
          background: var(--bg-surface, #f1f5f9);
        }
        .content-panel-empty {
          padding: 16px;
          font-size: 0.82rem;
          color: var(--text-muted, #64748b);
          margin: 0;
          text-align: center;
        }
        .content-panel-list {
          display: grid;
          gap: 1px;
          background: var(--border-subtle, #e2e8f0);
        }
        .content-card {
          padding: 10px 14px;
          background: var(--surface, #fff);
          display: grid;
          gap: 4px;
        }
        .content-card-mode {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--primary-500, #6366f1);
        }
        .content-card-snippet {
          font-size: 0.82rem;
          color: var(--text-muted, #475569);
          line-height: 1.55;
          margin: 0;
        }
        .content-mark {
          background: color-mix(in srgb, var(--primary-500, #6366f1) 18%, transparent);
          color: inherit;
          border-radius: 3px;
          padding: 0 2px;
        }
      `}</style>
    </div>
  );
}
