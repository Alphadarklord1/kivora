'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useCallback, useEffect } from 'react';

const FolderPanel = dynamic(
  () => import('@/components/folders/FolderPanel').then((mod) => mod.FolderPanel),
  { ssr: false, loading: () => <div style={{ width: 320, borderRight: '1px solid var(--border-1)', background: 'var(--panel)', minHeight: '100%' }} /> },
);
const WorkspacePanel = dynamic(
  () => import('@/components/workspace/WorkspacePanel').then((mod) => mod.WorkspacePanel),
  {
    ssr: false,
    loading: () => (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-3)' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border-2)', borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite' }} />
        <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>Loading workspace…</p>
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
  const [selectedFolder,     setSelectedFolder]     = useState<string | null>(null);
  const [selectedTopic,      setSelectedTopic]      = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [selectedTopicName,  setSelectedTopicName]  = useState('');
  const [folderCollapsed,    setFolderCollapsed]    = useState(false);
  const [refreshKey,         setRefreshKey]         = useState(0);
  const [filesRefreshKey,    setFilesRefreshKey]    = useState(0);
  const [reportsOpen,        setReportsOpen]        = useState(false);

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

  // Called when FolderPanel uploads a file — tells WorkspacePanel to reload
  const handleFilesChanged = useCallback(() => {
    setFilesRefreshKey(k => k + 1);
  }, []);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  return (
    <div className="workspace-root" style={{ height: 'calc(100dvh - 40px)', position: 'relative' }}>
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
    </div>
  );
}
