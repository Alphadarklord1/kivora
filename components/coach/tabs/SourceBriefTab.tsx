'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { loadClientAiDataMode } from '@/lib/privacy/ai-data';
import { buildImportedDeck, persistDeckLocally, syncDeckToCloud } from '@/lib/srs/deck-utils';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import { idbStore } from '@/lib/idb';
import { writeScholarContext } from '@/lib/coach/scholar-context';
import type { SourceBrief } from '@/lib/coach/source-brief';
import type { GeneratedContent } from '@/lib/offline/generate';
import styles from '@/app/(dashboard)/coach/page.module.css';
import { broadcastInvalidate, LIBRARY_CHANNEL } from '@/lib/sync/broadcast';

type SourceInputMode = 'url' | 'text' | 'file' | 'workspace';

interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  localBlobId: string | null;
  folderId: string;
  createdAt: string;
}
type SourceAction = 'notes' | 'quiz' | 'flashcards';
type CoachPanel = 'review' | 'manage';

interface SourceOutputSummary {
  mode: SourceAction;
  title: string;
  setId?: string;
}

interface Props {
  sourceBrief: SourceBrief | null;
  onBriefChange: (brief: SourceBrief | null) => void;
  onOpenPanel: (id: string, panel: CoachPanel, importedFlag?: boolean) => void;
  onNavigateToResearch: (topic: string) => void;
  onOutput: (output: { kind: 'quiz'; title: string; content: string; quiz: GeneratedContent; setId: string } | { kind: 'generated'; title: string; content: string }) => void;
  refreshReviewSets: () => Promise<void>;
  refreshAnalytics: () => void;
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Uploaded file';
}

function displaySourceOrigin(source: Pick<SourceBrief, 'sourceType' | 'sourceLabel' | 'url'>): string {
  if (source.sourceType === 'manual-text') return 'Manual text';
  if (source.sourceType === 'file') return source.sourceLabel || 'Uploaded file';
  try { return new URL(source.url).hostname.replace(/^www\./, ''); } catch { return source.url; }
}

