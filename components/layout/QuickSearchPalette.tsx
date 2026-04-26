'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

export type QuickSearchType = 'page' | 'file' | 'library';

export interface QuickSearchItem {
  id: string;
  type: QuickSearchType;
  title: string;
  subtitle?: string;
  href: string;
  icon: string;
  searchText: string;
}

interface QuickSearchPaletteProps {
  isOpen: boolean;
  query: string;
  items: QuickSearchItem[];
  loading: boolean;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onSelect: (item: QuickSearchItem) => void;
}

export function QuickSearchPalette({
  isOpen,
  query,
  items,
  loading,
  onQueryChange,
  onClose,
  onSelect,
}: QuickSearchPaletteProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const { t } = useI18n();

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.slice(0, 40);
    return items
      .filter((item) => item.searchText.toLowerCase().includes(normalized))
      .slice(0, 40);
  }, [items, query]);

  const grouped = useMemo(() => {
    const pages = filtered.filter((item) => item.type === 'page');
    const files = filtered.filter((item) => item.type === 'file');
    const library = filtered.filter((item) => item.type === 'library');
    return [
      { key: 'page' as const, label: t('Pages'), items: pages },
      { key: 'file' as const, label: t('Files'), items: files },
      { key: 'library' as const, label: t('Library'), items: library },
    ];
  }, [filtered, t]);

  useEffect(() => {
    if (!isOpen) return;
    const resetIndex = window.setTimeout(() => setActiveIndex(0), 0);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => {
      window.clearTimeout(resetIndex);
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (!filtered.length) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filtered.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const selected = filtered[activeIndex];
        if (selected) onSelect(selected);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, filtered, isOpen, onClose, onSelect]);

  if (!isOpen) return null;

  let runningIndex = -1;

  return (
    <div className="quick-search-overlay" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="quick-search-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="quick-search-header">
          <h3>{t('Quick Search')}</h3>
          <p>{t('Use arrows to navigate, Enter to open, Esc to close')}</p>
        </div>

        <div className="quick-search-input-row">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('Search pages, files, and library...')}
            aria-label={t('Quick Search')}
          />
        </div>

        <div className="quick-search-results">
          {loading ? (
            <div className="quick-search-empty">{t('Loading')}...</div>
          ) : filtered.length === 0 ? (
            <div className="quick-search-empty">
              <strong>{t('No results')}</strong>
              <span>{t('Type to search pages, files, and library items.')}</span>
            </div>
          ) : (
            grouped.map((group) => {
              if (!group.items.length) return null;
              return (
                <div key={group.key} className="result-group">
                  <div className="group-label">{group.label}</div>
                  {group.items.map((item) => {
                    runningIndex += 1;
                    const isActive = runningIndex === activeIndex;
                    return (
                      <button
                        key={item.id}
                        className={`result-row ${isActive ? 'active' : ''}`}
                        onMouseEnter={() => setActiveIndex(runningIndex)}
                        onClick={() => onSelect(item)}
                      >
                        <span className="result-icon">{item.icon}</span>
                        <span className="result-text">
                          <span className="result-title">{item.title}</span>
                          {item.subtitle ? <span className="result-subtitle">{item.subtitle}</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>

      <style jsx>{`
        .quick-search-overlay {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.54);
          backdrop-filter: blur(2px);
          z-index: 1400;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 10vh var(--space-3) var(--space-3);
        }

        .quick-search-panel {
          width: min(760px, 100%);
          max-height: min(72vh, 680px);
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .quick-search-header {
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .quick-search-header h3 {
          margin: 0;
          font-size: var(--font-sm);
          font-weight: 600;
        }

        .quick-search-header p {
          margin: var(--space-1) 0 0;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .quick-search-input-row {
          padding: var(--space-3) var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .quick-search-input-row input {
          width: 100%;
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          background: var(--bg-base);
          color: var(--text-primary);
          padding: 12px 14px;
          font-size: var(--font-body);
        }

        .quick-search-input-row input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px var(--primary-muted);
        }

        .quick-search-results {
          overflow: auto;
          padding: var(--space-2);
          display: grid;
          gap: var(--space-2);
        }

        .result-group {
          display: grid;
          gap: var(--space-1);
        }

        .group-label {
          font-size: var(--font-tiny);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-faint);
          font-weight: 600;
          padding: 0 var(--space-2);
        }

        .result-row {
          width: 100%;
          border: 1px solid transparent;
          border-radius: var(--radius-md);
          background: transparent;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          text-align: start;
          cursor: pointer;
        }

        .result-row:hover,
        .result-row.active {
          background: color-mix(in srgb, var(--primary-muted) 32%, transparent);
          border-color: color-mix(in srgb, var(--primary) 25%, var(--border-subtle));
        }

        .result-icon {
          width: 24px;
          text-align: center;
          flex-shrink: 0;
        }

        .result-text {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .result-title {
          font-size: var(--font-meta);
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-subtitle {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .quick-search-empty {
          padding: var(--space-6) var(--space-4);
          color: var(--text-muted);
          display: grid;
          gap: var(--space-1);
          justify-items: center;
          text-align: center;
        }

        :global(html[dir='rtl']) .quick-search-panel {
          direction: rtl;
        }
      `}</style>
    </div>
  );
}
