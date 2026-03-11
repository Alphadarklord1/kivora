'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';

interface LibItem {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LibraryPage() {
  const { toast } = useToast();
  const [items,   setItems]   = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    fetch('/api/library')
      .then(r => r.ok ? r.json() : [])
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteItem(id: string) {
    await fetch(`/api/library/${id}`, { method: 'DELETE' }).catch(() => {});
    setItems(p => p.filter(x => x.id !== id));
    toast('Deleted', 'info');
  }

  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = search.trim()
    ? items.filter(i => i.content.toLowerCase().includes(search.toLowerCase()) || i.mode.includes(search.toLowerCase()))
    : items;

  const COLORS: Record<string, string> = {
    summarize: 'var(--accent)', rephrase: 'var(--cyan)', notes: 'var(--success)',
    quiz: 'var(--warning)', mcq: 'var(--purple)', flashcards: 'var(--danger)', assignment: 'var(--text-2)',
  };

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
        onChange={e => setSearch(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 20 }}
      />

      {loading ? (
        [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100, marginBottom: 12, borderRadius: 12 }} />)
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <h3>{search ? 'No results' : 'Library is empty'}</h3>
          <p>Generate study content in the Workspace, then click <strong>Save to Library</strong>.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(item => (
            <div key={item.id} className="card card-sm" style={{ borderLeft: `3px solid ${COLORS[item.mode] ?? 'var(--border-2)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: COLORS[item.mode] ?? 'var(--text-3)' }}>
                  {item.mode}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginLeft: 'auto' }}>{fmtDate(item.createdAt)}</span>
                <button className="btn-icon btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteItem(item.id)}>✕</button>
              </div>

              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', whiteSpace: 'pre-wrap',
                ...(expanded === item.id ? {} : { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties)
              }}>
                {item.content}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(p => p === item.id ? null : item.id)}>
                  {expanded === item.id ? 'Collapse' : 'Expand'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(item.content).then(() => toast('Copied!', 'success'))}>
                  Copy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
