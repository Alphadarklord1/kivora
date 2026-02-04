'use client';

import { useState, useEffect } from 'react';
import { extractTextFromFile } from '@/lib/pdf/extract';
import { idbStore } from '@/lib/idb';
import { getGeneratedContent, ToolMode, GeneratedContent } from '@/lib/offline/generate';
import { InteractiveQuiz } from './InteractiveQuiz';
import { WelcomePanel } from './WelcomePanel';
import { MathSolver } from '@/components/tools/MathSolver';
import { useToastHelpers } from '@/components/ui/Toast';
import { SkeletonList } from '@/components/ui/Skeleton';
import { NoFilesState, EmptyState } from '@/components/ui/EmptyState';
import { ShareDialog } from '@/components/share';

interface FileItem {
  id: string;
  name: string;
  type: string;
  content: string | null;
  liked: boolean;
  pinned: boolean;
  createdAt: string;
  localBlobId: string | null;
}

interface WorkspacePanelProps {
  selectedFolder: string | null;
  selectedTopic: string | null;
  selectedFolderName: string;
  selectedTopicName: string;
  onRefresh: () => void;
}

type MainTab = 'files' | 'tools';
type ToolTab = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes' | 'math';

const toolTabs: { id: ToolTab; label: string; icon: string }[] = [
  { id: 'assignment', label: 'Assignment', icon: '📝' },
  { id: 'summarize', label: 'Summarize', icon: '📄' },
  { id: 'mcq', label: 'MCQ', icon: '✅' },
  { id: 'quiz', label: 'Quiz', icon: '🧠' },
  { id: 'pop', label: 'Pop Quiz', icon: '⚡' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'math', label: 'Math', icon: '🧮' },
];

