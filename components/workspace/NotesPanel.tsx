'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  folderId: string | null;
  injectContent?: string;     // When user clicks "Open in Notes" from Generate tab
  onInjectConsumed?: () => void;
}

const STORAGE_PREFIX = 'kivora-notes-';

/* Very small markdown-like preview: bold, italic, headings, bullets, code */
function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="margin:14px 0 4px;font-size:1em">$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2 style="margin:16px 0 6px;font-size:1.1em">$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1 style="margin:18px 0 8px;font-size:1.25em">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`([^`]+)`/g,     '<code style="background:var(--surface-2);padding:1px 5px;border-radius:4px;font-size:0.88em;font-family:monospace">$1</code>')
    .replace(/^[-*] (.+)$/gm,  '<div style="padding-left:14px">• $1</div>')
    .replace(/^(\d+)\. (.+)$/gm,'<div style="padding-left:14px">$1. $2</div>')
    .replace(/^---$/gm,        '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">')
    .replace(/\n/g, '<br>');
}

type ViewMode = 'edit' | 'preview' | 'split';

export function NotesPanel({ folderId, injectContent, onInjectConsumed }: Props) {
  const [content,  setContent]  = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [saved,    setSaved]    = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Storage key per folder (or global if no folder)
  const storageKey = folderId ? `${STORAGE_PREFIX}${folderId}` : `${STORAGE_PREFIX}global`;

  // Load saved notes on mount / folder change
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    setContent(saved ?? '');
    setSaved(true);
  }, [storageKey]);

  // Inject AI-generated content when requested
  useEffect(() => {
    if (!injectContent) return;
    setContent(prev => {
      const divider = prev.trim() ? '\n\n---\n\n' : '';
      return prev + divider + injectContent;
    });
    setSaved(false);
    onInjectConsumed?.();
  }, [injectContent, onInjectConsumed]);

  // Debounced save to localStorage
  const debouncedSave = useCallback((text: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (typeof window !== 'undefined') localStorage.setItem(storageKey, text);
      setSaved(true);
    }, 800);
  }, [storageKey]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    setSaved(false);
    debouncedSave(e.target.value);
  }

  // Toolbar helpers
  function wrap(before: string, after: string, placeholder = '') {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const selected = v.slice(s, e) || placeholder;
    const next = v.slice(0, s) + before + selected + after + v.slice(e);
    setContent(next);
    setSaved(false);
    debouncedSave(next);
    // Restore cursor inside the wrapping
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + selected.length);
    }, 0);
  }

  function insertLine(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    const next = v.slice(0, lineStart) + prefix + v.slice(lineStart);
    setContent(next);
    setSaved(false);
    debouncedSave(next);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + prefix.length, s + prefix.length); }, 0);
  }

  function downloadNotes() {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `notes-${folderId ?? 'global'}-${new Date().toISOString().slice(0,10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearNotes() {
    if (!confirm('Clear all notes for this folder? This cannot be undone.')) return;
    setContent('');
    setSaved(true);
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey);
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        {/* Formatting buttons */}
        {[
          { label: 'B',   title: 'Bold (Ctrl+B)',          action: () => wrap('**', '**', 'bold text'),       style: { fontWeight: 700 } },
          { label: 'I',   title: 'Italic (Ctrl+I)',         action: () => wrap('*', '*', 'italic text'),       style: { fontStyle: 'italic' } },
          { label: 'H1',  title: 'Heading 1',               action: () => insertLine('# ') },
          { label: 'H2',  title: 'Heading 2',               action: () => insertLine('## ') },
          { label: 'H3',  title: 'Heading 3',               action: () => insertLine('### ') },
          { label: '•',   title: 'Bullet list',             action: () => insertLine('- ') },
          { label: '1.',  title: 'Numbered list',           action: () => insertLine('1. ') },
          { label: '</>',  title: 'Inline code',            action: () => wrap('`', '`', 'code') },
          { label: '---', title: 'Horizontal divider',      action: () => { const ta = textareaRef.current; if (!ta) return; const { selectionStart: s, value: v } = ta; const next = v.slice(0,s) + '\n---\n' + v.slice(s); setContent(next); setSaved(false); debouncedSave(next); } },
        ].map(btn => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={btn.action}
            style={{
              padding: '2px 7px',
              background: 'var(--surface)',
              border: '1px solid var(--border-2)',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 11,
              color: 'var(--text-2)',
              fontFamily: 'monospace',
              ...(btn.style ?? {}),
            }}
          >
            {btn.label}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

        {/* View mode switcher */}
        {(['edit', 'split', 'preview'] as ViewMode[]).map(m => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            style={{
              padding: '2px 8px',
              background: viewMode === m ? 'var(--accent)' : 'var(--surface)',
              color: viewMode === m ? '#fff' : 'var(--text-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 11,
              textTransform: 'capitalize',
            }}
          >
            {m === 'edit' ? '✏ Edit' : m === 'preview' ? '👁 Preview' : '⬛ Split'}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {saved ? '✓ Saved' : '…saving'} · {wordCount} words
          </span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={downloadNotes} title="Export as .md">⬇</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={clearNotes} title="Clear notes">✕</button>
        </div>
      </div>

      {/* Editor / Preview area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Editor pane */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            placeholder={`# My Notes\n\nStart typing in Markdown…\n\n- Use **bold** or *italic*\n- Add headings with # / ## / ###\n- Use \`code\` for inline code\n\nTip: Switch to Split view to see the preview alongside.`}
            spellCheck
            style={{
              flex: 1,
              padding: '16px 20px',
              background: 'var(--surface)',
              border: 'none',
              borderRight: viewMode === 'split' ? '1px solid var(--border)' : 'none',
              color: 'var(--text)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
              lineHeight: 1.75,
              resize: 'none',
              outline: 'none',
              overflowY: 'auto',
              boxSizing: 'border-box',
            }}
          />
        )}

        {/* Preview pane */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className="tool-output"
            style={{
              flex: 1,
              padding: '16px 20px',
              overflowY: 'auto',
              borderLeft: viewMode === 'split' ? 'none' : 'none',
            }}
            dangerouslySetInnerHTML={{ __html: content.trim() ? mdToHtml(content) : '<p style="color:var(--text-3);font-style:italic">Preview will appear here as you type…</p>' }}
          />
        )}
      </div>
    </div>
  );
}
