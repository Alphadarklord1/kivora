'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';

interface LibItem {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
  metadata?: {
    title?: string;
    category?: string;
    problem?: string;
    sourceFileName?: string;
    sourceDeckId?: string;
    sourceDeckName?: string;
    graphExpr?: string;
    savedFrom?: string;
  } | null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MODE_META: Record<string, { label: string; color: string }> = {
  summarize: { label: 'Summarize', color: 'var(--accent)' },
  rephrase: { label: 'Rephrase', color: 'var(--cyan)' },
  notes: { label: 'Notes', color: 'var(--success)' },
  quiz: { label: 'Quiz', color: 'var(--warning)' },
  mcq: { label: 'MCQ', color: 'var(--purple)' },
  flashcards: { label: 'Flashcards', color: 'var(--danger)' },
  assignment: { label: 'Assignment', color: 'var(--text-2)' },
  exam: { label: 'Exam Prep', color: '#f59e0b' },
  'math-solution': { label: 'Math Solution', color: '#2563eb' },
  'math-practice': { label: 'Math Practice', color: '#7c3aed' },
};

export default function LibraryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    fetch('/api/library')
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function deleteItem(id: string) {
    await fetch(`/api/library/${id}`, { method: 'DELETE' }).catch(() => {});
    setItems((prev) => prev.filter((item) => item.id !== id));
    toast('Deleted', 'info');
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [
        item.mode,
        item.content,
        item.metadata?.title,
        item.metadata?.category,
        item.metadata?.problem,
        item.metadata?.sourceFileName,
        item.metadata?.sourceDeckName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, search]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Library</h1>
        <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>{items.length} saved outputs</span>
      </div>

      <input
        type="text"
        placeholder="Search library…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 20 }}
      />

      {loading ? (
        [1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 100, marginBottom: 12, borderRadius: 12 }} />)
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <h3>{search ? 'No results' : 'Library is empty'}</h3>
          <p>Generate study content in the Workspace or save math results from <strong>/math</strong>.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((item) => {
            const meta = MODE_META[item.mode] ?? { label: item.mode, color: 'var(--border-2)' };
            const title = item.metadata?.title || item.metadata?.problem || meta.label;
            return (
              <div key={item.id} className="card card-sm" style={{ borderLeft: `3px solid ${meta.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: meta.color }}>
                    {meta.label}
                  </span>
                  <strong style={{ fontSize: 'var(--text-sm)' }}>{title}</strong>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginLeft: 'auto' }}>{fmtDate(item.createdAt)}</span>
                  <button className="btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => void deleteItem(item.id)}>✕</button>
                </div>

                {!!item.metadata && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    {item.metadata.category && <span className="badge badge-accent">{item.metadata.category}</span>}
                    {item.metadata.sourceFileName && <span className="badge">{item.metadata.sourceFileName}</span>}
                    {item.metadata.sourceDeckName && <span className="badge">{item.metadata.sourceDeckName}</span>}
                    {item.metadata.graphExpr && <span className="badge">Graph ready</span>}
                    {item.metadata.savedFrom && <span className="badge">{item.metadata.savedFrom}</span>}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-2)',
                    whiteSpace: 'pre-wrap',
                    ...(expanded === item.id
                      ? {}
                      : {
                          display: '-webkit-box',
                          WebkitLineClamp: 5,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }),
                  }}
                >
                  {item.content}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((prev) => (prev === item.id ? null : item.id))}>
                    {expanded === item.id ? 'Collapse' : 'Expand'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(item.content).then(() => toast('Copied!', 'success'))}>
                    Copy
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
