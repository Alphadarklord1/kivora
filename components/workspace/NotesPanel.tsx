'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type NoteStyle = 'study' | 'summary' | 'revision' | 'cornell';

interface Props {
  folderId: string | null;
  injectContent?: string;
  onInjectConsumed?: () => void;
  sourceLabel?: string | null;
  sourceWordCount?: number;
  noteStyle?: NoteStyle;
  onNoteStyleChange?: (style: NoteStyle) => void;
  onGenerateFromSource?: () => void;
  onOpenFiles?: () => void;
}

const STORAGE_PREFIX = 'kivora-notes-';

const NOTE_STYLE_OPTIONS: Array<{ id: NoteStyle; label: string; hint: string }> = [
  { id: 'study', label: 'Study notes', hint: 'Headings, bullets, key terms' },
  { id: 'summary', label: 'Summary sheet', hint: 'Fast overview and takeaways' },
  { id: 'revision', label: 'Revision sheet', hint: 'Exam cues, definitions, recall prompts' },
  { id: 'cornell', label: 'Cornell', hint: 'Cue column, notes, review summary' },
];

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="margin:14px 0 4px;font-size:1em">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:16px 0 6px;font-size:1.1em">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:18px 0 8px;font-size:1.25em">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--surface-2);padding:1px 5px;border-radius:4px;font-size:0.88em;font-family:monospace">$1</code>')
    .replace(/^[-*] (.+)$/gm, '<div style="padding-left:14px">• $1</div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="padding-left:14px">$1. $2</div>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">')
    .replace(/\n/g, '<br>');
}

type ViewMode = 'edit' | 'preview' | 'split';

const TOOLBAR_BTNS: Array<{ label: string; title: string; actionKey: string; style?: React.CSSProperties }> = [
  { label: 'B', title: 'Bold (Ctrl+B)', actionKey: 'bold', style: { fontWeight: 700 } },
  { label: 'I', title: 'Italic (Ctrl+I)', actionKey: 'italic', style: { fontStyle: 'italic' } },
  { label: 'H1', title: 'Heading 1', actionKey: 'h1' },
  { label: 'H2', title: 'Heading 2', actionKey: 'h2' },
  { label: 'H3', title: 'Heading 3', actionKey: 'h3' },
  { label: '•', title: 'Bullet list', actionKey: 'bullet' },
  { label: '1.', title: 'Numbered list', actionKey: 'numbered' },
  { label: '</>', title: 'Inline code', actionKey: 'code' },
  { label: '---', title: 'Horizontal divider', actionKey: 'divider' },
];

