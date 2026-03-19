'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { idbStore } from '@/lib/idb';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import type { ToolMode } from '@/lib/offline/generate';
import { deleteRagIndex, ensureRagIndex } from '@/lib/rag/index-store';
import { buildGenerationContext } from '@/lib/rag/generation-context';
import { v4 as uuidv4 } from 'uuid';
import { deleteLocalFile, listLocalFiles, upsertLocalFile } from '@/lib/files/local-files';
import { createFileReplaceRequest, createFileUploadRequest, resolveStoredFileBlob } from '@/lib/files/client-storage';
import { getDeckStats, loadDecks, deleteDeck, type SRSDeck } from '@/lib/srs/sm2';
import { ChatPanel } from '@/components/workspace/ChatPanel';
import { NotesPanel } from '@/components/workspace/NotesPanel';
import { ExamPlannerPanel } from '@/components/workspace/ExamPlannerPanel';
import { MCQView } from '@/components/workspace/views/MCQView';
import { PracticeView } from '@/components/workspace/views/PracticeView';
import { FlashcardView } from '@/components/workspace/views/FlashcardView';
import { ExamView } from '@/components/workspace/views/ExamView';
import { FocusPanel } from '@/components/workspace/views/FocusPanel';
import { mdToHtml } from '@/lib/utils/md';
import { writeMathContext } from '@/lib/math/context';

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

// ── Tab config ─────────────────────────────────────────────────────────────

const GENERATE_TABS = [
  { id: 'summarize',  label: 'Summarize',  icon: '📝', hint: 'Key-point summary of your content' },
  { id: 'notes',      label: 'Notes',      icon: '📋', hint: 'Structured study notes' },
  { id: 'rephrase',   label: 'Rephrase',   icon: '🔄', hint: 'Simplified rewrite' },
  { id: 'outline',    label: 'Outline',    icon: '📑', hint: 'Chapter outline with learning objectives' },
  { id: 'practice',   label: 'Practice',   icon: '🎯', hint: 'Practice problem with progressive hints and solution' },
  { id: 'mcq',        label: 'MCQ',        icon: '🧩', hint: 'Multiple-choice questions with answers' },
  { id: 'quiz',       label: 'Quiz',       icon: '❓', hint: 'Open-ended quiz questions' },
  { id: 'flashcards', label: 'Flashcards', icon: '📇', hint: 'Spaced-repetition study cards' },
  { id: 'assignment', label: 'Assignment', icon: '📌', hint: 'Practice assignment questions' },
  { id: 'exam',       label: 'Exam Prep',  icon: '🏆', hint: 'Timed exam with scoring and weak-area analysis' },
] as const;

const GENERATE_TAB_GROUPS = [
  { label: 'Written',  ids: ['summarize', 'notes', 'rephrase', 'outline'] },
  { label: 'Practice', ids: ['practice', 'mcq', 'quiz', 'flashcards', 'assignment'] },
  { label: 'Exam',     ids: ['exam'] },
] as const;

const WORKSPACE_TABS: Array<{ id: MainTab; icon: string; label: string; getMeta?: (ctx: { filesCount: number; libraryCount: number }) => string }> = [
  { id: 'files', icon: '📁', label: 'Files', getMeta: ({ filesCount }) => (filesCount ? `(${filesCount})` : '') },
  { id: 'generate', icon: '⚡', label: 'Tools' },
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'notes', icon: '📓', label: 'Notes' },
  { id: 'focus', icon: '🍅', label: 'Focus' },
  { id: 'planner', icon: '📅', label: 'Planner' },
  { id: 'library', icon: '🗂', label: 'Library', getMeta: ({ libraryCount }) => (libraryCount ? `(${libraryCount})` : '') },
];

const GENERATE_SHORTCUTS = [
  { key: 'Ctrl+G', label: 'Generate' },
  { key: 'Ctrl+S', label: 'Save to library' },
  { key: 'Ctrl+E', label: 'Export .md' },
  { key: 'Esc', label: 'Clear output' },
] as const;

