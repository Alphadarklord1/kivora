'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { printContent, printMultiple } from '@/lib/utils/print';
import { ShareDialog, useShareDialog } from '@/components/share';
import { broadcastInvalidate, listenForInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

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

const MODE_META: Record<string, { label: string; color: string; icon: string }> = {
  summarize:       { label: 'Summarize',     color: 'var(--accent, #3b82f6)',  icon: '📝' },
  rephrase:        { label: 'Rephrase',       color: 'var(--cyan, #06b6d4)',   icon: '🔄' },
  notes:           { label: 'Notes',          color: 'var(--success, #22c55e)',icon: '🗒️' },
  quiz:            { label: 'Quiz',           color: 'var(--warning, #f59e0b)',icon: '❓' },
  mcq:             { label: 'MCQ',            color: '#8b5cf6',                icon: '☑️' },
  flashcards:      { label: 'Flashcards',     color: 'var(--danger, #ef4444)', icon: '🃏' },
  assignment:      { label: 'Assignment',     color: 'var(--text-2)',          icon: '📋' },
  exam:            { label: 'Exam Prep',      color: '#f59e0b',                icon: '📖' },
  'math-solution': { label: 'Math Solution',  color: '#2563eb',                icon: '🧮' },
  'math-practice': { label: 'Math Practice',  color: '#7c3aed',                icon: '✏️' },
};

const ALL_TYPE_KEYS = ['all', ...Object.keys(MODE_META)] as const;
type TypeFilter = typeof ALL_TYPE_KEYS[number];

const LOCAL_AR: Record<string, string> = {
  'saved outputs':    '\u0645\u062e\u0631\u062c\u0627\u062a \u0645\u062d\u0641\u0648\u0638\u0629',
  'Search library\u2026':  '\u0627\u0628\u062d\u062b \u0641\u064a \u0627\u0644\u0645\u0643\u062a\u0628\u0629...',
  'All types':        '\u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0646\u0648\u0627\u0639',
  'Library is empty': '\u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u0641\u0627\u0631\u063a\u0629',
  'No results for':   '\u0644\u0627 \u0646\u062a\u0627\u0626\u062c \u0644\u0640',
  'Generate study content in the Workspace \u2014 summaries, quizzes, notes, and more.':
    '\u0623\u0646\u0634\u0626 \u0645\u062d\u062a\u0648\u0649 \u062f\u0631\u0627\u0633\u064a\u064b\u0627 \u0641\u064a \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644 \u2014 \u0645\u0644\u062e\u0635\u0627\u062a \u0648\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a \u0648\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0648\u0627\u0644\u0645\u0632\u064a\u062f.',
  'Go to Workspace':  '\u0627\u0646\u062a\u0642\u0644 \u0625\u0644\u0649 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644',
  'Expand':           '\u062a\u0648\u0633\u064a\u0639',
  'Collapse':         '\u0637\u064a',
  'Copied!':          '\u062a\u0645 \u0627\u0644\u0646\u0633\u062e!',
  'Print':            '\u0637\u0628\u0627\u0639\u0629',
  'Export all':       '\u062a\u0635\u062f\u064a\u0631 \u0627\u0644\u0643\u0644',
  'Share':            '\u0645\u0634\u0627\u0631\u0643\u0629',
};

export default function LibraryPage() {
  useEffect(() => { document.title = 'Library — Kivora'; }, []);
  const { toast } = useToast();
  const { t, formatDate, locale } = useI18n(LOCAL_AR);
  const { isOpen: shareOpen, shareTarget, openShare, closeShare } = useShareDialog();

  const [items, setItems]     = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [expanded, setExpanded]     = useState<string | null>(null);

  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/library');
      if (!res.ok) throw new Error('Failed to load library');
      setItems(await res.json());
    } catch {
      setLoadError('Could not load library. Check your connection and try again.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Re-fetch when another tab mutates library data
  useEffect(() => {
    return listenForInvalidate(LIBRARY_CHANNEL, () => { void load(); });
  }, [load]);

  async function deleteItem(id: string) {
    const prev = items;
    setItems(p => p.filter(i => i.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/library/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast(t('Deleted'), 'info');
    } catch {
      setItems(prev); // revert
      toast('Failed to delete. Please try again.', 'error');
    }
  }

  function copyItem(content: string) {
    navigator.clipboard.writeText(content)
      .then(() => toast(t('Copied!'), 'success'))
      .catch(() => toast('Copy failed — try selecting the text manually.', 'error'));
  }

  function exportItem(item: LibItem) {
    const meta = MODE_META[item.mode] ?? { label: item.mode, color: '', icon: '' };
    const name = (item.metadata?.title || item.metadata?.problem || meta.label)
      .replace(/[^a-z0-9_\-\s]/gi, '').trim().slice(0, 40).replace(/\s+/g, '_');
    const blob = new Blob([item.content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `${name || 'export'}.txt` });
    a.click();
    URL.revokeObjectURL(url);
    toast('Saved to downloads.', 'success');
  }

  const countByType = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const item of items) c[item.mode] = (c[item.mode] ?? 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (typeFilter !== 'all' && item.mode !== typeFilter) return false;
      if (!q) return true;
      const hay = [item.mode, item.content, item.metadata?.title, item.metadata?.category,
                   item.metadata?.problem, item.metadata?.sourceFileName, item.metadata?.sourceDeckName]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, typeFilter]);

  return (
    <div className="lib-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="lib-header">
        <div className="lib-title-row">
          <h1 className="lib-title">{t('Library')}</h1>
          {items.length > 0 && (
            <span className="lib-count">{items.length} {t('saved outputs')}</span>
          )}
          {filtered.length > 0 && (
            <button
              className="lib-btn lib-btn-ghost lib-btn-sm lib-export-all-btn"
              onClick={() => printMultiple(filtered.map(item => ({
                title: item.metadata?.title || item.metadata?.problem || (MODE_META[item.mode]?.label ?? item.mode),
                content: item.content,
              })))}
              title={t('Export all')}
            >
              {'\uD83D\uDDA8\uFE0F'} {t('Export all')}
            </button>
          )}
        </div>
        <input
          type="search"
          className="lib-search"
          placeholder={t('Search library\u2026')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Type filter pills */}
      {items.length > 0 && (
        <div className="lib-filters">
          {ALL_TYPE_KEYS.filter(k => k === 'all' || countByType[k]).map(k => {
            const meta = k === 'all' ? null : MODE_META[k];
            return (
              <button
                key={k}
                className={`lib-pill${typeFilter === k ? ' active' : ''}`}
                style={typeFilter === k && meta ? {
                  borderColor: meta.color,
                  background: `color-mix(in srgb, ${meta.color} 14%, var(--bg-inset))`,
                  color: meta.color,
                } : {}}
                onClick={() => setTypeFilter(k)}
              >
                {meta && <span>{meta.icon}</span>}
                {k === 'all' ? t('All types') : meta?.label ?? k}
                {countByType[k] != null && (
                  <span className="lib-pill-count">{countByType[k]}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Load error */}
      {loadError && !loading && (
        <div className="lib-error-banner">
          <span>⚠️ {loadError}</span>
          <button className="lib-btn lib-btn-ghost lib-btn-sm" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="lib-skeletons">
          {[1, 2, 3].map(i => <div key={i} className="lib-skeleton" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="lib-empty">
          <div className="lib-empty-icon">{'\uD83D\uDDC2\uFE0F'}</div>
          {search ? (
            <>
              <h3 className="lib-empty-title">{t('No results for')} &ldquo;{search}&rdquo;</h3>
              <button className="lib-btn lib-btn-ghost" style={{ marginTop: 10 }} onClick={() => setSearch('')}>
                {t('Back')}
              </button>
            </>
          ) : (
            <>
              <h3 className="lib-empty-title">{t('Library is empty')}</h3>
              <p className="lib-empty-body">
                {t('Generate study content in the Workspace \u2014 summaries, quizzes, notes, and more.')}
              </p>
              <a href="/workspace" className="lib-btn lib-btn-primary" style={{ marginTop: 14, display: 'inline-block' }}>
                {t('Go to Workspace')} {'\u2192'}
              </a>
            </>
          )}
        </div>
      ) : (
        <div className="lib-list">
          {filtered.map(item => {
            const meta  = MODE_META[item.mode] ?? { label: item.mode, color: 'var(--border-2)', icon: '\uD83D\uDCC4' };
            const title = item.metadata?.title || item.metadata?.problem || meta.label;
            const isExp = expanded === item.id;
            return (
              <div key={item.id} className="lib-card" style={{ borderLeft: `3px solid ${meta.color}` }}>
                {/* Card header */}
                <div className="lib-card-header">
                  <span className="lib-card-badge" style={{
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 12%, var(--bg-inset))`,
                  }}>
                    {meta.icon} {meta.label}
                  </span>
                  <strong className="lib-card-title">{title}</strong>
                  <span className="lib-card-date">
                    {formatDate(item.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <button
                    className="lib-icon-btn lib-icon-btn-print"
                    title={t('Print')}
                    aria-label={t('Print')}
                    onClick={() => printContent(title, item.content)}
                  >{'\uD83D\uDDA8\uFE0F'}</button>
                  <button className="lib-icon-btn" onClick={() => void deleteItem(item.id)} title={t('Delete')} aria-label={t('Delete')}>{'\u2715'}</button>
                </div>

                {/* Tags */}
                {item.metadata && (
                  <div className="lib-card-tags">
                    {item.metadata.category      && <span className="lib-tag lib-tag-accent">{item.metadata.category}</span>}
                    {item.metadata.sourceFileName && <span className="lib-tag">{'\uD83D\uDCC4'} {item.metadata.sourceFileName}</span>}
                    {item.metadata.sourceDeckName && <span className="lib-tag">{'\uD83C\uDCCF'} {item.metadata.sourceDeckName}</span>}
                    {item.metadata.graphExpr      && <span className="lib-tag">{'\uD83D\uDCC8'} Graph</span>}
                    {item.metadata.savedFrom      && <span className="lib-tag">{item.metadata.savedFrom}</span>}
                  </div>
                )}

                {/* Content */}
                <div
                  className="lib-card-content"
                  style={isExp ? {} : {
                    display: '-webkit-box',
                    WebkitLineClamp: 5,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  } as React.CSSProperties}
                >
                  {item.content}
                </div>

                {/* Actions */}
                <div className="lib-card-actions">
                  <button className="lib-btn lib-btn-ghost lib-btn-sm"
                    onClick={() => setExpanded(prev => prev === item.id ? null : item.id)}>
                    {isExp ? t('Collapse') : t('Expand')}
                  </button>
                  <button className="lib-btn lib-btn-ghost lib-btn-sm" onClick={() => copyItem(item.content)}>
                    {'\uD83D\uDCCB'} {t('Copy')}
                  </button>
                  <button className="lib-btn lib-btn-ghost lib-btn-sm" onClick={() => exportItem(item)}>
                    {'\u2B07'} {t('Export')}
                  </button>
                  <button
                    className="lib-btn lib-btn-ghost lib-btn-sm lib-btn-share"
                    onClick={() => openShare('library', item.id, title)}
                  >
                    {'\uD83D\uDD17'} {t('Share')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ShareDialog — mounted once, driven by useShareDialog hook */}
      {shareTarget && (
        <ShareDialog
          isOpen={shareOpen}
          onClose={closeShare}
          resourceType={shareTarget.resourceType}
          resourceId={shareTarget.resourceId}
          resourceName={shareTarget.resourceName}
        />
      )}

      <style jsx>{`
        .lib-page { max-width: 860px; margin: 0 auto; padding: 0 0 60px; }
        .lib-header { margin-bottom: 16px; }
        .lib-title-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
        .lib-title { font-size: var(--text-3xl, 1.75rem); font-weight: 700; margin: 0; }
        .lib-count { font-size: var(--text-sm); color: var(--text-3); }
        .lib-search {
          width: 100%; max-width: 420px; padding: 9px 14px;
          border: 1px solid var(--border-2); border-radius: 8px;
          background: var(--bg-surface); color: var(--text-1); font-size: var(--text-sm);
        }
        .lib-search::placeholder { color: var(--text-3); }
        .lib-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
        .lib-pill {
          display: flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 999px;
          border: 1px solid var(--border-2); background: var(--bg-surface); color: var(--text-2);
          font-size: 12px; cursor: pointer; transition: all 0.15s;
        }
        .lib-pill:hover { background: var(--bg-inset); }
        .lib-pill.active { font-weight: 600; }
        .lib-pill-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; border-radius: 999px; padding: 0 4px;
          background: var(--bg-inset); font-size: 10px; font-weight: 700;
        }
        .lib-skeletons { display: flex; flex-direction: column; gap: 10px; }
        .lib-skeleton {
          height: 110px; border-radius: 12px;
          background: linear-gradient(90deg, var(--bg-inset) 25%, var(--bg-surface) 50%, var(--bg-inset) 75%);
          background-size: 200% 100%; animation: shimmer 1.2s infinite;
        }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .lib-error-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; margin-bottom: 16px; border-radius: 10px; background: color-mix(in srgb, #ef4444 10%, var(--bg-surface)); border: 1px solid color-mix(in srgb, #ef4444 30%, transparent); color: #b91c1c; font-size: 13px; }
        .lib-empty { text-align: center; padding: 60px 20px; border: 1.5px dashed var(--border-2); border-radius: 14px; }
        .lib-empty-icon { font-size: 52px; margin-bottom: 14px; }
        .lib-empty-title { font-size: var(--text-lg); font-weight: 600; margin: 0 0 8px; }
        .lib-empty-body { color: var(--text-3); font-size: var(--text-sm); margin: 0; }
        .lib-list { display: flex; flex-direction: column; gap: 10px; }
        .lib-card {
          padding: 14px 16px; background: var(--bg-surface);
          border-radius: 12px; border: 1px solid var(--border-2);
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .lib-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.08); border-color: var(--border-default); }
        .lib-card-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .lib-card-badge {
          padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
        }
        .lib-card-title { font-size: var(--text-sm); font-weight: 600; flex: 1; min-width: 0; }
        .lib-card-date { font-size: 11px; color: var(--text-3); margin-left: auto; white-space: nowrap; }
        .lib-icon-btn {
          background: none; border: none; cursor: pointer; color: var(--text-3);
          font-size: 13px; padding: 2px 5px; border-radius: 4px; transition: all 0.15s;
        }
        .lib-icon-btn:hover { color: var(--danger, #ef4444); background: color-mix(in srgb, var(--danger, #ef4444) 10%, transparent); }
        .lib-icon-btn-print:hover { color: var(--text-1) !important; background: var(--bg-inset) !important; }
        .lib-card-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .lib-tag {
          padding: 2px 8px; border-radius: 5px; font-size: 11px;
          background: var(--bg-inset); color: var(--text-2); border: 1px solid var(--border-2);
        }
        .lib-tag-accent { background: color-mix(in srgb, var(--accent) 12%, var(--bg-inset)); color: var(--accent); }
        .lib-card-content { font-size: var(--text-sm); color: var(--text-2); white-space: pre-wrap; line-height: 1.6; margin-bottom: 10px; }
        .lib-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .lib-btn { display: inline-flex; align-items: center; gap: 5px; border-radius: 7px; font-weight: 500; cursor: pointer; text-decoration: none; transition: all 0.15s; }
        .lib-btn-primary { padding: 8px 16px; background: var(--accent); color: #fff; border: none; font-size: var(--text-sm); }
        .lib-btn-primary:hover { opacity: 0.88; }
        .lib-btn-ghost { padding: 5px 10px; background: transparent; border: 1px solid var(--border-2); color: var(--text-2); font-size: 12px; }
        .lib-btn-ghost:hover { background: var(--bg-inset); color: var(--text-1); }
        .lib-btn-sm { font-size: 12px; }
        .lib-btn-share:hover { border-color: var(--accent) !important; color: var(--accent) !important; }
      `}</style>
    </div>
  );
}