export function NotesPanel({
  folderId,
  injectContent,
  onInjectConsumed,
  sourceLabel,
  sourceWordCount,
  noteStyle = 'study',
  onNoteStyleChange,
  onGenerateFromSource,
  onOpenFiles,
}: Props) {
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [saved, setSaved] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = folderId ? `${STORAGE_PREFIX}${folderId}` : `${STORAGE_PREFIX}global`;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedValue = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    setContent(savedValue ?? '');
    setSaved(true);
  }, [storageKey]);

  useEffect(() => {
    if (!injectContent) return;
    setContent((prev) => {
      const divider = prev.trim() ? '\n\n---\n\n' : '';
      return prev + divider + injectContent;
    });
    setSaved(false);
    onInjectConsumed?.();
  }, [injectContent, onInjectConsumed]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  function wrap(before: string, after: string, placeholder = '') {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value: v } = ta;
    const selected = v.slice(s, e) || placeholder;
    const next = v.slice(0, s) + before + selected + after + v.slice(e);
    setContent(next);
    setSaved(false);
    debouncedSave(next);
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
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + prefix.length, s + prefix.length);
    }, 0);
  }

  function insertDivider() {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: s, value: v } = ta;
    const next = v.slice(0, s) + '\n---\n' + v.slice(s);
    setContent(next);
    setSaved(false);
    debouncedSave(next);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s + 5, s + 5);
    }, 0);
  }

  function downloadNotes() {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notes-${folderId ?? 'global'}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearNotes() {
    if (!confirm('Clear all notes for this folder? This cannot be undone.')) return;
    setContent('');
    setSaved(true);
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey);
  }

  const toolbarActions: Record<string, () => void> = {
    bold: () => wrap('**', '**', 'bold text'),
    italic: () => wrap('*', '*', 'italic text'),
    h1: () => insertLine('# '),
    h2: () => insertLine('## '),
    h3: () => insertLine('### '),
    bullet: () => insertLine('- '),
    numbered: () => insertLine('1. '),
    code: () => wrap('`', '`', 'code'),
    divider: insertDivider,
  };

  const notesWordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const sourceReady = Boolean(sourceLabel && onGenerateFromSource);
  const styleMeta = NOTE_STYLE_OPTIONS.find((option) => option.id === noteStyle) ?? NOTE_STYLE_OPTIONS[0];

  return (
    <div className="notes-workflow" style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {TOOLBAR_BTNS.map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={toolbarActions[btn.actionKey]}
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

        {(['edit', 'split', 'preview'] as ViewMode[]).map((m) => (
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
            {m === 'edit' ? 'Edit' : m === 'preview' ? 'Preview' : 'Split'}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {saved ? 'Saved' : 'Saving'} · {notesWordCount} words
          </span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={downloadNotes} title="Export as .md">⬇</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={clearNotes} title="Clear notes">✕</button>
        </div>
      </div>

      <div className="notes-hero">
        <div className="notes-hero-top">
          <div className="notes-hero-copy">
            <span className="notes-eyebrow">Workspace Notes</span>
            <strong className="notes-hero-title">PDF to Notes</strong>
            <span className="notes-hero-body">
              {sourceLabel
                ? `Turn ${sourceLabel}${sourceWordCount ? ` · ${sourceWordCount.toLocaleString()} words` : ''} into ${styleMeta.label.toLowerCase()} you can edit, export, and keep studying from.`
                : 'Pick a PDF or document in Workspace, then convert it into clean study notes here.'}
            </span>
          </div>
          <div className="notes-hero-actions">
            {onOpenFiles && (
              <button className="btn btn-ghost btn-sm" onClick={onOpenFiles}>
                Files
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={!sourceReady} onClick={onGenerateFromSource}>
              Generate notes
            </button>
          </div>
        </div>

        <div className="notes-style-grid">
          {NOTE_STYLE_OPTIONS.map((option) => {
            const active = option.id === noteStyle;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onNoteStyleChange?.(option.id)}
                className={`notes-style-card${active ? ' active' : ''}`}
              >
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="notes-stat-grid">
          <div className="notes-stat-card">
            <div className="notes-stat-label">Source</div>
            <div className="notes-stat-value">{sourceLabel ?? 'No file selected'}</div>
          </div>
          <div className="notes-stat-card">
            <div className="notes-stat-label">Source length</div>
            <div className="notes-stat-value">{sourceWordCount ? `${sourceWordCount.toLocaleString()} words` : 'Waiting for extraction'}</div>
          </div>
          <div className="notes-stat-card">
            <div className="notes-stat-label">Note format</div>
            <div className="notes-stat-value">{styleMeta.label}</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {(viewMode === 'edit' || viewMode === 'split') && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            placeholder={`# My Notes\n\nStart typing in Markdown…\n\n- Use **bold** or *italic*\n- Add headings with # / ## / ###\n- Use \`code\` for inline code\n\nTip: Generate notes from a PDF above, then refine them here.`}
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

        {(viewMode === 'preview' || viewMode === 'split') && (
          <div
            className="tool-output"
            style={{
              flex: 1,
              padding: '16px 20px',
              overflowY: 'auto',
            }}
            dangerouslySetInnerHTML={{
              __html: content.trim()
                ? mdToHtml(content)
                : '<p style="color:var(--text-3);font-style:italic">Preview will appear here as you type or after you generate notes from a document.</p>',
            }}
          />
        )}
      </div>
    </div>
  );
}
