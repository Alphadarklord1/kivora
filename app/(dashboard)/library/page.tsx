'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { printContent, printMultiple } from '@/lib/utils/print';
import { ShareDialog, useShareDialog } from '@/components/share';
import { broadcastInvalidate, listenForInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

interface LibItem {
  id: string;
  mode: string;
  content?: string;
  contentPreview?: string;
  contentLength?: number;
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
  research:        { label: 'Research',       color: '#0ea5e9',                icon: '🔬' },
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

const STARTER_COLLECTIONS = [
  {
    title: 'Start with a research topic',
    description: 'Open Scholar Hub with a guided topic so you can research first and save the useful outputs later.',
    href: '/coach?starter=cell%20respiration&section=research',
    badge: 'Research',
  },
  {
    title: 'Build a writing scaffold',
    description: 'Open Writing Studio with a starter essay topic instead of facing a blank draft.',
    href: '/coach?starter=causes%20of%20World%20War%20I&section=write',
    badge: 'Writing',
  },
  {
    title: 'Generate notes from your own material',
    description: 'Go to Workspace when you already have a PDF, slide deck, or notes file to transform.',
    href: '/workspace',
    badge: 'Workspace',
  },
  {
    title: 'Start a study plan first',
    description: 'Open Planner when the best next move is building structure before content.',
    href: '/planner',
    badge: 'Planner',
  },
] as const;

// ── Search helpers ────────────────────────────────────────────────────────────

/** Split a query into cleaned tokens, deduped, min 1 char */
function tokenize(q: string): string[] {
  return [...new Set(q.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0))];
}

/** Score how well an item matches the query tokens. Higher = more relevant. */
function scoreItem(item: LibItem, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const title    = (item.metadata?.title || item.metadata?.problem || '').toLowerCase();
  const meta     = [item.metadata?.category, item.metadata?.sourceFileName, item.metadata?.sourceDeckName, item.mode]
    .filter(Boolean).join(' ').toLowerCase();
  const content  = (item.content ?? item.contentPreview ?? '').toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (title.includes(t))   score += 10;  // title match → highest weight
    if (meta.includes(t))    score += 4;   // metadata match
    if (content.includes(t)) score += 1;   // content match
  }
  // All tokens must match somewhere (AND logic)
  const allMatch = tokens.every(t => title.includes(t) || meta.includes(t) || content.includes(t));
  return allMatch ? score : 0;
}

