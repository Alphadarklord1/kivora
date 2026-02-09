'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { extractTextFromFile } from '@/lib/pdf/extract';
import { idbStore } from '@/lib/idb';
import { getGeneratedContent, ToolMode, GeneratedContent } from '@/lib/offline/generate';
import { generateAiContent, loadAiPreferences } from '@/lib/ai/client';
import { InteractiveQuiz } from './InteractiveQuiz';
import { MathSolver } from '@/components/tools/MathSolver';
import { GraphingCalculator } from '@/components/tools/GraphingCalculator';
import { VisualAnalyzer } from '@/components/tools/VisualAnalyzer';
import { MatlabLab } from '@/components/tools/MatlabLab';
import { FocusMode } from '@/components/tools/FocusMode';
import { ExamSimulator, ExamPrepData } from '@/components/tools/ExamSimulator';
import { FlashcardSRS } from '@/components/tools/FlashcardSRS';
import { useToastHelpers } from '@/components/ui/Toast';
import { SkeletonList } from '@/components/ui/Skeleton';
import { NoFilesState, EmptyState } from '@/components/ui/EmptyState';
import { ShareDialog } from '@/components/share';
import { FocusTimer } from '@/components/workspace/FocusTimer';

interface FileItem {
  id: string;
  name: string;
  type: string;
  content: string | null;
  folderId?: string | null;
  topicId?: string | null;
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
type ToolTab = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'notes' | 'math' | 'graph' | 'visual' | 'matlab' | 'focus' | 'exam' | 'srs';

const toolTabs: { id: ToolTab; label: string; icon: string }[] = [
  { id: 'assignment', label: 'Assignment', icon: '📝' },
  { id: 'summarize', label: 'Summarize', icon: '📄' },
  { id: 'mcq', label: 'MCQ', icon: '✅' },
  { id: 'quiz', label: 'Quiz', icon: '🧠' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'math', label: 'Math', icon: '🧮' },
  { id: 'matlab', label: 'MATLAB Lab', icon: '📐' },
  { id: 'focus', label: 'Focus', icon: '⏱️' },
  { id: 'exam', label: 'Exam Prep', icon: '🎯' },
  { id: 'srs', label: 'SRS', icon: '🧩' },
  { id: 'graph', label: 'Graph', icon: '📈' },
  { id: 'visual', label: 'Visual', icon: '🔍' },
];

const toolGroups: Array<{ label: string; tools: ToolTab[] }> = [
  { label: 'AI Tools', tools: ['assignment', 'summarize', 'mcq', 'quiz', 'notes'] },
  { label: 'Study Tools', tools: ['focus', 'exam', 'srs', 'graph'] },
  { label: 'Subject Tools', tools: ['math', 'matlab', 'visual'] },
];

const initialToolInputs = Object.fromEntries(
  toolTabs.map(tab => [tab.id, ''])
) as Record<ToolTab, string>;

type ToolSource = { type: 'manual' } | { type: 'file'; fileId: string; fileName: string };

const initialToolSources = Object.fromEntries(
  toolTabs.map(tab => [tab.id, { type: 'manual' }])
) as Record<ToolTab, ToolSource>;

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
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const totalQuickFiles = pinnedFiles.length + likedFiles.length + recentFiles.length;
  const selectedFileCount = selectedTopic ? files.length : totalQuickFiles;