export function SourceBriefTab({
  sourceBrief,
  onBriefChange,
  onOpenPanel,
  onNavigateToResearch,
  onOutput,
  refreshReviewSets,
  refreshAnalytics,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sourceMode,     setSourceMode]    = useState<SourceInputMode>('url');
  const [sourceUrl,      setSourceUrl]     = useState('');
  const [sourceText,     setSourceText]    = useState('');
  const [sourceTitle,    setSourceTitle]   = useState('');
  const [fileName,       setFileName]      = useState('');
  const [fileText,       setFileText]      = useState('');
  const [fileWordCount,  setFileWordCount] = useState(0);
  const [fileLoading,    setFileLoading]   = useState(false);
  const [fileError,      setFileError]     = useState('');
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [actionLoading,  setActionLoading] = useState<SourceAction | null>(null);
  const [outputSummary,  setOutputSummary] = useState<SourceOutputSummary | null>(null);

  const privacyMode = loadClientAiDataMode();

  const [wsFiles,       setWsFiles]       = useState<WorkspaceFile[]>([]);
  const [wsSearch,      setWsSearch]      = useState('');
  const [wsLoading,     setWsLoading]     = useState(false);
  const [wsPicking,     setWsPicking]     = useState<string | null>(null); // file id being loaded

  useEffect(() => {
    if (sourceMode !== 'workspace' || wsFiles.length > 0) return;
    setWsLoading(true);
    fetch('/api/files?all=true')
      .then(r => r.json())
      .then((data: WorkspaceFile[]) => setWsFiles(Array.isArray(data) ? data.filter(f => f.localBlobId) : []))
      .catch(() => toast('Could not load Workspace files', 'error'))
      .finally(() => setWsLoading(false));
  }, [sourceMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePickWorkspaceFile(wsFile: WorkspaceFile) {
    if (!wsFile.localBlobId || wsPicking) return;
    setWsPicking(wsFile.id);
    setFileError('');
    try {
      const payload = await idbStore.get(wsFile.localBlobId);
      if (!payload) throw new Error('File not found in local storage — it may have been cleared.');
      const extracted = await extractTextFromBlob(payload.blob, wsFile.name);
      if (extracted.error) throw new Error(extracted.error);
      if (!extracted.text.trim()) throw new Error('No readable text found in this file.');
      setFileName(wsFile.name);
      setFileText(extracted.text);
      setFileWordCount(extracted.wordCount);
      setSourceMode('file'); // switch to file mode with the extracted text ready
      toast(`Loaded "${wsFile.name}" from Workspace`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read this file.';
      setFileError(msg);
      toast(msg, 'error');
    } finally {
      setWsPicking(null);
    }
  }

  const handleFileSelected = useCallback(async (file: File | null) => {
    if (!file) return;
    setFileLoading(true);
    setFileError('');
    setFileName(file.name);
    setFileText('');
    setFileWordCount(0);
    try {
      const extracted = await extractTextFromBlob(file, file.name);
      if (extracted.error) throw new Error(extracted.error);
      if (!extracted.text.trim()) throw new Error('No readable text found in this file.');
      setFileText(extracted.text);
      setFileWordCount(extracted.wordCount);
      toast(`Loaded ${file.name}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read this file.';
      setFileError(msg);
      toast(msg, 'error');
    } finally {
      setFileLoading(false);
    }
  }, [toast]);

  async function handleAnalyze() {
    if (analyzeLoading) return;
    if (sourceMode === 'url'  && !sourceUrl.trim())  return;
    if (sourceMode === 'text' && !sourceText.trim())  return;
    if (sourceMode === 'file' && !fileText.trim())    return;
    setAnalyzeLoading(true);
    try {
      const body =
        sourceMode === 'url'  ? { url: sourceUrl.trim(), ai: loadAiRuntimePreferences(), privacyMode } :
        sourceMode === 'file' ? { text: fileText.trim(), title: titleFromFilename(fileName), sourceType: 'file', sourceLabel: fileName, ai: loadAiRuntimePreferences(), privacyMode } :
                                { text: sourceText.trim(), title: sourceTitle.trim(), ai: loadAiRuntimePreferences(), privacyMode };

      const res = await fetch('/api/coach/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Could not analyze this source');
      const brief = payload as SourceBrief;
      onBriefChange(brief);
      setOutputSummary(null);
      // Share context with Workspace
      writeScholarContext({
        label:      brief.title,
        sourceText: brief.extractedText,
        sourceUrl:  brief.sourceType === 'url' ? brief.url : undefined,
        kind:       'source',
      });
      toast('Source brief ready', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not analyze this source', 'error');
    } finally {
      setAnalyzeLoading(false);
    }
  }

  async function handleSourceAction(mode: SourceAction) {
    if (!sourceBrief || actionLoading) return;
    setActionLoading(mode);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, text: sourceBrief.extractedText,
          options: { count: mode === 'quiz' ? 8 : 10 },
          ai: loadAiRuntimePreferences(),
          privacyMode,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || typeof payload?.content !== 'string')
        throw new Error(payload?.error ?? `Could not create ${mode}`);

      if (mode === 'flashcards') {
        const set = buildImportedDeck({
          title: sourceBrief.title, description: sourceBrief.summary,
          content: payload.content, sourceType: 'manual',
          sourceLabel: 'Source Brief import', creatorName: 'You',
        });
        if (!set) throw new Error('Could not turn this source into review cards.');
        persistDeckLocally(set);
        const synced = await syncDeckToCloud(set);
        await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, content: payload.content, metadata: { title: `Review set — ${sourceBrief.title}`, sourceTitle: sourceBrief.title } }) });
        broadcastInvalidate(LIBRARY_CHANNEL);
        await refreshReviewSets();
        refreshAnalytics();
        setOutputSummary({ mode: 'flashcards', title: set.name, setId: set.id });
        toast(synced ? `Created review set "${set.name}"` : `Created "${set.name}" locally`, synced ? 'success' : 'warning');
        onOpenPanel(set.id, 'manage', true);
        return;
      }

      await fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, content: payload.content, metadata: { title: `${mode === 'quiz' ? 'Quiz' : 'Notes'} — ${sourceBrief.title}`, sourceTitle: sourceBrief.title } }) });
      broadcastInvalidate(LIBRARY_CHANNEL);
      setOutputSummary({ mode, title: sourceBrief.title });
      onOutput({
        kind: 'generated',
        title: `${mode === 'quiz' ? 'Quiz' : 'Notes'} — ${sourceBrief.title}`,
        content: payload.content,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : `Could not create ${mode}`, 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCopyForMyBib() {
    if (!sourceBrief) return;
    const text = sourceBrief.sourceType === 'url'
      ? `${sourceBrief.title}\n${sourceBrief.url}`
      : `${sourceBrief.title}\n${sourceBrief.sourceLabel}`;
    try {
      await navigator.clipboard.writeText(text);
      toast('Source details copied for MyBib', 'success');
    } catch {
      toast('Could not copy source details', 'warning');
    }
  }

  return (
    <div className={styles.sourceLayout}>

      {/* ── Left: input ─────────────────────────────────────────────── */}
      <div className={styles.inputPanel}>
        <div className={styles.panelHead}>
          <h2>Source Brief</h2>
          <p>Analyze any URL, pasted text, or uploaded file to extract its key ideas.</p>
        </div>

        <div className={styles.modeToggle}>
          {(['url', 'text', 'file', 'workspace'] as SourceInputMode[]).map(m => (
            <button
              key={m}
              className={`${styles.modeToggleBtn} ${sourceMode === m ? styles.modeToggleBtnActive : ''}`}
              onClick={() => setSourceMode(m)}
            >
              {m === 'url' ? '🔗 URL' : m === 'text' ? '📋 Paste' : m === 'file' ? '📁 File' : '🗂️ Workspace'}
            </button>
          ))}
        </div>

        <div className={styles.inputArea}>
          {sourceMode === 'url' && (
            <div className={styles.inputRow}>
              <input
                className={styles.textInput}
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://example.com/article"
                onKeyDown={e => e.key === 'Enter' && void handleAnalyze()}
              />
              <button className={styles.btnPrimary} disabled={analyzeLoading || !sourceUrl.trim()} onClick={() => void handleAnalyze()}>
                {analyzeLoading ? '…' : 'Analyze'}
              </button>
            </div>
          )}
          {sourceMode === 'text' && (
            <>
              <input className={styles.textInput} value={sourceTitle} onChange={e => setSourceTitle(e.target.value)} placeholder="Title (optional)" />
              <textarea className={styles.textArea} rows={7} value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder="Paste article, textbook passage, or study notes…" />
              <button className={styles.btnPrimary} disabled={analyzeLoading || !sourceText.trim()} onClick={() => void handleAnalyze()}>
                {analyzeLoading ? 'Analyzing…' : 'Analyze text'}
              </button>
            </>
          )}
          {sourceMode === 'file' && (
            <>
              <button className={styles.uploadZone} type="button" onClick={() => fileInputRef.current?.click()}>
                <span className={styles.uploadIcon}>📁</span>
                <strong>{fileName || 'Choose PDF, image, or document'}</strong>
                <small>PDF · DOCX · PPTX · images — click to browse</small>
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx,.pptx,image/*" className={styles.hiddenInput} onChange={e => void handleFileSelected(e.target.files?.[0] ?? null)} />
              {fileLoading && <div className={styles.statusNote}>⏳ Reading file…</div>}
              {fileError && <div className={styles.errorNote}>⚠️ {fileError}</div>}
              {fileText && !fileLoading && <div className={styles.successNote}>✓ {fileWordCount.toLocaleString()} words ready from {fileName}</div>}
              <button className={styles.btnPrimary} disabled={analyzeLoading || fileLoading || !fileText.trim()} onClick={() => void handleAnalyze()}>
                {analyzeLoading ? 'Analyzing…' : 'Analyze file'}
              </button>
            </>
          )}
          {sourceMode === 'workspace' && (
            <div className={styles.wsPicker}>
              <p className={styles.wsPickerHint}>Pick a file you&apos;ve already uploaded to Workspace — no need to upload it again.</p>
              <input
                className={styles.textInput}
                placeholder="Search your files…"
                value={wsSearch}
                onChange={e => setWsSearch(e.target.value)}
              />
              {wsLoading ? (
                <div className={styles.statusNote}>⏳ Loading your Workspace files…</div>
              ) : wsFiles.length === 0 ? (
                <div className={styles.emptyBrief} style={{ padding: '1rem 0' }}>
                  <strong>No files found</strong>
                  <p>Upload files in Workspace first, then come back here to pick them.</p>
                </div>
              ) : (
                <div className={styles.wsFileList}>
                  {wsFiles
                    .filter(f => !wsSearch.trim() || f.name.toLowerCase().includes(wsSearch.toLowerCase()))
                    .map(f => (
                      <button
                        key={f.id}
                        className={styles.wsFileRow}
                        disabled={!!wsPicking}
                        onClick={() => void handlePickWorkspaceFile(f)}
                      >
                        <span className={styles.wsFileName}>{f.name}</span>
                        <span className={styles.wsFileMeta}>
                          {f.fileSize ? `${Math.round(f.fileSize / 1024)} KB` : ''}
                        </span>
                        {wsPicking === f.id && <span className={styles.wsFileLoading}>Loading…</span>}
                      </button>
                    ))}
                </div>
              )}
              {fileError && <div className={styles.errorNote}>⚠️ {fileError}</div>}
            </div>
          )}
        </div>

        {sourceBrief && (
          <div className={styles.sourceActions}>
            <span className={styles.sectionLabel}>From this source</span>
            <div className={styles.chipRow}>
              {(['notes', 'quiz', 'flashcards'] as SourceAction[]).map(mode => (
                <button
                  key={mode}
                  className={`${styles.actionChip} ${actionLoading === mode ? styles.actionChipBusy : ''}`}
                  disabled={actionLoading !== null}
                  onClick={() => void handleSourceAction(mode)}
                >
                  {mode === 'notes' ? '📝' : mode === 'quiz' ? '🧪' : '🗂️'}{' '}
                  {actionLoading === mode ? 'Creating…' : mode === 'notes' ? 'Notes' : mode === 'quiz' ? 'Quiz' : 'Review Set'}
                </button>
              ))}
              <button className={styles.actionChip} onClick={() => { if (sourceBrief) onNavigateToResearch(sourceBrief.title); }}>
                🔎 Research wider
              </button>
              <button className={styles.actionChip} onClick={() => void handleCopyForMyBib()}>
                📎 Copy for MyBib
              </button>
            </div>
            {outputSummary && (
              <div className={styles.successStrip}>
                <span>✓ {outputSummary.mode === 'flashcards' ? `Review set "${outputSummary.title}" created` : `${outputSummary.title} saved`}</span>
                {outputSummary.setId && (
                  <button className={styles.stripLink} onClick={() => onOpenPanel(outputSummary.setId!, 'review')}>Review now →</button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right: brief output ──────────────────────────────────────── */}
      <div className={styles.briefPanel}>
        {!sourceBrief ? (
          <div className={styles.emptyBrief}>
            <div className={styles.emptyIcon}>📄</div>
            <strong>Brief appears here</strong>
            <p>Analyze a URL, paste text, or upload a file to see key ideas, summary, and provenance.</p>
          </div>
        ) : (
          <div className={styles.briefCard}>
            <div className={styles.briefCardHead}>
              <h3>{sourceBrief.title}</h3>
              <span className={styles.readPill}>{Math.max(1, Math.ceil(sourceBrief.wordCount / 220))} min read</span>
            </div>
            <p className={styles.briefSummary}>{sourceBrief.summary}</p>
            <div className={styles.metaTagRow}>
              <span className={styles.metaTag}>{displaySourceOrigin(sourceBrief)}</span>
              <span className={styles.metaTag}>{sourceBrief.wordCount.toLocaleString()} words</span>
              {sourceBrief.sourceLabel && <span className={styles.metaTag}>{sourceBrief.sourceLabel}</span>}
            </div>
            {sourceBrief.description && (
              <div className={styles.briefDescription}>
                <strong>What this covers</strong>
                <p>{sourceBrief.description}</p>
              </div>
            )}
            <div className={styles.keyPointsList}>
              <span className={styles.sectionLabel}>Key ideas</span>
              {sourceBrief.keyPoints.map((pt, i) => (
                <div key={i} className={styles.keyPoint}>
                  <span className={styles.keyPointNum}>{i + 1}</span>
                  <p>{pt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
