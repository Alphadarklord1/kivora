'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { getDeckStats, loadDecks, deleteDeck, saveDeck, type SRSDeck } from '@/lib/srs/sm2';
import { ChatPanel } from '@/components/workspace/ChatPanel';
import { KnowledgeMap } from '@/components/tools/KnowledgeMap';
import { NotesPanel } from '@/components/workspace/NotesPanel';
import { ExamPlannerPanel } from '@/components/workspace/ExamPlannerPanel';
import { MCQView } from '@/components/workspace/views/MCQView';
import { PracticeView } from '@/components/workspace/views/PracticeView';
import { FlashcardView } from '@/components/workspace/views/FlashcardView';
import { ExamView } from '@/components/workspace/views/ExamView';
import { FocusPanel } from '@/components/workspace/views/FocusPanel';
import { mdToHtml } from '@/lib/utils/md';
import { writeMathContext } from '@/lib/math/context';
import { clearCoachHandoff, readCoachHandoff } from '@/lib/coach/handoff';
import { clearScholarContext, readScholarContext, writeScholarContext, type ScholarContext } from '@/lib/coach/scholar-context';
import { DocumentPreview } from '@/components/workspace/DocumentPreview';
import { broadcastInvalidate, listenForInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

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

const WORKSPACE_TABS: Array<{ id: MainTab; icon: string; label: string; getMeta?: (ctx: { filesCount: number; libraryCount: number }) => string }> = [
  { id: 'files',    icon: '📁', label: 'Files',   getMeta: ({ filesCount })   => (filesCount   ? `(${filesCount})`   : '') },
  { id: 'generate', icon: '⚡', label: 'Tools' },
  { id: 'chat',     icon: '💬', label: 'Chat' },
  { id: 'notes',    icon: '📓', label: 'Notes' },
  { id: 'focus',    icon: '🍅', label: 'Focus' },
];

const GENERATE_SHORTCUTS = [
  { key: 'Ctrl+G', label: 'Generate' },
  { key: 'Ctrl+S', label: 'Save to library' },
  { key: 'Ctrl+E', label: 'Export .md' },
  { key: 'Esc', label: 'Clear output' },
] as const;

type GenMode    = (typeof GENERATE_TABS)[number]['id'];
type MainTab    = 'files' | 'generate' | 'chat' | 'notes' | 'focus' | 'planner' | 'analytics';
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


// ── View components (extracted to views/) ──────────────────────────────────
// MCQView, PracticeView, FlashcardView, ExamView, and FocusPanel
// are imported above from @/components/workspace/views/*

// ── Inline file viewer ─────────────────────────────────────────────────────

function FileViewer({
  file, onClose, onUseForTools, onUseForChat, onUseInMath,
}: {
  file: FileRecord;
  onClose: () => void;
  onUseForTools: (file: FileRecord, text: string) => void;
  onUseForChat: (file: FileRecord, text: string) => void;
  onUseInMath: (file: FileRecord, text: string) => void;
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0, minWidth: 0 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(file)}</span>
        <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{file.name}</span>
        {fmt(file.fileSize) && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', flexShrink: 0 }}>{fmt(file.fileSize)}</span>}
        <button className="btn btn-primary btn-sm" onClick={useForTools} title="Load into Generate tab" style={{ flexShrink: 0 }}>
          ⚡ Use for Generate
        </button>
        <button className="btn btn-secondary btn-sm" onClick={useForChat} title="Load into Chat tab" style={{ flexShrink: 0 }}>
          💬 Use for Chat
        </button>
        <button className="btn btn-secondary btn-sm" onClick={useInMath} title="Send this file into Math" style={{ flexShrink: 0 }}>
          ∑ Use in Math
        </button>
        <button className="btn-icon" onClick={onClose} title="Close" style={{ flexShrink: 0 }}>✕</button>
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
  const [output,        setOutput]        = useState('');
  const [generating,    setGenerating]    = useState(false);
  const [count,         setCount]         = useState(5);
  const [libItems,      setLibItems]      = useState<LibraryItemRecord[]>([]);
  const [libLoad,       setLibLoad]       = useState(false);
  const [libExpanded,   setLibExpanded]   = useState<Record<string, boolean>>({});
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
  const [notesInject,   setNotesInject]   = useState<string | undefined>(undefined);
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
    router.push('/library');
    setActiveReviewSetId(draft.id);
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
      const loaded: FileRecord[] = r.ok ? await r.json() : listLocalFiles(selectedFolder, selectedTopic);
      setFiles(loaded);
      // Check for missing blobs in the background
      const missing = new Set<string>();
      await Promise.all(loaded.map(async f => {
        if (f.localBlobId) {
          const payload = await idbStore.get(f.localBlobId).catch(() => undefined);
          if (!payload && !f.content && !f.storagePath) missing.add(f.id);
        }
      }));
      setMissingBlobs(missing);
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

  async function extractFromFile(file: FileRecord): Promise<string | null> {
    if (file.content) {
      setExtractedText(file.content);
      void ensureRagIndex(file.id, file.content);
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
      void ensureRagIndex(file.id, res.text);
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
      if (!res.ok) upsertLocalFile(local);
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

  useEffect(() => {
    const handoff = readCoachHandoff();
    if (!handoff) return;

    if ((handoff.type === 'review-set' || handoff.type === 'import-success') && handoff.setId) {
      clearCoachHandoff();
      router.push('/library');
      setActiveReviewSetId(handoff.setId);
      setRequestedReviewPhase(handoff.panel === 'review' ? 'review' : null);
      setPendingReviewImportUrl(null);
      toast('Review set opened in Workspace', 'success');
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
    const res = await fetch('/api/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: genMode, content: output }),
    });
    if (res.ok) {
      toast('Saved to Library ✓', 'success');
      broadcastInvalidate(LIBRARY_CHANNEL);
    } else {
      toast('Could not save — DB may not be configured', 'warning');
    }
  }

  async function toggleProfileShare(item: LibraryItemRecord) {
    const currentMeta = item.metadata ?? {};
    const isPublished = Boolean(currentMeta.publicProfile);

    try {
      let nextMeta: Record<string, unknown> = { ...currentMeta };

      if (isPublished) {
        if (currentMeta.publicShareId) {
          await fetch(`/api/share?id=${currentMeta.publicShareId}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
        }
        nextMeta = {
          ...currentMeta,
          publicProfile: false,
          publicShareId: null,
          publicShareUrl: null,
          publicShareToken: null,
        };
      } else {
        let shareId = currentMeta.publicShareId ?? null;
        let shareUrl = currentMeta.publicShareUrl ?? null;
        let shareToken = currentMeta.publicShareToken ?? null;

        if (!shareId || !shareUrl) {
          const shareRes = await fetch('/api/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ libraryItemId: item.id, permission: 'view' }),
          });
          if (!shareRes.ok) throw new Error('share-create-failed');
          const shareData = await shareRes.json();
          shareId = shareData.id ?? null;
          shareToken = shareData.shareToken ?? null;
          shareUrl = shareData.shareUrl ?? (shareToken ? `${window.location.origin}/share/${shareToken}` : null);
        }

        nextMeta = {
          ...currentMeta,
          publicProfile: true,
          publicShareId: shareId,
          publicShareUrl: shareUrl,
          publicShareToken: shareToken,
        };
      }

      const patchRes = await fetch(`/api/library/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ metadata: nextMeta }),
      });
      if (!patchRes.ok) throw new Error('library-update-failed');
      const updated = await patchRes.json();
      setLibItems((prev) => prev.map((entry) => (entry.id === item.id ? updated : entry)));
      broadcastInvalidate(LIBRARY_CHANNEL);
      toast(isPublished ? 'Removed from public profile' : 'Published to public profile', 'success');
    } catch {
      toast(isPublished ? 'Could not remove this item from your public profile' : 'Could not publish this item to your public profile', 'error');
    }
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
    toast('Review-set import is ready in Workspace', 'success');
    router.replace('/workspace');
  }, [createWorkspaceReviewSet, router, searchParams, toast]);

  const breadcrumb = [selectedFolderName, selectedTopicName].filter(Boolean).join(' › ');
  const currentGen = GENERATE_TABS.find(t => t.id === genMode)!;
  const currentSourceLabel = pasteMode ? 'Pasted text' : selFile?.name ?? null;
  const workspaceTabMeta = { filesCount: files.length, libraryCount: libItems.length };

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
            <span title={`${streak}-day study streak`} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 'var(--text-xs)', color: 'var(--text-2)', background: 'color-mix(in srgb, #f59e0b 15%, var(--surface))', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)', borderRadius: 20, padding: '2px 8px', cursor: 'default' }}>
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
            📇 {srsDecks.length}
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
                            style={{ cursor: 'pointer', marginBottom: 6, flexDirection: 'column', alignItems: 'stretch' }}
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
                              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                {!isMissing && (
                                  <>
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
                                      title="Send this file into Math"
                                      onClick={async () => {
                                        const text = await extractFromFile(file);
                                        if (text) {
                                          await sendFileToMath(file, text);
                                        }
                                      }}>
                                      ∑ Math
                                    </button>
                                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                                      onClick={() => {
                                        void markRecentFile(file.id);
                                        setViewFile(v => v?.id === file.id ? null : file);
                                      }}>
                                      {viewFile?.id === file.id ? 'Close' : 'View'}
                                    </button>
                                  </>
                                )}
                                <button className="btn-icon" style={{ color: 'var(--danger)', width: 26, height: 26 }}
                                  title={`Delete "${file.name}"`}
                                  onClick={e => deleteFile(e, file)}>✕</button>
                              </div>
                            </div>
                            {isMissing && (
                              <div style={{
                                marginTop: 6, padding: '6px 10px', borderRadius: 8,
                                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)',
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}
                                onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 'var(--text-xs)', color: '#f59e0b', flex: 1 }}>
                                  ⚠ File data missing — re-upload to restore
                                </span>
                                <button
                                  className="btn btn-sm"
                                  style={{ fontSize: 11, padding: '2px 10px', background: '#f59e0b', color: '#000', border: 'none' }}
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
                  onUseInMath={sendFileToMath}
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
                      onClick={() => { setGenMode(t.id); setOutput(''); }}
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
                  {selFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '5px 10px' }}>
                      <span>{fileIcon(selFile)}</span>
                      <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selFile.name}</span>
                      {extractedText && <span className="badge badge-accent">{wordCount(extractedText).toLocaleString()} words</span>}
                      <button className="btn-icon" style={{ width: 22, height: 22, fontSize: 11 }} onClick={clearGen}>✕</button>
                    </div>
                  ) : files.length > 0 ? (
                    <select defaultValue="" onChange={e => { const f = files.find(x => x.id === e.target.value); if (f) { setSelFile(f); setExtractedText(''); setOutput(''); } }} style={{ flex: 1, minWidth: 180 }}>
                      <option value="" disabled>Choose a file…</option>
                      {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
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
                    {!generating && (genMode === 'summarize' || genMode === 'notes' || genMode === 'outline' || genMode === 'quiz') && (
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
                  {editMode && !generating && (genMode === 'summarize' || genMode === 'notes' || genMode === 'outline' || genMode === 'quiz')
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
                        onClick={() => navigator.clipboard.writeText(output).then(() => toast('Copied!', 'success'))}>
                        📋 Copy
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('md')} title="Download as Markdown (Ctrl+E)">⬇ .md</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadOutput('txt')} title="Download as plain text">⬇ .txt</button>
                      <button className="btn btn-ghost btn-sm" onClick={saveToLibrary} title="Save to Library (Ctrl+S)">🗂 Save</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setNotesInject(output); setMainTab('notes'); toast('Opened in Notes ✓', 'success'); }} title="Send to Notes editor">📓 Notes</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setOutput(''); setEditMode(false); }}>✕ Clear</button>
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
                <div className="empty-state" style={{ padding: '40px 20px' }}>
                  <div className="empty-icon">⚡</div>
                  <h3>AI Tools</h3>
                  <p style={{ marginBottom: 18 }}>
                    Open a file in <strong>Files</strong> and click <strong>⚡ Use</strong>, or switch to <strong>Paste text</strong> above.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setMainTab('files')}>Open files</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setPasteMode(true)}>Paste text</button>
                  </div>
                  {/* Quick-start tool buttons */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
                    {GENERATE_TABS.slice(0, 6).map(t => (
                      <button key={t.id}
                        className={`btn btn-sm btn-ghost`}
                        style={{ fontSize: 12 }}
                        onClick={() => { setGenMode(t.id); setPasteMode(true); }}>
                        {t.icon} {t.label}
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
                  const color = pct < 40 ? '#ef4444' : pct < 65 ? '#f97316' : '#22c55e';
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
              <KnowledgeMap />
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