  // Tool state
  const [output, setOutput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [showInteractiveQuiz, setShowInteractiveQuiz] = useState(false);
  const [viewMode, setViewMode] = useState<'input' | 'output' | 'practice'>('input');
  const [graphExpression, setGraphExpression] = useState('');
  const [toolInputs, setToolInputs] = useState<Record<ToolTab, string>>(() => initialToolInputs);
  const [toolSources, setToolSources] = useState<Record<ToolTab, ToolSource>>(() => initialToolSources);
  const [recentOutputs, setRecentOutputs] = useState<Array<{ title: string; content: string; tool: ToolTab; source?: ToolSource }>>([]);
  const [autoChain, setAutoChain] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [examPrep, setExamPrep] = useState<ExamPrepData | null>(null);
  const [lastInjected, setLastInjected] = useState<{ text: string; source: ToolSource } | null>(null);

  useEffect(() => {
    const storedCompact = typeof window !== 'undefined' ? localStorage.getItem('studypilot_compact_mode') : null;
    if (storedCompact) {
      setCompactMode(storedCompact === 'true');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('studypilot_compact_mode', String(compactMode));
  }, [compactMode]);

  useEffect(() => {
    if (!lastInjected) return;
    if (!toolInputs[toolTab]) {
      setToolInputs(prev => ({ ...prev, [toolTab]: lastInjected.text }));
      setToolSources(prev => ({ ...prev, [toolTab]: lastInjected.source }));
    }
  }, [toolTab, lastInjected, toolInputs]);

  const handleGraphFromMath = (expression: string) => {
    setGraphExpression(expression);
    setToolTab('graph');
  };

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

  const isImageFile = (name: string) => /\.(png|jpg|jpeg|gif|webp)$/i.test(name);
  const isOfficeFile = (name: string) => /\.(doc|docx|ppt|pptx)$/i.test(name);
  const isVisualSupported = (file: FileItem) =>
    file.type === 'upload' && (/\.(pdf)$/i.test(file.name) || isImageFile(file.name) || isOfficeFile(file.name));

  const uploadFiles = useMemo(() => files.filter(f => f.type === 'upload'), [files]);
  const hasQuickAccess = useMemo(
    () => pinnedFiles.length > 0 || likedFiles.length > 0 || recentFiles.length > 0,
    [pinnedFiles.length, likedFiles.length, recentFiles.length]
  );

  const openVisualForFile = async (file: FileItem) => {
    if (isOfficeFile(file.name)) {
      if (!file.localBlobId) {
        toast.error('File not available', 'Please re-upload the file.');
        return;
      }
      try {
        const blobData = await idbStore.get(file.localBlobId);
        if (!blobData?.blob) {
          toast.error('File not available', 'Please re-upload the file.');
          return;
        }

        const form = new FormData();
        form.append('file', blobData.blob, blobData.name || file.name);
        const res = await fetch('/api/tools/convert', {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const message = await res.text();
          toast.error('Conversion failed', message || 'Please try again later.');
          return;
        }
        const pdfBlob = await res.blob();
        const pdfName = file.name.replace(/\.(doc|docx|ppt|pptx)$/i, '.pdf');
        const localBlobId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await idbStore.put(localBlobId, {
          blob: pdfBlob,
          name: pdfName,
          type: 'application/pdf',
          size: pdfBlob.size,
        });
        const tempFile = {
          id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: pdfName,
          type: 'upload',
          folderId: file.folderId,
          topicId: file.topicId,
          localBlobId,
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem('visual_temp_file', JSON.stringify(tempFile));
        setMainTab('tools');
        setToolTab('visual');
        return;
      } catch {
        toast.error('Conversion failed', 'Please try again later.');
        return;
      }
    }

    localStorage.setItem('visual_file_id', file.id);
    setMainTab('tools');
    setToolTab('visual');
  };

  const handleViewFile = async (file: FileItem) => {
    if (isVisualSupported(file)) {
      await openVisualForFile(file);
      return;
    }

    setViewingFile(file);
    setFileContent('');
    setViewingImageUrl(null);

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
      // Check if it's an image file - render visually
      if (isImageFile(file.name)) {
        try {
          const blobData = await idbStore.get(file.localBlobId);
          if (blobData) {
            const url = URL.createObjectURL(blobData.blob);
            setViewingImageUrl(url);
            setFileContent('[Image file] Use the Visual Analyzer tool to analyze this image.');
          } else {
            setFileContent('File not found locally.');
          }
        } catch {
          setFileContent('Failed to load image.');
        }
      } else {
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
      }
    } else if (file.content) {
      setFileContent(file.content);
    }
  };

  const applyToolInput = (text: string, source: ToolSource) => {
    setToolInputs(prev => ({ ...prev, [toolTab]: text }));
    setToolSources(prev => ({ ...prev, [toolTab]: source }));
    setLastInjected({ text, source });
    setMainTab('tools');
    setViewMode('input');
  };

  const handleUseInTool = async (file: FileItem) => {
    // Extract text and switch to tools tab
    if (file.type === 'upload' && file.localBlobId) {
      try {
        const blobData = await idbStore.get(file.localBlobId);
        if (blobData) {
          const text = await extractTextFromFile(blobData.blob, blobData.name);
          if (!text.trim()) {
            toast.warning('No text extracted', 'This file may be image-based. Try Visual Analyze.');
            if (isVisualSupported(file)) {
              await openVisualForFile(file);
            }
            return;
          }
          const source = { type: 'file' as const, fileId: file.id, fileName: file.name };
          applyToolInput(text, source);
        }
      } catch {
        toast.error('Failed to extract text', 'Could not read the file content');
      }
    } else if (file.content) {
      if (!file.content.trim()) {
        toast.warning('No text available', 'This file does not contain text content.');
        return;
      }
      const source = { type: 'file' as const, fileId: file.id, fileName: file.name };
      applyToolInput(file.content, source);
    }
  };

  const handleVisualAnalyze = async (file: FileItem) => {
    await openVisualForFile(file);
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
  const generateWithFallback = async (mode: ToolMode, text: string) => {
    const prefs = loadAiPreferences();
    const ai = await generateAiContent(text, mode, prefs);
    if (ai && ai.displayText) {
      if (mode === 'mcq' || mode === 'quiz') {
        if (!ai.questions?.length || !ai.questions[0]?.options?.length) {
          return getGeneratedContent(mode, text);
        }
      }
      if (mode === 'flashcards' && !ai.flashcards?.length) {
        return getGeneratedContent(mode, text);
      }
      return ai;
    }
    return getGeneratedContent(mode, text);
  };

  const handleGenerate = async () => {
    const input = toolInputs[toolTab] || '';
    if (!input.trim()) {
      setOutput('Please enter text to process.');
      return;
    }

    setGenerating(true);
    try {
      const content = await generateWithFallback(toolTab as ToolMode, input);
      setGeneratedContent(content);
      setOutput(content.displayText);
      addResult(toolTab, toolTabs.find(t => t.id === toolTab)?.label || toolTab, content.displayText, toolSources[toolTab]);
      if (toolTab === 'mcq' || toolTab === 'quiz') {
        setShowInteractiveQuiz(true);
        setViewMode('practice');
      } else {
        setViewMode('output');
      }
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
    setOutput('');
    setGeneratedContent(null);
    setShowInteractiveQuiz(false);
    setViewMode('input');
  };

  const addResult = (tool: ToolTab, title: string, content: string, source?: ToolSource) => {
    setRecentOutputs(prev => [{ title, content, tool, source }, ...prev].slice(0, 5));
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const handleSpeak = (text: string) => {
    if (!text) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 5000));
    const preferredVoice = localStorage.getItem('studypilot_tts_voice') || '';
    const preferredRate = Number(localStorage.getItem('studypilot_tts_rate') || 1);
    const preferredPitch = Number(localStorage.getItem('studypilot_tts_pitch') || 1);
    const voices = window.speechSynthesis.getVoices();
    if (preferredVoice) {
      const match = voices.find(v => v.name === preferredVoice);
      if (match) utterance.voice = match;
    } else {
      const best = voices.find(v => v.lang.startsWith('en') && /female|natural|premium/i.test(v.name)) || voices[0];
      if (best) utterance.voice = best;
    }
    utterance.rate = preferredRate;
    utterance.pitch = preferredPitch;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  const handleSaveToLibrary = async () => {
    if (!output) return;

    const toolLabel = toolTabs.find(t => t.id === toolTab)?.label || toolTab;
    const source = toolSources[toolTab];
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: toolTab,
          content: output,
          metadata: {
            title: `${toolLabel} • ${new Date().toLocaleString()}`,
            sourceTool: toolTab,
            ...(source?.type === 'file' ? { sourceFileId: source.fileId, sourceFileName: source.fileName } : {}),
          },
        }),
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
        quiz: '🧠', notes: '📝', math: '🧮',
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

  const handleSaveResultToLibrary = async (result: { title: string; content: string; tool: ToolTab; source?: ToolSource }) => {
    try {
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: result.tool,
          content: result.content,
          metadata: {
            title: `${result.title} • ${new Date().toLocaleString()}`,
            sourceTool: result.tool,
            ...(result.source?.type === 'file'
              ? { sourceFileId: result.source.fileId, sourceFileName: result.source.fileName }
              : {}),
          },
        }),
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

  return (
    <div className={`workspace-panel ${compactMode ? 'compact' : ''}`}>
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
        <div className="header-actions">
          {selectedTopic && (
            <span className="status-pill">Ready to upload</span>
          )}
          {!selectedTopic && (
            <span className="status-pill muted">Quick access view</span>
          )}
          <button
            className={`compact-toggle ${compactMode ? 'active' : ''}`}
            onClick={() => setCompactMode(prev => !prev)}
            type="button"
            aria-pressed={compactMode}
            aria-label="Toggle compact mode"
          >
            <span className="compact-track">
              <span className="compact-thumb" />
            </span>
            <span className="compact-label">Compact</span>
          </button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Files</div>
          <div className="stat-value">{selectedFileCount}</div>
          <div className="stat-meta">{selectedTopic ? 'In this subfolder' : 'Quick access total'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pinned</div>
          <div className="stat-value">{pinnedFiles.length}</div>
          <div className="stat-meta">Fast recalls</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Liked</div>
          <div className="stat-value">{likedFiles.length}</div>
          <div className="stat-meta">Favorites</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Recent</div>
          <div className="stat-value">{recentFiles.length}</div>
          <div className="stat-meta">Last opened</div>
        </div>
        <FocusTimer />
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
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
                {uploading ? 'Uploading...' : '+ Upload File'}
              </label>
            )}

            {/* Pinned, Liked & Recent */}
            {!selectedTopic && hasQuickAccess && (
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
                          {isVisualSupported(file) && (
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleVisualAnalyze(file); }} title="Visual Analyze">🔍</button>
                          )}
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
          <div className="tool-groups">
            {toolGroups.map((group) => (
              <div key={group.label} className="tool-group">
                <p className="tool-group-label">{group.label}</p>
                <div className="tool-tabs">
                  {group.tools.map((toolId) => {
                    const tab = toolTabs.find((item) => item.id === toolId);
                    if (!tab) return null;
                    return (
                      <button
                        key={tab.id}
                        className={`tool-tab ${toolTab === tab.id ? 'active' : ''}`}
                        onClick={() => { setToolTab(tab.id); handleToolReset(); }}
                      >
                        {tab.icon} {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Results Hub */}
          <div className="results-hub">
            <div className="results-header">
              <h4>Results Hub</h4>
              <label className="toggle">
                <input type="checkbox" checked={autoChain} onChange={() => setAutoChain(prev => !prev)} />
                Auto-chain Exam Prep → Exam → SRS
              </label>
            </div>
            {recentOutputs.length === 0 ? (
              <p className="muted">Generated results will appear here.</p>
            ) : (
              recentOutputs.map((r, i) => (
                <div key={i} className="result-item">
                  <strong>{r.title}</strong>
                  <div className="result-actions">
                    <button className="btn ghost small" onClick={() => handleCopy(r.content)}>Copy</button>
                    <button className="btn ghost small" onClick={() => handleSaveResultToLibrary(r)}>Save</button>
                  </div>
                </div>
              ))
            )}
          </div>

            {/* Quick Library Link */}
            <div className="library-link-row">
              <Link href="/library" className="library-quick-link">📚 View Library</Link>
            </div>

            {/* Tool-level Input Helpers */}
            {(['assignment', 'summarize', 'mcq', 'quiz', 'notes', 'exam', 'srs'] as ToolTab[]).includes(toolTab) && (
              <div className="tool-input-row">
                {selectedTopic && uploadFiles.length > 0 && (
                  <div className="file-selector inline">
                    <label>Use file in tool:</label>
                    <select onChange={(e) => {
                      const file = files.find(f => f.id === e.target.value);
                      if (file) handleUseInTool(file);
                    }} defaultValue="">
                      <option value="">-- Select a file --</option>
                      {uploadFiles.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setToolInputs(prev => ({ ...prev, [toolTab]: '' }));
                    setToolSources(prev => ({ ...prev, [toolTab]: { type: 'manual' } }));
                  }}
                >
                  Clear input
                </button>
              </div>
            )}

            {/* Math Solver */}
            {toolTab === 'math' ? (
              <div className="tool-content">
                <MathSolver onGraphExpression={handleGraphFromMath} />
              </div>
            ) : toolTab === 'focus' ? (
              <div className="tool-content">
                <FocusMode />
              </div>
            ) : toolTab === 'exam' ? (
              <div className="tool-content">
                <ExamSimulator
                  inputText={toolInputs.exam}
                  onInputChange={(value) => {
                    setToolInputs(prev => ({ ...prev, exam: value }));
                    setToolSources(prev => ({ ...prev, exam: { type: 'manual' } }));
                  }}
                  manualInputEnabled={false}
                  autoChain={autoChain}
                  prepData={examPrep}
                  onPrepGenerated={(prep) => {
                    setExamPrep(prep);
                  }}
                  onResult={(title, content) => addResult('exam', title, content, toolSources.exam)}
                  onSrsSeed={(prep) => setExamPrep(prep)}
                  generateContent={generateWithFallback}
                />
              </div>
            ) : toolTab === 'srs' ? (
              <div className="tool-content">
                <FlashcardSRS
                  inputText={toolInputs.srs}
                  onInputChange={(value) => {
                    setToolInputs(prev => ({ ...prev, srs: value }));
                    setToolSources(prev => ({ ...prev, srs: { type: 'manual' } }));
                  }}
                  manualInputEnabled={false}
                  prepData={examPrep}
                  autoGenerate={autoChain}
                  onResult={(title, content) => addResult('srs', title, content, toolSources.srs)}
                  generateContent={generateWithFallback}
                />
              </div>
            ) : toolTab === 'matlab' ? (
              <div className="tool-content">
                <MatlabLab onGraphExpression={handleGraphFromMath} />
              </div>
            ) : toolTab === 'graph' ? (
              <div className="tool-content">
                <GraphingCalculator initialExpression={graphExpression || undefined} />
              </div>
            ) : toolTab === 'visual' ? (
              <div className="tool-content">
                <VisualAnalyzer />
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

                    {toolInputs[toolTab] ? (
                      <p className="word-count">{toolInputs[toolTab].split(/\s+/).filter(Boolean).length} words</p>
                    ) : (
                      <p className="muted">Select a file to use in this tool.</p>
                    )}
                    <button
                      className="btn generate-btn"
                      onClick={handleGenerate}
                      disabled={generating || !(toolInputs[toolTab] || '').trim()}
                    >
                      {generating ? 'Generating...' : `Generate ${toolTabs.find(t => t.id === toolTab)?.label}`}
                    </button>
                  </>
                )}

                {/* Output Mode */}
                {viewMode === 'output' && output && !showInteractiveQuiz && toolTab !== 'mcq' && toolTab !== 'quiz' && (
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
                      <button className="btn secondary" onClick={() => handleSpeak(output)}>
                        {speaking ? '🔇 Stop' : '🔊 Listen'}
                      </button>
                      <button className="btn secondary" onClick={handleSaveToLibrary}>📚 Library</button>
                      <button className="btn secondary" onClick={handleSaveToFolder} disabled={!selectedTopic}>📁 Folder</button>
                    </div>
                  </>
                )}

                {/* Practice Mode */}
                {viewMode === 'practice' && showInteractiveQuiz && generatedContent && (
                  <InteractiveQuiz content={generatedContent} onClose={handleCloseInteractive} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="file-viewer-overlay" onClick={() => { if (viewingImageUrl) URL.revokeObjectURL(viewingImageUrl); setViewingImageUrl(null); setViewingFile(null); }}>
          <div className="file-viewer" onClick={e => e.stopPropagation()}>
            <div className="viewer-header">
              <h3>{getFileIcon(viewingFile.name, viewingFile.type)} {viewingFile.name}</h3>
              <button className="close-btn" onClick={() => setViewingFile(null)}>✕</button>
            </div>
            <div className="viewer-content">
              {extracting ? (
                <p className="extracting">Extracting text...</p>
              ) : viewingImageUrl ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                  <img src={viewingImageUrl} alt={viewingFile.name} style={{ maxWidth: '100%', maxHeight: '60vh', borderRadius: 'var(--radius-md)' }} />
                </div>
              ) : (
                <pre>{fileContent || 'No content'}</pre>
              )}
            </div>
            <div className="viewer-actions">
              {isImageFile(viewingFile.name) ? (
                <button className="btn" onClick={() => { setToolTab('visual'); setMainTab('tools'); if (viewingImageUrl) URL.revokeObjectURL(viewingImageUrl); setViewingImageUrl(null); setViewingFile(null); }}>🔍 Analyze Image</button>
              ) : isVisualSupported(viewingFile) ? (
                <button className="btn" onClick={() => { handleVisualAnalyze(viewingFile); setViewingFile(null); }}>🔍 Analyze Visually</button>
              ) : (
                <button className="btn" onClick={() => { handleUseInTool(viewingFile); setViewingFile(null); }}>🛠️ Use in Tool</button>
              )}
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
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 500px;
          overflow: hidden;
        }

        .panel-header {
          position: relative;
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-3);
          background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 8%, transparent), transparent 75%);
        }

        .panel-header::after {
          content: '';
          position: absolute;
          right: -25%;
          top: -70%;
          width: 65%;
          height: 220%;
          background: radial-gradient(circle, color-mix(in srgb, var(--primary) 14%, transparent), transparent 72%);
          pointer-events: none;
          opacity: 0.45;
        }

        .header-info h2 { font-size: var(--font-2xl); font-weight: 600; margin: 0; letter-spacing: var(--letter-tight); }
        .breadcrumb { font-size: var(--font-meta); color: var(--primary); margin: var(--space-1) 0 0; }
        .hint { font-size: var(--font-meta); color: var(--text-muted); margin: var(--space-1) 0 0; }

        .header-actions {
          display: flex;
          gap: var(--space-3);
          align-items: center;
        }

        .compact-toggle {
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          padding: 4px 8px 4px 6px;
          border-radius: var(--radius-full);
          font-size: var(--font-tiny);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
        }

        .compact-toggle:hover {
          border-color: var(--border-default);
          color: var(--text-primary);
        }

        .compact-toggle.active {
          border-color: color-mix(in srgb, var(--primary) 36%, var(--border-default));
        }

        .compact-track {
          width: 34px;
          height: 20px;
          border-radius: var(--radius-full);
          background: var(--bg-active);
          position: relative;
          transition: background 0.2s ease;
        }

        .compact-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--bg-surface);
          box-shadow: var(--shadow-sm);
          transition: transform 0.2s ease;
        }

        .compact-toggle.active .compact-track {
          background: color-mix(in srgb, var(--primary) 60%, var(--bg-active));
        }

        .compact-toggle.active .compact-thumb {
          transform: translateX(14px);
        }

        .compact-label {
          letter-spacing: 0.02em;
        }

        .status-pill {
          padding: 5px 10px;
          border-radius: var(--radius-full);
          background: color-mix(in srgb, var(--primary-muted) 55%, transparent);
          color: var(--primary);
          font-size: var(--font-tiny);
          font-weight: 600;
        }

        .status-pill.muted {
          background: var(--bg-elevated);
          color: var(--text-muted);
        }

        .stats-row {
          position: relative;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--space-4);
          padding: var(--space-5);
          border-bottom: 1px solid var(--border-subtle);
          align-items: stretch;
        }

        .stat-card {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .stat-card:hover {
          transform: translateY(-1px);
          box-shadow: var(--shadow-md);
        }

        .stat-label {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-weight: 600;
        }

        .stat-value {
          font-size: 30px;
          font-weight: 700;
          line-height: 1;
        }

        .stat-meta {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .main-tabs {
          display: flex;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-base);
          position: relative;
          z-index: 1;
        }

        .main-tab {
          flex: 1;
          padding: var(--space-3) var(--space-4);
          border: none;
          background: none;
          font-size: var(--font-body);
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.2s ease;
          border-bottom: 2px solid transparent;
        }

        .main-tab:hover { color: var(--text-primary); }
        .main-tab.active {
          color: var(--primary);
          border-bottom: 2px solid var(--primary);
        }

        .panel-content {
          flex: 1;
          padding: var(--space-5);
          overflow-y: auto;
          position: relative;
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
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
        }
        .file-item:hover {
          transform: translateY(-1px);
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border-subtle));
          box-shadow: var(--shadow-sm);
        }
        .file-icon { font-size: 24px; flex-shrink: 0; }
        .file-info { flex: 1; min-width: 0; }
        .file-name { display: block; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-date { font-size: var(--font-tiny); color: var(--text-muted); }
        .file-actions { display: flex; gap: var(--space-1); opacity: 0; transition: opacity 0.15s; }
        .file-item:hover .file-actions { opacity: 1; }

        .icon-btn {
          min-width: 36px; min-height: 36px;
          width: 36px; height: 36px;
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
        .tool-groups {
          display: grid;
          gap: var(--space-4);
          margin-bottom: var(--space-6);
        }

        .tool-group {
          display: grid;
          gap: var(--space-2);
        }

        .tool-group-label {
          margin: 0;
          font-size: var(--font-tiny);
          color: var(--text-faint);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 600;
        }

        .tool-tabs {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .results-hub {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: var(--space-4);
          box-shadow: var(--shadow-sm);
          margin-bottom: var(--space-6);
        }

        .results-hub h4 {
          margin: 0;
          font-size: var(--font-section);
          font-weight: 600;
        }

        .results-hub .muted {
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .muted {
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-3);
          margin-bottom: var(--space-3);
        }

        .toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .result-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          margin-bottom: var(--space-2);
          gap: var(--space-2);
        }

        .result-actions {
          display: flex;
          gap: var(--space-1);
        }

        .btn.ghost.small {
          padding: var(--space-1) var(--space-2);
          font-size: var(--font-tiny);
        }

        .tool-tab {
          padding: 8px 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .tool-tab:hover { border-color: var(--border-default); background: var(--bg-hover); }
        .tool-tab.active {
          background: color-mix(in srgb, var(--primary-muted) 50%, transparent);
          color: var(--primary);
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border-subtle));
        }

        .tool-content { }

        .library-link-row {
          display: flex;
          justify-content: flex-end;
          margin-bottom: var(--space-5);
        }

        .library-quick-link {
          font-size: var(--font-meta);
          color: var(--primary);
          text-decoration: none;
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          transition: background 0.15s;
        }

        .library-quick-link:hover {
          background: var(--primary-muted);
        }

        .context-info {
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }
        .context-active { color: var(--primary); }
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

        .tool-input-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
          flex-wrap: wrap;
          margin-bottom: var(--space-3);
        }

        .file-selector.inline {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin: 0;
        }

        .file-selector.inline label {
          margin: 0;
        }

        .file-selector.inline select {
          width: auto;
          min-width: 220px;
        }

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
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          white-space: pre-wrap;
          font-size: var(--font-body);
          line-height: 1.6;
          max-height: min(300px, 50vh);
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
          max-width: min(800px, calc(100vw - 32px));
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

        .viewer-actions { display: flex; gap: var(--space-2); padding: var(--space-4); border-top: 1px solid var(--border-subtle); flex-wrap: wrap; }

        .workspace-panel.compact .panel-header {
          padding: var(--space-3);
        }

        .workspace-panel.compact .panel-content {
          padding: var(--space-3);
        }

        .workspace-panel.compact .stats-row {
          padding: var(--space-3);
          gap: var(--space-2);
        }

        .workspace-panel.compact .stat-card {
          padding: var(--space-2);
          border-radius: 12px;
        }

        .workspace-panel.compact .stat-value {
          font-size: var(--font-lg);
        }

        .workspace-panel.compact .tool-tabs {
          gap: var(--space-1);
        }

        .workspace-panel.compact .tool-tab {
          padding: var(--space-1) var(--space-2);
          font-size: var(--font-tiny);
        }

        .workspace-panel.compact .results-hub {
          padding: var(--space-2);
        }

        .compact-toggle:focus-visible,
        .main-tab:focus-visible,
        .tool-tab:focus-visible,
        .icon-btn:focus-visible,
        .btn:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--primary) 72%, transparent);
          outline-offset: 2px;
        }

        .tool-tab:active,
        .icon-btn:active,
        .btn:active {
          transform: scale(0.98);
        }

        @media (hover: none) {
          .file-actions { opacity: 1; }
        }

        @media (max-width: 600px) {
          .panel-header { flex-direction: column; align-items: flex-start; }
          .stats-row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            padding: var(--space-3);
          }
          .stat-card {
            padding: var(--space-2);
          }
          .stat-value {
            font-size: var(--font-lg);
          }
          .file-item {
            flex-direction: column;
            align-items: flex-start;
          }
          .file-actions {
            opacity: 1;
            width: 100%;
            flex-wrap: wrap;
            justify-content: flex-start;
          }
          .tool-tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: var(--space-2); }
          .tool-tabs::-webkit-scrollbar { display: none; }
          .tool-tab { flex-shrink: 0; padding: var(--space-2) var(--space-3); font-size: var(--font-meta); }
          .viewer-actions { gap: var(--space-1); }
          .viewer-actions .btn { font-size: var(--font-meta); padding: var(--space-2) var(--space-3); }
        }
      `}</style>
    </div>
  );
}
