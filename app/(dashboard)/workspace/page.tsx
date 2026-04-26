'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { WorkspaceShell } from '@/components/workspace/v2/WorkspaceShell';

// Dynamic imports preserved from the original page — these components are
// large and we don't want them in the initial JS bundle.
const FolderPanel = dynamic(
  () => import('@/components/folders/FolderPanel').then((mod) => mod.FolderPanel),
  { ssr: false, loading: () => <div style={{ width: 320, borderRight: '1px solid var(--kv-rule)', background: 'var(--kv-cream-2)', minHeight: '100%' }} /> },
);
const WorkspacePanel = dynamic(
  () => import('@/components/workspace/WorkspacePanel').then((mod) => mod.WorkspacePanel),
  {
    ssr: false,
    loading: () => (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--kv-ink-3)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--kv-rule)', borderTopColor: 'var(--kv-brand-green, #1db88e)', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ margin: 0, fontSize: '0.9rem' }}>Loading workspace…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    ),
  },
);
const ReportsSidebar = dynamic(
  () => import('@/components/workspace/ReportsSidebar').then((mod) => mod.ReportsSidebar),
  { ssr: false },
);

export default function WorkspacePage() {
  useEffect(() => { document.title = 'Workspace — Kivora'; }, []);

  // ── Folder/topic selection (unchanged contract with FolderPanel) ───
  const [selectedFolder,     setSelectedFolder]     = useState<string | null>(null);
  const [selectedTopic,      setSelectedTopic]      = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [selectedTopicName,  setSelectedTopicName]  = useState('');
  const [folderCollapsed,    setFolderCollapsed]    = useState(false);
  const [refreshKey,         setRefreshKey]         = useState(0);
  const [filesRefreshKey,    setFilesRefreshKey]    = useState(0);
  const [reportsOpen,        setReportsOpen]        = useState(false);

  // ── Today drawer needs the file count for the current folder. We keep
  // it in shell-level state and let FolderPanel push updates via the
  // existing onFilesChanged callback.
  const [folderFileCount, setFolderFileCount] = useState(0);

  const handleSelect = useCallback((
    folderId: string | null,
    folderName: string,
    topicId: string | null,
    topicName: string,
  ) => {
    setSelectedFolder(folderId);
    setSelectedFolderName(folderName);
    setSelectedTopic(topicId);
    setSelectedTopicName(topicName);
  }, []);

  const handleFilesChanged = useCallback(() => {
    setFilesRefreshKey(k => k + 1);
  }, []);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // ── Quick-start chips dispatch via a simple custom event the
  // WorkspacePanel already listens for ('kivora:open-tab'). This avoids
  // having to touch WorkspacePanel internals to wire the new chips.
  const handleQuickStart = useCallback((target: 'tools' | 'notes' | 'flashcards' | 'paste') => {
    if (typeof window === 'undefined') return;
    // Map the friendly target names to the existing tab + modifier flags
    // the panel understands.
    const tabByTarget: Record<typeof target, string> = {
      tools: 'generate',
      notes: 'notes',
      flashcards: 'flashcards',
      paste: 'generate',
    };
    window.dispatchEvent(new CustomEvent('kivora:open-tab', {
      detail: { tab: tabByTarget[target], paste: target === 'paste' },
    }));
  }, []);

  // Whenever the current folder changes, ask the files API for a count
  // so the Today drawer can show "N files ready" accurately. This is a
  // tiny request — we don't fetch the full file list here.
  useEffect(() => {
    if (!selectedFolder) {
      setFolderFileCount(0);
      return;
    }
    let cancelled = false;
    fetch(`/api/files?folderId=${encodeURIComponent(selectedFolder)}&summary=1`)
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        // Route may return { items: [...], total: N } or just an array.
        const count = Array.isArray(data) ? data.length : (data?.total ?? data?.items?.length ?? 0);
        setFolderFileCount(typeof count === 'number' ? count : 0);
      })
      .catch(() => { if (!cancelled) setFolderFileCount(0); });
    return () => { cancelled = true; };
  }, [selectedFolder, filesRefreshKey]);

  return (
    <WorkspaceShell
      folderName={selectedFolderName}
      topicName={selectedTopicName}
      fileCount={folderFileCount}
      onQuickStart={handleQuickStart}
    >
      <FolderPanel
        onSelect={handleSelect}
        selectedFolder={selectedFolder}
        selectedTopic={selectedTopic}
        refreshKey={refreshKey}
        collapsed={folderCollapsed}
        onToggleCollapse={() => setFolderCollapsed(c => !c)}
        onFilesChanged={handleFilesChanged}
      />
      <Suspense fallback={null}>
        <WorkspacePanel
          selectedFolder={selectedFolder}
          selectedTopic={selectedTopic}
          selectedFolderName={selectedFolderName}
          selectedTopicName={selectedTopicName}
          onRefresh={handleRefresh}
          filesRefreshKey={filesRefreshKey}
          onToggleReports={() => setReportsOpen(o => !o)}
          reportsOpen={reportsOpen}
        />
      </Suspense>
      {reportsOpen ? <ReportsSidebar open={reportsOpen} onClose={() => setReportsOpen(false)} /> : null}
    </WorkspaceShell>
  );
}
