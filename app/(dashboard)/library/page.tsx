'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ShareDialog } from '@/components/share';

interface LibraryItem {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

type LibraryMetadata = {
  title?: string;
  tags?: string[];
  pinned?: boolean;
  collection?: string;
  sourceTool?: string;
  sourceFileId?: string;
  sourceFileName?: string;
};

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [editingMeta, setEditingMeta] = useState<LibraryMetadata>({});

  // Share dialog state
  const router = useRouter();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null);

  const readMetadata = (item: LibraryItem): LibraryMetadata => {
    const meta = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    return {
      title: typeof meta?.title === 'string' ? meta.title : undefined,
      tags: Array.isArray(meta?.tags) ? meta.tags.filter((t: unknown) => typeof t === 'string') as string[] : undefined,
      pinned: typeof meta?.pinned === 'boolean' ? meta.pinned : undefined,
      collection: typeof meta?.collection === 'string' ? meta.collection : undefined,
      sourceTool: typeof meta?.sourceTool === 'string' ? meta.sourceTool : undefined,
      sourceFileId: typeof meta?.sourceFileId === 'string' ? meta.sourceFileId : undefined,
      sourceFileName: typeof meta?.sourceFileName === 'string' ? meta.sourceFileName : undefined,
    };
  };

  const getTitle = (item: LibraryItem) => {
    const meta = readMetadata(item);
    return meta.title || `${formatMode(item.mode)} • ${new Date(item.createdAt).toLocaleDateString()}`;
  };

  const handleShare = (item: LibraryItem) => {
    setShareTarget({ id: item.id, name: getTitle(item) });
    setShareDialogOpen(true);
  };

  const fetchLibrary = useCallback(async () => {
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
  }, [search]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

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

  const updateItemMetadata = async (id: string, metadata: LibraryMetadata) => {
    try {
      const res = await fetch(`/api/library/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems(prev => prev.map(item => item.id === id ? updated : item));
      }
    } catch (error) {
      console.error('Failed to update metadata:', error);
    }
  };

  const handleTogglePin = async (item: LibraryItem) => {
    const meta = readMetadata(item);
    const updated = { ...meta, pinned: !meta.pinned };
    await updateItemMetadata(item.id, updated);
  };

  const handleOpenPreview = (item: LibraryItem) => {
    setPreviewItem(item);
    setEditingMeta(readMetadata(item));
  };

  const handleSaveMeta = async () => {
    if (!previewItem) return;
    await updateItemMetadata(previewItem.id, {
      ...editingMeta,
      tags: editingMeta.tags?.filter(Boolean),
    });
    setPreviewItem(null);
  };

  const handleExportMarkdown = () => {
    const md = filteredItems.map((item) => {
      const meta = readMetadata(item);
      const tags = meta.tags?.length ? `Tags: ${meta.tags.join(', ')}` : '';
      const collection = meta.collection ? `Collection: ${meta.collection}` : '';
      return [
        `## ${getTitle(item)}`,
        tags,
        collection,
        '',
        item.content,
      ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studypilot-library-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    const txt = filteredItems.map((item) => {
      const meta = readMetadata(item);
      const tags = meta.tags?.length ? `Tags: ${meta.tags.join(', ')}` : '';
      const collection = meta.collection ? `Collection: ${meta.collection}` : '';
      return [
        getTitle(item),
        tags,
        collection,
        '',
        item.content,
      ].filter(Boolean).join('\n');
    }).join('\n\n-----\n\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studypilot-library-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUseInTool = (item: LibraryItem) => {
    const params = new URLSearchParams({
      mode: item.mode,
      input: item.content,
    });
    router.push(`/tools?${params.toString()}`);
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
      notes: 'Notes',
      math: 'Math',
      exam: 'Exam',
      srs: 'SRS',
      pop: 'Pop Quiz (legacy)',
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

  const modes = ['all', 'assignment', 'summarize', 'mcq', 'quiz', 'notes', 'math', 'exam', 'srs'];
  const tags = Array.from(
    new Set(items.flatMap(item => readMetadata(item).tags || []))
  );
  const collections = Array.from(
    new Set(items.map(item => readMetadata(item).collection).filter(Boolean) as string[])
  );

  const filteredItems = items.filter(item => {
    if (filter !== 'all' && item.mode !== filter) return false;
    const meta = readMetadata(item);
    if (pinnedOnly && !meta.pinned) return false;
    if (tagFilter !== 'all' && !(meta.tags || []).includes(tagFilter)) return false;
    if (collectionFilter !== 'all' && meta.collection !== collectionFilter) return false;
    if (search) {
      const searchLower = search.toLowerCase();
      const inContent = item.content.toLowerCase().includes(searchLower);
      const inMode = item.mode.toLowerCase().includes(searchLower);
      const inTitle = (meta.title || '').toLowerCase().includes(searchLower);
      if (!inContent && !inMode && !inTitle) return false;
    }
    return true;
  });

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
          <button className="btn secondary" onClick={handleExportMarkdown} disabled={items.length === 0}>
            Export MD
          </button>
          <button className="btn secondary" onClick={handleExportText} disabled={items.length === 0}>
            Export TXT
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
        <div className="library-filters secondary">
          <button
            className={`filter-btn ${pinnedOnly ? 'active' : ''}`}
            onClick={() => setPinnedOnly(prev => !prev)}
          >
            📌 Pinned
          </button>
          <select
            className="filter-select"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
          >
            <option value="all">All tags</option>
            {tags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={collectionFilter}
            onChange={(e) => setCollectionFilter(e.target.value)}
          >
            <option value="all">All collections</option>
            {collections.map(collection => (
              <option key={collection} value={collection}>{collection}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="library-loading">Loading...</div>
      ) : filteredItems.length === 0 ? (
        <div className="library-empty">
          <div className="empty-icon">📚</div>
          <h3>{search || filter !== 'all' ? 'No matching items' : 'Library is empty'}</h3>
          <p>Save content from Tools to build your library</p>
        </div>
      ) : (
        <div className="library-grid">
          {filteredItems.map((item) => (
            <div key={item.id} className="library-card">
              <div className="card-header">
                <div className="card-left">
                  <span className={`card-badge ${item.mode}`}>
                    {formatMode(item.mode)}
                  </span>
                  {readMetadata(item).pinned && <span className="pin-pill">📌 Pinned</span>}
                </div>
                <span className="card-date">{formatDate(item.createdAt)}</span>
              </div>
              <div className="card-content">
                <div className="card-title">{getTitle(item)}</div>
                {item.content.slice(0, 300)}
                {item.content.length > 300 && '...'}
              </div>
              {readMetadata(item).tags?.length ? (
                <div className="card-tags">
                  {readMetadata(item).tags?.slice(0, 4).map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                  {readMetadata(item).tags && readMetadata(item).tags!.length > 4 && (
                    <span className="tag muted">+{readMetadata(item).tags!.length - 4}</span>
                  )}
                </div>
              ) : null}
              <div className="card-actions">
                <button className="btn ghost" onClick={() => handleOpenPreview(item)}>
                  👁️ Preview
                </button>
                <button className="btn ghost" onClick={() => handleUseInTool(item)}>
                  🛠️ Use in Tool
                </button>
                <button className="btn ghost" onClick={() => handleShare(item)}>
                  🔗 Share
                </button>
                <button className="btn ghost" onClick={() => handleCopy(item.content)}>
                  📋 Copy
                </button>
                <button className="btn ghost" onClick={() => handleTogglePin(item)}>
                  {readMetadata(item).pinned ? '📌 Unpin' : '📌 Pin'}
                </button>
                <button className="btn ghost danger" onClick={() => handleDelete(item.id)}>
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewItem && (
        <div className="library-modal" onClick={() => setPreviewItem(null)}>
          <div className="library-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{getTitle(previewItem)}</div>
                <div className="modal-meta">{formatMode(previewItem.mode)} · {formatDate(previewItem.createdAt)}</div>
              </div>
              <button className="close-btn" onClick={() => setPreviewItem(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Title</label>
              <input
                type="text"
                value={editingMeta.title || ''}
                onChange={(e) => setEditingMeta(prev => ({ ...prev, title: e.target.value }))}
              />
              <label>Tags (comma separated)</label>
              <input
                type="text"
                value={(editingMeta.tags || []).join(', ')}
                onChange={(e) => setEditingMeta(prev => ({
                  ...prev,
                  tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                }))}
              />
              <label>Collection</label>
              <input
                type="text"
                value={editingMeta.collection || ''}
                onChange={(e) => setEditingMeta(prev => ({ ...prev, collection: e.target.value }))}
              />
              <div className="modal-actions">
                <button className="btn secondary" onClick={() => handleTogglePin(previewItem)}>
                  {readMetadata(previewItem).pinned ? 'Unpin' : 'Pin'}
                </button>
                <button className="btn secondary" onClick={() => handleCopy(previewItem.content)}>Copy</button>
                <button className="btn secondary" onClick={() => handleUseInTool(previewItem)}>Use in Tool</button>
                <button className="btn" onClick={handleSaveMeta}>Save</button>
              </div>
              <div className="modal-content">{previewItem.content}</div>
            </div>
          </div>
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
          flex-wrap: wrap;
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

        .library-filters.secondary {
          margin-top: var(--space-3);
          align-items: center;
        }

        .filter-select {
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-full);
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          font-size: var(--font-meta);
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

        .library-loading,
        .library-empty {
          text-align: center;
          padding: var(--space-12);
          color: var(--text-muted);
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: var(--space-4);
        }

        .library-empty h3 {
          color: var(--text-primary);
          margin-bottom: var(--space-2);
        }

        .library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: var(--space-4);
        }

        .library-card {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .library-card:hover {
          border-color: var(--border-default);
          box-shadow: var(--shadow-md);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-inset);
        }

        .card-left {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .card-badge {
          font-size: var(--font-tiny);
          font-weight: 600;
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          background: var(--primary-muted);
          color: var(--primary);
        }

        .pin-pill {
          font-size: var(--font-tiny);
          padding: 2px 8px;
          border-radius: var(--radius-full);
          background: rgba(250, 204, 21, 0.15);
          color: #a16207;
          font-weight: 600;
        }

        .card-badge.mcq { background: #dcfce7; color: #16a34a; }
        .card-badge.quiz { background: #fef3c7; color: #d97706; }
        .card-badge.summarize { background: #dbeafe; color: #2563eb; }
        .card-badge.notes { background: #f3e8ff; color: #9333ea; }
        .card-badge.math { background: #fce7f3; color: #db2777; }
        .card-badge.exam { background: #e0f2fe; color: #0284c7; }
        .card-badge.srs { background: #ecfccb; color: #4d7c0f; }

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

        .card-title {
          font-size: var(--font-body);
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: var(--space-2);
        }

        .card-tags {
          display: flex;
          gap: var(--space-1);
          flex-wrap: wrap;
          padding: 0 var(--space-4) var(--space-3);
        }

        .tag {
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: var(--font-tiny);
          background: var(--bg-inset);
          color: var(--text-secondary);
        }

        .tag.muted {
          color: var(--text-muted);
        }

        .card-actions {
          display: flex;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          border-top: 1px solid var(--border-subtle);
          flex-wrap: wrap;
        }

        .btn.ghost.danger {
          color: var(--error);
        }

        .btn.ghost.danger:hover {
          background: var(--error-muted);
        }

        .library-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4);
          z-index: 1000;
        }

        .library-modal-card {
          background: var(--bg-surface);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-subtle);
          max-width: 720px;
          width: 100%;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--bg-inset);
          cursor: pointer;
        }

        .close-btn:hover {
          background: var(--bg-elevated);
        }

        .modal-title {
          font-size: var(--font-lg);
          font-weight: 700;
        }

        .modal-meta {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .modal-body {
          padding: var(--space-4);
          display: grid;
          gap: var(--space-2);
          overflow-y: auto;
        }

        .modal-body label {
          font-size: var(--font-meta);
          color: var(--text-secondary);
        }

        .modal-body input {
          padding: var(--space-2);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          background: var(--bg-inset);
        }

        .modal-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
          margin-top: var(--space-2);
          margin-bottom: var(--space-2);
        }

        .modal-content {
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          white-space: pre-wrap;
          font-size: var(--font-meta);
          line-height: 1.6;
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
