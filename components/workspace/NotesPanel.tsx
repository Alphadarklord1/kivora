'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

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

const LOCAL_AR: Record<string, string> = {
  'Study': 'دراسة',
  'Headings, bullets, key terms': 'عناوين ونقاط ومصطلحات أساسية',
  'Summary': 'ملخص',
  'Fast overview and takeaways': 'نظرة سريعة وأهم الخلاصات',
  'Revision': 'مراجعة',
  'Exam cues, definitions, recall prompts': 'تلميحات للامتحان وتعريفات وأسئلة استرجاع',
  'Cornell': 'كورنيل',
  'Cue column, notes, review summary': 'عمود للتلميحات وملاحظات وملخص للمراجعة',
  'Bold (Ctrl+B)': 'عريض (Ctrl+B)',
  'Italic (Ctrl+I)': 'مائل (Ctrl+I)',
  'Heading 1': 'عنوان 1',
  'Heading 2': 'عنوان 2',
  'Heading 3': 'عنوان 3',
  'Bullet list': 'قائمة نقطية',
  'Numbered list': 'قائمة مرقمة',
  'Inline code': 'كود داخل السطر',
  'Divider': 'فاصل',
  'Note': 'ملاحظة',
  'PDF → Notes': 'PDF ← ملاحظات',
  'Edit': 'تحرير',
  'Preview': 'معاينة',
  'Split': 'تقسيم',
  'Saved': 'تم الحفظ',
  'Saving…': 'جارٍ الحفظ…',
  'words': 'كلمات',
  'Export as .md': 'تصدير بصيغة .md',
  'Clear notes?': 'مسح الملاحظات؟',
  'Yes': 'نعم',
  'No': 'لا',
  'Clear notes': 'مسح الملاحظات',
  'Source': 'المصدر',
  'No file selected': 'لم يتم اختيار ملف',
  'Change': 'تغيير',
  'Choose file': 'اختيار ملف',
  'Style': 'النمط',
  'Generate notes': 'إنشاء ملاحظات',
  'Choose a file first': 'اختر ملفًا أولًا',
  'Preview appears here as you type.': 'ستظهر المعاينة هنا أثناء الكتابة.',
};

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
  const { t } = useI18n(LOCAL_AR);
  const [content, setContent]       = useState('');
  const [viewMode, setViewMode]     = useState<ViewMode>('edit');
  const [noteMode, setNoteMode]     = useState<NoteMode>('plain');
  const [saved, setSaved]           = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const saveTimer                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const storageKey = folderId ? `${STORAGE_PREFIX}${folderId}` : `${STORAGE_PREFIX}global`;

  useEffect(() => {
    const savedValue = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    const frame = window.requestAnimationFrame(() => {
      setContent(savedValue ?? '');
      setSaved(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);

  useEffect(() => {
    if (!injectContent) return;
    const frame = window.requestAnimationFrame(() => {
      setContent((prev) => {
        const divider = prev.trim() ? '\n\n---\n\n' : '';
        return prev + divider + injectContent;
      });
      setSaved(false);
      onInjectConsumed?.();
    });
    return () => window.cancelAnimationFrame(frame);
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

  function clearNotes() {
    setContent('');
    setSaved(true);
    setConfirmClear(false);
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
            {m === 'plain' ? t('Note') : t('PDF → Notes')}
          </button>
        ))}

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

        {/* Formatting toolbar */}
        {TOOLBAR_BTNS.map((btn) => (
          <button
            key={btn.label}
            title={t(btn.title)}
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
            {m === 'edit' ? t('Edit') : m === 'preview' ? t('Preview') : t('Split')}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            {saved ? t('Saved') : t('Saving…')} · {wordCount} {t('words')}
          </span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={downloadNotes} title={t('Export as .md')}>⬇</button>
          {confirmClear ? (
            <>
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>{t('Clear notes?')}</span>
              <button className="btn btn-sm" style={{ fontSize: 11, background: 'var(--danger)', color: '#fff', border: 'none', padding: '2px 8px' }} onClick={clearNotes}>{t('Yes')}</button>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setConfirmClear(false)}>{t('No')}</button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => setConfirmClear(true)} title={t('Clear notes')}>✕</button>
          )}
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
            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t('Source')}</span>
            <span style={{
              fontSize: 12,
              fontWeight: 500,
              color: sourceLabel ? 'var(--text)' : 'var(--text-3)',
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {sourceLabel ?? t('No file selected')}
            </span>
            {sourceWordCount && (
              <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                · {sourceWordCount.toLocaleString()} words
              </span>
            )}
            {onOpenFiles && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={onOpenFiles}>
                {sourceLabel ? t('Change') : t('Choose file')}
              </button>
            )}
          </div>

          <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

          {/* Style selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t('Style')}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {NOTE_STYLES.map((s) => (
                <button
                  key={s.id}
                  title={t(s.hint)}
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
                  {t(s.label)}
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
            title={sourceReady ? `${t('Generate notes')}: ${t(activeStyle.label)}` : t('Choose a file first')}
          >
            {t('Generate notes')}
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
                ? `# ${t('PDF → Notes')}\n\n${t('Choose file')} → ${t('Generate notes')}`
                : `# ${t('Note')}\n\nMarkdown`
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
                : `<p style="color:var(--text-3);font-style:italic">${t('Preview appears here as you type.')}</p>`,
            }}
          />
        )}
      </div>
    </div>
  );
}
