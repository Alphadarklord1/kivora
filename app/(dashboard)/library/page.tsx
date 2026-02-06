'use client';

import { useState, useEffect } from 'react';
import { ShareDialog } from '@/components/share';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface LibraryItem {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);

  const handleShare = (item: LibraryItem) => {
    setShareTarget({ id: item.id, name: `${formatMode(item.mode)} - ${new Date(item.createdAt).toLocaleDateString()}` });
    setShareDialogOpen(true);
  };

  const fetchLibrary = async () => {
    try {
      const url = search
        ? `/api/library?search=${encodeURIComponent(search)}`
        : '/api/library';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Failed to fetch library:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [search]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await fetch(`/api/library/${id}`, { method: 'DELETE' });
      setItems(items.filter(i => i.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Delete ALL library items? This cannot be undone.')) return;
    try {
      await fetch('/api/library', { method: 'DELETE' });
      setItems([]);
    } catch (error) {
      console.error('Failed to clear:', error);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleExport = () => {
    const json = JSON.stringify(items, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studypilot-library-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatMode = (mode: string) => {
    const modes: Record<string, string> = {
      assignment: 'Assignment',
      summarize: 'Summary',
      mcq: 'MCQ',
      quiz: 'Quiz',
      pop: 'Pop Quiz',
      notes: 'Notes',
      math: 'Math',
    };
    return modes[mode] || mode;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const modes = ['all', 'assignment', 'summarize', 'mcq', 'quiz', 'pop', 'notes', 'math'];
  const filteredItems = filter === 'all'
    ? items
    : items.filter(i => i.mode === filter);

  return (
    <div className="library-page">
      <div className="library-header">
        <div>
          <h1>Library</h1>
          <p>Your saved study materials</p>
        </div>
        <div className="library-actions">
          <button className="btn secondary" onClick={handleExport} disabled={items.length === 0}>
            Export JSON
          </button>
          <button className="btn danger" onClick={handleClearAll} disabled={items.length === 0}>
            Clear All
          </button>
        </div>
      </div>

      <div className="library-controls">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search library..."
          className="library-search"
        />
        <div className="library-filters">
          {modes.map((mode) => (
            <button
              key={mode}
              className={`filter-btn ${filter === mode ? 'active' : ''}`}
              onClick={() => setFilter(mode)}
            >
              {mode === 'all' ? 'All' : formatMode(mode)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="library-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        search || filter !== 'all' ? (
          <EmptyState
            icon="search"
            title="No matching items"
            description={search ? `No results for "${search}"` : 'No items match the selected filter'}
            size="lg"
          />
        ) : (
          <EmptyState
            icon="library"
            title="Library is empty"
            description="Save content from Tools to build your library"
            size="lg"
          />
        )
      ) : (
        <div className="library-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="library-card">
              <div className="card-header">
                <span className={`card-badge ${item.mode}`}>
                  {formatMode(item.mode)}
                </span>
                <span className="card-date">{formatDate(item.createdAt)}</span>
              </div>
              <div className="card-content">
                {item.content.slice(0, 300)}
                {item.content.length > 300 && '...'}
              </div>
              <div className="card-actions">
                <button className="btn ghost" onClick={() => handleShare(item)}>
                  🔗 Share
                </button>
                <button className="btn ghost" onClick={() => handleCopy(item.content)}>
                  📋 Copy
                </button>
                <button className="btn ghost danger" onClick={() => handleDelete(item.id)}>
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .library-page {
          max-width: 1200px;
          margin: 0 auto;
        }

        .library-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-6);
          flex-wrap: wrap;
          gap: var(--space-4);
        }

        .library-header h1 {
          font-size: var(--font-2xl);
          margin-bottom: var(--space-1);
        }

        .library-header p {
          color: var(--text-muted);
        }

        .library-actions {
          display: flex;
          gap: var(--space-2);
        }

        .library-controls {
          margin-bottom: var(--space-6);
        }

        .library-search {
          width: 100%;
          margin-bottom: var(--space-4);
        }

        .library-filters {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .filter-btn {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          cursor: pointer;
          transition: all 0.15s;
        }

        .filter-btn:hover {
          border-color: var(--primary);
        }

        .filter-btn.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .library-loading {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-muted);
        }

        .library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: var(--space-4);
        }

        .library-card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: var(--card-radius);
          overflow: hidden;
          transition: border-color var(--transition-fast), box-shadow var(--transition-normal);
        }

        .library-card:hover {
          border-color: var(--card-hover-border);
          box-shadow: var(--card-hover-shadow);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-inset);
        }

        .card-badge {
          font-size: var(--font-tiny);
          font-weight: 600;
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          background: var(--primary-muted);
          color: var(--primary);
        }

        .card-badge.mcq { background: #dcfce7; color: #16a34a; }
        .card-badge.quiz { background: #fef3c7; color: #d97706; }
        .card-badge.summarize { background: #dbeafe; color: #2563eb; }
        .card-badge.notes { background: #f3e8ff; color: #9333ea; }
        .card-badge.math { background: #fce7f3; color: #db2777; }

        .card-date {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .card-content {
          padding: var(--space-4);
          font-size: var(--font-meta);
          line-height: 1.6;
          color: var(--text-secondary);
          max-height: 150px;
          overflow: hidden;
        }

        .card-actions {
          display: flex;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          border-top: 1px solid var(--border-subtle);
        }

        .btn.ghost.danger {
          color: var(--error);
        }

        .btn.ghost.danger:hover {
          background: var(--error-muted);
        }

        @media (max-width: 600px) {
          .library-header {
            flex-direction: column;
          }

          .library-actions {
            width: 100%;
          }

          .library-actions .btn {
            flex: 1;
          }

          .library-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Share Dialog */}
      {shareTarget && (
        <ShareDialog
          isOpen={shareDialogOpen}
          onClose={() => { setShareDialogOpen(false); setShareTarget(null); }}
          resourceType="library"
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
        />
      )}
    </div>
  );
}
