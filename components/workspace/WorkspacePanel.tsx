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
import { stashPodcastHandoff } from '@/lib/podcast/handoff';
import type { NoteStyle } from '@/components/workspace/NotesPanel';

// ── Lazy-loaded tool panels (split into separate JS chunks) ────────────────────
const ChatPanel      = dynamic(() => import('@/components/workspace/ChatPanel').then(m => ({ default: m.ChatPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const KnowledgeMap   = dynamic(() => import('@/components/tools/KnowledgeMap').then(m => ({ default: m.KnowledgeMap })), { ssr: false, loading: () => <div className="tool-loading" /> });
const NotesPanel     = dynamic(() => import('@/components/workspace/NotesPanel').then(m => ({ default: m.NotesPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const ExamPlannerPanel = dynamic(() => import('@/components/workspace/ExamPlannerPanel').then(m => ({ default: m.ExamPlannerPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const MCQView        = dynamic(() => import('@/components/workspace/views/MCQView').then(m => ({ default: m.MCQView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const QuizView       = dynamic(() => import('@/components/workspace/views/QuizView').then(m => ({ default: m.QuizView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const PracticeView   = dynamic(() => import('@/components/workspace/views/PracticeView').then(m => ({ default: m.PracticeView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const FlashcardView  = dynamic(() => import('@/components/workspace/views/FlashcardView').then(m => ({ default: m.FlashcardView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const ExamView       = dynamic(() => import('@/components/workspace/views/ExamView').then(m => ({ default: m.ExamView })), { ssr: false, loading: () => <div className="tool-loading" /> });
const FocusPanel     = dynamic(() => import('@/components/workspace/views/FocusPanel').then(m => ({ default: m.FocusPanel })), { ssr: false, loading: () => <div className="tool-loading" /> });
const DocumentPreview = dynamic(() => import('@/components/workspace/DocumentPreview').then(m => ({ default: m.DocumentPreview })), { ssr: false, loading: () => <div className="tool-loading" /> });

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

// "notes" generation lives on the dedicated 📓 Notes tab (which has its own
// "Generate notes" button + style picker). "flashcards" generation lives on
// the dedicated 🃏 Flashcards tab — neither is duplicated here.
const GENERATE_TABS = [
  { id: 'summarize',  label: 'Summarize',  icon: '📝', hint: 'Key-point summary of your content' },
  { id: 'outline',    label: 'Outline',    icon: '📑', hint: 'Chapter outline with learning objectives' },
  { id: 'practice',   label: 'Practice',   icon: '🎯', hint: 'Practice problem with progressive hints and solution' },
  { id: 'mcq',        label: 'MCQ',        icon: '🧩', hint: 'Multiple-choice questions with answers' },
  { id: 'quiz',       label: 'Quiz',       icon: '❓', hint: 'Open-ended quiz questions' },
  { id: 'exam',       label: 'Exam Prep',  icon: '🏆', hint: 'Timed exam with scoring and weak-area analysis' },
  // Flashcards generation lives in the dedicated Flashcards tab next
  // to its deck library + study modes — adding a duplicate chip here
  // confused users, so it's not in this list.
] as const;

const GENERATE_TAB_GROUPS = [
  { label: 'Written',  ids: ['summarize', 'outline'] },
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
  file, onClose, onUseForTools, onUseForChat, onUseForNotes, onUseForFlashcards, onUseInMath, onUseForPodcast,
}: {
  file: FileRecord;
  onClose: () => void;
  onUseForTools: (file: FileRecord, text: string) => void;
  onUseForChat: (file: FileRecord, text: string) => void;
  onUseForNotes: (file: FileRecord, text: string) => void;
  onUseForFlashcards: (file: FileRecord, text: string) => void;
  onUseInMath: (file: FileRecord, text: string) => void;
  onUseForPodcast: (file: FileRecord, text: string) => void;
}) {
  const { toast } = useToast();
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
    if (!blob) { toast('File not found locally or in remote storage.', 'error'); return; }
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

  async function useForFlashcards() {
    const text = await resolveFileText('Flashcards');
    if (text) onUseForFlashcards(file, text);
  }

  async function useForPodcast() {
    const text = await resolveFileText('Podcast');
    if (text) onUseForPodcast(file, text);
  }

  async function useInMath() {
    if (textContent) {
      onUseInMath(file, textContent);
      return;
    }
    if (!file.localBlobId) {
      toast('This file is not available locally for math context.', 'warning');
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
          <button className="btn btn-primary btn-sm" onClick={useForTools} title="Load into Generate tab">
            ⚡ Tools
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useForNotes} title="Load into Notes tab">
            📓 Notes
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useForChat} title="Load into Chat tab">
            💬 Chat
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useForFlashcards} title="Generate flashcards from this file">
            🃏 Flashcards
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useInMath} title="Send this file into Math">
            ∑ Math
          </button>
          <button className="btn btn-secondary btn-sm" onClick={useForPodcast} title="Send this file to Audio Podcast">
            🎙 Podcast
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
  // When the user generates from a whole folder instead of a single
  // file, this holds the source-strip metadata so the UI can show
  // "📁 Folder · N files · M words" instead of a single filename.
  const [folderSourceMeta, setFolderSourceMeta] = useState<{ folderName: string; fileCount: number; wordCount: number } | null>(null);
  const [output,        setOutput]        = useState('');
  // Snapshot the most recent output per tool tab so switching between
  // Summarize / MCQ / Quiz / etc. doesn't wipe a result the user wants
  // to come back to. Cleared explicitly via the ✕ Clear button or when
  // a new file is loaded.
  const [outputsByMode, setOutputsByMode] = useState<Record<string, string>>({});
  const [generating,    setGenerating]    = useState(false);
  const [count,         setCount]         = useState(5);
  const [libItems,      setLibItems]      = useState<LibraryItemRecord[]>([]);
  const [libLoad,       setLibLoad]       = useState(false);
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
  const [analyticsData, setAnalyticsData] = useState<{
    weakAreas: Array<{ topic: string; accuracy: number; attempts: number; suggestion: string }>;
    totalQuizzes: number;
    avgScore: number;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showKnowledgeMap, setShowKnowledgeMap] = useState(false);
  const [notesInject,   setNotesInject]   = useState<string | undefined>(undefined);
  const [noteStyle,     setNoteStyle]     = useState<NoteStyle>('study');
  const abortRef    = useRef<AbortController | null>(null);
  const pasteRef    = useRef<HTMLTextAreaElement>(null);
  const handledReviewImportRef = useRef<string | null>(null);

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
  useEffect(() => { setViewFile(null); setMissingBlobs(new Set()); setFolderSourceMeta(null); }, [selectedFolder, selectedTopic]);

  // Mirror non-empty output into the per-mode snapshot so switching tabs
  // doesn't lose work. Using a derived effect (rather than threading an
  // updater through every setOutput call site) keeps the change tiny.
  useEffect(() => {
    if (!output) return;
    setOutputsByMode(prev => prev[genMode] === output ? prev : { ...prev, [genMode]: output });
  }, [output, genMode]);
  useEffect(() => {
    if (!selFile) return;
    const stillExists = files.some((file) => file.id === selFile.id);
    if (!stillExists) {
      setSelFile(null);
      setExtractedText('');
    }
  }, [files, selFile]);

  const loadLib = useCallback(() => {
    setLibLoad(true);
    fetch('/api/library')
      .then(r => r.ok ? r.json() : [])
      .then(setLibItems)
      .catch(() => setLibItems([]))
      .finally(() => setLibLoad(false));
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

  async function useFolderAsSource() {
    if (!selectedFolder) { toast('Pick a folder first.', 'warning'); return; }
    if (files.length === 0) { toast('This folder has no files yet.', 'warning'); return; }
    setExtracting(true);
    setSelFile(null);
    setPasteMode(false);
    setOutput('');
    setOutputsByMode({});
    setFolderSourceMeta(null);
    try {
      const sections: string[] = [];
      let extracted = 0;
      let failed = 0;
      let totalWords = 0;
      for (const file of files) {
        // Reuse cached content when present, otherwise resolve + extract.
        let text: string | null = file.content ?? null;
        if (!text) {
          try {
            const blob = await resolveStoredFileBlob(file);
            if (!blob) { failed++; continue; }
            const res = await extractTextFromBlob(blob, file.name);
            if (res.error || !res.text) { failed++; continue; }
            text = res.text;
          } catch {
            failed++;
            continue;
          }
        }
        sections.push(`=== File: ${file.name} ===\n\n${text}`);
        totalWords += wordCount(text);
        extracted++;
      }
      if (extracted === 0) {
        toast('Could not extract any files from this folder.', 'error');
        return;
      }
      // Combined text is the new source. Most cloud LLMs cap at 8K–32K
      // tokens (~6K–25K words); warn when the user is comfortably past
      // that so they aren't surprised when generation fails or summarises
      // instead of using everything.
      const combined = sections.join('\n\n---\n\n');
      setExtractedText(combined);
      setFolderSourceMeta({
        folderName: selectedFolderName || 'Folder',
        fileCount: extracted,
        wordCount: totalWords,
      });
      setMainTab('generate');
      const oversize = totalWords > 30_000;
      const failTail = failed > 0 ? ` ${failed} couldn't be read.` : '';
      const sizeTail = oversize ? ' Note: long combined text may exceed AI context — consider regenerating with fewer files.' : '';
      toast(
        `Loaded ${extracted} files (${totalWords.toLocaleString()} words) from "${selectedFolderName || 'folder'}".${failTail}${sizeTail}`,
        oversize || failed > 0 ? 'warning' : 'success',
      );
    } finally {
      setExtracting(false);
    }
  }

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
      if (!blob) { toast('File not found in local or remote storage.', 'error'); return null; }
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
    if (!selectedFolder) { toast('Select a folder first.', 'warning'); return; }
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
    // Capture the old blob id BEFORE we start writing the new one so we
    // can clean it up after the metadata patch confirms. Without this,
    // every reupload leaks the previous blob into IndexedDB.
    const oldBlobId = target.localBlobId;
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
      // Metadata is now pointing at the new blob — safe to drop the old.
      // We only delete on the success path so a failed reupload doesn't
      // leave the user with no blob at all.
      if (oldBlobId && oldBlobId !== newBlobId) {
        await idbStore.delete(oldBlobId).catch(() => {});
      }
    } catch {
      // Reupload failed; the old blob is still authoritative — leave it.
    }
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
    toast('File deleted', 'info');
  }

  // ── AI generation (streaming) ──────────────────────────────────────────

  async function runGenerate(mode: ToolMode, sourceOverride?: string) {
    let src = sourceOverride?.trim() ?? extractedText.trim();
    if (!src && selFile) src = (await extractFromFile(selFile))?.trim() ?? '';
    if (!src) { toast('Select a file or paste content first.', 'warning'); return; }

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
        toast('Generated offline (Offline-only mode is active)', 'info');
      } catch { toast('Offline generation failed.', 'error'); }
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
          toast('Generated locally on-device', 'success');
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
        toast('Local generation failed — used offline fallback instead', 'warning');
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
        toast('Too many requests — please wait a moment.', 'error');
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
          toast('Too many requests — please wait a moment.', 'error');
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
      toast('Generation failed. Please try again.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  async function generateNotesForWorkspace() {
    let src = extractedText.trim();
    if (!src && selFile) src = (await extractFromFile(selFile))?.trim() ?? '';
    if (!src) {
      toast('Choose a PDF or document first, then generate notes from it.', 'warning');
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

      if (aiDataMode === 'offline') {
        const { offlineGenerate } = await import('@/lib/offline/generate');
        generated = offlineGenerate('notes', src, { count: 8, noteStyle });
      } else if (ai.mode === 'local' && typeof window !== 'undefined' && window.electronAPI?.desktopAI) {
        const result = await window.electronAPI.desktopAI.generate({ mode: 'notes', text: textForAI });
        if (result.ok) generated = result.content.displayText;
        else {
          const { offlineGenerate } = await import('@/lib/offline/generate');
          generated = offlineGenerate('notes', src, { count: 8, noteStyle });
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
        const data = await res.json() as { content?: string; result?: string; error?: string };
        generated = data.content ?? data.result ?? '';
        if (!generated) throw new Error(data.error ?? 'Could not generate notes');
      }

      setNotesInject(generated);
      setMainTab('notes');
      toast('Structured notes are ready in Notes', 'success');
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
      toast('Review set opened in Flashcards', 'success');
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

  // ── Analytics fetch (lazy, on tab open) ───────────────────────────────
  useEffect(() => {
    if (mainTab !== 'analytics' || analyticsData || analyticsLoading) return;
    setAnalyticsLoading(true);
    fetch('/api/analytics?period=7', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const qs = data.quizStats ?? {};
        const wScore = qs.averageScore ?? null;
        const wCount = qs.totalAttempts ?? 0;
        setWeekScore(typeof wScore === 'number' ? Math.round(wScore) : null);
        setWeekQuizzes(wCount);
        setAnalyticsData({
          weakAreas: (data.weakAreas ?? []).slice(0, 5),
          totalQuizzes: wCount,
          avgScore: wScore ?? 0,
        });
        // Keep streak in sync
        const s = data.activity?.currentStreak ?? 0;
        if (s > 0) { setStreak(s); try { localStorage.setItem('kivora_study_streak', String(s)); } catch {} }
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab]);

  async function saveToLibrary() {
    if (!output) return;
    // Build a descriptive title — Library used to render every saved
    // item as just "Summarize" / "MCQ" / "Quiz" because no metadata.title
    // was being sent. Now we derive one from the source so the user
    // sees "Summary: Cell Biology Ch.5" instead of a generic mode name.
    const label = GENERATE_TABS.find(t => t.id === genMode)?.label ?? 'Output';
    const titleFromSource = (() => {
      if (selFile) return `${label}: ${selFile.name.replace(/\.[^.]+$/, '')}`;
      if (folderSourceMeta) return `${label}: 📁 ${folderSourceMeta.folderName}`;
      const firstLine = output.split('\n').map(l => l.trim()).find(Boolean) ?? '';
      if (firstLine) return `${label}: ${firstLine.slice(0, 60)}`;
      return label;
    })();
    const metadata = {
      title: titleFromSource,
      sourceFileName: selFile?.name ?? null,
      sourceFolderName: folderSourceMeta?.folderName ?? null,
      sourceFileCount: folderSourceMeta?.fileCount ?? null,
      savedFrom: '/workspace',
    };

    let savedOffline = false;
    try {
      const { saveOfflineItem } = await import('@/lib/library/offline-store');
      saveOfflineItem({ mode: genMode, content: output, metadata });
      savedOffline = true;
    } catch { /* IndexedDB may be unavailable; fall through to network */ }

    try {
      const res = await fetch('/api/library', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: genMode, content: output, metadata }),
      });
      if (res.ok) {
        toast('Saved to Library ✓', 'success');
        broadcastInvalidate(LIBRARY_CHANNEL);
        return;
      }
      // Any non-2xx (401/503/500/etc.) — the offline copy already covers
      // the user; just tell them where it landed.
      if (savedOffline) {
        toast('Saved locally (sign in to sync to cloud)', 'success');
        broadcastInvalidate(LIBRARY_CHANNEL);
      } else {
        toast('Could not save — try again', 'warning');
      }
    } catch {
      if (savedOffline) {
        toast('Saved locally — network was unreachable', 'success');
        broadcastInvalidate(LIBRARY_CHANNEL);
      } else {
        toast('Could not save — try again', 'warning');
      }
    }
  }

  function applyFileContext(file: FileRecord, text: string, nextTab: MainTab, successMessage: string) {
    setExtractedText(text);
    setSelFile(file);
    setPasteMode(false);
    setOutput('');
    // New file = the old per-mode snapshots are stale (they were generated
    // from a different document), so drop them. Otherwise the user could
    // tab between Summarize/MCQ and see content from the previous file.
    setOutputsByMode({});
    setFolderSourceMeta(null);
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

  function handleUseForFlashcards(file: FileRecord, text: string) {
    applyFileContext(file, text, 'flashcards', `Generating flashcards from "${file.name}"…`);
    setTimeout(() => { void runGenerate('flashcards', text); }, 0);
  }

  function handleUseForPodcast(file: FileRecord, text: string) {
    stashPodcastHandoff({ title: file.name, content: text });
    toast(`Sending "${file.name}" to Podcast…`, 'info');
    router.push('/podcast');
  }

  async function loadSelectedFileIntoChat() {
    if (!selFile) {
      toast('Choose a file first.', 'warning');
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
    toast('Chat file cleared', 'info');
  }

  function clearGen() { abortRef.current?.abort(); setSelFile(null); setExtractedText(''); setOutput(''); setPasteMode(false); setGenerating(false); setFolderSourceMeta(null); }

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
    toast('Review-set import is ready in Workspace', 'success');
    router.replace('/workspace');
  }, [createWorkspaceReviewSet, router, searchParams, toast]);

  const breadcrumb = [selectedFolderName, selectedTopicName].filter(Boolean).join(' › ');
  const currentGen = GENERATE_TABS.find(t => t.id === genMode)!;
  const currentSourceLabel = pasteMode ? 'Pasted text' : selFile?.name ?? null;
  const workspaceTabMeta = { filesCount: files.length, libraryCount: libItems.length, decksCount: srsDecks.length };

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="tool-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="panel-header" style={{ gap: 10, flexShrink: 0 }}>
        <span className="panel-title">
          {breadcrumb
            ? <>{selectedFolderName}<span style={{ color: 'var(--text-3)' }}>{selectedTopicName ? ` › ${selectedTopicName}` : ''}</span></>
            : 'Kivora Workspace'}
        </span>
        {!selectedFolder && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', fontWeight: 400 }}>← Select a folder to get started</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
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
          {streak > 0 && (
            <span title={`${streak}-day study streak`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--text-xs)', color: 'var(--text-2)', background: 'var(--warning-bg)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)', borderRadius: 20, padding: '2px 8px', cursor: 'default' }}>
              🔥 {streak}d
            </span>
          )}
          {files.length > 0 && <span className="badge badge-accent">{files.length} file{files.length !== 1 ? 's' : ''}</span>}
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => router.push('/library')}
            title="Open review sets and saved outputs"
            style={{ fontSize: 12, padding: '3px 8px' }}
          >
            📇 Review sets {srsDecks.length ? `(${srsDecks.length})` : ''}
          </button>
          {onToggleReports && (
            <button
              className={`btn btn-sm ${reportsOpen ? 'btn-accent' : 'btn-ghost'}`}
              onClick={onToggleReports}
              title={reportsOpen ? 'Close reports panel' : 'Open study reports'}
              style={{ fontSize: 12, padding: '3px 8px' }}>
              📊
            </button>
          )}
        </div>
      </div>

      {/* Scholar Hub context banner */}
      {scholarCtx && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '6px 14px',
          background: 'color-mix(in srgb, var(--accent, #3b82f6) 8%, var(--surface))',
          borderBottom: '1px solid color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent)',
          fontSize: 'var(--text-xs)', flexShrink: 0,
        }}>
          <span style={{ color: 'var(--text-2)' }}>
            {scholarCtx.kind === 'research' ? '🔍' : '📄'}{' '}
            <strong style={{ color: 'var(--text)' }}>Scholar Hub:</strong>{' '}
            <span style={{ color: 'var(--text-2)' }}>{scholarCtx.label.slice(0, 60)}{scholarCtx.label.length > 60 ? '…' : ''}</span>
          </span>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
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
                Use as source ↓
              </button>
            )}
            <a
              href="/coach"
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', textDecoration: 'none' }}
            >
              Open Scholar Hub ↗
            </a>
            <button
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11, padding: '2px 8px', opacity: 0.7 }}
              onClick={() => { clearScholarContext(); setScholarCtx(null); }}
              title="Dismiss Scholar Hub context"
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
              <span className="tab-btn-text">{label}</span>
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
                <div className="empty-state" style={{ flex: 1 }}>
                  <div className="empty-icon">📂</div>
                  <h3>No folder selected</h3>
                  <p>Start by creating a folder, then drop in a file and send it straight into Tools.</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button className="btn btn-primary btn-sm" onClick={requestCreateFolder}>
                      Create first folder
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setMainTab('generate')}>
                      Open tools
                    </button>
                  </div>
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
                      {uploading ? '⏳ Uploading…' : dragging ? '📥 Drop to upload' : '＋ Drop files or click to upload'}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 3 }}>
                      PDF · Word · PowerPoint · Images · Text
                      {(selectedTopicName || selectedFolderName) && <span style={{ color: 'var(--accent)' }}> → {selectedTopicName || selectedFolderName}</span>}
                    </div>
                  </div>

                  <div className="workspace-focus-strip" style={{ margin: '10px 10px 0', flexShrink: 0 }}>
                    <div className="workspace-focus-card">
                      <span className="workspace-focus-eyebrow">Files</span>
                      <strong>{files.length ? `${files.length} study file${files.length !== 1 ? 's' : ''}` : 'Build your study source library'}</strong>
                      <span>{viewFile ? `Previewing ${viewFile.name}` : selFile ? `Current source: ${selFile.name}` : 'Upload once, then send a file into Tools, Notes, Chat, or Math.'}</span>
                    </div>
                    <div className="workspace-focus-card">
                      <span className="workspace-focus-eyebrow">Whole folder</span>
                      <strong>{files.length > 1 ? `Use all ${files.length} files as the source` : 'Use the whole folder'}</strong>
                      <span>Combines every file in this folder into a single source. Great for "Lecture 1–10" style folders before generating notes, MCQs, or an exam.</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ marginTop: 8, alignSelf: 'flex-start' }}
                        disabled={files.length === 0 || extracting}
                        onClick={() => { void useFolderAsSource(); }}
                        title={files.length === 0 ? 'Upload at least one file first' : `Combine ${files.length} files into one source`}
                      >
                        {extracting && folderSourceMeta === null ? '⏳ Loading…' : `📁 Use whole folder${files.length > 0 ? ` (${files.length})` : ''}`}
                      </button>
                    </div>
                  </div>

                  {/* File list */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px 12px' }}>
                    {filesLoad ? (
                      [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 58, marginBottom: 8, borderRadius: 10 }} />)
                    ) : files.length === 0 ? (
                      <div className="empty-state" style={{ padding: '32px 12px' }}>
                        <div className="empty-icon">📁</div>
                        <p style={{ fontSize: 'var(--text-sm)' }}>No files yet — drag one in above.</p>
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
                                <div className="file-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fmt(file.fileSize)}{file.fileSize ? ' · ' : ''}{fmtDate(file.createdAt)}</div>
                              </div>
                              <button className="btn-icon" style={{ color: 'var(--danger)', width: 26, height: 26, flexShrink: 0 }}
                                title={`Delete "${file.name}"`}
                                onClick={e => deleteFile(e, file)}>✕</button>
                            </div>
                            {!isMissing && (
                              <div className="workspace-file-actions"
                                style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}
                                onClick={e => e.stopPropagation()}>
                                <button
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: 11, padding: '2px 8px' }}
                                  title="Extract text and open in Generate"
                                  onClick={async () => {
                                    const text = await extractFromFile(file);
                                    if (text) {
                                      setSelFile(file);
                                      setMainTab('generate');
                                    }
                                  }}>
                                  ⚡ Use
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: '2px 8px' }}
                                  title="Extract text and open in Chat"
                                  onClick={async () => {
                                    const text = await extractFromFile(file);
                                    if (text) {
                                      setSelFile(file);
                                      setMainTab('chat');
                                    }
                                  }}>
                                  💬 Chat
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: '2px 8px' }}
                                  title="Extract text and open PDF to Notes"
                                  onClick={async () => {
                                    const text = await extractFromFile(file);
                                    if (text) {
                                      handleUseForNotes(file, text);
                                    }
                                  }}>
                                  📓 Notes
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: '2px 8px' }}
                                  title="Generate flashcards from this file"
                                  onClick={async () => {
                                    const text = await extractFromFile(file);
                                    if (text) {
                                      handleUseForFlashcards(file, text);
                                    }
                                  }}>
                                  🃏 Flashcards
                                </button>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ fontSize: 11, padding: '2px 8px' }}
                                  title="Send this file into Math"
                                  onClick={async () => {
                                    const text = await extractFromFile(file);
                                    if (text) {
                                      await sendFileToMath(file, text);
                                    }
                                  }}>
                                  ∑ Math
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 'auto' }}
                                  onClick={() => {
                                    void markRecentFile(file.id);
                                    setViewFile(v => v?.id === file.id ? null : file);
                                  }}>
                                  {viewFile?.id === file.id ? 'Close' : 'View'}
                                </button>
                              </div>
                            )}
                            {isMissing && (
                              <div style={{
                                marginTop: 6, padding: '6px 10px', borderRadius: 8,
                                background: 'var(--warning-bg)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}
                                onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', flex: 1 }}>
                                  ⚠ File data missing — re-upload to restore
                                </span>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: '2px 10px', background: 'var(--warning)', color: 'var(--bg)', border: 'none' }}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setReuploadTarget(file);
                                    reuploadRef.current?.click();
                                  }}>
                                  ↑ Re-upload
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
                  onUseForFlashcards={handleUseForFlashcards}
                  onUseInMath={sendFileToMath}
                  onUseForPodcast={handleUseForPodcast}
                />
              </div>
            )}
          </div>
        )}

        {/* ─────────────────── GENERATE ──────────────── */}
        {mainTab === 'generate' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* Analytics strip */}
            {(streak > 0 || weekScore !== null) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '5px 14px',
                background: 'color-mix(in srgb, var(--accent,#6366f1) 6%, var(--surface))',
                borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap',
              }}>
                {streak > 0 && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    🔥 <strong>{streak}</strong>d streak
                  </span>
                )}
                {weekScore !== null && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    📊 <strong>{weekScore}%</strong> avg · {weekQuizzes} quiz{weekQuizzes !== 1 ? 'zes' : ''} this week
                  </span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 10, padding: '1px 7px', marginLeft: 'auto', opacity: 0.7 }}
                  onClick={() => setMainTab('analytics')}
                >
                  Full analytics →
                </button>
              </div>
            )}

            {/*
              Single status bar — replaces the previous two side-by-side
              "Tools" + "Best fit" cards which described the same thing
              twice and pushed the actual controls below the fold.
              Reads as one sentence: source · mode · readiness.
            */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                fontSize: 'var(--text-sm)',
                color: 'var(--text-2)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)' }}>
                Tools
              </span>
              <span style={{ width: 1, height: 14, background: 'var(--border-2)' }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 14 }}>{currentGen.icon}</span>
                <strong style={{ color: 'var(--text)' }}>{currentGen.label}</strong>
              </span>
              <span style={{ color: 'var(--text-3)' }}>·</span>
              <span style={{ color: 'var(--text-3)' }}>
                {folderSourceMeta
                  ? <>Source: <strong style={{ color: 'var(--text-2)' }}>📁 {folderSourceMeta.folderName}</strong> · {folderSourceMeta.fileCount} file{folderSourceMeta.fileCount === 1 ? '' : 's'} · {folderSourceMeta.wordCount.toLocaleString()} words</>
                  : selFile
                  ? <>Source: <strong style={{ color: 'var(--text-2)' }}>{selFile.name}</strong>{extractedText ? ` · ${wordCount(extractedText).toLocaleString()} words` : ' · waiting for extract'}</>
                  : pasteMode
                    ? extractedText ? <>Source: <strong style={{ color: 'var(--text-2)' }}>pasted text</strong> · {wordCount(extractedText).toLocaleString()} words</> : 'Source: paste text below'
                    : 'No source yet — pick a file, paste text, or use the whole folder below'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                Step 1 source · Step 2 mode · Step 3 generate
              </span>
            </div>

            {/* Tool mode pills — grouped */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
              {GENERATE_TAB_GROUPS.map((group, gi) => (
                <div key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: gi === 0 ? '9px 14px 5px' : '4px 14px 5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-3)', marginRight: 3, flexShrink: 0, minWidth: 42 }}>
                    {group.label}
                  </span>
                  <span style={{ width: 1, height: 14, background: 'var(--border-2)', flexShrink: 0, marginRight: 3 }} />
                  {GENERATE_TABS.filter(t => (group.ids as readonly string[]).includes(t.id)).map(t => (
                    <button key={t.id} title={t.hint}
                      onClick={() => { setGenMode(t.id); setOutput(outputsByMode[t.id] ?? ''); }}
                      style={{
                        padding: '4px 11px', borderRadius: 20, fontSize: 'var(--text-xs)',
                        fontWeight: 500, border: `1.5px solid ${genMode === t.id ? 'var(--accent)' : 'var(--border-2)'}`,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        background: genMode === t.id ? 'var(--accent)' : 'var(--surface-2)',
                        color: genMode === t.id ? '#fff' : 'var(--text-2)',
                        transition: 'all 0.14s',
                      }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Source row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                <button className={`btn btn-sm ${!pasteMode ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => setPasteMode(false)}>From file</button>
                <button className={`btn btn-sm ${pasteMode ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => { setPasteMode(true); setSelFile(null); if (!pasteMode) setExtractedText(''); }}>Paste text</button>
              </div>

              {!pasteMode && (
                <>
                  {folderSourceMeta ? (
                    /* Active folder source — show what's loaded with the
                       same dismiss-style as a single file. */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '5px 10px' }}>
                      <span>📁</span>
                      <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Folder: {folderSourceMeta.folderName} · {folderSourceMeta.fileCount} files
                      </span>
                      <span className="badge badge-accent">{folderSourceMeta.wordCount.toLocaleString()} words</span>
                      <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={clearGen}>✕</button>
                    </div>
                  ) : selFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '5px 10px' }}>
                      <span>{fileIcon(selFile)}</span>
                      <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selFile.name}</span>
                      {extractedText && <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>}
                      <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={clearGen}>✕</button>
                    </div>
                  ) : files.length > 0 ? (
                    <>
                      <select
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value === '__folder__') {
                            void useFolderAsSource();
                            return;
                          }
                          const f = files.find(x => x.id === e.target.value);
                          if (f) { setSelFile(f); setExtractedText(''); setOutput(''); }
                        }}
                        style={{ flex: 1, minWidth: 180 }}
                      >
                        <option value="" disabled>Choose a file…</option>
                        {/* Whole-folder option lives at the top of the same dropdown so
                            the user doesn't have to switch tabs to set up a folder source. */}
                        <option value="__folder__">📁 Use whole folder ({files.length} files)</option>
                        <option value="" disabled>──────────</option>
                        {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>No files yet —</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => setMainTab('files')}>Go to Files ↗</button>
                    </div>
                  )}
                  {selFile && !extractedText && (
                    <button className="btn btn-secondary btn-sm" disabled={extracting}
                      onClick={() => extractFromFile(selFile)}>
                      {extracting ? 'Extracting…' : '↓ Extract text'}
                    </button>
                  )}
                  {selFile && extractedText && (
                    <a
                      href="/coach"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, textDecoration: 'none', opacity: 0.75 }}
                      title="Analyze this content deeply in Scholar Hub"
                      onClick={() => {
                        writeScholarContext({ label: selFile.name, sourceText: extractedText, kind: 'source' });
                      }}
                    >
                      Scholar Hub ↗
                    </a>
                  )}
                </>
              )}

              {pasteMode && !extractedText && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>Paste content below →</span>}
              {pasteMode && extractedText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>
                  <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={() => { setExtractedText(''); setOutput(''); }}>✕</button>
                </div>
              )}

              {(extractedText || pasteMode) && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                  {['quiz','mcq','exam'].includes(genMode) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                      Count:
                      <input type="number" value={count} min={2} max={25}
                        onChange={e => setCount(Math.max(2, Math.min(25, +e.target.value)))}
                        style={{ width: 52, padding: '3px 7px', fontSize: 'var(--text-xs)' }} />
                    </label>
                  )}
                  {generating ? (
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--text-3)' }}
                      onClick={() => { abortRef.current?.abort(); setGenerating(false); }}>
                      ✕ Cancel
                    </button>
                  ) : (
                    <button
                      className={`btn btn-sm ${output ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={!extractedText.trim() && pasteMode}
                      onClick={() => runGenerate(genMode as ToolMode)}
                      title="Generate (Ctrl+G)">
                      {output ? `↻ Regenerate` : `${currentGen.icon} Generate ${currentGen.label}`}
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
                  placeholder="Paste your notes, essay, textbook content, or any study material here…"
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
                    <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>Ctrl+Enter</kbd> to confirm
                  </span>
                  <button className="btn btn-primary btn-sm"
                    onClick={() => {
                      const v = pasteRef.current?.value.trim();
                      if (v) setExtractedText(v);
                    }}>Use this text →</button>
                </div>
              </div>
            )}

            {/* Output */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
              {generating && !output && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 20px', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, border: '2.5px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ color: 'var(--text-3)' }}>Generating {currentGen.label.toLowerCase()}…</span>
                </div>
              )}

              {(output || (generating && output)) && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 18 }}>{currentGen.icon}</span>
                    <span style={{ fontWeight: 600 }}>{currentGen.label}</span>
                    {selFile && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160, whiteSpace: 'nowrap' }}>from &ldquo;{selFile.name}&rdquo;</span>}
                    {!generating && output && (
                      <span className="badge badge-accent" style={{ fontSize: 10 }}>{wordCount(output).toLocaleString()} words</span>
                    )}
                    {generating && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginLeft: 4 }}>● streaming…</span>}
                    {!generating && streamSource === 'offline' && <span className="badge" style={{ fontSize: 10, opacity: 0.6 }}>offline</span>}
                    {!generating && streamSource === 'local' && <span className="badge badge-accent" style={{ fontSize: 10, background: 'rgba(74,222,128,0.15)', color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)' }}>● Local AI</span>}
                    {!generating && streamSource === 'openai' && <span className="badge badge-accent" style={{ fontSize: 10, background: 'rgba(79,134,247,0.15)', color: '#4f86f7', borderColor: 'rgba(79,134,247,0.3)' }}>● Cloud AI</span>}
                    {/* Edit toggle — only for text modes, not while streaming */}
                    {!generating && (genMode === 'summarize' || genMode === 'outline' || genMode === 'quiz') && (
                      <button
                        className={`btn btn-sm ${editMode ? 'btn-accent' : 'btn-ghost'}`}
                        style={{ marginLeft: 'auto', fontSize: 12 }}
                        onClick={() => setEditMode(v => !v)}
                        title={editMode ? 'Done editing (view rendered)' : 'Edit output inline'}
                      >
                        {editMode ? '✓ Done' : '✏ Edit'}
                      </button>
                    )}
                  </div>

                  {/* Output rendering */}
                  {editMode && !generating && (genMode === 'summarize' || genMode === 'outline' || genMode === 'quiz')
                    ? (
                      <textarea
                        value={output}
                        onChange={e => setOutput(e.target.value)}
                        spellCheck
                        style={{ width: '100%', minHeight: 320, padding: '14px 16px', background: 'var(--surface-2)', border: '1.5px solid var(--accent)', borderRadius: 10, color: 'var(--text)', fontSize: 'var(--text-sm)', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                      />
                    )
                    : generating && (genMode === 'mcq' || genMode === 'quiz' || genMode === 'exam')
                    ? (
                        /* MCQ / Quiz / Exam streaming — Answer: lines and
                           (correct) markers are embedded in the raw output.
                           Use the parsed view (which strips those) during
                           streaming so the student doesn't see answers
                           ahead of time. Partial blocks without the
                           required Answer: line are filtered out anyway. */
                        <div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite' }} />
                            Generating questions… answers will be hidden until you submit.
                          </div>
                          {genMode === 'mcq'  && <MCQView  content={output} fileId={selFile?.id ?? null} />}
                          {genMode === 'quiz' && <QuizView content={output} fileId={selFile?.id ?? null} />}
                          {genMode === 'exam' && <ExamView content={output} fileId={selFile?.id ?? null} />}
                        </div>
                      )
                    : generating && genMode === 'practice'
                    ? (
                        /* Practice streams Problem → Hint 1/2/3 → Solution.
                           PracticeView keeps the Solution hidden behind
                           "Show solution" once revealed, but the raw stream
                           shows everything. Use PracticeView while streaming
                           so the user has to opt in to see the answer. */
                        <div>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite' }} />
                            Generating practice problem… solution stays hidden until you click to reveal.
                          </div>
                          <PracticeView content={output} />
                        </div>
                      )
                    : generating
                    ? <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(output) + '<span class="stream-cursor">▍</span>' }} />
                    : genMode === 'practice'   ? <PracticeView content={output} />
                    : genMode === 'mcq'        ? <MCQView content={output} fileId={selFile?.id ?? null} />
                    : genMode === 'quiz'       ? <QuizView content={output} fileId={selFile?.id ?? null} />
                    : genMode === 'exam'       ? <ExamView content={output} fileId={selFile?.id ?? null} />
                    : <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(output) }} />
                  }

                  {!generating && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => navigator.clipboard.writeText(output).then(() => toast('Copied!', 'success'))}>
                        📋 Copy
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('md')} title="Download as Markdown (Ctrl+E)">⬇ .md</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('txt')} title="Download as plain text">⬇ .txt</button>
                      <button className="btn btn-ghost btn-sm" onClick={saveToLibrary} title="Save to Library (Ctrl+S)">🗂 Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNotesInject(output); setMainTab('notes'); toast('Opened in Notes ✓', 'success'); }} title="Send to Notes editor">📓 Notes</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setOutput(''); setEditMode(false); setOutputsByMode(prev => { const next = { ...prev }; delete next[genMode]; return next; }); }}>✕ Clear</button>
                    </div>
                  )}
                </>
              )}

              {!generating && !output && extractedText && (
                <div className="empty-state" style={{ padding: '36px 20px' }}>
                  <div className="empty-icon">{currentGen.icon}</div>
                  <h3>{currentGen.label}</h3>
                  <p style={{ maxWidth: 340 }}>{currentGen.hint}</p>
                  <div style={{ marginTop: 4, marginBottom: 16, display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span className="badge badge-accent" style={{ fontSize: 11 }}>
                      {wordCount(extractedText).toLocaleString()} words ready
                    </span>
                    {selFile && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>from &ldquo;{selFile.name}&rdquo;</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => runGenerate(genMode as ToolMode)}>
                      {currentGen.icon} Generate {currentGen.label}
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center' }}>or <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 3, padding: '0 4px', fontFamily: 'monospace' }}>Ctrl+G</kbd></span>
                  </div>
                  {/* Also show all other tools so user can pick without going back */}
                  <div style={{ marginTop: 20, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {GENERATE_TABS.filter(t => t.id !== genMode).map(t => (
                      <button key={t.id} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                        onClick={() => { setGenMode(t.id); void runGenerate(t.id as ToolMode); }}>
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!generating && !output && !extractedText && !pasteMode && (
                /*
                  Single linear empty state — no duplicate mode chips,
                  no second source toggle. Just three numbered steps with
                  the only-real-action-here at step 1.
                  The mode chips already live in the row above; sending
                  the user there avoids two sources of truth.
                */
                <div className="empty-state" style={{ padding: '40px 20px', maxWidth: 480, margin: '0 auto' }}>
                  <div className="empty-icon" style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
                  <h3 style={{ marginBottom: 4 }}>Pick a source to start</h3>
                  <p style={{ marginBottom: 22, color: 'var(--text-3)' }}>
                    Tools turn a source into notes, a quiz, an outline, or exam prep.
                  </p>

                  {/* Step 1 — the one real action on this screen */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
                    {files.length > 0 ? (
                      <button className="btn btn-primary" onClick={() => setMainTab('files')}>
                        📁 Open Files
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={() => setMainTab('files')}>
                        📁 Add a file
                      </button>
                    )}
                    <button className="btn btn-secondary" onClick={() => setPasteMode(true)}>
                      ✍ Paste text instead
                    </button>
                  </div>

                  {/* Steps 2 + 3 — non-clickable signposts that point UP at the
                      controls instead of duplicating them. Keeps a single
                      source of truth for mode selection (the chip row above). */}
                  <ol style={{
                    textAlign: 'left',
                    listStyle: 'none',
                    counterReset: 'step',
                    padding: 0,
                    margin: '0 auto',
                    maxWidth: 360,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontSize: 'var(--text-sm)',
                    color: 'var(--text-2)',
                  }}>
                    <li style={{ display: 'flex', gap: 10, opacity: 0.55 }}>
                      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>1</span>
                      <span><strong>Pick a source</strong> — the buttons above.</span>
                    </li>
                    <li style={{ display: 'flex', gap: 10 }}>
                      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-2)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '1px solid var(--border-2)' }}>2</span>
                      <span><strong>Pick a mode</strong> — Summarize, Notes, MCQ, Quiz… use the chip row at the top of this tab.</span>
                    </li>
                    <li style={{ display: 'flex', gap: 10 }}>
                      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-2)', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: '1px solid var(--border-2)' }}>3</span>
                      <span><strong>Generate</strong> — click the green button or press <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontSize: 11 }}>Ctrl+G</kbd>.</span>
                    </li>
                  </ol>

                  {/* Discrete shortcut footer — was floating mid-screen before, now lives
                      where keyboard shortcuts belong: at the bottom in small type. */}
                  <details style={{ marginTop: 28, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                    <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Keyboard shortcuts</summary>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', textAlign: 'left', maxWidth: 280, margin: '10px auto 0' }}>
                      {GENERATE_SHORTCUTS.map((shortcut) => (
                        <span key={shortcut.key}>
                          <kbd style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace' }}>{shortcut.key}</kbd> {shortcut.label}
                        </span>
                      ))}
                    </div>
                  </details>
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
                <span className="workspace-focus-eyebrow">Flashcards</span>
                <strong>{activeReviewSet ? activeReviewSet.name : 'Review Sets live here'}</strong>
                <span>{activeReviewSet ? `${activeReviewDueCount} due now · ${activeReviewSet.cards.length} cards in this set` : 'Import, review, edit, and export your sets from one place in Workspace.'}</span>
              </div>
              <div className="workspace-focus-card workspace-focus-card--actions">
                {extractedText && !generating && (
                  <>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                      Cards
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={count}
                        onChange={e => {
                          const n = Number.parseInt(e.target.value, 10);
                          // Hard cap lowered from 50 → 30 after a user
                          // accidentally generated 57 cards. Anything above
                          // 30 is rarely useful and easy to overshoot.
                          if (Number.isFinite(n) && n > 0) setCount(Math.min(30, n));
                        }}
                        style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface)', color: 'var(--text)', fontSize: 'var(--text-xs)' }}
                      />
                    </label>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        // Confirm large generations so accidental clicks
                        // (or runaway "57 cards" surprises) need an explicit
                        // tap to proceed.
                        if (count >= 20 && !window.confirm(`Generate ${count} flashcards? This may take a minute.`)) return;
                        setOutput(''); void runGenerate('flashcards');
                      }}
                      title={selFile ? `Generate ${count} flashcards from ${selFile.name}` : `Generate ${count} flashcards from pasted text`}
                    >
                      ✨ Generate {count} from {pasteMode ? 'pasted text' : (selFile?.name ?? 'source')}
                    </button>
                  </>
                )}
                {generating && (
                  <span className="badge" style={{ fontSize: 'var(--text-xs)' }}>Generating cards…</span>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setRequestedReviewPhase('review')}>Review now</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRequestedReviewPhase('import')}>Import set</button>
                <button className="btn btn-ghost btn-sm" onClick={() => router.push('/library')}>Open Library</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {generating && !activeReviewSet ? (
                /* Don't show the deck preview while cards are still
                   streaming in — the backs are visible immediately and
                   that defeats the point of self-testing. Once
                   generation finishes, FlashcardView replaces this and
                   the user can study with backs hidden by default. */
                <div style={{ padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{ fontSize: 36 }}>🃏</div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text)' }}>
                    Generating flashcards…
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', textAlign: 'center', maxWidth: 360 }}>
                    {(() => {
                      const cardCount = (output.match(/^\s*Front\s*:/gmi) || []).length;
                      return cardCount > 0
                        ? `${cardCount} card${cardCount === 1 ? '' : 's'} created so far. Backs stay hidden until you flip them yourself.`
                        : 'Your deck will appear here once ready. Backs stay hidden until you flip them.';
                    })()}
                  </div>
                  <div style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite' }} />
                </div>
              ) : activeReviewSet || output ? (
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
              ) : srsDecks.length > 0 ? (
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                    <strong style={{ fontSize: 'var(--text-sm)' }}>Your review sets</strong>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{srsDecks.length} total · click a set to study</span>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 10px', color: 'var(--danger)' }}
                      onClick={() => {
                        if (!window.confirm(`Delete all ${srsDecks.length} review sets? This wipes the local store and cloud-synced copies.`)) return;
                        const ids = srsDecks.map(d => d.id);
                        try { localStorage.removeItem('kivora-srs-decks'); } catch { /* noop */ }
                        setSrsDecks([]);
                        setActiveReviewSetId(null);
                        ids.forEach(id => {
                          void fetch(`/api/srs?deckId=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
                        });
                      }}
                    >
                      ✕ Clear all
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                    {srsDecks.map((d) => {
                      const due = d.cards.filter(c => c.repetitions > 0 && c.nextReview <= new Date().toISOString().split('T')[0]).length
                        + d.cards.filter(c => c.repetitions === 0).length;
                      return (
                        <div key={d.id}
                          style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
                          onClick={() => setActiveReviewSetId(d.id)}>
                          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📇 {d.name}</div>
                          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-3)', alignItems: 'center' }}>
                            <span>{d.cards.length} cards</span>
                            {due > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>· {due} due</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11, padding: '2px 10px' }}
                              onClick={(e) => { e.stopPropagation(); setActiveReviewSetId(d.id); setRequestedReviewPhase('review'); }}>
                              ▶ Study
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 10px', color: 'var(--danger)', marginLeft: 'auto' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!window.confirm(`Delete review set "${d.name}"? This can't be undone.`)) return;
                                try {
                                  const remaining = loadDecks().filter(x => x.id !== d.id);
                                  localStorage.setItem('kivora-srs-decks', JSON.stringify(remaining));
                                } catch { /* noop */ }
                                setSrsDecks(current => current.filter(x => x.id !== d.id));
                                if (activeReviewSetId === d.id) setActiveReviewSetId(null);
                                void fetch(`/api/srs?deckId=${encodeURIComponent(d.id)}`, { method: 'DELETE' }).catch(() => {});
                              }}>✕ Delete</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
                  No review sets yet. Open a folder, upload a file, and click <strong>🃏 Flashcards</strong> to generate your first set — or use <strong>Import set</strong> above.
                </div>
              )}
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
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Analytics</h3>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>Last 7 days · quiz attempts and review activity</div>
              </div>
              <a href="/coach" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>Full analysis in Scholar Hub ↗</a>
            </div>

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Streak',     value: streak > 0 ? `🔥 ${streak}d` : '—', sub: 'days in a row' },
                { label: 'Avg Score',  value: weekScore !== null ? `${weekScore}%` : analyticsLoading ? '…' : '—', sub: 'this week' },
                { label: 'Quizzes',    value: analyticsLoading ? '…' : String(weekQuizzes), sub: 'this week' },
                { label: 'Review Sets',value: String(srsDecks.length), sub: 'total decks' },
              ].map(card => (
                <div key={card.label} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{card.label}</div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text)' }}>{card.value}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Weak areas */}
            {analyticsLoading ? (
              [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8, borderRadius: 10 }} />)
            ) : analyticsData && analyticsData.weakAreas.length > 0 ? (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 10 }}>⚠️ Weak Areas</div>
                {analyticsData.weakAreas.map(area => {
                  const pct = Math.round(area.accuracy);
                  const color = pct < 40 ? 'var(--danger)' : pct < 65 ? 'var(--warning)' : 'var(--success)';
                  return (
                    <div key={area.topic} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: '10px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>{area.topic}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{area.suggestion}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color }}>{pct}%</span>
                          <div style={{ flex: 1, height: 5, background: 'var(--border-2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{area.attempts} attempts</span>
                        </div>
                      </div>
                      <a href="/coach" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>Practice in Scholar Hub →</a>
                    </div>
                  );
                })}
              </div>
            ) : analyticsData ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginBottom: 20, padding: '8px 0' }}>✔ No weak areas detected this week</div>
            ) : null}

            {/* Knowledge Map */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>Knowledge Map</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                    This visual can be heavy, so it now loads after the rest of Analytics is responsive.
                  </div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setShowKnowledgeMap((value) => !value)}
                >
                  {showKnowledgeMap ? 'Hide map' : 'Show map'}
                </button>
              </div>
              {showKnowledgeMap ? (
                <KnowledgeMap />
              ) : (
                <div style={{ borderRadius: 12, border: '1px dashed var(--border-2)', padding: '18px 16px', color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
                  Loading the rest of Analytics first keeps this tab snappier. Open the map when you need the deeper visual view.
                </div>
              )}
            </div>

            {/* Library quick-access */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>🗂 Recent Saves</div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => router.push('/library')}>See all in Library →</button>
              </div>
              {libLoad ? (
                [1,2].map(i => <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 8 }} />)
              ) : libItems.length === 0 ? (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', padding: '8px 0' }}>
                  Nothing saved yet — generate something and click <strong>Save</strong>.
                </div>
              ) : (
                libItems.slice(0, 5).map(item => {
                  const tool = GENERATE_TABS.find(t => t.id === item.mode);
                  return (
                    <div key={item.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 9, padding: '9px 12px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{tool?.icon ?? '📄'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.metadata?.title ?? item.mode}</div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{fmtDate(item.createdAt)}</div>
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }}
                        onClick={() => {
                          setOutput(item.content);
                          const match = GENERATE_TABS.find(t => t.id === item.mode);
                          setGenMode(match ? item.mode as GenMode : 'summarize');
                          setMainTab('generate');
                        }}>Open ↗</button>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* Library is now a standalone page at /library */}

      </div>
    </div>
  );
}