/** Extract a ~160-char snippet from content centred on the first token match */
function getSnippet(content: string, tokens: string[]): string {
  const lower = content.toLowerCase();
  let best = -1;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  if (best === -1) return content.slice(0, 160);
  const start = Math.max(0, best - 60);
  const end   = Math.min(content.length, best + 100);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

/** Wrap matched tokens in <mark> within a text string */
function Highlight({ text, tokens }: { text: string; tokens: string[] }): ReactNode {
  if (tokens.length === 0) return text;
  // Build a regex that matches any token (case-insensitive)
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        tokens.some(t => part.toLowerCase() === t)
          ? <mark key={i} className="lib-highlight">{part}</mark>
          : part
      )}
    </>
  );
}

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
  'Word':             'Word',
  'Share':            '\u0645\u0634\u0627\u0631\u0643\u0629',
  'Starter paths': '\u0645\u0633\u0627\u0631\u0627\u062a \u062c\u0627\u0647\u0632\u0629',
  'You do not need a saved deck marketplace to begin. These guided entry points open the right part of Kivora so you can create useful study material fast.': '\u0644\u0627 \u062a\u062d\u062a\u0627\u062c \u0625\u0644\u0649 \u0633\u0648\u0642 \u0645\u062d\u062a\u0648\u0649 \u0645\u062d\u0641\u0648\u0638 \u0644\u062a\u0628\u062f\u0623. \u062a\u0641\u062a\u062d \u0647\u0630\u0647 \u0627\u0644\u0645\u0633\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u0648\u062c\u0647\u0629 \u0627\u0644\u062c\u0632\u0621 \u0627\u0644\u0645\u0646\u0627\u0633\u0628 \u0645\u0646 Kivora \u0644\u062a\u0628\u0646\u064a \u0645\u0648\u0627\u062f \u062f\u0631\u0627\u0633\u064a\u0629 \u0645\u0641\u064a\u062f\u0629 \u0628\u0633\u0631\u0639\u0629.',
  'Start with a research topic': '\u0627\u0628\u062f\u0623 \u0628\u0645\u0648\u0636\u0648\u0639 \u0628\u062d\u062b\u064a',
  'Open Scholar Hub with a guided topic so you can research first and save the useful outputs later.': '\u0627\u0641\u062a\u062d Scholar Hub \u0628\u0645\u0648\u0636\u0648\u0639 \u0645\u0648\u062c\u0647 \u062d\u062a\u0649 \u062a\u0628\u062f\u0623 \u0628\u0627\u0644\u0628\u062d\u062b \u0623\u0648\u0644\u064b\u0627 \u062b\u0645 \u062a\u062d\u0641\u0638 \u0627\u0644\u0645\u062e\u0631\u062c\u0627\u062a \u0627\u0644\u0645\u0641\u064a\u062f\u0629 \u0644\u0627\u062d\u0642\u064b\u0627.',
  'Build a writing scaffold': '\u0627\u0628\u0646\u0650 \u0647\u064a\u0643\u0644\u064b\u0627 \u0623\u0648\u0644\u064a\u064b\u0627 \u0644\u0644\u0643\u062a\u0627\u0628\u0629',
  'Open Writing Studio with a starter essay topic instead of facing a blank draft.': '\u0627\u0641\u062a\u062d \u0627\u0633\u062a\u0648\u062f\u064a\u0648 \u0627\u0644\u0643\u062a\u0627\u0628\u0629 \u0628\u0645\u0648\u0636\u0648\u0639 \u0628\u062f\u0627\u064a\u0654\u064a \u0628\u062f\u0644\u064b\u0627 \u0645\u0646 \u0645\u0648\u0627\u062c\u0647\u0629 \u0645\u0633\u0648\u062f\u0629 \u0641\u0627\u0631\u063a\u0629.',
  'Generate notes from your own material': '\u0623\u0646\u0634\u0626 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0645\u0646 \u0645\u0648\u0627\u062f\u0643',
  'Go to Workspace when you already have a PDF, slide deck, or notes file to transform.': '\u0627\u0630\u0647\u0628 \u0625\u0644\u0649 \u0645\u0633\u0627\u062d\u0629 \u0627\u0644\u0639\u0645\u0644 \u0639\u0646\u062f\u0645\u0627 \u064a\u0643\u0648\u0646 \u0644\u062f\u064a\u0643 PDF \u0623\u0648 \u0639\u0631\u0636 \u0634\u0631\u0627\u0626\u062d \u0623\u0648 \u0645\u0644\u0641 \u0645\u0644\u0627\u062d\u0638\u0627\u062a \u062c\u0627\u0647\u0632 \u0644\u0644\u062a\u062d\u0648\u064a\u0644.',
  'Start a study plan first': '\u0627\u0628\u062f\u0623 \u0628\u062e\u0637\u0629 \u062f\u0631\u0627\u0633\u0629 \u0623\u0648\u0644\u064b\u0627',
  'Open Planner when the best next move is building structure before content.': '\u0627\u0641\u062a\u062d \u0627\u0644\u0645\u062e\u0637\u0637 \u0639\u0646\u062f\u0645\u0627 \u064a\u0643\u0648\u0646 \u0623\u0641\u0636\u0644 \u062e\u0637\u0648\u0629 \u062a\u0627\u0644\u064a\u0629 \u0647\u064a \u0628\u0646\u0627\u0621 \u0627\u0644\u0647\u064a\u0643\u0644 \u0642\u0628\u0644 \u0627\u0644\u0645\u062d\u062a\u0648\u0649.',
  'Open path': '\u0627\u0641\u062a\u062d \u0627\u0644\u0645\u0633\u0627\u0631',
  'Could not load library right now. Check your connection and try again.': 'تعذر تحميل المكتبة الآن. تحقّق من الاتصال وحاول مرة أخرى.',
  'Network connection issue — try again in a moment.': 'هناك مشكلة في الاتصال بالشبكة — حاول مرة أخرى بعد قليل.',
  'Database unavailable right now. Please try again shortly.': 'قاعدة البيانات غير متاحة الآن. حاول مرة أخرى بعد قليل.',
  'Could not delete this item right now.': 'تعذر حذف هذا العنصر الآن.',
  'Could not copy this content automatically.': 'تعذر نسخ هذا المحتوى تلقائيًا.',
  'Loading the full item first…': 'جارٍ تحميل العنصر الكامل أولًا…',
  'Could not load the full item right now.': 'تعذر تحميل العنصر الكامل الآن.',
  'Could not export this item to Word right now.': 'تعذر تصدير هذا العنصر إلى Word الآن.',
  'Could not delete some selected items.': 'تعذر حذف بعض العناصر المحددة.',
  'Could not rename this item right now.': 'تعذر إعادة تسمية هذا العنصر الآن.',
  'Expand an item first if you want it included in Export all.': 'وسّع عنصرًا أولًا إذا كنت تريد تضمينه في تصدير الكل.',
};

