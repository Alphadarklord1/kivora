'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { saveOfflineItem } from '@/lib/library/offline-store';
import { addXp, XP_VALUES, incrementCounter, getCounters, checkAndUnlockAchievements } from '@/lib/gamification';

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

const NOTE_STYLES: Array<{ id: NoteStyle; label: string; hint: string }> = [
  { id: 'study',    label: 'Study',    hint: 'Headings, bullets, key terms' },
  { id: 'summary',  label: 'Summary',  hint: 'Fast overview and takeaways' },
  { id: 'revision', label: 'Revision', hint: 'Exam cues, definitions, recall prompts' },
  { id: 'cornell',  label: 'Cornell',  hint: 'Cue column, notes, review summary' },
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
  { label: 'B',   title: 'Bold (Ctrl+B)',   actionKey: 'bold',     style: { fontWeight: 700 } },
  { label: 'I',   title: 'Italic (Ctrl+I)', actionKey: 'italic',   style: { fontStyle: 'italic' } },
  { label: 'H1',  title: 'Heading 1',       actionKey: 'h1' },
  { label: 'H2',  title: 'Heading 2',       actionKey: 'h2' },
  { label: 'H3',  title: 'Heading 3',       actionKey: 'h3' },
  { label: '•',   title: 'Bullet list',     actionKey: 'bullet' },
  { label: '1.',  title: 'Numbered list',   actionKey: 'numbered' },
  { label: '</>',  title: 'Inline code',    actionKey: 'code' },
  { label: '---', title: 'Divider',         actionKey: 'divider' },
];