type GenMode    = (typeof GENERATE_TABS)[number]['id'];
type MainTab    = 'files' | 'generate' | 'chat' | 'notes' | 'focus' | 'library' | 'planner';

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

  useEffect(() => {
    let url: string | null = null;
    setLoading(true); setErr(null); setBlobUrl(null); setTextContent(null);
    (async () => {
      try {
        if (file.content && !file.localBlobId) { setTextContent(file.content); return; }
        const blob = await resolveStoredFileBlob(file);
        if (!blob) {
          setErr('This file is not available locally or in remote storage yet.');
          return;
        }
        if (isPDF(file) || isImage(file)) {
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
        {!loading && !err && textContent !== null && (
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
  const filePickerRef = useRef<HTMLInputElement>(null);

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
  const [libItems,      setLibItems]      = useState<Array<{ id: string; mode: string; content: string; createdAt: string; metadata?: { title?: string; category?: string; problem?: string; sourceFileName?: string; graphExpr?: string; savedFrom?: string } | null }>>([]);
  const [libLoad,       setLibLoad]       = useState(false);
  const [libExpanded,   setLibExpanded]   = useState<Record<string, boolean>>({});
  const [srsDecks,      setSrsDecks]      = useState<SRSDeck[]>([]);
  const [dragging,      setDragging]      = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [missingBlobs,  setMissingBlobs]  = useState<Set<string>>(new Set());
  const [reuploadTarget, setReuploadTarget] = useState<FileRecord | null>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const [streamSource,  setStreamSource]  = useState<string>('');
  const [editMode,      setEditMode]      = useState(false);
  const [streak,        setStreak]        = useState<number>(0);
  const [notesInject,   setNotesInject]   = useState<string | undefined>(undefined);
  const abortRef    = useRef<AbortController | null>(null);
  const pasteRef    = useRef<HTMLTextAreaElement>(null);

  function requestCreateFolder() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kivora:create-folder'));
    }
  }

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
    if (mainTab === 'library') {
      loadLib();
      setSrsDecks(loadDecks());
    }
  }, [mainTab, loadLib]);

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

  async function runGenerate(mode: ToolMode) {
    let src = extractedText.trim();
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

    // Cancel any in-flight stream
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setGenerating(true);
    setOutput('');
    setStreamSource('');
    setEditMode(false);

    try {
      const ai = loadAiRuntimePreferences();

      const res = await fetch('/api/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, text: src, fileId: selFile?.id ?? null, retrievalContext, options: { count }, ai }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        // Fallback to non-streaming route
        const fallback = await fetch('/api/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, text: retrievalContext, fileId: selFile?.id ?? null, options: { count }, ai }),
        });
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
      toast('Generation failed. Please try again.', 'error');
    } finally {
      setGenerating(false);
    }
  }

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
    // Read study streak from local analytics data
    try {
      const raw = localStorage.getItem('kivora_study_streak');
      if (raw) setStreak(parseInt(raw, 10) || 0);
    } catch {}
  }, []);

  async function saveToLibrary() {
    if (!output) return;
    const res = await fetch('/api/library', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: genMode, content: output }),
    });
    if (res.ok) toast('Saved to Library ✓', 'success');
    else toast('Could not save — DB may not be configured', 'warning');
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
                  {['quiz','mcq','flashcards','assignment','exam'].includes(genMode) && (
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
                    {!generating && (genMode === 'summarize' || genMode === 'notes' || genMode === 'rephrase' || genMode === 'outline' || genMode === 'assignment' || genMode === 'quiz') && (
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
                  {editMode && !generating && (genMode === 'summarize' || genMode === 'notes' || genMode === 'rephrase' || genMode === 'outline' || genMode === 'assignment' || genMode === 'quiz')
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
                    : genMode === 'flashcards' ? <FlashcardView content={output} title={selFile?.name} />
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

        {/* ─────────────────── LIBRARY ───────────────── */}
        {mainTab === 'library' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Saved outputs</h3>
                {libItems.length > 0 && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{libItems.length} item{libItems.length !== 1 ? 's' : ''}</div>}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={loadLib}>↻ Refresh</button>
            </div>

            {/* ── SRS Decks ───────────────────────────────────────────────── */}
            {srsDecks.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>📇 Saved Flashcard Decks</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{srsDecks.length} deck{srsDecks.length !== 1 ? 's' : ''}</span>
                </div>
                {srsDecks.map(deck => {
                  const st = getDeckStats(deck);
                  return (
                    <div key={deck.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)', marginBottom: 3 }}>{deck.name}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {[
                              { label: `${st.new} new`,       color: '#4f86f7' },
                              { label: `${st.learning} lrn`,  color: '#f59e0b' },
                              { label: `${st.mature} mature`,  color: '#52b788' },
                            ].map(b => (
                              <span key={b.label} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: `${b.color}22`, color: b.color, fontWeight: 600 }}>{b.label}</span>
                            ))}
                            {st.due > 0 && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'var(--accent-subtle, rgba(79,134,247,0.12))', color: 'var(--accent)', fontWeight: 700 }}>{st.due} due</span>}
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => router.push(`/study/${deck.id}`)}>
                          {st.due > 0 ? `▶ Review ${st.due}` : 'Open deck'}
                        </button>
                        <button className="btn-icon" style={{ color: 'var(--text-3)', width: 24, height: 24, fontSize: 12 }}
                          onClick={() => {
                            if (!confirm(`Delete deck "${deck.name}"?`)) return;
                            deleteDeck(deck.id);
                            setSrsDecks(d => d.filter(x => x.id !== deck.id));
                            void fetch(`/api/srs/${deck.id}`, { method: 'DELETE' }).catch(() => {});
                          }}>✕</button>
                      </div>
                    </div>
                  );
                })}
                <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
              </div>
            )}

            {libLoad ? (
              [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 90, marginBottom: 10, borderRadius: 10 }} />)
            ) : libItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🗂️</div>
                <h3>Library is empty</h3>
                <p>Generate something in <strong>Generate</strong>, then click <strong>Save to Library</strong>.</p>
              </div>
            ) : libItems.map(item => {
              const tool = GENERATE_TABS.find(t => t.id === item.mode);
              const label = item.mode === 'math-solution'
                ? 'Math Solution'
                : item.mode === 'math-practice'
                  ? 'Math Practice'
                  : (tool?.label ?? item.mode);
              const expanded = libExpanded[item.id];
              return (
                <div key={item.id} className="lib-item" style={{ marginBottom: 10 }}>
                  <div className="lib-item-header">
                    <span style={{ fontSize: 16 }}>{tool?.icon ?? '📄'}</span>
                    <span className="lib-item-mode">{label}</span>
                    <span className="lib-item-date">{fmtDate(item.createdAt)}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setLibExpanded(p => ({ ...p, [item.id]: !expanded }))}>
                        {expanded ? 'Collapse' : 'Expand'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          if (item.mode === 'math-solution' || item.mode === 'math-practice') {
                            router.push('/math');
                            toast('Open the Math page to review this item.', 'info');
                            return;
                          }
                          setOutput(item.content);
                          const match = GENERATE_TABS.find(t => t.id === item.mode);
                          setGenMode(match ? item.mode as GenMode : 'summarize');
                          setMainTab('generate');
                          toast('Loaded into Generate', 'info');
                        }}>Open ↗</button>
                      <button className="btn-icon" style={{ color: 'var(--danger)', width: 26, height: 26 }}
                        onClick={async () => {
                          await fetch(`/api/library/${item.id}`, { method: 'DELETE' });
                          setLibItems(p => p.filter(x => x.id !== item.id));
                          toast('Deleted', 'info');
                        }}>✕</button>
                    </div>
                  </div>
                  {item.metadata?.problem && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 6 }}>Problem: {item.metadata.problem}</div>
                  )}
                  {item.metadata?.sourceFileName && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 6 }}>Source: {item.metadata.sourceFileName}</div>
                  )}
                  {item.mode === 'flashcards' ? (
                    <div style={{ marginTop: 8 }}>
                      {expanded
                        ? <FlashcardView content={item.content} />
                        : <div className="lib-item-preview" style={{ maxHeight: 80, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent)', maskImage: 'linear-gradient(to bottom, #000 60%, transparent)', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                            {item.content.slice(0, 300)}…
                          </div>
                      }
                    </div>
                  ) : item.mode === 'mcq' ? (
                    <div style={{ marginTop: 8 }}>
                      {expanded
                        ? <MCQView content={item.content} />
                        : <div className="lib-item-preview" style={{ maxHeight: 80, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, #000 60%, transparent)', maskImage: 'linear-gradient(to bottom, #000 60%, transparent)' }}>
                            <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(item.content.slice(0, 400)) }} />
                          </div>
                      }
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      {expanded
                        ? <div className="tool-output" dangerouslySetInnerHTML={{ __html: mdToHtml(item.content) }} />
                        : <div className="tool-output" style={{ maxHeight: 90, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, #000 50%, transparent)', maskImage: 'linear-gradient(to bottom, #000 50%, transparent)', pointerEvents: 'none' }}
                            dangerouslySetInnerHTML={{ __html: mdToHtml(item.content.slice(0, 600)) }} />
                      }
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                      onClick={() => navigator.clipboard.writeText(item.content).then(() => toast('Copied!', 'success'))}>
                      📋 Copy
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                      onClick={() => {
                        const filename = `${item.mode}-${new Date(item.createdAt).toISOString().slice(0,10)}.md`;
                        const blob = new Blob([item.content], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                        URL.revokeObjectURL(url);
                        toast(`Downloaded ${filename}`, 'success');
                      }}>
                      ⬇ .md
                    </button>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', alignSelf: 'center', marginLeft: 2 }}>
                      {wordCount(item.content).toLocaleString()} words
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
