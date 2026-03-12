'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { idbStore } from '@/lib/idb';
import { extractTextFromBlob } from '@/lib/pdf/extract';
import type { ToolMode } from '@/lib/offline/generate';
import { v4 as uuidv4 } from 'uuid';
import { deleteLocalFile, listLocalFiles, upsertLocalFile } from '@/lib/files/local-files';
import { MathSolver } from '@/components/tools/MathSolver';
import { GraphingCalculator } from '@/components/tools/GraphingCalculator';
import { MatlabLab } from '@/components/tools/MatlabLab';
import { VisualAnalyzer } from '@/components/tools/VisualAnalyzer';

// ── Types ──────────────────────────────────────────────────────────────────

interface FileRecord {
  id: string;
  name: string;
  type: string;
  mimeType?: string;
  fileSize?: number;
  localBlobId?: string;
  localFilePath?: string | null;
  content?: string;
  createdAt: string;
}

export interface WorkspacePanelProps {
  selectedFolder:     string | null;
  selectedTopic:      string | null;
  selectedFolderName: string;
  selectedTopicName:  string;
  onRefresh: () => void;
}

// ── Tool tabs ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'files',      label: 'Files'      },
  { id: 'summarize',  label: 'Summarize'  },
  { id: 'rephrase',   label: 'Rephrase'   },
  { id: 'notes',      label: 'Notes'      },
  { id: 'quiz',       label: 'Quiz'       },
  { id: 'mcq',        label: 'MCQ'        },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'assignment', label: 'Assignment' },
  { id: 'math',       label: 'Math'       },
  { id: 'graph',      label: 'Graph'      },
  { id: 'matlab',     label: 'MATLAB Lab' },
  { id: 'visual',     label: 'Visual'     },
  { id: 'library',    label: 'Library'    },
] as const;

type Tab = (typeof TABS)[number]['id'];

// ── Helpers ────────────────────────────────────────────────────────────────

function fileIcon(file: FileRecord): string {
  if (file.mimeType === 'application/pdf' || file.name.endsWith('.pdf')) return '📕';
  if (file.name.match(/\.docx?$/i)) return '📘';
  if (file.name.match(/\.pptx?$/i)) return '📙';
  if (file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i)) return '🖼️';
  if (file.name.match(/\.(txt|md)$/i)) return '📝';
  return '📄';
}

