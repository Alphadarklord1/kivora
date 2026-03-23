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

const TIER_RADIUS: Record<number, number> = { 0: 20, 1: 35, 2: 46 };

// ── TF-IDF fallback ───────────────────────────────────────────────────────────

function buildTfidfGraph(items: LibraryItem[]): { nodes: Node[]; edges: Edge[] } {
  const totalItems = items.length;
  const df = new Map<string, number>();
  const tf = new Map<string, number>();
  const coCount = new Map<string, number>();
  const wordItemIds = new Map<string, string[]>();

  for (const item of items) {
    const words = item.content.toLowerCase().match(/[a-z]{5,}/g) ?? [];
    const unique = Array.from(new Set(words.filter(w => !STOP_WORDS.has(w))));

    for (const w of unique) {
      df.set(w, (df.get(w) ?? 0) + 1);
      tf.set(w, (tf.get(w) ?? 0) + 1);
      const existing = wordItemIds.get(w) ?? [];
      if (!existing.includes(item.id)) existing.push(item.id);
      wordItemIds.set(w, existing);
    }

    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = unique[i] < unique[j]
          ? `${unique[i]}|${unique[j]}`
          : `${unique[j]}|${unique[i]}`;
        coCount.set(key, (coCount.get(key) ?? 0) + 1);
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
    if (count < 2) continue;
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

// ── Positions ─────────────────────────────────────────────────────────────────

function computePositions(nodes: Node[]): Record<string, { x: number; y: number }> {
  const tiers: Record<number, Node[]> = { 0: [], 1: [], 2: [] };
  for (const node of nodes) tiers[node.tier].push(node);

  const pos: Record<string, { x: number; y: number }> = {};
  for (const tierIdx of [0, 1, 2] as const) {
    const group = tiers[tierIdx];
    const r = TIER_RADIUS[tierIdx];
    group.forEach((node, i) => {
      const angle = (i / Math.max(group.length, 1)) * Math.PI * 2 - Math.PI / 2;
      pos[node.id] = { x: 50 + Math.cos(angle) * r, y: 50 + Math.sin(angle) * r };
    });
  }
  return pos;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KnowledgeMap() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiEnhanced, setAiEnhanced] = useState(false);
  const [tooltip, setTooltip] = useState<{
    label: string;
    sourceItemIds: string[];
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/library?limit=30', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then(async (items: LibraryItem[]) => {
        if (cancelled) return;
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

  const positions = useMemo(() => computePositions(nodes), [nodes]);

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
              ? 'Semantic concept map built from your library.'
              : 'Key concepts from your saved library, connected by co-occurrence.'}
          </p>
        </div>
        {aiEnhanced && (
          <span className="ai-badge" aria-label="AI enhanced map">AI-enhanced</span>
        )}
      </div>

      <div className="canvas" onClick={() => setTooltip(null)}>
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
                      setTooltip(t =>
                        t?.label === node.label
                          ? null
                          : {
                              label: node.label,
                              sourceItemIds: node.sourceItemIds,
                              x: pos.x,
                              y: pos.y,
                            },
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

              {/* Tooltip inside SVG */}
              {tooltip && (() => {
                const tx = tooltip.x > 70 ? tooltip.x - 28 : tooltip.x + 2;
                const ty = tooltip.y > 80 ? tooltip.y - 14 : tooltip.y + 5;
                const lines = [
                  tooltip.label,
                  `${tooltip.sourceItemIds.length} item${tooltip.sourceItemIds.length !== 1 ? 's' : ''}`,
                ];
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={tx - 1}
                      y={ty - 1}
                      width={30}
                      height={lines.length * 4 + 2}
                      rx="1"
                      fill="var(--bg-surface, #f8fafc)"
                      stroke="var(--border-subtle, #e2e8f0)"
                      strokeWidth="0.3"
                    />
                    {lines.map((line, li) => (
                      <text
                        key={li}
                        x={tx + 0.5}
                        y={ty + 2.5 + li * 4}
                        fontSize="2.5"
                        fill="var(--text-primary, #0f172a)"
                      >
                        {truncate(line, 18)}
                      </text>
                    ))}
                  </g>
                );
              })()}
            </svg>

            {/* Legend */}
            <div className="legend">
              <span className="legend-item tier0">Core Objectives</span>
              <span className="legend-item tier1">Key Topics</span>
              <span className="legend-item tier2">Related Terms</span>
            </div>
          </>
        )}
      </div>

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
      `}</style>
    </div>
  );
}
