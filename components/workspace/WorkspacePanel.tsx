'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useToast } from '@/providers/ToastProvider';
import { emitRateLimitEvent, RateLimitedError } from '@/lib/utils/fetchWithRateLimit';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { idbStore } from '@/lib/idb';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import type { ToolMode } from '@/lib/offline/generate';
import { deleteRagIndex, ensureRagIndex } from '@/lib/rag/index-store';
import { buildGenerationContext } from '@/lib/rag/generation-context';
import { v4 as uuidv4 } from 'uuid';
import { deleteLocalFile, listLocalFiles, upsertLocalFile } from '@/lib/files/local-files';
import { createFileReplaceRequest, createFileUploadRequest, resolveStoredFileBlob } from '@/lib/files/client-storage';
import { loadDecks, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { mdToHtml } from '@/lib/utils/md';
import { writeMathContext } from '@/lib/math/context';
import { clearCoachHandoff, readCoachHandoff } from '@/lib/coach/handoff';
import { clearScholarContext, readScholarContext, writeScholarContext, type ScholarContext } from '@/lib/coach/scholar-context';
import { broadcastInvalidate, listenForInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';
import type { NoteStyle } from '@/components/workspace/NotesPanel';
import { useI18n } from '@/lib/i18n/useI18n';

// ── Lazy-loaded tool panels (split into separate JS chunks) ────────────────────
const ChatPanel      = dynamic(() => import('@/components/workspace/ChatPanel').then(m => ({ default: m.ChatPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const NotesPanel     = dynamic(() => import('@/components/workspace/NotesPanel').then(m => ({ default: m.NotesPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const ExamPlannerPanel = dynamic(() => import('@/components/workspace/ExamPlannerPanel').then(m => ({ default: m.ExamPlannerPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const MCQView        = dynamic(() => import('@/components/workspace/views/MCQView').then(m => ({ default: m.MCQView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const PracticeView   = dynamic(() => import('@/components/workspace/views/PracticeView').then(m => ({ default: m.PracticeView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const FlashcardView  = dynamic(() => import('@/components/workspace/views/FlashcardView').then(m => ({ default: m.FlashcardView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const ExamView       = dynamic(() => import('@/components/workspace/views/ExamView').then(m => ({ default: m.ExamView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const FocusPanel     = dynamic(() => import('@/components/workspace/views/FocusPanel').then(m => ({ default: m.FocusPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const DocumentPreview = dynamic(() => import('@/components/workspace/DocumentPreview').then(m => ({ default: m.DocumentPreview })), { ssr: false, loading: () => <div className="tool-loading" /> });
const StudyAnalytics = dynamic(() => import('@/components/analytics/StudyAnalytics').then(m => ({ default: m.StudyAnalytics })), { ssr: false, loading: () => <div className="tool-loading" /> });

// ── Types ──────────────────────────────────────────────────────────────────

interface FileRecord {
  id: string; name: string; type: string;
  mimeType?: string; fileSize?: number;
  storageProvider?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  localBlobId?: string; localFilePath?: string | null;
  content?: string; createdAt: string;
}

export interface WorkspacePanelProps {
  selectedFolder:     string | null;
  selectedTopic:      string | null;
  selectedFolderName: string;
  selectedTopicName:  string;
  onRefresh: () => void;
  filesRefreshKey?: number;
  onToggleReports?: () => void;
  reportsOpen?: boolean;
}

interface LibraryItemRecord {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
  metadata?: {
    title?: string;
    description?: string;
    category?: string;
    problem?: string;
    sourceFileName?: string;
    graphExpr?: string;
    savedFrom?: string;
    publicProfile?: boolean;
    publicShareId?: string | null;
    publicShareUrl?: string | null;
    publicShareToken?: string | null;
    cardCount?: number;
  } | null;
}

// ── Tab config ─────────────────────────────────────────────────────────────

const GENERATE_TABS = [
  { id: 'summarize',  label: 'Summarize',  icon: '📝', hint: 'Key-point summary of your content' },
  { id: 'notes',      label: 'Notes',      icon: '📋', hint: 'Structured study notes' },
  { id: 'outline',    label: 'Outline',    icon: '📑', hint: 'Chapter outline with learning objectives' },
  { id: 'practice',   label: 'Practice',   icon: '🎯', hint: 'Practice problem with progressive hints and solution' },
  { id: 'mcq',        label: 'MCQ',        icon: '🧩', hint: 'Multiple-choice questions with answers' },
  { id: 'quiz',       label: 'Quiz',       icon: '❓', hint: 'Open-ended quiz questions' },
  { id: 'exam',       label: 'Exam Prep',  icon: '🏆', hint: 'Timed exam with scoring and weak-area analysis' },
] as const;

const GENERATE_TAB_GROUPS = [
  { label: 'Written',  ids: ['summarize', 'notes', 'outline'] },
  { label: 'Practice', ids: ['practice', 'mcq', 'quiz'] },
  { label: 'Exam',     ids: ['exam'] },
] as const;

const WORKSPACE_TABS: Array<{ id: MainTab; icon: string; label: string; getMeta?: (ctx: { filesCount: number; libraryCount: number; decksCount: number }) => string }> = [
  { id: 'files',      icon: '📁', label: 'Files',      getMeta: ({ filesCount })  => (filesCount  ? `(${filesCount})`  : '') },
  { id: 'generate',   icon: '⚡', label: 'Tools' },
  { id: 'flashcards', icon: '🃏', label: 'Flashcards', getMeta: ({ decksCount })  => (decksCount  ? `(${decksCount})`  : '') },
  { id: 'chat',       icon: '💬', label: 'Chat' },
  { id: 'notes',      icon: '📓', label: 'Notes' },
  { id: 'focus',      icon: '🍅', label: 'Focus' },
];

const GENERATE_SHORTCUTS = [
  { key: 'Ctrl+G', label: 'Generate' },
  { key: 'Ctrl+S', label: 'Save to library' },
  { key: 'Ctrl+E', label: 'Export .md' },
  { key: 'Esc', label: 'Clear output' },
] as const;

type GenMode    = (typeof GENERATE_TABS)[number]['id'];
type MainTab    = 'files' | 'generate' | 'flashcards' | 'chat' | 'notes' | 'focus' | 'planner' | 'analytics';
type ReviewSetPhase = 'review' | 'import';

// ── Helpers ────────────────────────────────────────────────────────────────

function fileIcon(f: FileRecord): string {
  const n = f.name.toLowerCase();
  if (f.mimeType === 'application/pdf' || n.endsWith('.pdf')) return '📕';
  if (n.match(/\.docx?$/))  return '📘';
  if (n.match(/\.pptx?$/))  return '📙';
  if (n.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return '🖼️';
  if (n.match(/\.(txt|md)$/)) return '📝';
  return '📄';
}

function isPDF(f: FileRecord)   { return f.mimeType === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'); }
function isImage(f: FileRecord) { return !!f.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|webp|svg)$/); }
function isDocxOrPptx(f: FileRecord) { return !!f.name.toLowerCase().match(/\.(docx|pptx)$/); }

function fmt(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function describeNoteStyle(style: NoteStyle): string {
  switch (style) {
    case 'summary':
      return 'Create a concise summary sheet with a short overview, key bullets, and final takeaways.';
    case 'revision':
      return 'Create a revision sheet with key ideas, definitions, likely exam cues, and quick recall prompts.';
    case 'cornell':
      return 'Create Cornell-style notes with cue questions, detailed notes, and a short summary section.';
    case 'study':
    default:
      return 'Create structured study notes with headings, key bullets, definitions, and memorable takeaways.';
  }
}


// ── View components (extracted to views/) ──────────────────────────────────
// MCQView, PracticeView, FlashcardView, ExamView, and FocusPanel
// are imported above from @/components/workspace/views/*

// ── Inline file viewer ─────────────────────────────────────────────────────

function FileViewer({
  file, onClose, onUseForTools, onUseForChat, onUseForNotes, onUseInMath,
}: {
  file: FileRecord;
  onClose: () => void;
  onUseForTools: (file: FileRecord, text: string) => void;
  onUseForChat: (file: FileRecord, text: string) => void;
  onUseForNotes: (file: FileRecord, text: string) => void;
  onUseInMath: (file: FileRecord, text: string) => void;
}) {
  const { toast } = useToast();
  const { t } = useI18n();
  const [blobUrl,     setBlobUrl]     = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);
  // Preview tab state — only relevant for .docx / .pptx files
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const canPreview = isDocxOrPptx(file);
  type ViewTab = 'text' | 'preview';
  const [viewTab, setViewTab] = useState<ViewTab>('text');
  const previewWordCount = textContent ? wordCount(textContent) : 0;

  useEffect(() => {
    let url: string | null = null;
    setLoading(true); setErr(null); setBlobUrl(null); setTextContent(null);
    setPreviewBlob(null); setViewTab('text');
    (async () => {
      try {
        if (file.content && !file.localBlobId) { setTextContent(file.content); return; }
        const blob = await resolveStoredFileBlob(file);
        if (!blob) {
          setErr('This file is not available locally or in remote storage yet.');
          return;
        }
        if (canPreview) {
          // Store blob for the preview tab; also extract text for the text tab
          setPreviewBlob(blob);
          const res = await extractTextFromBlob(blob, file.name);
          if (res.error) setErr(res.error); else setTextContent(res.text);
        } else if (isPDF(file) || isImage(file)) {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        } else {
          const isPlain = !!file.name.toLowerCase().match(/\.(txt|md|csv|json|xml|html)$/);
          if (isPlain) setTextContent(await blob.text());
          else {
            const res = await extractTextFromBlob(blob, file.name);
            if (res.error) setErr(res.error); else setTextContent(res.text);
          }
        }
      } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load file.'); }
      finally { setLoading(false); }
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  async function resolveFileText(successLabel: string) {
    if (textContent) return textContent;
    const blob = await resolveStoredFileBlob(file);
    if (!blob) { toast(t('File not found locally or in remote storage.'), 'error'); return; }
    const res = await extractTextFromBlob(blob, file.name);
    if (res.error) { toast(res.error, 'error'); return; }
    toast(`${res.wordCount.toLocaleString()} words loaded into ${successLabel}`, 'success');
    return res.text;
  }

  async function useForTools() {
    const text = await resolveFileText('Generate');
    if (text) onUseForTools(file, text);
  }

  async function useForChat() {
    const text = await resolveFileText('Chat');
    if (text) onUseForChat(file, text);
  }

  async function useForNotes() {
    const text = await resolveFileText('Notes');
    if (text) onUseForNotes(file, text);
  }

  async function useInMath() {
    if (textContent) {
      onUseInMath(file, textContent);
      return;
    }
    if (!file.localBlobId) {
      toast(t('This file is not available locally for math context.'), 'warning');
      return;
    }
    const text = await resolveFileText('Math');
    if (text) onUseInMath(file, text);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid var(--border)', background: 'var(--bg)', animation: 'slideInRight 0.18s ease' }}>
      {/* ── Header ── */}
      <div style={{ display: 'grid', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, var(--surface)), var(--surface))', flexShrink: 0, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{fileIcon(file)}</span>
          <div style={{ display: 'grid', gap: 4, minWidth: 0, flex: 1 }}>
            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.name}
            </strong>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {fmt(file.fileSize) && <span className="badge">{fmt(file.fileSize)}</span>}
              {previewWordCount > 0 && <span className="badge badge-accent">{previewWordCount.toLocaleString()} words</span>}
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                Route this file straight into the tool you want to continue in.
              </span>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close" style={{ flexShrink: 0 }}>✕</button>
        </div>

        <div className="workspace-file-actions" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={useForTools} title="Load into Generate tab" aria-label={`Use ${file.name} in Tools`}>
            ⚡ Tools
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useForNotes} title="Load into Notes tab" aria-label={`Use ${file.name} in Notes`}>
            📓 Notes
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useForChat} title="Load into Chat tab" aria-label={`Use ${file.name} in Chat`}>
            💬 Chat
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useInMath} title="Send this file into Math" aria-label={`Use ${file.name} in Math`}>
            ∑ Math
          </button>
        </div>
      </div>

      {/* ── Tab switcher (only for .docx / .pptx) ── */}
      {canPreview && !loading && !err && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <button
            className="btn btn-sm"
            onClick={() => setViewTab('text')}
            style={{
              padding: '3px 12px', borderRadius: 20, fontSize: 'var(--text-xs)',
              fontWeight: 500, border: `1.5px solid ${viewTab === 'text' ? 'var(--accent)' : 'var(--border-2)'}`,
              background: viewTab === 'text' ? 'var(--accent)' : 'var(--surface-2)',
              color: viewTab === 'text' ? '#fff' : 'var(--text-2)', cursor: 'pointer',
            }}
          >
            Text
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setViewTab('preview')}
            style={{
              padding: '3px 12px', borderRadius: 20, fontSize: 'var(--text-xs)',
              fontWeight: 500, border: `1.5px solid ${viewTab === 'preview' ? 'var(--accent)' : 'var(--border-2)'}`,
              background: viewTab === 'preview' ? 'var(--accent)' : 'var(--surface-2)',
              color: viewTab === 'preview' ? '#fff' : 'var(--text-2)', cursor: 'pointer',
            }}
          >
            Preview
          </button>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
            <div style={{ width: 22, height: 22, border: '2.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>Loading…</span>
          </div>
        )}
        {err && <div style={{ padding: 40, textAlign: 'center' }}><div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div><p style={{ color: 'var(--danger)', fontSize: 'var(--text-sm)', maxWidth: 300, margin: '0 auto' }}>{err}</p></div>}
        {!loading && !err && blobUrl && isPDF(file) && (
          <iframe src={blobUrl} title={file.name} style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} />
        )}
        {!loading && !err && blobUrl && isImage(file) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24, overflow: 'auto', background: 'var(--surface)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }} />
          </div>
        )}
        {/* ── docx / pptx: text tab ── */}
        {!loading && !err && canPreview && viewTab === 'text' && textContent !== null && (
          <div style={{ height: '100%', overflow: 'auto', padding: '16px 20px' }}>
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-accent">{wordCount(textContent).toLocaleString()} words</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>Extracted text preview</span>
            </div>
            <pre style={{ fontFamily: 'inherit', fontSize: 'var(--text-sm)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', margin: 0 }}>{textContent}</pre>
          </div>
        )}
        {/* ── docx / pptx: preview tab ── */}
        {!loading && !err && canPreview && viewTab === 'preview' && previewBlob && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <DocumentPreview blob={previewBlob} fileName={file.name} />
          </div>
        )}
        {/* ── non-docx/pptx plain text ── */}
        {!loading && !err && !canPreview && textContent !== null && (
          <div style={{ height: '100%', overflow: 'auto', padding: '16px 20px' }}>
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="badge badge-accent">{wordCount(textContent).toLocaleString()} words</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>Extracted text preview</span>
            </div>
            <pre style={{ fontFamily: 'inherit', fontSize: 'var(--text-sm)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', margin: 0 }}>{textContent}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function WorkspacePanel({
  selectedFolder, selectedTopic, selectedFolderName, selectedTopicName, onRefresh, filesRefreshKey,
  onToggleReports, reportsOpen,
}: WorkspacePanelProps) {
  const { toast } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [scholarCtx,    setScholarCtx]    = useState<ScholarContext | null>(() => {
    if (typeof window === 'undefined') return null;
    return readScholarContext();
  });

  const [mainTab,       setMainTab]       = useState<MainTab>('files');
  const [genMode,       setGenMode]       = useState<GenMode>('summarize');
  const [files,         setFiles]         = useState<FileRecord[]>([]);
  const [filesLoad,     setFilesLoad]     = useState(false);
  const [viewFile,      setViewFile]      = useState<FileRecord | null>(null);
  const [selFile,       setSelFile]       = useState<FileRecord | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [pasteMode,     setPasteMode]     = useState(false);
  const [extracting,    setExtracting]    = useState(false);
  const [output,        setOutput]        = useState('');
  const [generating,    setGenerating]    = useState(false);
  const [count,         setCount]         = useState(5);
  const [libItems,      setLibItems]      = useState<LibraryItemRecord[]>([]);
  const [srsDecks,      setSrsDecks]      = useState<SRSDeck[]>([]);
  const [activeReviewSetId, setActiveReviewSetId] = useState<string | null>(null);
  const [requestedReviewPhase, setRequestedReviewPhase] = useState<ReviewSetPhase | null>(null);
  const [pendingReviewImportUrl, setPendingReviewImportUrl] = useState<string | null>(null);
  const [dragging,      setDragging]      = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [missingBlobs,  setMissingBlobs]  = useState<Set<string>>(new Set());
  const [reuploadTarget, setReuploadTarget] = useState<FileRecord | null>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [streamSource,  setStreamSource]  = useState<string>('');
  const [editMode,      setEditMode]      = useState(false);
  const [streak,        setStreak]        = useState<number>(0);
  const [weekScore,     setWeekScore]     = useState<number | null>(null);
  const [weekQuizzes,   setWeekQuizzes]   = useState<number>(0);
  const [notesInject,   setNotesInject]   = useState<string | undefined>(undefined);
  const [noteStyle,     setNoteStyle]     = useState<NoteStyle>('study');
  const abortRef    = useRef<AbortController | null>(null);
  const pasteRef    = useRef<HTMLTextAreaElement>(null);
  const handledReviewImportRef = useRef<string | null>(null);
  const handledScholarActionRef = useRef<string | null>(null);

  function requestCreateFolder() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kivora:create-folder'));
    }
  }

  const createWorkspaceReviewSet = useCallback((options?: {
    name?: string;
    description?: string;
    phase?: ReviewSetPhase | null;
    importUrl?: string | null;
  }) => {
    const draft: SRSDeck = {
      id: `deck-${crypto.randomUUID().slice(0, 12)}`,
      name: options?.name?.trim() || 'New review set',
      description: options?.description?.trim() || 'Long-term recall work lives here in Workspace.',
      cards: [],
      createdAt: new Date().toISOString(),
      sourceType: 'workspace',
    };

    saveDeck(draft);
    setSrsDecks((current) => [draft, ...current.filter((deck) => deck.id !== draft.id)]);
    setActiveReviewSetId(draft.id);
    setMainTab('flashcards');
    setRequestedReviewPhase(options?.phase ?? null);
    setPendingReviewImportUrl(options?.importUrl ?? null);

    void fetch('/api/srs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deck: draft }),
    }).catch(() => {});

    return draft;
  }, []);

  async function markRecentFile(fileId: string) {
    await fetch('/api/recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    }).catch(() => {});
  }

  async function sendFileToMath(file: FileRecord, text: string) {
    writeMathContext({
      fileId: file.id,
      fileName: file.name,
      extractedText: text,
      sourceFolderId: selectedFolder,
      sourceTopicId: selectedTopic,
    });
    await markRecentFile(file.id);
    toast(`"${file.name}" ready in Math`, 'success');
    router.push('/math');
  }

  // ── Data loading ──────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    if (!selectedFolder) { setFiles([]); setMissingBlobs(new Set()); return; }
    setFilesLoad(true);
    const qs = new URLSearchParams({ folderId: selectedFolder });
    if (selectedTopic) qs.set('topicId', selectedTopic);
    try {
      const r = await fetch(`/api/files?${qs}`);
      const remote: FileRecord[] = r.ok ? await r.json() : [];
      const local = listLocalFiles(selectedFolder, selectedTopic) as FileRecord[];
      const loaded: FileRecord[] = [
        ...remote,
        ...local.filter((entry) => !remote.some((remoteEntry) => remoteEntry.id === entry.id)),
      ];
      setFiles(loaded);
      // Check for missing blobs in the background (deferred so file list renders first)
      const checkMissing = async () => {
        const missing = new Set<string>();
        await Promise.all(loaded.map(async f => {
          if (f.localBlobId) {
            const payload = await idbStore.get(f.localBlobId).catch(() => undefined);
            if (!payload && !f.content && !f.storagePath) missing.add(f.id);
          }
        }));
        setMissingBlobs(missing);
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => { void checkMissing(); }, { timeout: 3000 });
      } else {
        setTimeout(() => { void checkMissing(); }, 500);
      }
    } catch {
      const loaded = listLocalFiles(selectedFolder, selectedTopic);
      setFiles(loaded);
    }
    finally { setFilesLoad(false); }
  }, [selectedFolder, selectedTopic]);

  useEffect(() => { loadFiles(); }, [loadFiles, filesRefreshKey]);
  useEffect(() => { setViewFile(null); setMissingBlobs(new Set()); }, [selectedFolder, selectedTopic]);
  useEffect(() => {
    if (!selFile) return;
    const stillExists = files.some((file) => file.id === selFile.id);
    if (!stillExists) {
      setSelFile(null);
      setExtractedText('');
    }
  }, [files, selFile]);

  const loadLib = useCallback(() => {
    fetch('/api/library')
      .then(r => r.ok ? r.json() : [])
      .then(setLibItems)
      .catch(() => setLibItems([]));
  }, []);

  useEffect(() => {
    loadLib();
    setSrsDecks(loadDecks());
  }, [loadLib]);

  // Re-fetch library when another tab saves a new item
  useEffect(() => {
    return listenForInvalidate(LIBRARY_CHANNEL, loadLib);
  }, [loadLib]);

  // Auto-extract when a file is selected from the dropdown
  useEffect(() => {
    if (selFile && !extractedText && !extracting && !pasteMode) {
      extractFromFile(selFile);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selFile?.id]);

  // ── File operations ───────────────────────────────────────────────────

  async function extractFromFile(file: FileRecord): Promise<string | null> {
    if (file.content) {
      setExtractedText(file.content);
      // Build RAG index after UI updates (non-blocking)
      setTimeout(() => { void ensureRagIndex(file.id, file.content!); }, 0);
      void markRecentFile(file.id);
      return file.content;
    }
    setExtracting(true);
    try {
      const blob = await resolveStoredFileBlob(file);
      if (!blob) { toast(t('File not found in local or remote storage.'), 'error'); return null; }
      const res = await extractTextFromBlob(blob, file.name);
      if (res.error) { toast(res.error, 'error'); return null; }
      setExtractedText(res.text);
      // Build RAG index after UI updates (non-blocking)
      setTimeout(() => { void ensureRagIndex(file.id, res.text); }, 0);
      void markRecentFile(file.id);
      toast(`Extracted ${res.wordCount.toLocaleString()} words from "${file.name}"`, 'success');
      return res.text;
    } finally { setExtracting(false); }
  }

  async function uploadFile(file: File) {
    if (!selectedFolder) { toast(t('Select a folder first.'), 'warning'); return; }
    const blobId = uuidv4(), fileId = uuidv4(), createdAt = new Date().toISOString();
    await idbStore.put(blobId, { blob: file, name: file.name, type: file.type, size: file.size });
    const local = { id: fileId, folderId: selectedFolder, topicId: selectedTopic ?? null, name: file.name, type: 'upload', localBlobId: blobId, mimeType: file.type, fileSize: file.size, createdAt };
    try {
      const res = await createFileUploadRequest({
        ...local,
        file,
      });
      toast(res.ok ? `"${file.name}" uploaded` : `"${file.name}" saved locally`, res.ok ? 'success' : 'info');
      if (res.ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.localOnly || payload?.storageWarning) {
          upsertLocalFile(local);
        }
      } else {
        upsertLocalFile(local);
      }
    } catch { upsertLocalFile(local); toast(`"${file.name}" saved locally`, 'info'); }
    await loadFiles(); onRefresh();
  }

  async function uploadFiles(list: FileList | File[]) {
    setUploading(true);
    try { for (const f of Array.from(list)) await uploadFile(f); }
    finally { setUploading(false); }
  }

  async function handleReupload(newFile: File, target: FileRecord) {
    const newBlobId = uuidv4();
    await idbStore.put(newBlobId, { blob: newFile, name: newFile.name, type: newFile.type, size: newFile.size });
    try {
      await createFileReplaceRequest({
        fileId: target.id,
        localBlobId: newBlobId,
        fileSize: newFile.size,
        mimeType: newFile.type,
        file: newFile,
      });
    } catch {}
    setFiles(prev => prev.map(f => f.id === target.id ? { ...f, localBlobId: newBlobId, fileSize: newFile.size } : f));
    setMissingBlobs(prev => { const next = new Set(prev); next.delete(target.id); return next; });
    setReuploadTarget(null);
    toast(`"${target.name}" restored ✓`, 'success');
  }

  async function deleteFile(e: React.MouseEvent, file: FileRecord) {
    e.stopPropagation();
    if (!confirm(`Delete "${file.name}"?`)) return;
    if (file.localBlobId) await idbStore.delete(file.localBlobId);
    await deleteRagIndex(file.id).catch(() => {});
    deleteLocalFile(file.id);
    await fetch(`/api/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
    setFiles(p => p.filter(f => f.id !== file.id));
    if (viewFile?.id === file.id) setViewFile(null);
    if (selFile?.id === file.id) { setSelFile(null); setExtractedText(''); setOutput(''); }
    toast(t('File deleted'), 'info');
  }

  // ── AI generation (streaming) ──────────────────────────────────────────

  async function runGenerate(mode: ToolMode, sourceOverride?: string) {
    let src = sourceOverride?.trim() ?? extractedText.trim();
    if (!src && selFile) src = (await extractFromFile(selFile))?.trim() ?? '';
    if (!src) { toast(t('Select a file or paste content first.'), 'warning'); return; }

    // Read privacy preference — what can we send to AI?
    const aiDataMode = (typeof window !== 'undefined'
      ? localStorage.getItem('kivora_ai_mode')
      : null) as 'full' | 'metadata-only' | 'offline' | null ?? 'full';

    // If user chose offline-only mode, skip AI API entirely
    if (aiDataMode === 'offline') {
      setGenerating(true); setOutput(''); setStreamSource('offline'); setEditMode(false);
      try {
        const { offlineGenerate } = await import('@/lib/offline/generate');
        const result = offlineGenerate(mode as ToolMode, src, { count });
        setOutput(result);
        setStreamSource('offline');
        toast(t('Generated offline (Offline-only mode is active)'), 'info');
      } catch { toast(t('Offline generation failed.'), 'error'); }
      finally { setGenerating(false); }
      return;
    }

    // If metadata-only: replace content with a placeholder summary
    const textForAI = aiDataMode === 'metadata-only'
      ? `[Content withheld for privacy. File: "${selFile?.name ?? 'pasted text'}", ${wordCount(src).toLocaleString()} words. Generate ${mode} based on this description only.]`
      : src;

    const retrievalContext = selFile
      ? buildGenerationContext(mode as Parameters<typeof buildGenerationContext>[0], textForAI, { count }, await ensureRagIndex(selFile.id, src).catch(() => undefined))
      : buildGenerationContext(mode as Parameters<typeof buildGenerationContext>[0], textForAI, { count });

    const ai = loadAiRuntimePreferences();
    const privacyMode = loadClientAiDataMode();

    if (ai.mode === 'local' && typeof window !== 'undefined' && window.electronAPI?.desktopAI) {
      setGenerating(true); setOutput(''); setStreamSource('local'); setEditMode(false);
      try {
        const result = await window.electronAPI.desktopAI.generate({ mode, text: retrievalContext });
        if (result.ok) {
          setOutput(result.content.displayText);
          setStreamSource('local');
          toast(t('Generated locally on-device'), 'success');
          return;
        }

        if (result.errorCode === 'OUT_OF_SCOPE') {
          setOutput(result.reason || result.message);
          toast(result.message, 'warning');
          return;
        }

        const { offlineGenerate } = await import('@/lib/offline/generate');
        setOutput(offlineGenerate(mode as ToolMode, src, { count }));
        setStreamSource('offline');
        toast(result.message || 'Local model unavailable — used offline fallback instead', 'warning');
        return;
      } catch {
        const { offlineGenerate } = await import('@/lib/offline/generate');
        setOutput(offlineGenerate(mode as ToolMode, src, { count }));
        setStreamSource('offline');
        toast(t('Local generation failed — used offline fallback instead'), 'warning');
        return;
      } finally {
        setGenerating(false);
      }
    }

    // Cancel any in-flight stream
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setGenerating(true);
    setOutput('');
    setStreamSource('');
    setEditMode(false);

    try {
      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, text: src, fileId: selFile?.id ?? null, retrievalContext, options: { count }, ai, privacyMode }),
        signal: ctrl.signal,
      });

      if (res.status === 429) {
        try {
          const body = await res.json();
          if (body.errorCode === 'RATE_LIMITED') {
            emitRateLimitEvent(new RateLimitedError(body.retryAfterSeconds ?? 60, body.reason ?? ''));
            return;
          }
        } catch { /* not JSON */ }
        toast(t('Too many requests — please wait a moment.'), 'error');
        return;
      }

      if (!res.ok || !res.body) {
        // Fallback to non-streaming route
        const fallback = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, text: retrievalContext, fileId: selFile?.id ?? null, options: { count }, ai, privacyMode }),
        });
        if (fallback.status === 429) {
          try {
            const body = await fallback.json();
            if (body.errorCode === 'RATE_LIMITED') {
              emitRateLimitEvent(new RateLimitedError(body.retryAfterSeconds ?? 60, body.reason ?? ''));
              return;
            }
          } catch { /* not JSON */ }
          toast(t('Too many requests — please wait a moment.'), 'error');
          return;
        }
        const data = await fallback.json();
        setOutput(data.content ?? data.error ?? 'No output received.');
        if (data.source === 'offline') toast('Generated offline — AI not connected', 'info');
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            if (parsed.token) {
              accumulated += parsed.token;
              setOutput(accumulated);
            }
            if (parsed.done) {
              setStreamSource(parsed.source ?? '');
              if (parsed.source === 'offline') toast('Generated offline — AI not connected', 'info');
            }
          } catch { /* malformed chunk */ }
        }
      }
      if (!accumulated) setOutput('No output received.');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return; // cancelled
      if (err instanceof RateLimitedError) { emitRateLimitEvent(err); return; }
      toast(t('Generation failed. Please try again.'), 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function generateNotesForWorkspace() {
    let src = extractedText.trim();
    if (!src && selFile) src = (await extractFromFile(selFile))?.trim() ?? '';
    if (!src) {
      toast(t('Choose a PDF or document first, then generate notes from it.'), 'warning');
      return;
    }

    const ai = loadAiRuntimePreferences();
    const privacyMode = loadClientAiDataMode();
    const aiDataMode = (typeof window !== 'undefined'
      ? localStorage.getItem('kivora_ai_mode')
      : null) as 'full' | 'metadata-only' | 'offline' | null ?? 'full';

    const textForAI = aiDataMode === 'metadata-only'
      ? `[Content withheld for privacy. File: "${selFile?.name ?? 'selected document'}", ${wordCount(src).toLocaleString()} words. Generate ${noteStyle} notes from this description only.]`
      : `${describeNoteStyle(noteStyle)}\n\nSource file: ${selFile?.name ?? 'selected document'}\n\n${src}`;

    try {
      let generated = '';
      let source: 'offline' | 'local' | 'openai' = 'offline';

      if (aiDataMode === 'offline') {
        const { offlineGenerate } = await import('@/lib/offline/generate');
        generated = offlineGenerate('notes', src, { count: 8, noteStyle });
        source = 'offline';
      } else if (ai.mode === 'local' && typeof window !== 'undefined' && window.electronAPI?.desktopAI) {
        const result = await window.electronAPI.desktopAI.generate({ mode: 'notes', text: textForAI });
        if (result.ok) {
          generated = result.content.displayText;
          source = 'local';
        }
        else {
          const { offlineGenerate } = await import('@/lib/offline/generate');
          generated = offlineGenerate('notes', src, { count: 8, noteStyle });
          source = 'offline';
        }
      } else {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'notes',
            text: textForAI,
            fileId: selFile?.id ?? null,
            options: { count: 8, noteStyle },
            ai,
            privacyMode,
          }),
        });
        const data = await res.json() as { content?: string; result?: string; error?: string; source?: 'offline' | 'local' | 'openai' };
        generated = data.content ?? data.result ?? '';
        if (!generated) throw new Error(data.error ?? 'Could not generate notes');
        source = data.source ?? 'openai';
      }

      setStreamSource(source);
      setNotesInject(generated);
      setMainTab('notes');
      if (source === 'offline') {
        toast(t('Notes were generated with offline fallback — the output may be simpler than cloud or local AI.'), 'info');
      }
      toast(t('Structured notes are ready in Notes'), 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not generate notes', 'error');
    }
  }

  useEffect(() => {
    const handoff = readCoachHandoff();
    if (!handoff) return;

    if ((handoff.type === 'review-set' || handoff.type === 'import-success') && handoff.setId) {
      clearCoachHandoff();
      setActiveReviewSetId(handoff.setId);
      setRequestedReviewPhase(handoff.panel === 'review' ? 'review' : null);
      setPendingReviewImportUrl(null);
      setMainTab('flashcards');
      toast(t('Review set opened in Flashcards'), 'success');
      return;
    }

    if (handoff.type === 'source-output' && handoff.sourceText) {
      const preferred = handoff.preferredTool ?? 'summarize';
      const nextMode: ToolMode = preferred === 'quiz' || preferred === 'mcq'
        ? 'quiz'
        : 'summarize';

      clearCoachHandoff();
      setMainTab('generate');
      setPasteMode(true);
      setViewFile(null);
      setSelFile(null);
      setOutput('');
      setGenMode(nextMode as GenMode);
      setExtractedText(handoff.sourceText);
      toast(`${handoff.title ?? 'Source brief'} is ready in Workspace`, 'success');
      void runGenerate(nextMode, handoff.sourceText);
      return;
    }

    if (handoff.type !== 'weak-topic' || !handoff.topic) return;

    const preferred = handoff.preferredTool ?? 'quiz';
    const nextMode: ToolMode = preferred === 'mcq'
      ? 'mcq'
      : preferred === 'summarize' || preferred === 'explain'
        ? 'summarize'
        : 'quiz';

    const sourceText = preferred === 'mcq'
      ? `Topic: ${handoff.topic}\nCreate 6 high-yield multiple-choice questions with answers and short explanations.`
      : preferred === 'summarize'
        ? `Topic: ${handoff.topic}\nCreate a concise revision summary with key ideas, one example, and a checklist.`
        : preferred === 'explain'
          ? `Topic: ${handoff.topic}\nExplain this topic simply for a student. Include one worked example and one common mistake to avoid.`
          : `Topic: ${handoff.topic}\nCreate 5 open-ended quiz questions with answers and brief feedback.`;

    clearCoachHandoff();
    setMainTab('generate');
    setPasteMode(true);
    setViewFile(null);
    setSelFile(null);
    setOutput('');
    setGenMode(nextMode as GenMode);
    setExtractedText(sourceText);
    toast(`"${handoff.topic}" is ready in Workspace`, 'success');
    void runGenerate(nextMode, sourceText);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeReviewSet = useMemo(
    () => srsDecks.find((deck) => deck.id === activeReviewSetId) ?? null,
    [activeReviewSetId, srsDecks],
  );
  const activeReviewDueCount = useMemo(() => {
    if (!activeReviewSet) return 0;
    const dueToday = new Date().toISOString().slice(0, 10);
    return activeReviewSet.cards.filter((card) => {
      return Boolean(card.nextReview && card.nextReview <= dueToday);
    }).length;
  }, [activeReviewSet]);

  // ── Export generated content ───────────────────────────────────────────

  function downloadOutput(format: 'txt' | 'md') {
    if (!output) return;
    const ext = format === 'md' ? 'md' : 'txt';
    const mime = format === 'md' ? 'text/markdown' : 'text/plain';
    const filename = `${genMode}-${selFile?.name?.replace(/\.[^.]+$/, '') ?? 'export'}.${ext}`;
    const blob = new Blob([output], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast(`Downloaded ${filename}`, 'success');
  }

  // ── Streak counter from localStorage ─────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kivora_study_streak');
      if (raw) setStreak(parseInt(raw, 10) || 0);
    } catch {}
  }, []);

  // ── Analytics strip data (for generate tab header) ────────────────────
  useEffect(() => {
    if (weekScore !== null) return; // already loaded
    fetch('/api/analytics?period=7', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const qs = data.quizStats ?? {};
        const wScore = qs.averageScore ?? null;
        setWeekScore(typeof wScore === 'number' ? Math.round(wScore) : null);
        setWeekQuizzes(qs.totalAttempts ?? 0);
        const s = data.activity?.currentStreak ?? 0;
        if (s > 0) { setStreak(s); try { localStorage.setItem('kivora_study_streak', String(s)); } catch {} }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveToLibrary() {
    if (!output) return;
    const res = await fetch('/api/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: genMode, content: output }),
    });
    if (res.ok) {
      toast(t('Saved to Library ✓'), 'success');
      broadcastInvalidate(LIBRARY_CHANNEL);
    } else {
      toast(t('Could not save — DB may not be configured'), 'warning');
    }
  }

  async function saveNotesSnapshotToLibrary(text: string) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('Add or generate notes first.');

    const topicLabel = selectedTopicName && selectedTopicName !== 'All Topics' ? selectedTopicName : null;
    const folderLabel = selectedFolderName && selectedFolderName !== 'All Files' ? selectedFolderName : null;
    const titleParts = [topicLabel, folderLabel, 'Notes snapshot'].filter(Boolean);

    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'notes',
        content: trimmed,
        metadata: {
          title: titleParts.join(' · ') || 'Workspace notes snapshot',
          description: 'Saved from the Workspace notes panel.',
          sourceFileName: selFile?.name ?? undefined,
          savedFrom: 'workspace-notes',
          category: noteStyle,
        },
      }),
    });

    const data = await res.json().catch(() => null) as { error?: string } | null;
    if (!res.ok) {
      throw new Error(data?.error ?? 'Could not save notes snapshot.');
    }

    broadcastInvalidate(LIBRARY_CHANNEL);
  }

  function openNotesInTools(text: string, nextMode?: GenMode) {
    const trimmed = text.trim();
    if (!trimmed) {
      toast('Add or generate notes first.', 'warning');
      return;
    }
    setMainTab('generate');
    setPasteMode(true);
    setViewFile(null);
    setSelFile(null);
    setOutput('');
    setGenMode(nextMode ?? genMode);
    setExtractedText(trimmed);
    toast(nextMode ? 'Notes are ready for generation' : 'Notes are ready in Tools', 'success');
  }

  function openNotesInChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      toast('Add or generate notes first.', 'warning');
      return;
    }
    setMainTab('chat');
    setViewFile(null);
    setSelFile(null);
    setOutput('');
    setExtractedText(trimmed);
    toast(t('Notes are ready in Chat'), 'success');
  }

  function quizFromNotes(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      toast('Add or generate notes first.', 'warning');
      return;
    }
    setMainTab('generate');
    setPasteMode(true);
    setViewFile(null);
    setSelFile(null);
    setOutput('');
    setGenMode('quiz');
    setExtractedText(trimmed);
    toast(t('Building quiz prompts from your notes…'), 'info');
    void runGenerate('quiz', trimmed);
  }

  function applyFileContext(file: FileRecord, text: string, nextTab: MainTab, successMessage: string) {
    setExtractedText(text);
    setSelFile(file);
    setPasteMode(false);
    setOutput('');
    setMainTab(nextTab);
    toast(successMessage, 'success');
  }

  function handleUseForTools(file: FileRecord, text: string) {
    applyFileContext(file, text, 'generate', 'Content loaded — pick a tool and generate');
  }

  function handleUseForChat(file: FileRecord, text: string) {
    applyFileContext(file, text, 'chat', 'File loaded — ask a question in Chat');
  }

  function handleUseForNotes(file: FileRecord, text: string) {
    applyFileContext(file, text, 'notes', 'File loaded — generate notes from the selected document');
  }

  async function loadSelectedFileIntoChat() {
    if (!selFile) {
      toast(t('Choose a file first.'), 'warning');
      return;
    }
    const text = await extractFromFile(selFile);
    if (text) {
      setMainTab('chat');
      toast(`"${selFile.name}" is ready in Chat`, 'success');
    }
  }

  function clearChatContext() {
    setSelFile(null);
    setExtractedText('');
    toast(t('Chat file cleared'), 'info');
  }

  function clearGen() { abortRef.current?.abort(); setSelFile(null); setExtractedText(''); setOutput(''); setPasteMode(false); setGenerating(false); }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      // Don't fire if focus is in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape' && output) { clearGen(); return; }
      if (inInput) return;
      if (ctrl && e.key === 'g') { e.preventDefault(); if (mainTab === 'generate' && extractedText && !generating) runGenerate(genMode as ToolMode); }
      if (ctrl && e.key === 's') { e.preventDefault(); if (output) saveToLibrary(); }
      if (ctrl && e.key === 'e') { e.preventDefault(); if (output) downloadOutput('md'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, extractedText, generating, genMode, output]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'planner' || tab === 'generate' || tab === 'chat' || tab === 'notes' || tab === 'focus' || tab === 'analytics') {
      setMainTab(tab);
    }
  }, [searchParams]);

  // Listen for sidebar tool navigation events
  useEffect(() => {
    function onOpenTab(e: Event) {
      const tab = (e as CustomEvent<string>).detail as MainTab;
      setMainTab(tab);
    }
    window.addEventListener('kivora:open-tab', onOpenTab);
    return () => window.removeEventListener('kivora:open-tab', onOpenTab);
  }, []);

  useEffect(() => {
    const reviewSetImport = searchParams.get('reviewSetImport');
    if (!reviewSetImport) return;
    if (handledReviewImportRef.current === reviewSetImport) return;
    handledReviewImportRef.current = reviewSetImport;

    createWorkspaceReviewSet({
      name: 'Imported review set',
      description: 'Import cards here from pasted text, CSV, Anki, or a Kivora share link.',
      phase: 'import',
      importUrl: reviewSetImport,
    });
    toast(t('Review-set import is ready in Workspace'), 'success');
    router.replace('/workspace');
  }, [createWorkspaceReviewSet, router, searchParams, toast]);

  useEffect(() => {
    const scholarAction = searchParams.get('scholarAction');
    if (!scholarAction || !scholarCtx) return;

    const actionKey = `${scholarAction}:${scholarCtx.writtenAt}`;
    if (handledScholarActionRef.current === actionKey) return;
    handledScholarActionRef.current = actionKey;

    if (scholarAction === 'flashcards' && scholarCtx.reviewSetContent) {
      setMainTab('flashcards');
      setOutput(scholarCtx.reviewSetContent);
      setSelFile(null);
      setViewFile(null);
      setPasteMode(false);
      setActiveReviewSetId(null);
      setRequestedReviewPhase(null);
      toast(`"${scholarCtx.label}" is ready in Flashcards`, 'success');
      router.replace('/workspace?tab=flashcards');
      return;
    }

    if (scholarAction === 'generate' && scholarCtx.sourceText) {
      setMainTab('generate');
      setPasteMode(true);
      setSelFile(null);
      setViewFile(null);
      setExtractedText(scholarCtx.sourceText);
      setOutput('');
      setGenMode('summarize');
      toast(`"${scholarCtx.label}" is ready in Tools`, 'success');
      router.replace('/workspace?tab=generate');
    }
  }, [router, scholarCtx, searchParams, toast]);

  const breadcrumb = [selectedFolderName, selectedTopicName].filter(Boolean).join(' › ');
  const currentGen = GENERATE_TABS.find(t => t.id === genMode)!;
  const currentSourceLabel = pasteMode ? t('Pasted text') : selFile?.name ?? null;
  const workspaceTabMeta = { filesCount: files.length, libraryCount: libItems.length, decksCount: srsDecks.length };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="tool-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
          <span className="panel-title">
            {breadcrumb
              ? <>{selectedFolderName}<span style={{ color: 'var(--text-3)' }}>{selectedTopicName ? ` › ${selectedTopicName}` : ''}</span></>
              : t('Kivora Workspace')}
          </span>
          {!selectedFolder && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', fontWeight: 400 }}>{t('← Select a folder to get started')}</span>}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {currentSourceLabel && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--text-xs)',
                color: 'var(--text-2)',
                background: 'var(--surface)',
                border: '1px solid var(--border-2)',
                borderRadius: 20,
                padding: '2px 8px',
                maxWidth: 220,
              }}
              title={currentSourceLabel}
            >
              {pasteMode ? '✍️' : '📄'}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentSourceLabel}</span>
            </span>
          )}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => router.push('/library')}
            title={t('Open review sets and saved outputs')}
            style={{ fontSize: 12, padding: '3px 8px' }}
          >
            📇 {t('Review sets')} {srsDecks.length ? `(${srsDecks.length})` : ''}
          </button>
          {onToggleReports && (
            <button
              className={`btn btn-sm ${reportsOpen ? 'btn-accent' : 'btn-ghost'}`}
              onClick={onToggleReports}
              title={reportsOpen ? t('Close reports panel') : t('Open study reports')}
              style={{ fontSize: 12, padding: '3px 8px' }}>
              📊
            </button>
          )}
        </div>
      </div>

      {/* Scholar Hub context banner */}
      {scholarCtx && (
        <div className="workspace-scholar-banner" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '6px 14px',
          background: 'color-mix(in srgb, var(--accent, #3b82f6) 8%, var(--surface))',
          borderBottom: '1px solid color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent)',
          fontSize: 'var(--text-xs)', flexShrink: 0,
        }}>
          <span style={{ color: 'var(--text-2)' }}>
            {scholarCtx.kind === 'research' ? '🔍' : '📄'}{' '}
            <strong style={{ color: 'var(--text)' }}>{t('From Scholar Hub')}:</strong>{' '}
            <span style={{ color: 'var(--text-2)' }}>{scholarCtx.label.slice(0, 60)}{scholarCtx.label.length > 60 ? '…' : ''}</span>
          </span>
          <div className="workspace-scholar-actions" style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {scholarCtx.sourceText && (
              <button
                className="btn btn-sm btn-secondary"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setMainTab('generate');
                  setPasteMode(true);
                  setSelFile(null);
                  setExtractedText(scholarCtx.sourceText!);
                  setOutput('');
                }}
              >
                {t('Use as source ↓')}
              </button>
            )}
            {scholarCtx.reviewSetContent && (
              <button
                className="btn btn-sm btn-secondary"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => {
                  setMainTab('flashcards');
                  setOutput(scholarCtx.reviewSetContent!);
                  setSelFile(null);
                  setViewFile(null);
                  setPasteMode(false);
                  setActiveReviewSetId(null);
                  setRequestedReviewPhase(null);
                }}
              >
                {t('Build review set ↓')}
              </button>
            )}
            <button
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', opacity: 0.7 }}
              onClick={() => { clearScholarContext(); setScholarCtx(null); }}
              title={t('Dismiss Scholar Hub context')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="tab-bar" style={{ flexShrink: 0, overflowX: 'auto', flexWrap: 'nowrap' }}>
        {WORKSPACE_TABS.map(({ id, icon, label, getMeta }) => {
          const meta = getMeta?.(workspaceTabMeta) ?? '';
          return (
          <button key={id} className={`tab-btn${mainTab === id ? ' active' : ''}`}
            onClick={() => setMainTab(id)}>
            <span className="tab-btn-content">
              <span className="tab-btn-icon" aria-hidden="true">{icon}</span>
              <span className="tab-btn-text">{t(label)}</span>
              {meta && <span className="tab-btn-meta">{meta}</span>}
            </span>
          </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* ─────────────────── FILES ─────────────────── */}
        {mainTab === 'files' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: viewFile ? 'clamp(180px, 28%, 300px)' : '100%',
              flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRight: viewFile ? '1px solid var(--border)' : 'none',
              transition: 'width 0.22s ease',
              // On mobile, hide list when viewer is open
            }} className={viewFile ? 'file-list-panel file-list-panel--has-viewer' : 'file-list-panel'}>
              {!selectedFolder ? (
                <div className="empty-state" style={{ flex: 1, gap: 20, padding: '28px 16px' }}>
                  <div className="empty-icon">📚</div>
                  <h3 style={{ marginBottom: 4 }}>{t('Pick a starting point')}</h3>
                  <p style={{ marginBottom: 8 }}>{t('Create a folder to organize files, or jump straight into a tool.')}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 240 }}>
                    <button className="btn btn-primary btn-sm" onClick={requestCreateFolder} style={{ justifyContent: 'flex-start', gap: 8 }}>
                      📂 {t('Create a folder')}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setMainTab('generate')} style={{ justifyContent: 'flex-start', gap: 8 }}>
                      ⚡ {t('Use tools without a file')}
                    </button>
                    <a href="/coach" className="btn btn-secondary btn-sm" style={{ justifyContent: 'flex-start', gap: 8, textDecoration: 'none' }}>
                      🔬 {t('Search research sources')}
                    </a>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 4 }}>
                    {t('Tip: ⌘K searches all your decks, library items, and saved sources.')}
                  </p>
                </div>
              ) : (
                <>
                  <input ref={filePickerRef} type="file" multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                    style={{ display: 'none' }}
                    onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />

                  {/* Drop zone */}
                  <div
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={async e => { e.preventDefault(); setDragging(false); await uploadFiles(e.dataTransfer.files); }}
                    onClick={() => filePickerRef.current?.click()}
                    style={{
                      margin: '10px 10px 0', borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      border: dragging ? '2px solid var(--accent)' : '1.5px dashed var(--border-2)',
                      background: dragging ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                      transition: 'border-color 0.15s, background 0.15s', flexShrink: 0,
                    }}>
                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: dragging ? 'var(--accent)' : 'var(--text-2)' }}>
                      {uploading ? `⏳ ${t('Uploading…')}` : dragging ? `📥 ${t('Drop to upload')}` : `＋ ${t('Drop files or click to upload')}`}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 3 }}>
                      {t('PDF · Word · PowerPoint · Images · Text')}
                      {(selectedTopicName || selectedFolderName) && <span style={{ color: 'var(--accent)' }}> → {selectedTopicName || selectedFolderName}</span>}
                    </div>
                  </div>

                  <div className="workspace-focus-strip" style={{ margin: '10px 10px 0', flexShrink: 0 }}>
                    <div className="workspace-focus-card">
                      <span className="workspace-focus-eyebrow">{t('Files')}</span>
                      <strong>{files.length ? t(files.length === 1 ? '{count} study file' : '{count} study files', { count: files.length }) : t('Build your study source library')}</strong>
                      <span>{viewFile ? t('Previewing {name}', { name: viewFile.name }) : selFile ? t('Current source: {name}', { name: selFile.name }) : t('Upload once, then send a file into Tools, Notes, Chat, or Math.')}</span>
                    </div>
                    <div className="workspace-focus-card">
                      <span className="workspace-focus-eyebrow">{t('Best next step')}</span>
                      <strong>{selFile ? t('Turn this file into notes or questions') : t('Open a file and route it anywhere')}</strong>
                      <span>{selFile ? t('Use the quick actions on the file card or preview to move faster.') : t('Every file card now has one-click actions for Generate, Chat, Notes, and Math.')}</span>
                    </div>
                  </div>

                  {/* File list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 12px' }}>
                    {filesLoad ? (
                      [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 58, marginBottom: 8, borderRadius: 10 }} />)
                    ) : files.length === 0 ? (
                      <div className="empty-state" style={{ padding: '32px 12px' }}>
                        <div className="empty-icon">📁</div>
                        <p style={{ fontSize: 'var(--text-sm)' }}>{t('No files yet — drag one in above.')}</p>
                      </div>
                    ) : (
                      files.map(file => {
                        const isMissing = missingBlobs.has(file.id);
                        return (
                          <div key={file.id}
                            className={`file-card${viewFile?.id === file.id ? ' selected' : ''}${isMissing ? ' file-card-missing' : ''}`}
                            style={{ cursor: 'pointer', marginBottom: 6, flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
                            onClick={() => {
                              if (isMissing) return;
                              void markRecentFile(file.id);
                              setViewFile(v => v?.id === file.id ? null : file);
                            }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="file-thumb" style={{ opacity: isMissing ? 0.45 : 1 }}>{fileIcon(file)}</div>
                              <div className="file-info" style={{ flex: 1, minWidth: 0 }}>
                                <div className="file-name" title={file.name}>{file.name}</div>
                                <div className="file-meta">{fmt(file.fileSize)}{file.fileSize ? ' · ' : ''}{fmtDate(file.createdAt)}</div>
                              </div>
                              <div className="workspace-file-actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                {!isMissing && (
                                  <>
                                    <button
                                      className="btn btn-primary btn-sm"
                                      style={{ fontSize: 11, padding: '2px 8px' }}
                                      title="Extract text and open in Generate"
                                      aria-label={`Use ${file.name} in Tools`}
                                      onClick={async () => {
                                        const text = await extractFromFile(file);
                                        if (text) {
                                          setSelFile(file);
                                          setMainTab('generate');
                                        }
                                      }}>
                                      ⚡ {t('Use')}
                                    </button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: 11, padding: '2px 8px' }}
                                      title="Extract text and open in Chat"
                                      aria-label={`Use ${file.name} in Chat`}
                                      onClick={async () => {
                                        const text = await extractFromFile(file);
                                        if (text) {
                                          setSelFile(file);
                                          setMainTab('chat');
                                        }
                                      }}>
                                      💬 {t('Chat')}
                                    </button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: 11, padding: '2px 8px' }}
                                      title="Extract text and open PDF to Notes"
                                      aria-label={`Use ${file.name} in Notes`}
                                      onClick={async () => {
                                        const text = await extractFromFile(file);
                                        if (text) {
                                          handleUseForNotes(file, text);
                                        }
                                      }}>
                                      📓 {t('Notes')}
                                    </button>
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      style={{ fontSize: 11, padding: '2px 8px' }}
                                      title="Send this file into Math"
                                      aria-label={`Use ${file.name} in Math`}
                                      onClick={async () => {
                                        const text = await extractFromFile(file);
                                        if (text) {
                                          await sendFileToMath(file, text);
                                        }
                                      }}>
                                      ∑ {t('Math')}
                                    </button>
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                                      aria-label={`${viewFile?.id === file.id ? 'Close preview for' : 'View'} ${file.name}`}
                                      onClick={() => {
                                        void markRecentFile(file.id);
                                        setViewFile(v => v?.id === file.id ? null : file);
                                      }}>
                                      {viewFile?.id === file.id ? t('Close') : t('View')}
                                    </button>
                                  </>
                                )}
                                <button className="btn-icon" style={{ color: 'var(--danger)', width: 26, height: 26 }}
                                  title={`Delete "${file.name}"`}
                                  aria-label={`Delete ${file.name}`}
                                  onClick={e => deleteFile(e, file)}>✕</button>
                              </div>
                            </div>
                            {isMissing && (
                              <div style={{
                                marginTop: 6, padding: '6px 10px', borderRadius: 8,
                                background: 'var(--warning-bg)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}
                                onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', flex: 1 }}>
                                  ⚠ {t('File data missing — re-upload to restore')}
                                </span>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: '2px 10px', background: 'var(--warning)', color: 'var(--bg)', border: 'none' }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setReuploadTarget(file);
                                    reuploadRef.current?.click();
                                  }}>
                                  ↑ {t('Re-upload')}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {/* Hidden re-upload input */}
                  <input
                    ref={reuploadRef}
                    type="file"
                    accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                    style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0];
                      if (file && reuploadTarget) await handleReupload(file, reuploadTarget);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>
            {viewFile && (
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }} className="file-viewer-panel">
                <FileViewer
                  file={viewFile}
                  onClose={() => setViewFile(null)}
                  onUseForTools={handleUseForTools}
                  onUseForChat={handleUseForChat}
                  onUseForNotes={handleUseForNotes}
                  onUseInMath={sendFileToMath}
                />
              </div>
            )}
          </div>
        )}

        {/* ─────────────────── GENERATE ──────────────── */}
        {mainTab === 'generate' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            <div className="workspace-generate-toolbar workspace-generate-toolbar--summary" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)' }}>
                {selFile
                  ? t('Working from {name}{suffix}.', { name: selFile.name, suffix: extractedText ? ` · ${wordCount(extractedText).toLocaleString()} ${t('words loaded')}` : '' })
                  : pasteMode
                    ? t('Paste text directly, then generate notes, summaries, quizzes, or exam prep.')
                    : t('Pick a file from Workspace or switch to Paste text to start generating study material.')}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{t(currentGen.label)}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              <div className="workspace-focus-card">
                <span className="workspace-focus-eyebrow">{t('Tools')}</span>
                <strong>{t(currentGen.label)}</strong>
                <span>
                  {selFile
                    ? t('Working from {name}{suffix}.', { name: selFile.name, suffix: extractedText ? ` · ${wordCount(extractedText).toLocaleString()} ${t('words loaded')}` : '' })
                    : pasteMode
                      ? t('Paste text directly, then generate notes, summaries, quizzes, or exam prep.')
                      : t('Pick a file from Workspace or switch to Paste text to start generating study material.')}
                </span>
              </div>
              <div className="workspace-focus-card">
                <span className="workspace-focus-eyebrow">{t('Best fit')}</span>
                <strong>{genMode === 'notes' ? t('Turn sources into notes') : genMode === 'exam' ? t('Simulate exam prep') : genMode === 'practice' ? t('Build guided practice') : t('Create a quick study output')}</strong>
                <span>{pasteMode ? t('Text mode stays fast for quick experiments.') : t('File mode is best when you want grounded output from a real document.')}</span>
              </div>
            </div>

            {/* Tool mode pills — grouped */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              {GENERATE_TAB_GROUPS.map((group, gi) => (
                <div key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: gi === 0 ? '9px 14px 5px' : '4px 14px 5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginRight: 3, flexShrink: 0, minWidth: 42 }}>
                    {t(group.label)}
                  </span>
                  <span style={{ width: 1, height: 14, background: 'var(--border-2)', flexShrink: 0, marginRight: 3 }} />
                  {GENERATE_TABS.filter(tab => (group.ids as readonly string[]).includes(tab.id)).map(tab => (
                    <button key={tab.id} title={t(tab.hint)}
                      onClick={() => { setGenMode(tab.id); setOutput(''); }}
                      style={{
                        padding: '4px 11px', borderRadius: 20, fontSize: 'var(--text-xs)',
                        fontWeight: 500, border: `1.5px solid ${genMode === tab.id ? 'var(--accent)' : 'var(--border-2)'}`,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        background: genMode === tab.id ? 'var(--accent)' : 'var(--surface-2)',
                        color: genMode === tab.id ? '#fff' : 'var(--text-2)',
                        transition: 'all 0.14s',
                      }}>
                      {tab.icon} {t(tab.label)}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Source row */}
            <div className="workspace-generate-toolbar" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <button className={`btn btn-sm ${!pasteMode ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setPasteMode(false)}>{t('From file')}</button>
                <button className={`btn btn-sm ${pasteMode ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => { setPasteMode(true); setSelFile(null); if (!pasteMode) setExtractedText(''); }}>{t('Paste text')}</button>
              </div>

              {!pasteMode && (
                <>
                  {selFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '5px 10px' }}>
                      <span>{fileIcon(selFile)}</span>
                      <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selFile.name}</span>
                      {extractedText && <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>}
                      <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={clearGen}>✕</button>
                    </div>
                  ) : files.length > 0 ? (
                    <select defaultValue="" onChange={e => { const f = files.find(x => x.id === e.target.value); if (f) { setSelFile(f); setExtractedText(''); setOutput(''); } }} style={{ flex: 1, minWidth: 180 }}>
                      <option value="" disabled>{t('Choose a file…')}</option>
                      {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>{t('No files yet —')}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setMainTab('files')}>{t('Go to Files ↗')}</button>
                    </div>
                  )}
                  {selFile && !extractedText && (
                    <button className="btn btn-secondary btn-sm" disabled={extracting}
                      onClick={() => extractFromFile(selFile)}>
                      {extracting ? t('Extracting…') : `↓ ${t('Extract text')}`}
                    </button>
                  )}
                  {selFile && extractedText && (
                    <a
                      href="/coach"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, textDecoration: 'none', opacity: 0.75 }}
                      title={t('Analyze this content deeply in Scholar Hub')}
                      onClick={() => {
                        writeScholarContext({ label: selFile.name, sourceText: extractedText, kind: 'source' });
                      }}
                    >
                      {t('Scholar Hub ↗')}
                    </a>
                  )}
                </>
              )}

              {pasteMode && !extractedText && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>{t('Paste content below →')}</span>}
              {pasteMode && extractedText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>
                  <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={() => { setExtractedText(''); setOutput(''); }}>✕</button>
                </div>
              )}

              {(extractedText || pasteMode) && (
                <div className="workspace-generate-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                  {['quiz','mcq','exam'].includes(genMode) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                      {t('Count')}:
                      <input type="number" value={count} min={2} max={25}
                        onChange={e => setCount(Math.max(2, Math.min(25, +e.target.value)))}
                        style={{ width: 52, padding: '3px 7px', fontSize: 'var(--text-xs)' }} />
                    </label>
                  )}
                  {generating ? (
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--text-3)' }}
                      onClick={() => { abortRef.current?.abort(); setGenerating(false); }}>
                      ✕ {t('Cancel')}
                    </button>
                  ) : (
                    <button
                      className={`btn btn-sm ${output ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={!extractedText.trim() && pasteMode}
                      onClick={() => runGenerate(genMode as ToolMode)}
                      title={t('Generate (Ctrl+G)')}>
                      {output ? `↻ ${t('Regenerate')}` : `${currentGen.icon} ${t('Generate')} ${t(currentGen.label)}`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Paste textarea */}
            {pasteMode && !extractedText && (
              <div style={{ padding: '12px 14px', flexShrink: 0 }}>
                <textarea
                  ref={pasteRef}
                  placeholder={t('Paste your notes, essay, textbook content, or any study material here…')}
                  style={{ width: '100%', minHeight: 140, resize: 'vertical', background: 'var(--surface)', border: '1.5px solid var(--border-2)', borderRadius: 10, padding: '12px 14px', fontSize: 'var(--text-sm)', lineHeight: 1.6, color: 'var(--text)', fontFamily: 'inherit' }}
                  onKeyDown={e => {
                    // Ctrl+Enter to confirm paste
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      const v = pasteRef.current?.value.trim();
                      if (v) setExtractedText(v);
                    }
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                    <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Ctrl+Enter</kbd> {t('to confirm')}
                  </span>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => {
                      const v = pasteRef.current?.value.trim();
                      if (v) setExtractedText(v);
                    }}>{t('Use this text →')}</button>
                </div>
              </div>
            )}

            {/* Output */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
              {generating && !output && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 20px', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ color: 'var(--text-3)' }}>{t('Generating {label}…', { label: t(currentGen.label).toLowerCase() })}</span>
                </div>
              )}

              {(output || (generating && output)) && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18 }}>{currentGen.icon}</span>
                    <span style={{ fontWeight: 600 }}>{t(currentGen.label)}</span>
                    {selFile && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160, whiteSpace: 'nowrap' }}>{t('from “{name}”', { name: selFile.name })}</span>}
                    {!generating && output && (
                      <span className="badge badge-accent" style={{ fontSize: 10 }}>{wordCount(output).toLocaleString()} words</span>
                    )}
                    {generating && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginLeft: 4 }}>● {t('streaming…')}</span>}
                    {!generating && streamSource === 'offline' && <span className="badge" style={{ fontSize: 10, opacity: 0.6 }}>{t('offline')}</span>}
                    {!generating && streamSource === 'local' && <span className="badge badge-accent" style={{ fontSize: 10, background: 'rgba(74,222,128,0.15)', color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)' }}>● {t('Local AI')}</span>}
                    {!generating && streamSource === 'openai' && <span className="badge badge-accent" style={{ fontSize: 10, background: 'rgba(79,134,247,0.15)', color: '#4f86f7', borderColor: 'rgba(79,134,247,0.3)' }}>● {t('Cloud AI')}</span>}
                    {/* Edit toggle — available for all modes, not while streaming */}
                    {!generating && (
                      <button
                        className={`btn btn-sm ${editMode ? 'btn-accent' : 'btn-ghost'}`}
                        style={{ marginLeft: 'auto', fontSize: 12 }}
                        onClick={() => setEditMode(v => !v)}
                        title={editMode ? t('Done editing (view rendered)') : t('Edit output inline')}
                      >
                        {editMode ? `✓ ${t('Done')}` : `✏ ${t('Edit')}`}
                      </button>
                    )}
                  </div>

                  {/* Output rendering */}
                  {editMode && !generating
                    ? (
                      <textarea
                        value={output}
                        onChange={e => setOutput(e.target.value)}
                        spellCheck
                        style={{ width: '100%', minHeight: 320, padding: '14px 16px', background: 'var(--surface-2)', border: '1.5px solid var(--accent)', borderRadius: 10, color: 'var(--text)', fontSize: 'var(--text-sm)', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                      />
                    )
                    : generating
                    ? <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(output) + '<span class="stream-cursor">▍</span>' }} />
                    : genMode === 'practice'   ? <PracticeView content={output} />
                    : genMode === 'mcq'        ? <MCQView content={output} />
                    : genMode === 'exam'       ? <ExamView content={output} />
                    : <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(output) }} />
                  }

                  {!generating && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => navigator.clipboard.writeText(output).then(() => toast(t('Copied!'), 'success'))}>
                        📋 {t('Copy')}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('md')} title={t('Download as Markdown (Ctrl+E)')}>⬇ .md</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('txt')} title={t('Download as plain text')}>⬇ .txt</button>
                      <button className="btn btn-ghost btn-sm" onClick={saveToLibrary} title={t('Save to Library (Ctrl+S)')}>🗂 {t('Save')}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNotesInject(output); setMainTab('notes'); toast(t('Opened in Notes ✓'), 'success'); }} title={t('Send to Notes editor')}>📓 {t('Notes')}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setOutput(''); setEditMode(false); }}>✕ {t('Clear')}</button>
                    </div>
                  )}
                </>
              )}

              {!generating && !output && extractedText && (
                <div className="empty-state" style={{ padding: '36px 20px' }}>
                  <div className="empty-icon">{currentGen.icon}</div>
                  <h3>{t(currentGen.label)}</h3>
                  <p style={{ maxWidth: 340 }}>{t(currentGen.hint)}</p>
                  <div style={{ marginTop: 4, marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span className="badge badge-accent" style={{ fontSize: 11 }}>
                      {t('{count} words ready', { count: wordCount(extractedText).toLocaleString() })}
                    </span>
                    {selFile && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{t('from “{name}”', { name: selFile.name })}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => runGenerate(genMode as ToolMode)}>
                      {currentGen.icon} {t('Generate')} {t(currentGen.label)}
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>{t('or')} <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 3, padding: '0 4px', fontFamily: 'monospace' }}>Ctrl+G</kbd></span>
                  </div>
                  {/* Also show all other tools so user can pick without going back */}
                  <div style={{ marginTop: 20, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {GENERATE_TABS.filter(tab => tab.id !== genMode).map(tab => (
                      <button key={tab.id} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                        onClick={() => { setGenMode(tab.id); void runGenerate(tab.id as ToolMode); }}>
                        {tab.icon} {t(tab.label)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!generating && !output && !extractedText && !pasteMode && (
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <div className="empty-icon">⚡</div>
                  <h3>{t('AI Tools')}</h3>
                  <p style={{ marginBottom: 18 }}>
                    {t('Open a file in Files, paste text, or jump in with a starter path below.')}
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setMainTab('files')}>{t('Open files')}</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPasteMode(true)}>{t('Paste text')}</button>
                  </div>
                  <div className="workspace-generate-empty-grid" style={{ display: 'grid', gap: 8, width: '100%', maxWidth: 520, margin: '0 auto 18px', textAlign: 'left' }}>
                    <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)', fontWeight: 700 }}>
                      {t('Starter paths')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <a href="/coach?starter=cell%20respiration&section=research" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                        🔬 {t('Start from a topic')}
                      </a>
                      <a href="/planner" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                        📅 {t('Build a study plan')}
                      </a>
                      <a href="/library" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                        🗂 {t('Browse saved work')}
                      </a>
                    </div>
                  </div>
                  {/* Quick-start tool buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                    {GENERATE_TABS.slice(0, 6).map(tab => (
                      <button key={tab.id}
                        className={`btn btn-sm btn-ghost`}
                        style={{ fontSize: 12 }}
                        onClick={() => { setGenMode(tab.id); setPasteMode(true); }}>
                        {tab.icon} {t(tab.label)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 'var(--text-xs)', color: 'var(--text-3)', textAlign: 'left', maxWidth: 280, margin: '0 auto' }}>
                    {GENERATE_SHORTCUTS.map((shortcut) => (
                      <span key={shortcut.key}>
                        <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>{shortcut.key}</kbd> {shortcut.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─────────────────── FLASHCARDS ────────────── */}
        {mainTab === 'flashcards' && (
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            <div className="workspace-focus-strip" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div className="workspace-focus-card">
                <span className="workspace-focus-eyebrow">{t('Flashcards')}</span>
                <strong>{activeReviewSet ? activeReviewSet.name : t('Review sets live here')}</strong>
                <span>{activeReviewSet ? t('{due} due now · {count} cards in this set', { due: activeReviewDueCount, count: activeReviewSet.cards.length }) : t('Import, review, edit, and export your sets from one place in Workspace.')}</span>
              </div>
              <div className="workspace-focus-card workspace-focus-card--actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setRequestedReviewPhase('review')}>{t('Review now')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRequestedReviewPhase('import')}>{t('Import set')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => router.push('/library')}>{t('Open Library')}</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <FlashcardView
                content={output}
                title={selFile?.name}
                initialDeck={activeReviewSet}
                requestedPhase={requestedReviewPhase}
                initialImportUrl={pendingReviewImportUrl}
                onRequestedPhaseHandled={() => setRequestedReviewPhase(null)}
                onDeckChange={(deck) => {
                  setSrsDecks(current => current.map(d => d.id === deck.id ? deck : d));
                }}
              />
            </div>
          </div>
        )}

        {/* ─────────────────── CHAT ──────────────────── */}
        {mainTab === 'chat' && (
          <ChatPanel
            extractedText={extractedText}
            fileName={selFile?.name}
            fileId={selFile?.id}
            files={files.map((file) => ({ id: file.id, name: file.name }))}
            selectedFileId={selFile?.id ?? null}
            onSelectFile={(fileId) => {
              const nextFile = files.find((file) => file.id === fileId);
              if (!nextFile) return;
              setSelFile(nextFile);
              setExtractedText('');
              void extractFromFile(nextFile);
            }}
            onLoadSelectedFile={loadSelectedFileIntoChat}
            onClearContext={clearChatContext}
            extracting={extracting}
          />
        )}

        {/* ─────────────────── NOTES ─────────────────── */}
        {mainTab === 'notes' && (
          <NotesPanel
            folderId={selectedFolder}
            injectContent={notesInject}
            onInjectConsumed={() => setNotesInject(undefined)}
            sourceLabel={selFile?.name ?? null}
            sourceWordCount={extractedText ? wordCount(extractedText) : undefined}
            noteStyle={noteStyle}
            onNoteStyleChange={setNoteStyle}
            onGenerateFromSource={() => void generateNotesForWorkspace()}
            onOpenFiles={() => setMainTab('files')}
            onUseNotesInTools={openNotesInTools}
            onQuizFromNotes={quizFromNotes}
            onAskChatAboutNotes={openNotesInChat}
            onSaveNotesSnapshot={saveNotesSnapshotToLibrary}
          />
        )}

        {/* ─────────────────── FOCUS ─────────────────── */}
        {/* Always mounted so the Pomodoro timer keeps running when you switch tabs */}
        <div style={{ display: mainTab === 'focus' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
          <FocusPanel />
        </div>

        {/* ─────────────────── PLANNER ─────────────────── */}
        {mainTab === 'planner' && <ExamPlannerPanel />}

        {/* ─────────────────── ANALYTICS ─────────────────── */}
        {mainTab === 'analytics' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <StudyAnalytics />
          </div>
        )}

        {/* Library is now a standalone page at /library */}

      </div>
    </div>
  );
}