function fmt(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── MCQ renderer ──────────────────────────────────────────────────────────

function MCQView({ content }: { content: string }) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const blocks = content.split(/\*\*Q\d+\.\*\*/).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {blocks.map((block, qi) => {
        const lines = block.trim().split('\n').filter(Boolean);
        const stem = lines[0];
        const options = lines.slice(1).filter(l => /^\s*[A-D]\)/.test(l));
        const answerLine = lines.find(l => l.includes('✓'));
        const correctLetter = answerLine?.match(/([A-D])\)/)?.[1];

        return (
          <div key={qi} className="quiz-card">
            <div className="quiz-q-num">Question {qi + 1}</div>
            <div className="quiz-q-text">{stem}</div>
            <div className="quiz-options">
              {options.map((opt, oi) => {
                const letter = opt.trim().match(/^([A-D])\)/)?.[1] ?? '';
                const optText = opt.replace(/^\s*[A-D]\)\s*/, '');
                const isSelected = selected[qi] === letter;
                const isRevealed = revealed[qi];
                const isCorrect = letter === correctLetter;
                let cls = 'quiz-option';
                if (isRevealed) { if (isCorrect) cls += ' correct'; else if (isSelected) cls += ' wrong'; }
                else if (isSelected) cls += ' selected';

                return (
                  <div key={oi} className={cls} onClick={() => {
                    if (isRevealed) return;
                    setSelected(p => ({ ...p, [qi]: letter }));
                  }}>
                    <span style={{ fontWeight: 600, width: 20, flexShrink: 0 }}>{letter})</span>
                    <span>{optText}</span>
                  </div>
                );
              })}
            </div>
            {!revealed[qi] && selected[qi] && (
              <button className="btn btn-sm btn-secondary" style={{ marginTop: 10, alignSelf: 'flex-start' }}
                onClick={() => setRevealed(p => ({ ...p, [qi]: true }))}>
                Check Answer
              </button>
            )}
            {revealed[qi] && correctLetter && (
              <div className="quiz-answer">✓ Correct answer: {correctLetter}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Flashcard renderer ────────────────────────────────────────────────────

function FlashcardView({ content }: { content: string }) {
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const cards = content.split(/---/).filter(c => c.includes('Front:'));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
      {cards.map((card, i) => {
        const front = card.match(/Front:\*\*\s*(.*)/)?.[1]?.trim() ?? '';
        const back  = card.match(/Back:\*\*\s*(.*)/)?.[1]?.trim() ?? '';
        const isFlipped = flipped[i] ?? false;
        return (
          <div
            key={i}
            className="flashcard-wrap"
            style={{ minHeight: 160 }}
            onClick={() => setFlipped(p => ({ ...p, [i]: !p[i] }))}
          >
            <div className={`flashcard${isFlipped ? ' flipped' : ''}`} style={{ minHeight: 160 }}>
              <div className="flashcard-face">
                <div className="flashcard-label">Front</div>
                <div className="flashcard-text">{front || card.trim()}</div>
                <small style={{ marginTop: 12, color: 'var(--text-3)' }}>Click to flip</small>
              </div>
              <div className="flashcard-face flashcard-back">
                <div className="flashcard-label">Back</div>
                <div className="flashcard-text">{back}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function WorkspacePanel({
  selectedFolder, selectedTopic, selectedFolderName, selectedTopicName, onRefresh,
}: WorkspacePanelProps) {
  const { toast } = useToast();
  const filePickerRef = useRef<HTMLInputElement>(null);

  const [tab,        setTab]        = useState<Tab>('files');
  const [files,      setFiles]      = useState<FileRecord[]>([]);
  const [filesLoad,  setFilesLoad]  = useState(false);
  const [selFile,    setSelFile]    = useState<FileRecord | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [output,     setOutput]     = useState('');
  const [generating, setGenerating] = useState(false);
  const [count,      setCount]      = useState(5);
  const [libItems,   setLibItems]   = useState<Array<{ id: string; mode: string; content: string; createdAt: string }>>([]);
  const [libLoad,    setLibLoad]    = useState(false);
  const [graphExpression, setGraphExpression] = useState('x^2');
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!selectedFolder) {
      setFiles([]);
      return;
    }

    setFilesLoad(true);
    const qs = new URLSearchParams({ folderId: selectedFolder });
    if (selectedTopic) qs.set('topicId', selectedTopic);
    try {
      const response = await fetch(`/api/files?${qs}`);
      if (response.ok) {
        setFiles(await response.json());
        return;
      }
      setFiles(listLocalFiles(selectedFolder, selectedTopic));
    } catch {
      setFiles(listLocalFiles(selectedFolder, selectedTopic));
    } finally {
      setFilesLoad(false);
    }
  }, [selectedFolder, selectedTopic]);

  // Load files when folder/topic changes
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Load library
  const loadLib = useCallback(() => {
    setLibLoad(true);
    fetch('/api/library')
      .then(r => r.ok ? r.json() : [])
      .then(setLibItems)
      .catch(() => setLibItems([]))
      .finally(() => setLibLoad(false));
  }, []);

  useEffect(() => { if (tab === 'library') loadLib(); }, [tab, loadLib]);

  // Extract text from selected file
  async function extractFromFile(file: FileRecord): Promise<string | null> {
    if (!file.localBlobId) {
      if (file.content) {
        setExtractedText(file.content);
        return file.content;
      }
      toast('No file data available for extraction.', 'error');
      return null;
    }
    setExtracting(true);
    try {
      const payload = await idbStore.get(file.localBlobId);
      if (!payload) {
        toast('File not found in local storage.', 'error');
        return null;
      }
      const result = await extractTextFromBlob(payload.blob, file.name);
      if (result.error) {
        toast(result.error, 'error');
        return null;
      }
      setExtractedText(result.text);
      toast(`Extracted ${result.wordCount.toLocaleString()} words`, 'success');
      return result.text;
    } finally {
      setExtracting(false);
    }
  }

  // Select file
  function selectFile(file: FileRecord) {
    setSelFile(file);
    setOutput('');
    setExtractedText('');
  }

  async function uploadWorkspaceFile(file: File) {
    if (!selectedFolder) {
      toast('Select a folder first.', 'warning');
      return;
    }

    const blobId = uuidv4();
    const fileId = uuidv4();
    const createdAt = new Date().toISOString();
    const localFilePath = (file as File & { path?: string }).path || undefined;

    await idbStore.put(blobId, { blob: file, name: file.name, type: file.type, size: file.size });

    let nextRecord: FileRecord = {
      id: fileId,
      name: file.name,
      type: 'upload',
      mimeType: file.type,
      fileSize: file.size,
      localBlobId: blobId,
      localFilePath,
      createdAt,
    };

    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: selectedFolder,
          topicId: selectedTopic ?? null,
          id: fileId,
          name: file.name,
          type: 'upload',
          localBlobId: blobId,
          mimeType: file.type,
          fileSize: file.size,
          localFilePath,
        }),
      });

      if (response.ok) {
        nextRecord = await response.json();
        toast(`"${file.name}" uploaded`, 'success');
      } else {
        upsertLocalFile({
          id: fileId,
          folderId: selectedFolder,
          topicId: selectedTopic ?? null,
          name: file.name,
          type: 'upload',
          localBlobId: blobId,
          localFilePath,
          mimeType: file.type,
          fileSize: file.size,
          createdAt,
        });
        toast(`"${file.name}" saved locally`, 'info');
      }
    } catch {
      upsertLocalFile({
        id: fileId,
        folderId: selectedFolder,
        topicId: selectedTopic ?? null,
        name: file.name,
        type: 'upload',
        localBlobId: blobId,
        localFilePath,
        mimeType: file.type,
        fileSize: file.size,
        createdAt,
      });
      toast(`"${file.name}" saved locally`, 'info');
    }

    await loadFiles();
    setSelFile(nextRecord);
    setExtractedText('');
    onRefresh();
  }

  async function uploadWorkspaceFiles(fileList: FileList | File[]) {
    const filesToUpload = Array.from(fileList);
    if (filesToUpload.length === 0) return;
    setUploadingFiles(true);
    try {
      for (const file of filesToUpload) {
        await uploadWorkspaceFile(file);
      }
    } finally {
      setUploadingFiles(false);
    }
  }

  async function handleWorkspaceFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const pickedFiles = event.target.files;
    if (!pickedFiles?.length) return;
    await uploadWorkspaceFiles(pickedFiles);
    event.target.value = '';
  }

  // Run AI tool
  async function runTool(mode: ToolMode) {
    let sourceText = extractedText.trim();
    if (!sourceText && selFile) {
      sourceText = (await extractFromFile(selFile))?.trim() ?? '';
    }
    if (!sourceText) {
      toast('Select a file and load it first.', 'warning');
      return;
    }
    setGenerating(true);
    setOutput('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, text: sourceText, options: { count } }),
      });
      const data = await res.json();
      setOutput(data.content ?? data.error ?? 'No output.');
      if (data.source === 'offline') toast('Generated offline (AI model not available)', 'info');
    } catch {
      toast('Generation failed.', 'error');
    } finally {
      setGenerating(false);
    }
  }

  // Save to library
  async function saveToLibrary() {
    if (!output) return;
    const res = await fetch('/api/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: tab, content: output }),
    });
    if (res.ok) toast('Saved to Library', 'success');
    else toast('Could not save (DB may not be configured)', 'warning');
  }

  // Delete file
  async function deleteFile(e: React.MouseEvent, file: FileRecord) {
    e.stopPropagation();
    if (!confirm(`Delete "${file.name}"?`)) return;
    if (file.localBlobId) await idbStore.delete(file.localBlobId);
    deleteLocalFile(file.id);
    await fetch(`/api/files/${file.id}`, { method: 'DELETE' }).catch(() => {});
    setFiles(p => p.filter(f => f.id !== file.id));
    if (selFile?.id === file.id) { setSelFile(null); setExtractedText(''); setOutput(''); }
    toast('File deleted', 'info');
  }

  // ── Tool panel: shared layout for generative tools
  function ToolPanel({ mode }: { mode: ToolMode }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Context: which file is loaded */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, display: 'grid', gap: 10 }}>
            {files.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={selFile?.id ?? ''}
                  onChange={(event) => {
                    const next = files.find((file) => file.id === event.target.value) ?? null;
                    if (next) selectFile(next);
                  }}
                  style={{ minWidth: 240, flex: '1 1 240px' }}
                >
                  <option value="">Select file for this tool…</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setTab('files');
                    filePickerRef.current?.click();
                  }}
                  disabled={!selectedFolder || uploadingFiles}
                >
                  {uploadingFiles ? 'Uploading…' : 'Add file'}
                </button>
              </div>
            )}
            {selFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 8, padding: '6px 12px' }}>
                <span>{fileIcon(selFile)}</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{selFile.name}</span>
                {extractedText && <span className="badge badge-accent">{extractedText.split(/\s+/).filter(Boolean).length} words</span>}
              </div>
            ) : (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                {files.length > 0
                  ? <>Choose a file above or use the <strong>Files</strong> tab.</>
                  : <>Upload a file to the selected folder to use this tool.</>}
              </span>
            )}
          </div>
          {selFile && !extractedText && (
            <button className="btn btn-secondary btn-sm" disabled={extracting} onClick={() => extractFromFile(selFile)}>
              {extracting ? 'Extracting…' : 'Extract text'}
            </button>
          )}
          {extractedText && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {(mode === 'quiz' || mode === 'mcq' || mode === 'flashcards' || mode === 'assignment') && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  Count:
                  <input type="number" value={count} min={2} max={20} onChange={e => setCount(+e.target.value)}
                    style={{ width: 52, padding: '3px 8px', fontSize: 'var(--text-xs)' }} />
                </label>
              )}
              <button className="btn btn-primary btn-sm" disabled={generating} onClick={() => runTool(mode)}>
                {generating ? 'Generating…' : `Generate ${TABS.find(t => t.id === mode)?.label}`}
              </button>
            </div>
          )}
        </div>

        {/* Output */}
        {output && (
          <div>
            {mode === 'mcq' ? (
              <MCQView content={output} />
            ) : mode === 'flashcards' ? (
              <FlashcardView content={output} />
            ) : (
              <div className="tool-output" dangerouslySetInnerHTML={{ __html: output
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/^(#{1,3})\s+(.+)/gm, (_, hashes, text) => `<h${hashes.length}>${text}</h${hashes.length}>`)
                .replace(/^•\s+(.+)/gm, '<li>$1</li>')
                .replace(/\n/g, '<br/>')
              }} />
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(output).then(() => toast('Copied!', 'success'))}>
                Copy
              </button>
              <button className="btn btn-ghost btn-sm" onClick={saveToLibrary}>
                Save to Library
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setOutput('')}>
                Clear
              </button>
            </div>
          </div>
        )}

        {!output && extractedText && !generating && (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-icon">✨</div>
            <p>Click <strong>Generate</strong> to create {TABS.find(t => t.id === mode)?.label?.toLowerCase()} from your material.</p>
          </div>
        )}
        {!output && !extractedText && !generating && (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <div className="empty-icon">📂</div>
            <p>Select a file from the <strong>Files</strong> tab, then extract its text to use this tool.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const breadcrumb = [selectedFolderName, selectedTopicName].filter(Boolean).join(' › ');

  return (
    <div className="tool-panel">
      {/* Header */}
      <div className="panel-header" style={{ gap: 8 }}>
        <span className="panel-title" style={{ fontSize: 'var(--text-base)' }}>
          {breadcrumb || 'Workspace'}
        </span>
        {!selectedFolder && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            Select a folder to get started
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="tab-content">

        {/* FILES TAB */}
        {tab === 'files' && (
          <div>
            {!selectedFolder ? (
              <div className="empty-state">
                <div className="empty-icon">📂</div>
                <h3>No folder selected</h3>
                <p>Pick a folder from the left sidebar to see its files.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                <input
                  ref={filePickerRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                  style={{ display: 'none' }}
                  onChange={handleWorkspaceFileInput}
                />

                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDraggingFiles(true);
                  }}
                  onDragLeave={() => setDraggingFiles(false)}
                  onDrop={async (event) => {
                    event.preventDefault();
                    setDraggingFiles(false);
                    if (!selectedFolder) return;
                    await uploadWorkspaceFiles(event.dataTransfer.files);
                  }}
                  onClick={() => {
                    if (!selectedFolder) return;
                    filePickerRef.current?.click();
                  }}
                  style={{
                    border: draggingFiles ? '1px solid var(--accent)' : '1px dashed var(--border-2)',
                    background: draggingFiles ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'var(--surface)',
                    borderRadius: 16,
                    padding: '20px 18px',
                    cursor: selectedFolder ? 'pointer' : 'default',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <strong style={{ fontSize: 'var(--text-sm)' }}>
                    {draggingFiles ? 'Drop files to upload' : 'Drag files here or click to upload'}
                  </strong>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                    Files go into {selectedTopicName || selectedFolderName}. PDFs, Word docs, text files, and images are supported.
                  </span>
                </div>

                {filesLoad ? (
              [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8, borderRadius: 10 }} />)
            ) : files.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📁</div>
                <h3>No files yet</h3>
                <p>Drag files into this area or click the upload surface above.</p>
              </div>
            ) : (
              <div className="file-list">
                {files.map(file => (
                  <div
                    key={file.id}
                    className={`file-card${selFile?.id === file.id ? ' selected' : ''}`}
                    onClick={() => selectFile(file)}
                  >
                    <div className="file-thumb">{fileIcon(file)}</div>
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-meta">
                        {fmt(file.fileSize)} {file.fileSize ? '·' : ''} {fmtDate(file.createdAt)}
                        {selFile?.id === file.id && extractedText && (
                          <span className="badge badge-accent" style={{ marginLeft: 6 }}>
                            {extractedText.split(/\s+/).filter(Boolean).length} words extracted
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {selFile?.id === file.id && !extractedText && (
                        <button className="btn btn-secondary btn-sm" disabled={extracting}
                          onClick={e => { e.stopPropagation(); extractFromFile(file); }}>
                          {extracting ? '…' : 'Extract'}
                        </button>
                      )}
                      <button className="btn-icon" style={{ color: 'var(--danger)' }} title="Delete"
                        onClick={e => deleteFile(e, file)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
              </div>
            )}
          </div>
        )}

        {/* TOOL TABS */}
        {(['summarize', 'rephrase', 'notes', 'quiz', 'mcq', 'flashcards', 'assignment'] as ToolMode[]).map(mode => (
          tab === mode && <ToolPanel key={mode} mode={mode} />
        ))}

        {tab === 'math' && (
          <MathSolver
            onGraphExpression={(expression) => {
              setGraphExpression(expression);
              setTab('graph');
              toast('Sent to graphing tool', 'info');
            }}
          />
        )}

        {tab === 'graph' && (
          <GraphingCalculator initialExpression={graphExpression} />
        )}

        {tab === 'matlab' && (
          <MatlabLab
            onGraphExpression={(expression) => {
              setGraphExpression(expression);
              setTab('graph');
              toast('Sent to graphing tool', 'info');
            }}
          />
        )}

        {tab === 'visual' && (
          <VisualAnalyzer />
        )}

        {/* LIBRARY TAB */}
        {tab === 'library' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 'var(--text-lg)' }}>Saved outputs</h3>
              <button className="btn btn-ghost btn-sm" onClick={loadLib}>↻ Refresh</button>
            </div>
            {libLoad ? (
              [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 90, marginBottom: 10, borderRadius: 10 }} />)
            ) : libItems.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🗂️</div>
                <h3>Library is empty</h3>
                <p>Generate something from a tool, then click <strong>Save to Library</strong>.</p>
              </div>
            ) : (
              libItems.map(item => (
                <div key={item.id} className="lib-item" style={{ marginBottom: 12 }}>
                  <div className="lib-item-header">
                    <span className="lib-item-mode">{item.mode}</span>
                    <span className="lib-item-date">{fmtDate(item.createdAt)}</span>
                    <button
                      className="btn-icon btn-sm"
                      style={{ color: 'var(--danger)', marginLeft: 'auto' }}
                      title="Delete"
                      onClick={async () => {
                        await fetch(`/api/library/${item.id}`, { method: 'DELETE' });
                        setLibItems(p => p.filter(x => x.id !== item.id));
                        toast('Deleted', 'info');
                      }}
                    >✕</button>
                  </div>
                  <div className="lib-item-preview">{item.content}</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                    onClick={() => { setOutput(item.content); setTab(item.mode as Tab); toast('Loaded into tool', 'info'); }}>
                    Reopen
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