export function WorkspacePanel({
  selectedFolder,
  selectedTopic,
  selectedFolderName,
  selectedTopicName,
  onRefresh,
}: WorkspacePanelProps) {
  const toast = useToastHelpers();
  const [mainTab, setMainTab] = useState<MainTab>('files');
  const [toolTab, setToolTab] = useState<ToolTab>('assignment');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pinnedFiles, setPinnedFiles] = useState<FileItem[]>([]);
  const [likedFiles, setLikedFiles] = useState<FileItem[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [extracting, setExtracting] = useState(false);

  // Tool state
  const [inputText, setInputText] = useState('');
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [showInteractiveQuiz, setShowInteractiveQuiz] = useState(false);
  const [viewMode, setViewMode] = useState<'input' | 'output' | 'practice'>('input');

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'file'; id: string; name: string } | null>(null);

  const handleShareFile = (file: FileItem) => {
    setShareTarget({ type: 'file', id: file.id, name: file.name });
    setShareDialogOpen(true);
  };

  // Fetch files in selected topic
  useEffect(() => {
    if (selectedTopic) {
      setLoading(true);
      fetch(`/api/files?topicId=${selectedTopic}`, { credentials: 'include' })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setFiles(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => {
          setFiles([]);
          setLoading(false);
        });
    } else {
      setFiles([]);
    }
  }, [selectedTopic]);

  // Fetch pinned, liked, and recent files
  const fetchQuickAccess = () => {
    Promise.all([
      fetch('/api/files?pinned=true', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/files?liked=true', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/recent?limit=10', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ])
      .then(([pinned, liked, recent]) => {
        setPinnedFiles(Array.isArray(pinned) ? pinned : []);
        setLikedFiles(Array.isArray(liked) ? liked : []);
        // Recent comes with nested file object
        const recentList = Array.isArray(recent) ? recent.map((r: { file: FileItem }) => r.file) : [];
        setRecentFiles(recentList);
      })
      .catch(() => {
        setPinnedFiles([]);
        setLikedFiles([]);
        setRecentFiles([]);
      });
  };

  useEffect(() => {
    fetchQuickAccess();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTopic || !e.target.files?.length) return;

    setUploading(true);
    const file = e.target.files[0];

    try {
      const localBlobId = `blob_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await idbStore.put(localBlobId, {
        blob: file,
        name: file.name,
        type: file.type,
        size: file.size,
      });

      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          type: 'upload',
          folderId: selectedFolder,
          topicId: selectedTopic,
          localBlobId,
          mimeType: file.type,
          fileSize: file.size,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        const filesRes = await fetch(`/api/files?topicId=${selectedTopic}`, { credentials: 'include' });
        setFiles(await filesRes.json());
        onRefresh();
        toast.success('File uploaded');
      }
    } catch {
      toast.error('Upload failed', 'Please try again');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleViewFile = async (file: FileItem) => {
    setViewingFile(file);
    setFileContent('');

    // Record file access for recent files
    try {
      await fetch('/api/recent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: file.id }),
        credentials: 'include',
      });
      fetchQuickAccess(); // Refresh recent files list
    } catch {
      // Silently fail - don't interrupt file viewing
    }

    if (file.type === 'upload' && file.localBlobId) {
      setExtracting(true);
      try {
        const blobData = await idbStore.get(file.localBlobId);
        if (blobData) {
          const text = await extractTextFromFile(blobData.blob, blobData.name);
          setFileContent(text);
        } else {
          setFileContent('File not found locally.');
        }
      } catch {
        setFileContent('Failed to extract text from file.');
      } finally {
        setExtracting(false);
      }
    } else if (file.content) {
      setFileContent(file.content);
    }
  };

  const handleUseInTool = async (file: FileItem) => {
    // Extract text and switch to tools tab
    if (file.type === 'upload' && file.localBlobId) {
      try {
        const blobData = await idbStore.get(file.localBlobId);
        if (blobData) {
          const text = await extractTextFromFile(blobData.blob, blobData.name);
          setInputText(text);
          setMainTab('tools');
          setViewMode('input');
        }
      } catch {
        toast.error('Failed to extract text', 'Could not read the file content');
      }
    } else if (file.content) {
      setInputText(file.content);
      setMainTab('tools');
      setViewMode('input');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Delete this file?')) return;

    try {
      const file = files.find(f => f.id === fileId);
      if (file?.localBlobId) {
        await idbStore.delete(file.localBlobId);
      }
      await fetch(`/api/files/${fileId}`, { method: 'DELETE', credentials: 'include' });
      setFiles(files.filter(f => f.id !== fileId));
      if (viewingFile?.id === fileId) {
        setViewingFile(null);
      }
      onRefresh();
    } catch {
      console.error('Delete failed');
    }
  };

  const handleDownloadFile = async (file: FileItem) => {
    try {
      if (file.type === 'upload' && file.localBlobId) {
        // Download original uploaded file
        const blobData = await idbStore.get(file.localBlobId);
        if (blobData) {
          const url = URL.createObjectURL(blobData.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = blobData.name || file.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Download started');
        } else {
          toast.error('File not found', 'The original file is not available on this device');
        }
      } else if (file.content) {
        // Download generated content as text file
        const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success('Download started');
      } else {
        toast.warning('No content', 'This file has no downloadable content');
      }
    } catch {
      toast.error('Download failed', 'Could not download the file');
    }
  };

  const toggleFileLike = async (fileId: string, liked: boolean) => {
    try {
      await fetch(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: !liked }),
        credentials: 'include',
      });
      const [newFiles, pinned, likedData] = await Promise.all([
        selectedTopic ? fetch(`/api/files?topicId=${selectedTopic}`, { credentials: 'include' }).then(r => r.json()) : Promise.resolve(files),
        fetch('/api/files?pinned=true', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/files?liked=true', { credentials: 'include' }).then(r => r.json()),
      ]);
      if (selectedTopic) setFiles(newFiles);
      setPinnedFiles(pinned);
      setLikedFiles(likedData);
    } catch {
      console.error('Failed to toggle like');
    }
  };

  const toggleFilePin = async (fileId: string, pinned: boolean) => {
    try {
      await fetch(`/api/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !pinned }),
        credentials: 'include',
      });
      const [newFiles, pinnedData, liked] = await Promise.all([
        selectedTopic ? fetch(`/api/files?topicId=${selectedTopic}`, { credentials: 'include' }).then(r => r.json()) : Promise.resolve(files),
        fetch('/api/files?pinned=true', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/files?liked=true', { credentials: 'include' }).then(r => r.json()),
      ]);
      if (selectedTopic) setFiles(newFiles);
      setPinnedFiles(pinnedData);
      setLikedFiles(liked);
    } catch {
      console.error('Failed to toggle pin');
    }
  };

  // Tool functions
  const handleGenerate = () => {
    if (!inputText.trim()) {
      setOutput('Please enter text to process.');
      return;
    }

    setGenerating(true);
    try {
      const content = getGeneratedContent(toolTab as ToolMode, inputText);
      setGeneratedContent(content);
      setOutput(content.displayText);
      setViewMode('output');
    } catch {
      setOutput('Error generating content.');
      setGeneratedContent(null);
    } finally {
      setGenerating(false);
    }
  };

  const handleStartInteractive = () => {
    if (generatedContent && generatedContent.questions.length > 0) {
      setShowInteractiveQuiz(true);
      setViewMode('practice');
    }
  };

  const handleCloseInteractive = () => {
    setShowInteractiveQuiz(false);
    setViewMode('output');
  };

  const handleToolReset = () => {
    setInputText('');
    setOutput('');
    setGeneratedContent(null);
    setShowInteractiveQuiz(false);
    setViewMode('input');
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleSaveToLibrary = async () => {
    if (!output) return;

    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: toolTab, content: output }),
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Saved to library');
      } else {
        toast.error('Failed to save', 'Could not save to library');
      }
    } catch {
      toast.error('Failed to save', 'Please try again');
    }
  };

  const handleSaveToFolder = async () => {
    if (!output || !selectedFolder || !selectedTopic) {
      toast.warning('Select a subfolder first', 'Choose a folder and subfolder to save');
      return;
    }

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${toolTab} - ${new Date().toLocaleString()}`,
          type: toolTab,
          content: output,
          folderId: selectedFolder,
          topicId: selectedTopic,
        }),
        credentials: 'include',
      });
      if (res.ok) {
        toast.success('Saved to folder');
        onRefresh();
        // Refresh files
        const filesRes = await fetch(`/api/files?topicId=${selectedTopic}`, { credentials: 'include' });
        setFiles(await filesRes.json());
      } else {
        toast.error('Failed to save', 'Could not save to folder');
      }
    } catch {
      toast.error('Failed to save', 'Please try again');
    }
  };

  const getFileIcon = (name: string, type: string) => {
    if (type !== 'upload') {
      const icons: Record<string, string> = {
        assignment: '📝', summarize: '📄', mcq: '✅',
        quiz: '🧠', pop: '⚡', notes: '📝', math: '🧮',
      };
      return icons[type] || '📄';
    }
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return '📕';
    if (['doc', 'docx'].includes(ext || '')) return '📘';
    if (['ppt', 'pptx'].includes(ext || '')) return '📙';
    return '📄';
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="workspace-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="header-info">
          <h2>Workspace</h2>
          {selectedFolder && selectedTopic ? (
            <p className="breadcrumb">{selectedFolderName} / {selectedTopicName}</p>
          ) : (
            <p className="hint">Select a folder and subfolder</p>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="main-tabs">
        <button
          className={`main-tab ${mainTab === 'files' ? 'active' : ''}`}
          onClick={() => setMainTab('files')}
        >
          📁 Files
        </button>
        <button
          className={`main-tab ${mainTab === 'tools' ? 'active' : ''}`}
          onClick={() => setMainTab('tools')}
        >
          🛠️ Tools
        </button>
      </div>

      {/* Content */}
      <div className="panel-content">
        {/* FILES TAB */}
        {mainTab === 'files' && (
          <>
            {/* Upload Button */}
            {selectedTopic && (
              <label className="upload-btn">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                {uploading ? 'Uploading...' : '+ Upload File'}
              </label>
            )}

            {/* Welcome Panel - show when no folder selected and no quick access files */}
            {!selectedTopic && pinnedFiles.length === 0 && likedFiles.length === 0 && recentFiles.length === 0 && (
              <WelcomePanel />
            )}

            {/* Pinned, Liked & Recent */}
            {!selectedTopic && (pinnedFiles.length > 0 || likedFiles.length > 0 || recentFiles.length > 0) && (
              <div className="quick-access">
                {pinnedFiles.length > 0 && (
                  <div className="quick-section">
                    <h3>📌 Pinned</h3>
                    <div className="file-list">
                      {pinnedFiles.map(file => (
                        <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                          <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-date">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="file-actions">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">🛠️</button>
                            <button className="icon-btn active" onClick={(e) => { e.stopPropagation(); toggleFilePin(file.id, file.pinned); }}>📌</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {likedFiles.length > 0 && (
                  <div className="quick-section">
                    <h3>❤️ Liked</h3>
                    <div className="file-list">
                      {likedFiles.map(file => (
                        <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                          <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-date">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="file-actions">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">🛠️</button>
                            <button className="icon-btn active" onClick={(e) => { e.stopPropagation(); toggleFileLike(file.id, file.liked); }}>❤️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {recentFiles.length > 0 && (
                  <div className="quick-section">
                    <h3>🕐 Recent</h3>
                    <div className="file-list">
                      {recentFiles.map(file => (
                        <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                          <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-date">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="file-actions">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">🛠️</button>
                            <button className={`icon-btn ${file.liked ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFileLike(file.id, file.liked); }}>{file.liked ? '❤️' : '🤍'}</button>
                            <button className={`icon-btn ${file.pinned ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFilePin(file.id, file.pinned); }}>📌</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!selectedTopic && pinnedFiles.length === 0 && likedFiles.length === 0 && recentFiles.length === 0 && (
              <EmptyState
                icon="folder"
                title="Welcome to your Workspace"
                description="Select a folder and subfolder to view files, or pin/like files for quick access."
                size="lg"
              />
            )}

            {/* Files list */}
            {selectedTopic && (
              <>
                {loading ? (
                  <SkeletonList items={3} />
                ) : files.length === 0 ? (
                  <NoFilesState onUploadFile={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()} />
                ) : (
                  <div className="file-list">
                    {files.map(file => (
                      <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                        <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                        <div className="file-info">
                          <span className="file-name">{file.name}</span>
                          <span className="file-date">{formatDate(file.createdAt)}</span>
                        </div>
                        <div className="file-actions">
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleShareFile(file); }} title="Share">🔗</button>
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">🛠️</button>
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDownloadFile(file); }} title="Download">⬇️</button>
                          <button className={`icon-btn ${file.liked ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFileLike(file.id, file.liked); }}>{file.liked ? '❤️' : '🤍'}</button>
                          <button className={`icon-btn ${file.pinned ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFilePin(file.id, file.pinned); }}>📌</button>
                          <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* TOOLS TAB */}
        {mainTab === 'tools' && (
          <>
            {/* Tool Tabs */}
            <div className="tool-tabs">
              {toolTabs.map(tab => (
                <button
                  key={tab.id}
                  className={`tool-tab ${toolTab === tab.id ? 'active' : ''}`}
                  onClick={() => { setToolTab(tab.id); handleToolReset(); }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Math Solver */}
            {toolTab === 'math' ? (
              <div className="tool-content">
                <MathSolver />
              </div>
            ) : (
              <div className="tool-content">
                {/* Input Mode */}
                {viewMode === 'input' && (
                  <>
                    <div className="context-info">
                      {selectedTopic ? (
                        <span className="context-active">📁 {selectedFolderName} / {selectedTopicName}</span>
                      ) : (
                        <span className="context-hint">Select a folder to use files, or paste text below</span>
                      )}
                    </div>

                    {/* File selector */}
                    {selectedTopic && files.filter(f => f.type === 'upload').length > 0 && (
                      <div className="file-selector">
                        <label>Use content from file:</label>
                        <select onChange={(e) => {
                          const file = files.find(f => f.id === e.target.value);
                          if (file) handleUseInTool(file);
                        }} defaultValue="">
                          <option value="">-- Select a file --</option>
                          {files.filter(f => f.type === 'upload').map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <textarea
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder="Paste your study material here..."
                      rows={8}
                    />
                    {inputText && (
                      <p className="word-count">{inputText.split(/\s+/).filter(Boolean).length} words</p>
                    )}

                    <button
                      className="btn generate-btn"
                      onClick={handleGenerate}
                      disabled={generating || !inputText.trim()}
                    >
                      {generating ? 'Generating...' : `Generate ${toolTabs.find(t => t.id === toolTab)?.label}`}
                    </button>
                  </>
                )}

                {/* Output Mode */}
                {viewMode === 'output' && output && !showInteractiveQuiz && (
                  <>
                    <div className="output-actions">
                      {generatedContent && generatedContent.questions.length > 0 && (
                        <button className="btn" onClick={handleStartInteractive}>🎯 Practice</button>
                      )}
                      <button className="btn secondary" onClick={() => setViewMode('input')}>✏️ Edit</button>
                      <button className="btn secondary" onClick={handleToolReset}>↺ New</button>
                    </div>

                    <div className="output-display">{output}</div>

                    <div className="save-actions">
                      <button className="btn secondary" onClick={() => handleCopy(output)}>📋 Copy</button>
                      <button className="btn secondary" onClick={handleSaveToLibrary}>📚 Library</button>
                      <button className="btn secondary" onClick={handleSaveToFolder} disabled={!selectedTopic}>📁 Folder</button>
                    </div>
                  </>
                )}

                {/* Practice Mode */}
                {viewMode === 'practice' && showInteractiveQuiz && generatedContent && (
                  <InteractiveQuiz content={generatedContent} fileId={viewingFile?.id} onClose={handleCloseInteractive} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="file-viewer-overlay" onClick={() => setViewingFile(null)}>
          <div className="file-viewer" onClick={e => e.stopPropagation()}>
            <div className="viewer-header">
              <h3>{getFileIcon(viewingFile.name, viewingFile.type)} {viewingFile.name}</h3>
              <button className="close-btn" onClick={() => setViewingFile(null)}>✕</button>
            </div>
            <div className="viewer-content">
              {extracting ? <p className="extracting">Extracting text...</p> : <pre>{fileContent || 'No content'}</pre>}
            </div>
            <div className="viewer-actions">
              <button className="btn" onClick={() => { handleUseInTool(viewingFile); setViewingFile(null); }}>🛠️ Use in Tool</button>
              <button className="btn secondary" onClick={() => { handleShareFile(viewingFile); setViewingFile(null); }}>🔗 Share</button>
              <button className="btn secondary" onClick={() => handleDownloadFile(viewingFile)}>⬇️ Download</button>
              <button className="btn secondary" onClick={() => handleCopy(fileContent)}>📋 Copy</button>
              <button className="btn danger" onClick={() => { handleDeleteFile(viewingFile.id); setViewingFile(null); }}>🗑️ Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Dialog */}
      {shareTarget && (
        <ShareDialog
          isOpen={shareDialogOpen}
          onClose={() => { setShareDialogOpen(false); setShareTarget(null); }}
          resourceType={shareTarget.type}
          resourceId={shareTarget.id}
          resourceName={shareTarget.name}
        />
      )}

      <style jsx>{`
        .workspace-panel {
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 500px;
        }

        .panel-header {
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .header-info h2 { font-size: var(--font-lg); font-weight: 600; margin: 0; }
        .breadcrumb { font-size: var(--font-meta); color: var(--primary); margin: var(--space-1) 0 0; }
        .hint { font-size: var(--font-meta); color: var(--text-muted); margin: var(--space-1) 0 0; }

        .main-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-subtle);
        }

        .main-tab {
          flex: 1;
          padding: var(--space-3);
          border: none;
          background: none;
          font-size: var(--font-meta);
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .main-tab:hover { background: var(--bg-inset); }
        .main-tab.active {
          color: var(--primary);
          background: var(--primary-muted);
          border-bottom: 2px solid var(--primary);
        }

        .panel-content {
          flex: 1;
          padding: var(--space-4);
          overflow-y: auto;
        }

        .upload-btn {
          display: block;
          width: 100%;
          padding: var(--space-3);
          background: var(--primary);
          color: white;
          border-radius: var(--radius-md);
          text-align: center;
          font-weight: 500;
          cursor: pointer;
          margin-bottom: var(--space-4);
        }
        .upload-btn:hover { background: var(--primary-hover); }

        .quick-access { margin-bottom: var(--space-4); }
        .quick-section { margin-bottom: var(--space-4); }
        .quick-section h3 { font-size: var(--font-meta); font-weight: 600; margin-bottom: var(--space-2); color: var(--text-secondary); }

        .file-list { display: flex; flex-direction: column; gap: var(--space-2); }
        .file-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background 0.15s;
        }
        .file-item:hover { background: var(--bg-elevated); }
        .file-icon { font-size: 24px; flex-shrink: 0; }
        .file-info { flex: 1; min-width: 0; }
        .file-name { display: block; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-date { font-size: var(--font-tiny); color: var(--text-muted); }
        .file-actions { display: flex; gap: var(--space-1); opacity: 0; transition: opacity 0.15s; }
        .file-item:hover .file-actions { opacity: 1; }

        .icon-btn {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          border: none; background: transparent;
          border-radius: var(--radius-sm);
          cursor: pointer; font-size: 14px; opacity: 0.6;
        }
        .icon-btn:hover { background: var(--bg-surface); opacity: 1; }
        .icon-btn.active { opacity: 1; }
        .icon-btn.danger:hover { background: var(--error-muted); }

        .empty-state { text-align: center; padding: var(--space-8); color: var(--text-muted); }
        .empty-state.small { padding: var(--space-6); }
        .empty-icon { font-size: 48px; margin-bottom: var(--space-4); }
        .empty-state h3 { color: var(--text-primary); margin-bottom: var(--space-2); }

        .loading { text-align: center; padding: var(--space-6); color: var(--text-muted); }

        /* Tool Tabs */
        .tool-tabs {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
          margin-bottom: var(--space-4);
        }

        .tool-tab {
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-subtle);
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          cursor: pointer;
          transition: all 0.15s;
        }
        .tool-tab:hover { border-color: var(--primary); }
        .tool-tab.active { background: var(--primary); color: white; border-color: var(--primary); }

        .tool-content { }

        .context-info {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }
        .context-active { color: var(--success); }
        .context-hint { color: var(--text-muted); }

        .file-selector {
          margin-bottom: var(--space-4);
        }
        .file-selector label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 500;
          margin-bottom: var(--space-2);
        }
        .file-selector select {
          width: 100%;
          padding: var(--space-2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
        }

        textarea {
          width: 100%;
          padding: var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: var(--font-body);
          font-family: inherit;
          resize: vertical;
          background: var(--bg-base);
        }
        textarea:focus { outline: none; border-color: var(--primary); }

        .word-count { font-size: var(--font-tiny); color: var(--text-muted); margin: var(--space-2) 0 var(--space-4); }

        .generate-btn {
          width: 100%;
          padding: var(--space-3);
          font-weight: 600;
        }

        .output-actions, .save-actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
          margin-bottom: var(--space-4);
        }

        .output-display {
          padding: var(--space-4);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          white-space: pre-wrap;
          font-size: var(--font-body);
          line-height: 1.6;
          max-height: 300px;
          overflow-y: auto;
          margin-bottom: var(--space-4);
        }

        /* File Viewer Modal */
        .file-viewer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: var(--space-4);
        }

        .file-viewer {
          background: var(--bg-surface);
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 800px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .viewer-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }
        .viewer-header h3 { margin: 0; font-size: var(--font-body); }
        .close-btn {
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          border: none; background: var(--bg-inset);
          border-radius: var(--radius-sm); cursor: pointer;
        }
        .close-btn:hover { background: var(--bg-elevated); }

        .viewer-content { flex: 1; padding: var(--space-4); overflow-y: auto; }
        .viewer-content pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; font-size: var(--font-meta); line-height: 1.6; margin: 0; }
        .extracting { text-align: center; color: var(--primary); }

        .viewer-actions { display: flex; gap: var(--space-2); padding: var(--space-4); border-top: 1px solid var(--border-subtle); }

        @media (max-width: 600px) {
          .file-actions { opacity: 1; }
          .tool-tabs { gap: var(--space-1); }
          .tool-tab { padding: var(--space-1) var(--space-2); font-size: var(--font-tiny); }
        }
      `}</style>
    </div>
  );
}
