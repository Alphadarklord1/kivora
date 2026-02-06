'use client';

import { useState, useEffect } from 'react';
import { extractTextFromFile } from '@/lib/pdf/extract';
import { idbStore } from '@/lib/idb';
import { getGeneratedContent, ToolMode, GeneratedContent } from '@/lib/offline/generate';
import { InteractiveQuiz } from './InteractiveQuiz';
import { WelcomePanel } from './WelcomePanel';
import { MathSolver } from '@/components/tools/MathSolver';
import { VisualAnalyzer } from '@/components/tools/VisualAnalyzer';
import { MathText } from '@/components/math/MathRenderer';
import { extractImagesFromPDF } from '@/lib/pdf/image-extract';
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
type ToolTab = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes' | 'math' | 'vision';

const ToolSvgIcons: Record<string, React.ReactNode> = {
  assignment: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  summarize: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  mcq: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  quiz: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  pop: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  notes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>,
  math: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  vision: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
};

// Action icons for file operations, tabs, and UI elements
const ActionIcons = {
  files: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  tools: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>,
  heart: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  heartOutline: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  share: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  download: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  clipboard: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>,
  folder: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  target: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  library: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  clock: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  // File type icons (20x20)
  filePdf: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  fileDoc: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  filePpt: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  fileGeneric: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  fileAssignment: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  fileSummarize: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  fileMcq: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  fileQuiz: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  filePop: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  fileMath: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

const SnapshotIcons = {
  files: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>,
  quizzes: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  streak: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  plans: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
};

const GENERATION_STEPS = [
  'Analyzing content...',
  'Generating questions...',
  'Formatting output...',
];

const toolTabs: { id: ToolTab; label: string; iconKey: string }[] = [
  { id: 'assignment', label: 'Assignment', iconKey: 'assignment' },
  { id: 'summarize', label: 'Summarize', iconKey: 'summarize' },
  { id: 'mcq', label: 'MCQ', iconKey: 'mcq' },
  { id: 'quiz', label: 'Quiz', iconKey: 'quiz' },
  { id: 'pop', label: 'Pop Quiz', iconKey: 'pop' },
  { id: 'notes', label: 'Notes', iconKey: 'notes' },
  { id: 'math', label: 'Math', iconKey: 'math' },
  { id: 'vision', label: 'Vision', iconKey: 'vision' },
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

  // Snapshot state
  const [snapshot, setSnapshot] = useState<{ files: number; quizzes: number; streak: number; plans: number } | null>(null);

  // Generation step state
  const [generationStep, setGenerationStep] = useState(0);

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'file'; id: string; name: string } | null>(null);

  // Image-aware generation state
  const [includeImageAnalysis, setIncludeImageAnalysis] = useState(false);
  const [imageAnalysisLoading, setImageAnalysisLoading] = useState(false);
  const [selectedToolFile, setSelectedToolFile] = useState<FileItem | null>(null);

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

  // Fetch snapshot data
  useEffect(() => {
    fetch('/api/analytics', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setSnapshot({
          files: data?.quizStats?.totalQuestions || 0,
          quizzes: data?.quizStats?.totalAttempts || 0,
          streak: data?.activity?.currentStreak || 0,
          plans: data?.planStats?.activePlans || 0,
        });
      })
      .catch(() => {
        setSnapshot({ files: 0, quizzes: 0, streak: 0, plans: 0 });
      });
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
      } else {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        toast.error('Upload failed', errorData.error || `Server returned ${res.status}`);
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
    setSelectedToolFile(file);
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
  const handleGenerate = async () => {
    if (!inputText.trim()) {
      setOutput('Please enter text to process.');
      return;
    }

    setGenerating(true);
    setGenerationStep(0);

    // Simulate step progression for UX feedback
    const stepTimer1 = setTimeout(() => setGenerationStep(1), 400);
    const stepTimer2 = setTimeout(() => setGenerationStep(2), 800);

    try {
      let finalInputText = inputText;

      // If image analysis is enabled and we have a PDF file
      if (includeImageAnalysis && selectedToolFile?.localBlobId && selectedToolFile.name.toLowerCase().endsWith('.pdf')) {
        setImageAnalysisLoading(true);
        try {
          const blobData = await idbStore.get(selectedToolFile.localBlobId);
          if (blobData) {
            const images = await extractImagesFromPDF(blobData.blob, 5);
            const descriptions: string[] = [];

            for (const img of images) {
              try {
                const res = await fetch('/api/vision/analyze', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ imageDataUrl: img.dataUrl, mode: 'describe' }),
                  credentials: 'include',
                });
                if (res.ok) {
                  const data = await res.json();
                  descriptions.push(`[Image from page ${img.pageNumber}]: ${data.result}`);
                }
              } catch {
                // Skip failed image analyses
              }
            }

            if (descriptions.length > 0) {
              finalInputText = `--- Visual Content from PDF ---\n${descriptions.join('\n\n')}\n\n--- Text Content ---\n${inputText}`;
            }
          }
        } catch {
          // Continue without image analysis if it fails
        } finally {
          setImageAnalysisLoading(false);
        }
      }

      const content = getGeneratedContent(toolTab as ToolMode, finalInputText);
      setGeneratedContent(content);
      setOutput(content.displayText);
      setViewMode('output');
    } catch {
      setOutput('Error generating content.');
      setGeneratedContent(null);
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setGenerating(false);
      setGenerationStep(0);
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
    setIncludeImageAnalysis(false);
    setSelectedToolFile(null);
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

  const getFileIcon = (name: string, type: string): React.ReactNode => {
    if (type !== 'upload') {
      const icons: Record<string, React.ReactNode> = {
        assignment: ActionIcons.fileAssignment, summarize: ActionIcons.fileSummarize,
        mcq: ActionIcons.fileMcq, quiz: ActionIcons.fileQuiz, pop: ActionIcons.filePop,
        notes: ActionIcons.fileAssignment, math: ActionIcons.fileMath,
      };
      return icons[type] || ActionIcons.fileGeneric;
    }
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return ActionIcons.filePdf;
    if (['doc', 'docx'].includes(ext || '')) return ActionIcons.fileDoc;
    if (['ppt', 'pptx'].includes(ext || '')) return ActionIcons.filePpt;
    return ActionIcons.fileGeneric;
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

      {/* Study Snapshot Bar */}
      {snapshot && (
        <div className="study-snapshot">
          <div className="snapshot-item">
            <div className="snapshot-icon">{SnapshotIcons.files}</div>
            <div className="snapshot-data">
              <span className="snapshot-value">{snapshot.files}</span>
              <span className="snapshot-label">Questions</span>
            </div>
          </div>
          <div className="snapshot-item">
            <div className="snapshot-icon">{SnapshotIcons.quizzes}</div>
            <div className="snapshot-data">
              <span className="snapshot-value">{snapshot.quizzes}</span>
              <span className="snapshot-label">Quizzes</span>
            </div>
          </div>
          <div className="snapshot-item">
            <div className="snapshot-icon">{SnapshotIcons.streak}</div>
            <div className="snapshot-data">
              <span className="snapshot-value">{snapshot.streak}</span>
              <span className="snapshot-label">Streak</span>
            </div>
          </div>
          <div className="snapshot-item">
            <div className="snapshot-icon">{SnapshotIcons.plans}</div>
            <div className="snapshot-data">
              <span className="snapshot-value">{snapshot.plans}</span>
              <span className="snapshot-label">Plans</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs */}
      <div className="main-tabs">
        <button
          className={`main-tab ${mainTab === 'files' ? 'active' : ''}`}
          onClick={() => setMainTab('files')}
        >
          <span className="main-tab-icon">{ActionIcons.files}</span> Files
        </button>
        <button
          className={`main-tab ${mainTab === 'tools' ? 'active' : ''}`}
          onClick={() => setMainTab('tools')}
        >
          <span className="main-tab-icon">{ActionIcons.tools}</span> Tools
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
                    <h3><span className="section-icon">{ActionIcons.pin}</span> Pinned</h3>
                    <div className="file-list">
                      {pinnedFiles.map(file => (
                        <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                          <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-date">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="file-actions">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">{ActionIcons.tools}</button>
                            <button className="icon-btn active" onClick={(e) => { e.stopPropagation(); toggleFilePin(file.id, file.pinned); }}>{ActionIcons.pin}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {likedFiles.length > 0 && (
                  <div className="quick-section">
                    <h3><span className="section-icon">{ActionIcons.heart}</span> Liked</h3>
                    <div className="file-list">
                      {likedFiles.map(file => (
                        <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                          <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-date">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="file-actions">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">{ActionIcons.tools}</button>
                            <button className="icon-btn active" onClick={(e) => { e.stopPropagation(); toggleFileLike(file.id, file.liked); }}>{ActionIcons.heart}</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {recentFiles.length > 0 && (
                  <div className="quick-section">
                    <h3><span className="section-icon">{ActionIcons.clock}</span> Recent</h3>
                    <div className="file-list">
                      {recentFiles.map(file => (
                        <div key={file.id} className="file-item" onClick={() => handleViewFile(file)}>
                          <span className="file-icon">{getFileIcon(file.name, file.type)}</span>
                          <div className="file-info">
                            <span className="file-name">{file.name}</span>
                            <span className="file-date">{formatDate(file.createdAt)}</span>
                          </div>
                          <div className="file-actions">
                            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">{ActionIcons.tools}</button>
                            <button className={`icon-btn ${file.liked ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFileLike(file.id, file.liked); }}>{file.liked ? ActionIcons.heart : ActionIcons.heartOutline}</button>
                            <button className={`icon-btn ${file.pinned ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFilePin(file.id, file.pinned); }}>{ActionIcons.pin}</button>
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
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleShareFile(file); }} title="Share">{ActionIcons.share}</button>
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleUseInTool(file); }} title="Use in Tool">{ActionIcons.tools}</button>
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDownloadFile(file); }} title="Download">{ActionIcons.download}</button>
                          <button className={`icon-btn ${file.liked ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFileLike(file.id, file.liked); }}>{file.liked ? ActionIcons.heart : ActionIcons.heartOutline}</button>
                          <button className={`icon-btn ${file.pinned ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFilePin(file.id, file.pinned); }}>{ActionIcons.pin}</button>
                          <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}>{ActionIcons.trash}</button>
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
                  <span className="tool-tab-icon">{ToolSvgIcons[tab.iconKey]}</span> {tab.label}
                </button>
              ))}
            </div>

            {/* Standalone Tools */}
            {toolTab === 'math' ? (
              <div className="tool-content">
                <MathSolver />
              </div>
            ) : toolTab === 'vision' ? (
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
                        <span className="context-active"><span className="context-icon">{ActionIcons.folder}</span> {selectedFolderName} / {selectedTopicName}</span>
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

                    {/* Image analysis toggle for PDFs */}
                    {selectedToolFile && selectedToolFile.name.toLowerCase().endsWith('.pdf') && selectedToolFile.localBlobId && (
                      <label className="image-analysis-toggle">
                        <input
                          type="checkbox"
                          checked={includeImageAnalysis}
                          onChange={(e) => setIncludeImageAnalysis(e.target.checked)}
                        />
                        Include image analysis (diagrams, charts)
                      </label>
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

                    {generating ? (
                      <div className="generation-status">
                        <div className="generation-spinner" />
                        <span className="generation-step">{imageAnalysisLoading ? 'Analyzing images...' : (GENERATION_STEPS[generationStep] || GENERATION_STEPS[0])}</span>
                      </div>
                    ) : (
                      <button
                        className="btn generate-btn"
                        onClick={handleGenerate}
                        disabled={!inputText.trim()}
                      >
                        Generate {toolTabs.find(t => t.id === toolTab)?.label}
                      </button>
                    )}
                  </>
                )}

                {/* Output Mode */}
                {viewMode === 'output' && output && !showInteractiveQuiz && (
                  <>
                    <div className="output-actions">
                      {generatedContent && generatedContent.questions.length > 0 && (
                        <button className="btn" onClick={handleStartInteractive}><span className="btn-icon">{ActionIcons.target}</span> Practice</button>
                      )}
                      <button className="btn secondary" onClick={() => setViewMode('input')}><span className="btn-icon">{ActionIcons.edit}</span> Edit</button>
                      <button className="btn secondary" onClick={handleToolReset}><span className="btn-icon">{ActionIcons.refresh}</span> New</button>
                    </div>

                    <div className="output-display"><MathText>{output}</MathText></div>

                    <div className="save-actions">
                      <button className="btn secondary" onClick={() => handleCopy(output)}><span className="btn-icon">{ActionIcons.clipboard}</span> Copy</button>
                      <button className="btn secondary" onClick={handleSaveToLibrary}><span className="btn-icon">{ActionIcons.library}</span> Library</button>
                      <button className="btn secondary" onClick={handleSaveToFolder} disabled={!selectedTopic}><span className="btn-icon">{ActionIcons.folder}</span> Folder</button>
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
              <h3><span className="viewer-file-icon">{getFileIcon(viewingFile.name, viewingFile.type)}</span> {viewingFile.name}</h3>
              <button className="close-btn" onClick={() => setViewingFile(null)}>{ActionIcons.close}</button>
            </div>
            <div className="viewer-content">
              {extracting ? <p className="extracting">Extracting text...</p> : <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'inherit', fontSize: 'var(--font-meta)', lineHeight: 1.6 }}><MathText>{fileContent || 'No content'}</MathText></div>}
            </div>
            <div className="viewer-actions">
              <button className="btn" onClick={() => { handleUseInTool(viewingFile); setViewingFile(null); }}><span className="btn-icon">{ActionIcons.tools}</span> Use in Tool</button>
              <button className="btn secondary" onClick={() => { handleShareFile(viewingFile); setViewingFile(null); }}><span className="btn-icon">{ActionIcons.share}</span> Share</button>
              <button className="btn secondary" onClick={() => handleDownloadFile(viewingFile)}><span className="btn-icon">{ActionIcons.download}</span> Download</button>
              <button className="btn secondary" onClick={() => handleCopy(fileContent)}><span className="btn-icon">{ActionIcons.clipboard}</span> Copy</button>
              <button className="btn danger" onClick={() => { handleDeleteFile(viewingFile.id); setViewingFile(null); }}><span className="btn-icon">{ActionIcons.trash}</span> Delete</button>
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
        .file-icon { font-size: 24px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
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
          display: inline-flex;
          align-items: center;
          gap: var(--space-1);
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-subtle);
          background: var(--bg-inset);
          border-radius: var(--radius-full);
          font-size: var(--font-meta);
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .tool-tab:hover { border-color: var(--primary); }
        .tool-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
        .tool-tab-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
        }

        .main-tab-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          vertical-align: middle;
          margin-right: 2px;
        }

        .main-tab { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); }

        .section-icon {
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
          margin-right: 4px;
        }

        .quick-section h3 { display: flex; align-items: center; }

        .btn-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 14px;
          height: 14px;
          vertical-align: middle;
          margin-right: 2px;
        }

        .context-icon {
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
          margin-right: 4px;
        }

        .viewer-file-icon {
          display: inline-flex;
          align-items: center;
          vertical-align: middle;
          margin-right: 4px;
        }

        .icon-btn { color: var(--text-secondary); }
        .icon-btn:hover { color: var(--text-primary); }
        .icon-btn.active { color: var(--primary); }
        .icon-btn.danger:hover { color: var(--error); }

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

        .image-analysis-toggle {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: var(--space-3);
          font-size: var(--font-meta);
          cursor: pointer;
          padding: var(--space-2) var(--space-3);
          background: var(--primary-muted);
          border-radius: var(--radius-md);
          color: var(--primary);
        }
        .image-analysis-toggle input { cursor: pointer; }

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
