'use client';

import { useEffect, useMemo, useState } from 'react';

interface Node {
  id: string;
  label: string;
  size: number;
}

interface Edge {
  from: string;
  to: string;
  weight: number;
}

export function KnowledgeMap() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    fetch('/api/library', { credentials: 'include' })
      .then(res => res.ok ? res.json() : [])
      .then((items: Array<{ content: string }>) => {
        const text = items.map(i => i.content).join(' ');
        const words = text
          .toLowerCase()
          .match(/[a-z]{5,}/g) || [];
        const freq = new Map<string, number>();
        for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
        const top = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);

        const n = top.map(([label, count]) => ({ id: label, label, size: Math.min(26, 12 + count) }));
        const e: Edge[] = [];
        for (let i = 0; i < top.length; i++) {
          for (let j = i + 1; j < top.length; j++) {
            if (Math.random() > 0.6) continue;
            e.push({ from: top[i][0], to: top[j][0], weight: 1 });
          }
        }
        setNodes(n);
        setEdges(e);
      })
      .catch(() => {
        setNodes([]);
        setEdges([]);
      });
  }, []);

  const positions = useMemo(() => {
    const angle = (i: number, total: number) => (i / total) * Math.PI * 2;
    return nodes.reduce<Record<string, { x: number; y: number }>>((acc, node, i) => {
      const a = angle(i, nodes.length);
      acc[node.id] = { x: 50 + Math.cos(a) * 35, y: 50 + Math.sin(a) * 35 };
      return acc;
    }, {});
  }, [nodes]);

  return (
    <div className="map">
      <div>
        <h3>Knowledge Map</h3>
        <p>Explore key concepts extracted from your library items.</p>
      </div>
      <div className="canvas">
        <svg viewBox="0 0 100 100">
          {edges.map((e, i) => (
            <line
              key={i}
              x1={positions[e.from]?.x}
              y1={positions[e.from]?.y}
              x2={positions[e.to]?.x}
              y2={positions[e.to]?.y}
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="0.4"
            />
          ))}
          {nodes.map(node => (
            <g key={node.id}>
              <circle cx={positions[node.id]?.x} cy={positions[node.id]?.y} r={node.size / 10} fill="rgba(37,99,235,0.2)" />
              <text
                x={positions[node.id]?.x}
                y={positions[node.id]?.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="3"
                fill="currentColor"
              >
                {node.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <style jsx>{`
        .map { display: grid; gap: var(--space-3); }
        p { color: var(--text-muted); font-size: var(--font-meta); margin: 0; }
        .canvas {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: var(--space-3);
        }
        svg { width: 100%; height: 320px; color: var(--text-primary); }
      `}</style>
    </div>
  );
}