function normalizeLibraryError(message: string | undefined, t: (key: string) => string) {
  const lower = message?.toLowerCase() ?? '';
  if (lower.includes('network')) return t('Network connection issue — try again in a moment.');
  if (lower.includes('database')) return t('Database unavailable right now. Please try again shortly.');
  if (lower.includes('load library')) return t('Could not load library right now. Check your connection and try again.');
  return message ?? t('Could not load library right now. Check your connection and try again.');
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/library?summary=1');
      if (!res.ok) throw new Error('Failed to load library');
      setItems(await res.json());
    } catch (error) {
      setLoadError(normalizeLibraryError(error instanceof Error ? error.message : undefined, t));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const ensureFullItem = useCallback(async (item: LibItem) => {
    if (typeof item.content === 'string') return item;
    const res = await fetch(`/api/library/${item.id}`);
    if (!res.ok) throw new Error('Failed to load item');
    const fullItem = await res.json() as LibItem;
    setItems((prev) => prev.map((entry) => (entry.id === fullItem.id ? fullItem : entry)));
    return fullItem;
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
      toast(t('Could not delete this item right now.'), 'error');
    }
  }

  function copyItem(content: string) {
    navigator.clipboard.writeText(content)
      .then(() => toast(t('Copied!'), 'success'))
      .catch(() => toast(t('Could not copy this content automatically.'), 'error'));
  }

  async function exportItem(item: LibItem) {
    if (typeof item.content !== 'string') {
      toast(t('Loading the full item first…'), 'info');
      void ensureFullItem(item).then(exportItem).catch(() => {
        toast(t('Could not load the full item right now.'), 'error');
      });
      return;
    }
    const meta  = MODE_META[item.mode] ?? { label: item.mode, color: '', icon: '' };
    const title = (item.metadata?.title || item.metadata?.problem || meta.label).trim().slice(0, 60);
    const name  = title.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '_') || 'export';
    try {
      const { generateDocx } = await import('@/lib/export/docx');
      const blob = await generateDocx({ title, content: item.content });
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `${name}.docx` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Word document saved to downloads.', 'success');
    } catch {
      toast(t('Could not export this item to Word right now.'), 'error');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const prev = items;
    setItems(p => p.filter(i => !ids.includes(i.id)));
    setSelectedIds(new Set());
    try {
      await Promise.all(ids.map(id => fetch(`/api/library/${id}`, { method: 'DELETE' })));
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast(`Deleted ${ids.length} item${ids.length === 1 ? '' : 's'}`, 'info');
    } catch {
      setItems(prev);
      toast(t('Could not delete some selected items.'), 'error');
    }
  }

  async function renameItem(id: string, newTitle: string) {
    const trimmed = newTitle.trim();
    setEditingId(null);
    if (!trimmed) return;
    setItems(prev => prev.map(item =>
      item.id === id
        ? { ...item, metadata: { ...(item.metadata ?? {}), title: trimmed } }
        : item,
    ));
    try {
      const res = await fetch(`/api/library/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { title: trimmed } }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast(t('Could not rename this item right now.'), 'error');
      void load();
    }
  }

  const countByType = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const item of items) c[item.mode] = (c[item.mode] ?? 0) + 1;
    return c;
  }, [items]);

  const searchTokens = useMemo(() => tokenize(search), [search]);

  const filtered = useMemo(() => {
    const typeOk = (item: LibItem) => typeFilter === 'all' || item.mode === typeFilter;
    if (searchTokens.length === 0) return items.filter(typeOk);
    return items
      .filter(typeOk)
      .map(item => ({ item, score: scoreItem(item, searchTokens) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item);
  }, [items, searchTokens, typeFilter]);

  const libraryStats = useMemo(() => {
    const typeCount = new Set(items.map((item) => item.mode)).size;
    const newest = items[0]?.createdAt ?? null;
    const sourceBacked = items.filter((item) => item.metadata?.sourceFileName || item.metadata?.sourceDeckName).length;
    return { total: items.length, typeCount, newest, sourceBacked };
  }, [items]);

  return (
    <div className="lib-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="lib-shell">
        <div className="lib-hero">
          <div className="lib-title-block">
            <span className="lib-eyebrow">Library</span>
            <div className="lib-title-row">
              <h1 className="lib-title">{t('Library')}</h1>
              {items.length > 0 && (
                <span className="lib-count">{items.length} {t('saved outputs')}</span>
              )}
            </div>
            <p className="lib-subtitle">
              Keep your notes, quizzes, summaries, and saved outputs in one place, then open, print, export, or share them when you need them.
            </p>
          </div>
          <div className="lib-stat-grid">
            <div className="lib-stat-card">
              <span className="lib-stat-label">Saved items</span>
              <strong>{libraryStats.total}</strong>
            </div>
            <div className="lib-stat-card">
              <span className="lib-stat-label">Content types</span>
              <strong>{libraryStats.typeCount}</strong>
            </div>
            <div className="lib-stat-card">
              <span className="lib-stat-label">Source-backed</span>
              <strong>{libraryStats.sourceBacked}</strong>
            </div>
            <div className="lib-stat-card">
              <span className="lib-stat-label">Latest save</span>
              <strong>{libraryStats.newest ? formatDate(libraryStats.newest, { month: 'short', day: 'numeric' }) : '—'}</strong>
            </div>
          </div>
        </div>

        <div className="lib-controls-grid">
          <section className="lib-controls-card">
            <div className="lib-controls-head">
              <strong>Browse</strong>
              {selectedIds.size > 0 && (
                <button
                  className="lib-btn lib-btn-ghost lib-btn-sm lib-btn-danger"
                  onClick={() => void bulkDelete()}
                >
                  🗑️ Delete selected ({selectedIds.size})
                </button>
              )}
              {filtered.length > 0 && (
                <button
                  className="lib-btn lib-btn-ghost lib-btn-sm lib-export-all-btn"
                  onClick={() => {
                    const readyItems = filtered.filter((item) => typeof item.content === 'string');
                    if (readyItems.length !== filtered.length) {
                      toast(t('Expand an item first if you want it included in Export all.'), 'info');
                    }
                    printMultiple(readyItems.map(item => ({
                      title: item.metadata?.title || item.metadata?.problem || (MODE_META[item.mode]?.label ?? item.mode),
                      content: item.content ?? item.contentPreview ?? '',
                    })));
                  }}
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
            <p className="lib-controls-note">
              Search titles, source names, modes, and saved content.
            </p>
          </section>

          <section className="lib-controls-card">
            <div className="lib-controls-head">
              <strong>Filter by type</strong>
              <span className="lib-controls-note">{filtered.length} visible</span>
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
          </section>
        </div>

        <section className="lib-starter">
          <div className="lib-starter-copy">
            <span className="lib-eyebrow">{t('Starter paths')}</span>
            <strong>Start with a useful lane, not a blank library</strong>
            <p>{t('You do not need a saved deck marketplace to begin. These guided entry points open the right part of Kivora so you can create useful study material fast.')}</p>
          </div>
          <div className="lib-starter-grid">
            {STARTER_COLLECTIONS.map((entry) => (
              <Link key={entry.title} className="lib-starter-card" href={entry.href}>
                <span className="lib-starter-badge">{entry.badge}</span>
                <strong>{t(entry.title)}</strong>
                <p>{t(entry.description)}</p>
                <span className="lib-starter-link">{t('Open path')} →</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

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
              {searchTokens.length > 1 && (
                <p className="lib-empty-body" style={{ marginTop: 6 }}>
                  Searching for all {searchTokens.length} words — try fewer terms
                </p>
              )}
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
            const meta    = MODE_META[item.mode] ?? { label: item.mode, color: 'var(--border-2)', icon: '\uD83D\uDCC4' };
            const title   = item.metadata?.title || item.metadata?.problem || meta.label;
            const isExp   = expanded === item.id;
            const isSearch = searchTokens.length > 0;
            const contentText = item.content ?? item.contentPreview ?? '';
            const snippet  = isSearch && !isExp ? getSnippet(contentText, searchTokens) : null;
            return (
              <div key={item.id} className="lib-card" style={{ borderLeft: `3px solid ${meta.color}` }}>
                {/* Card header */}
                <div className="lib-card-header">
                  <input
                    type="checkbox"
                    className="lib-card-check"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    aria-label="Select item"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="lib-card-badge" style={{
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 12%, var(--bg-inset))`,
                  }}>
                    {meta.icon} {meta.label}
                  </span>
                  {editingId === item.id ? (
                    <input
                      className="lib-title-input"
                      value={editingTitle}
                      autoFocus
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onBlur={() => void renameItem(item.id, editingTitle)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void renameItem(item.id, editingTitle);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                  ) : (
                    <strong
                      className="lib-card-title lib-card-title-editable"
                      title="Click to rename"
                      onClick={() => { setEditingId(item.id); setEditingTitle(title); }}
                    >
                      <Highlight text={title} tokens={searchTokens} />
                    </strong>
                  )}
                  <span className="lib-card-date">
                    {formatDate(item.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <button
                    className="lib-icon-btn lib-icon-btn-print"
                    title={t('Print')}
                    aria-label={t('Print')}
                    onClick={() => {
                      if (typeof item.content === 'string') {
                        printContent(title, item.content);
                        return;
                      }
                      toast(t('Loading the full item first…'), 'info');
                      void ensureFullItem(item).then((fullItem) => {
                        printContent(title, fullItem.content ?? '');
                      }).catch(() => {
                        toast(t('Could not load the full item right now.'), 'error');
                      });
                    }}
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

                {/* Content — snippet when searching, clamped preview otherwise */}
                {snippet ? (
                  <div className="lib-card-content lib-card-snippet">
                    <Highlight text={snippet} tokens={searchTokens} />
                  </div>
                ) : (
                  <div
                    className="lib-card-content"
                    style={isExp ? {} : {
                      display: '-webkit-box',
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    } as React.CSSProperties}
                  >
                    {typeof item.content === 'string' ? item.content : contentText}
                  </div>
                )}

                {/* Actions */}
                <div className="lib-card-actions">
                  <button className="lib-btn lib-btn-ghost lib-btn-sm"
                    onClick={() => {
                      setExpanded(prev => prev === item.id ? null : item.id);
                      if (!isExp && typeof item.content !== 'string') {
                        void ensureFullItem(item).catch(() => {
                          toast(t('Could not load the full item right now.'), 'error');
                        });
                      }
                    }}>
                    {isExp ? t('Collapse') : t('Expand')}
                  </button>
                  <button className="lib-btn lib-btn-ghost lib-btn-sm" onClick={() => {
                    if (typeof item.content === 'string') {
                      copyItem(item.content);
                      return;
                    }
                    toast(t('Loading the full item first…'), 'info');
                    void ensureFullItem(item).then((fullItem) => {
                      copyItem(fullItem.content ?? '');
                    }).catch(() => {
                      toast(t('Could not load the full item right now.'), 'error');
                    });
                  }}>
                    {'\uD83D\uDCCB'} {t('Copy')}
                  </button>
                  <button className="lib-btn lib-btn-ghost lib-btn-sm" onClick={() => void exportItem(item)}>
                    📄 {t('Word')}
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
        .lib-shell { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
        .lib-hero {
          display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 14px;
          padding: 18px; border: 1px solid var(--border-2); border-radius: 18px;
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 10%, transparent), transparent 35%),
            linear-gradient(180deg, var(--bg-surface), var(--bg-inset));
        }
        .lib-title-block { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .lib-eyebrow {
          font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: var(--accent);
        }
        .lib-title-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
        .lib-title { font-size: var(--text-3xl, 1.75rem); font-weight: 700; margin: 0; }
        .lib-count { font-size: var(--text-sm); color: var(--text-3); }
        .lib-subtitle { margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-2); max-width: 700px; }
        .lib-stat-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .lib-stat-card {
          display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 14px;
          border: 1px solid var(--border-2); background: color-mix(in srgb, var(--bg-surface) 85%, var(--bg-inset));
        }
        .lib-stat-label { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
        .lib-stat-card strong { font-size: 20px; color: var(--text); }
        .lib-controls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .lib-starter {
          display: grid;
          gap: 14px;
          padding: 16px 18px;
          border: 1px solid var(--border-2);
          border-radius: 18px;
          background:
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 92%, transparent), color-mix(in srgb, var(--bg-inset) 92%, transparent));
        }
        .lib-starter-copy { display: grid; gap: 6px; }
        .lib-starter-copy strong { font-size: 1.05rem; color: var(--text); }
        .lib-starter-copy p { margin: 0; color: var(--text-2); line-height: 1.6; max-width: 56rem; }
        .lib-starter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .lib-starter-card {
          display: grid;
          gap: 8px;
          min-height: 150px;
          padding: 14px;
          border-radius: 14px;
          border: 1px solid var(--border-2);
          background: color-mix(in srgb, var(--bg-surface) 82%, transparent);
          color: inherit;
          text-decoration: none;
        }
        .lib-starter-card strong { color: var(--text); }
        .lib-starter-card p { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.6; }
        .lib-starter-badge {
          width: fit-content;
          padding: 3px 9px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent);
          color: var(--accent);
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .lib-starter-link { margin-top: auto; color: var(--accent); font-size: 12px; font-weight: 700; }
        .lib-controls-card {
          display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px;
          border: 1px solid var(--border-2); background: var(--bg-surface);
        }
        .lib-controls-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .lib-controls-head strong { font-size: 14px; color: var(--text); }
        .lib-controls-note { margin: 0; font-size: 12px; color: var(--text-3); }
        .lib-search {
          width: 100%; max-width: 420px; padding: 9px 14px;
          border: 1px solid var(--border-2); border-radius: 8px;
          background: var(--bg-surface); color: var(--text); font-size: var(--text-sm);
          transition: border-color 0.15s;
        }
        .lib-search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
        .lib-search::placeholder { color: var(--text-3); }
        .lib-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
        .lib-pill {
          display: flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 999px;
          border: 1px solid var(--border-2); background: var(--bg-surface); color: var(--text-2);
          font-size: 12px; cursor: pointer; transition: all 0.15s;
        }
        .lib-pill:hover { background: var(--bg-inset); border-color: var(--border-3); color: var(--text); }
        .lib-pill.active { font-weight: 600; border-color: var(--accent); color: var(--accent); background: var(--accent-bg); }
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
        .lib-error-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 14px; margin-bottom: 16px; border-radius: 10px; background: var(--danger-bg); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); color: var(--danger); font-size: 13px; }
        .lib-empty { text-align: center; padding: 60px 20px; border: 1.5px dashed var(--border-2); border-radius: 14px; }
        .lib-empty-icon { font-size: 52px; margin-bottom: 14px; }
        .lib-empty-title { font-size: var(--text-lg); font-weight: 600; margin: 0 0 8px; }
        .lib-empty-body { color: var(--text-3); font-size: var(--text-sm); margin: 0; }
        .lib-list { display: flex; flex-direction: column; gap: 10px; }
        .lib-card {
          padding: 14px 16px; background: var(--bg-surface);
          border-radius: 12px; border: 1px solid var(--border-2);
          transition: box-shadow 0.18s, border-color 0.18s, transform 0.18s;
        }
        .lib-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.14); border-color: var(--border-3); transform: translateY(-1px); }
        .lib-card-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .lib-card-badge {
          padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
        }
        .lib-card-check { width: 15px; height: 15px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0; }
        .lib-card-title { font-size: var(--text-sm); font-weight: 600; flex: 1; min-width: 0; }
        .lib-card-title-editable { cursor: text; }
        .lib-card-title-editable:hover { text-decoration: underline; text-decoration-style: dotted; }
        .lib-title-input { font-size: var(--text-sm); font-weight: 600; flex: 1; min-width: 0; padding: 2px 6px; border: 1px solid var(--accent); border-radius: 5px; background: var(--bg-surface); color: var(--text); outline: none; }
        .lib-btn-danger:hover { border-color: var(--danger) !important; color: var(--danger) !important; }
        .lib-card-date { font-size: 11px; color: var(--text-3); margin-left: auto; white-space: nowrap; }
        .lib-icon-btn {
          background: none; border: none; cursor: pointer; color: var(--text-3);
          font-size: 13px; padding: 2px 5px; border-radius: 4px; transition: all 0.15s;
        }
        .lib-icon-btn:hover { color: var(--danger); background: var(--danger-bg); }
        .lib-icon-btn-print:hover { color: var(--text) !important; background: var(--bg-inset) !important; }
        .lib-card-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .lib-tag {
          padding: 2px 8px; border-radius: 5px; font-size: 11px;
          background: var(--bg-inset); color: var(--text-2); border: 1px solid var(--border-2);
        }
        .lib-tag-accent { background: color-mix(in srgb, var(--accent) 12%, var(--bg-inset)); color: var(--accent); }
        .lib-card-content { font-size: var(--text-sm); color: var(--text-2); white-space: pre-wrap; line-height: 1.6; margin-bottom: 10px; }
        .lib-card-snippet { white-space: normal; font-style: italic; color: var(--text-3); }
        :global(.lib-highlight) { background: color-mix(in srgb, var(--warning) 22%, var(--surface-2)); color: var(--warning); border-radius: 3px; padding: 0 2px; font-style: normal; font-weight: 600; }
        .lib-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
        .lib-btn { display: inline-flex; align-items: center; gap: 5px; border-radius: 7px; font-weight: 500; cursor: pointer; text-decoration: none; transition: all 0.15s; }
        .lib-btn-primary { padding: 8px 16px; background: var(--accent); color: #fff; border: none; font-size: var(--text-sm); }
        .lib-btn-primary:hover { background: var(--accent-h); }
        .lib-btn-ghost { padding: 5px 10px; background: transparent; border: 1px solid var(--border-2); color: var(--text-2); font-size: 12px; }
        .lib-btn-ghost:hover { background: var(--bg-inset); color: var(--text); border-color: var(--border-3); }
        .lib-btn-sm { font-size: 12px; }
        .lib-btn-share:hover { border-color: var(--accent) !important; color: var(--accent) !important; }
        @media (max-width: 900px) {
          .lib-hero,
          .lib-controls-grid,
          .lib-starter-grid { grid-template-columns: 1fr; }
          .lib-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .lib-stat-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