type NoteMode = 'plain' | 'pdf';

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
  const [content, setContent]     = useState('');
  const [savingLib, setSavingLib] = useState(false);
  const [savedLibId, setSavedLibId] = useState<string | null>(null);
  const [viewMode, setViewMode]   = useState<ViewMode>('edit');
  const [noteMode, setNoteMode]   = useState<NoteMode>('plain');
  const [saved, setSaved]         = useState(true);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const saveTimer                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = folderId ? `${STORAGE_PREFIX}${folderId}` : `${STORAGE_PREFIX}global`;

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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `notes-${folderId ?? 'global'}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveToLibrary() {
    if (savingLib || !content.trim()) return;
    setSavingLib(true);
    // Title heuristic: first markdown heading or the first non-empty line
    // (clamped), so the library entry is recognisable.
    const firstLine = content.split('\n').find((l) => l.trim()) ?? 'Notes';
    const title = firstLine.replace(/^#+\s*/, '').slice(0, 80) || 'Notes';
    const metadata = {
      title,
      wordCount,
      sourceLabel: sourceLabel ?? null,
      savedFrom: '/workspace/notes',
    };
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'notes', title, content, metadata }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        setSavedLibId(data?.id ?? 'saved');
      } else if (res.status === 503) {
        // Guest / no-DATABASE_URL: persist locally so the Save button is
        // useful instead of silently failing.
        const item = saveOfflineItem({ mode: 'notes', content, metadata });
        setSavedLibId(item.id);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
      addXp(XP_VALUES.noteCreated, 'notes:saveToLibrary');
      incrementCounter('notesCreated');
      checkAndUnlockAchievements(getCounters());
      setTimeout(() => setSavedLibId(null), 2400);
    } catch {
      // Last-resort offline save covers network errors too.
      try {
        const item = saveOfflineItem({ mode: 'notes', content, metadata });
        setSavedLibId(item.id);
        addXp(XP_VALUES.noteCreated, 'notes:saveToLibrary:offline');
        incrementCounter('notesCreated');
        checkAndUnlockAchievements(getCounters());
      } catch {
        setSavedLibId('error');
      }
      setTimeout(() => setSavedLibId(null), 2400);
    } finally {
      setSavingLib(false);
    }
  }

  function clearNotes() {
    if (!confirm('Clear all notes for this folder? This cannot be undone.')) return;
    setContent('');
    setSaved(true);
    if (typeof window !== 'undefined') localStorage.removeItem(storageKey);
  }

  const toolbarActions: Record<string, () => void> = {
    bold:     () => wrap('**', '**', 'bold text'),
    italic:   () => wrap('*', '*', 'italic text'),
    h1:       () => insertLine('# '),
    h2:       () => insertLine('## '),
    h3:       () => insertLine('### '),
    bullet:   () => insertLine('- '),
    numbered: () => insertLine('1. '),
    code:     () => wrap('`', '`', 'code'),
    divider:  insertDivider,
  };

  const wordCount      = content.trim() ? content.trim().split(/\s+/).length : 0;
  const sourceReady    = Boolean(sourceLabel && onGenerateFromSource);
  const activeStyle    = NOTE_STYLES.find((s) => s.id === noteStyle) ?? NOTE_STYLES[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>

      {/* ── Mode switcher + toolbar ─────────────────────────────────────────── */}
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
        {/* Mode tabs */}
        {(['plain', 'pdf'] as NoteMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setNoteMode(m)}
            style={{
              padding: '3px 10px',
              background: noteMode === m ? 'var(--accent)' : 'var(--surface)',
              color: noteMode === m ? '#fff' : 'var(--text-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: noteMode === m ? 600 : 400,
            }}
          >
            {m === 'plain' ? 'Note' : 'PDF → Notes'}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

        {/* Formatting toolbar */}
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

        {/* View mode */}
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
            {saved ? 'Saved' : 'Saving…'} · {wordCount} words
          </span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 11, color: savedLibId === 'error' ? 'var(--danger)' : savedLibId ? 'var(--accent)' : undefined }}
            disabled={!content.trim() || savingLib}
            onClick={saveToLibrary}
            title="Save to Library"
          >
            {savingLib ? 'Saving…' : savedLibId === 'error' ? '✗ Failed' : savedLibId ? '✓ Saved' : '🗂 Save'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={downloadNotes} title="Export as .md">⬇</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={clearNotes} title="Clear notes">✕</button>
        </div>
      </div>

      {/* ── PDF → Notes control strip (only in pdf mode) ─────────────────────── */}
      {noteMode === 'pdf' && (
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          {/* Source info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Source</span>
            <span style={{
              fontSize: 12,
              fontWeight: 500,
              color: sourceLabel ? 'var(--text)' : 'var(--text-3)',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {sourceLabel ?? 'No file selected'}
            </span>
            {sourceWordCount && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                · {sourceWordCount.toLocaleString()} words
              </span>
            )}
            {onOpenFiles && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={onOpenFiles}>
                {sourceLabel ? 'Change' : 'Choose file'}
              </button>
            )}
          </div>

          <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

          {/* Style selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Style</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {NOTE_STYLES.map((s) => (
                <button
                  key={s.id}
                  title={s.hint}
                  onClick={() => onNoteStyleChange?.(s.id)}
                  style={{
                    padding: '2px 9px',
                    background: noteStyle === s.id ? 'var(--accent)' : 'var(--surface)',
                    color: noteStyle === s.id ? '#fff' : 'var(--text-2)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 5,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: noteStyle === s.id ? 600 : 400,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <button
            className="btn btn-primary btn-sm"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
            disabled={!sourceReady}
            onClick={onGenerateFromSource}
            title={sourceReady ? `Generate ${activeStyle.label.toLowerCase()} notes` : 'Choose a file first'}
          >
            Generate notes
          </button>
        </div>
      )}

      {/* ── Editor ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {(viewMode === 'edit' || viewMode === 'split') && (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            placeholder={
              noteMode === 'pdf'
                ? '# Notes\n\nChoose a file above and click Generate notes — your notes will appear here and you can edit them freely.'
                : '# My Notes\n\nStart typing in Markdown…\n\n- Use **bold** or *italic*\n- Add headings with # / ## / ###\n- Use `code` for inline code'
            }
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
            style={{ flex: 1, padding: '16px 20px', overflowY: 'auto' }}
            dangerouslySetInnerHTML={{
              __html: content.trim()
                ? mdToHtml(content)
                : '<p style="color:var(--text-3);font-style:italic">Preview appears here as you type.</p>',
            }}
          />
        )}
      </div>
    </div>
  );
}
