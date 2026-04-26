'use client';

/**
 * WorkspaceShell — the v2 layout for /workspace.
 *
 * Wraps the existing FolderPanel + WorkspacePanel + ReportsSidebar
 * components in a new three-zone layout with a header strip on top.
 * Keeps every behaviour the existing components already implement —
 * this layer only reorganises the canvas and gives the page identity:
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Header — greeting · breadcrumb · quick start chips          │
 *   ├──────────┬──────────────────────────────┬───────────────────┤
 *   │ Folder   │ Workbench                    │ Today drawer      │
 *   │ panel    │ (existing WorkspacePanel)    │ (collapsible)     │
 *   └──────────┴──────────────────────────────┴───────────────────┘
 *
 * The Today drawer surfaces context that's already computed elsewhere
 * (file count, generations, due cards) without duplicating UI from the
 * global AppShell sidebar — it focuses on "what's happening in THIS
 * folder right now" rather than global stats.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import styles from './workspace-shell.module.css';

interface WorkspaceShellProps {
  /** Currently selected folder name from FolderPanel. Empty string when none. */
  folderName?: string;
  /** Currently selected topic name from FolderPanel. Empty string when none. */
  topicName?: string;
  /** Number of files in the current folder, for the Today drawer stat. */
  fileCount?: number;
  /** Optional callback when the user clicks a quick-start chip. */
  onQuickStart?: (target: 'tools' | 'notes' | 'flashcards' | 'paste') => void;
  /** The body — typically <FolderPanel/> + <WorkspacePanel/> + optional sidebar. */
  children: React.ReactNode;
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5)  return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

function firstName(name: string | null | undefined, fallback = 'there'): string {
  if (!name?.trim()) return fallback;
  const first = name.trim().split(/\s+/)[0];
  return first.length > 0 ? first : fallback;
}

export function WorkspaceShell({
  folderName,
  topicName,
  fileCount = 0,
  onQuickStart,
  children,
}: WorkspaceShellProps) {
  const { data: session } = useSession();
  // Initial state must match the server render (no localStorage on the server).
  // Reading localStorage during the initial render causes a hydration mismatch
  // on the data-collapsed attribute, so defer the read to a post-mount effect
  // and accept a single re-render to apply the persisted preference.
  const [todayCollapsed, setTodayCollapsed] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setTodayCollapsed(window.localStorage.getItem('kivora_workspace_today_collapsed') === '1');
    setHydrated(true);
  }, []);
  // Persist the drawer collapsed state so the user doesn't have to
  // re-collapse it every page load. Skip the first render so we don't
  // overwrite the persisted value with the SSR default before reading it.
  useEffect(() => {
    if (typeof window === 'undefined' || !hydrated) return;
    window.localStorage.setItem('kivora_workspace_today_collapsed', todayCollapsed ? '1' : '0');
  }, [todayCollapsed, hydrated]);

  const greeting = useMemo(() => timeOfDayGreeting(), []);
  const userFirst = firstName(session?.user?.name, 'there');

  return (
    <div className={styles.shell}>
      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.greetingBlock}>
          <h1 className={styles.greeting}>
            {greeting}, <span className={styles.greetingAccent}>{userFirst}</span>
          </h1>
          <span className={styles.breadcrumb}>
            <span>Workspace</span>
            {folderName && (
              <>
                <span className={styles.breadcrumbSep}>›</span>
                <strong>{folderName}</strong>
              </>
            )}
            {topicName && (
              <>
                <span className={styles.breadcrumbSep}>›</span>
                <strong>{topicName}</strong>
              </>
            )}
            {!folderName && (
              <>
                <span className={styles.breadcrumbSep}>·</span>
                <span>pick a folder to get started</span>
              </>
            )}
          </span>
        </div>

        {/* Quick start — single-click access to the three primary tools.
            "Paste text" goes straight to Tools with paste mode pre-armed. */}
        <nav className={styles.quickActions} aria-label="Quick start">
          <button
            type="button"
            className={styles.quickChip}
            data-tone="mint"
            onClick={() => onQuickStart?.('tools')}
            title="Generate from a source"
          >
            ⚡ Tools
          </button>
          <button
            type="button"
            className={styles.quickChip}
            data-tone="butter"
            onClick={() => onQuickStart?.('notes')}
            title="Open the Notes editor"
          >
            📓 Notes
          </button>
          <button
            type="button"
            className={styles.quickChip}
            data-tone="peach"
            onClick={() => onQuickStart?.('flashcards')}
            title="Review your decks"
          >
            🃏 Flashcards
          </button>
          <button
            type="button"
            className={styles.quickChip}
            data-tone="sky"
            onClick={() => onQuickStart?.('paste')}
            title="Paste text and start fast"
          >
            ✍ Paste
          </button>
        </nav>
      </header>

      {/* ── THREE-ZONE BODY ─────────────────────────────────────────── */}
      <div className={styles.body}>
        {/*
          The first two children are the existing FolderPanel and
          WorkspacePanel — they're rendered as-is. The Today drawer
          is added as a third zone after them.
        */}
        {children}

        {/* ── TODAY DRAWER (right zone, collapsible) ─────────────── */}
        <aside
          className={styles.todayDrawer}
          data-collapsed={todayCollapsed}
          aria-label="Today panel"
        >
          <div className={styles.todayHeader}>
            {!todayCollapsed && <strong>Today</strong>}
            <button
              type="button"
              className={styles.todayToggle}
              onClick={() => setTodayCollapsed(c => !c)}
              aria-label={todayCollapsed ? 'Expand Today panel' : 'Collapse Today panel'}
              title={todayCollapsed ? 'Expand' : 'Collapse'}
            >
              {todayCollapsed ? '‹' : '›'}
            </button>
          </div>
          <div className={styles.todayContent}>
            {/* Folder context — what you're looking at. */}
            <div className={styles.statCard} data-tone="mint">
              <span className={styles.statLabel}>This folder</span>
              <span className={styles.statValue}>{fileCount}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--kv-ink-3)' }}>
                {fileCount === 1 ? 'file ready' : 'files ready'}
              </span>
            </div>

            {/* Quick links into the rest of the product. Saves the user
                from going back to the global sidebar to navigate. */}
            <span className={styles.sectionLabel}>Jump to</span>
            <Link href="/library" className={styles.linkRow}>
              🗂 <span>Library</span> <span>↗</span>
            </Link>
            <Link href="/coach" className={styles.linkRow}>
              🎓 <span>Scholar Hub</span> <span>↗</span>
            </Link>
            <Link href="/planner" className={styles.linkRow}>
              📅 <span>Planner</span> <span>↗</span>
            </Link>
            <Link href="/analytics" className={styles.linkRow}>
              📊 <span>Analytics</span> <span>↗</span>
            </Link>

            {/* Tip strip — small, helpful, dismissible-feeling. */}
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.7rem 0.85rem',
                borderRadius: '12px',
                background: 'var(--kv-cream-2, #f7f4ee)',
                border: '1px solid var(--kv-rule, rgba(0,0,0,0.08))',
                fontSize: '0.78rem',
                color: 'var(--kv-ink-2, #4a4a4a)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--kv-ink, #1a1a1a)' }}>
                Tip
              </strong>
              Drop a PDF into Files, then hit ⚡ Tools to generate notes, MCQs,
              or exam prep from it.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
