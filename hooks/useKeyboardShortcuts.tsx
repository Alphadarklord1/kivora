'use client';

import { useEffect, useCallback, useRef } from 'react';

type KeyHandler = (event: KeyboardEvent) => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean; // Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
  description?: string;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  ignoreInputs?: boolean; // Ignore when focused on inputs
}

// Detect if running on Mac
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * Hook for registering keyboard shortcuts
 *
 * @example
 * useKeyboardShortcuts([
 *   { key: 's', meta: true, handler: handleSave, description: 'Save' },
 *   { key: 'k', meta: true, handler: openSearch, description: 'Search' },
 * ]);
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutConfig[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, ignoreInputs = true } = options;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore if typing in an input field
      if (ignoreInputs) {
        const target = event.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable;

        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable) {
          // Allow Escape key even in inputs
          if (event.key !== 'Escape') return;
        }
      }

      for (const shortcut of shortcutsRef.current) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();

        // Handle Cmd/Ctrl cross-platform
        const modifierMatches = (
          (shortcut.ctrl ? event.ctrlKey : !event.ctrlKey || shortcut.meta) &&
          (shortcut.meta ? (isMac ? event.metaKey : event.ctrlKey) : (isMac ? !event.metaKey : true)) &&
          (shortcut.shift ? event.shiftKey : !event.shiftKey) &&
          (shortcut.alt ? event.altKey : !event.altKey)
        );

        // Simplified check: if meta is specified, treat as Cmd on Mac, Ctrl elsewhere
        const cmdCtrlMatches = shortcut.meta
          ? (isMac ? event.metaKey : event.ctrlKey)
          : (!event.metaKey && !event.ctrlKey);

        const ctrlOnlyMatches = shortcut.ctrl
          ? event.ctrlKey
          : true;

        const shiftMatches = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatches = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatches && cmdCtrlMatches && shiftMatches && altMatches) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler(event);
          return;
        }
      }
    },
    [enabled, ignoreInputs]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Common app-wide shortcuts
 */
export function useAppShortcuts({
  onSave,
  onSearch,
  onNewFolder,
  onHelp,
  onEscape,
}: {
  onSave?: () => void;
  onSearch?: () => void;
  onNewFolder?: () => void;
  onHelp?: () => void;
  onEscape?: () => void;
}) {
  const shortcuts: ShortcutConfig[] = [];

  if (onSave) {
    shortcuts.push({
      key: 's',
      meta: true,
      handler: onSave,
      description: 'Save',
    });
  }

  if (onSearch) {
    shortcuts.push({
      key: 'k',
      meta: true,
      handler: onSearch,
      description: 'Search',
    });
  }

  if (onNewFolder) {
    shortcuts.push({
      key: 'n',
      meta: true,
      shift: true,
      handler: onNewFolder,
      description: 'New Folder',
    });
  }

  if (onHelp) {
    shortcuts.push({
      key: '?',
      shift: true,
      handler: onHelp,
      description: 'Help',
    });
  }

  if (onEscape) {
    shortcuts.push({
      key: 'Escape',
      handler: onEscape,
      description: 'Close/Cancel',
    });
  }

  useKeyboardShortcuts(shortcuts);
}

/**
 * Format a shortcut for display
 */
export function formatShortcut(shortcut: Omit<ShortcutConfig, 'handler'>): string {
  const parts: string[] = [];

  if (shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.ctrl && !shortcut.meta) {
    parts.push('Ctrl');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }

  // Format the key nicely
  let keyDisplay = shortcut.key.toUpperCase();
  if (shortcut.key === 'Escape') keyDisplay = 'Esc';
  if (shortcut.key === 'Enter') keyDisplay = '↵';
  if (shortcut.key === 'Backspace') keyDisplay = '⌫';
  if (shortcut.key === 'ArrowUp') keyDisplay = '↑';
  if (shortcut.key === 'ArrowDown') keyDisplay = '↓';
  if (shortcut.key === 'ArrowLeft') keyDisplay = '←';
  if (shortcut.key === 'ArrowRight') keyDisplay = '→';

  parts.push(keyDisplay);

  return parts.join(isMac ? '' : '+');
}

/**
 * Shortcut display component
 */
export function ShortcutBadge({
  shortcut
}: {
  shortcut: Omit<ShortcutConfig, 'handler'>
}) {
  const formatted = formatShortcut(shortcut);

  return (
    <span
      style={{
        display: 'inline-flex',
        gap: '2px',
        padding: '2px 6px',
        fontSize: '11px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 500,
        color: 'var(--text-secondary, #6b7280)',
        backgroundColor: 'var(--bg-secondary, #f3f4f6)',
        borderRadius: '4px',
        border: '1px solid var(--border-color, #e5e7eb)',
      }}
    >
      {formatted}
    </span>
  );
}

// Export common shortcut definitions
export const SHORTCUTS = {
  save: { key: 's', meta: true, description: 'Save' },
  search: { key: 'k', meta: true, description: 'Search' },
  newFolder: { key: 'n', meta: true, shift: true, description: 'New Folder' },
  help: { key: '?', shift: true, description: 'Show Help' },
  escape: { key: 'Escape', description: 'Close/Cancel' },
  delete: { key: 'Backspace', meta: true, description: 'Delete' },
  selectAll: { key: 'a', meta: true, description: 'Select All' },
  undo: { key: 'z', meta: true, description: 'Undo' },
  redo: { key: 'z', meta: true, shift: true, description: 'Redo' },
} as const;
