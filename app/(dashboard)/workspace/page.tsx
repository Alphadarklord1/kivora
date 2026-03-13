'use client';

import { useState, useCallback } from 'react';
import { FolderPanel } from '@/components/folders/FolderPanel';
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel';

export default function WorkspacePage() {
  const [selectedFolder,     setSelectedFolder]     = useState<string | null>(null);
  const [selectedTopic,      setSelectedTopic]      = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [selectedTopicName,  setSelectedTopicName]  = useState('');
  const [folderCollapsed,    setFolderCollapsed]    = useState(false);
  const [refreshKey,         setRefreshKey]         = useState(0);
  const [filesRefreshKey,    setFilesRefreshKey]    = useState(0);

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
    <div className="workspace-root" style={{ height: 'calc(100dvh - 40px)' }}>
      <FolderPanel
        onSelect={handleSelect}
        selectedFolder={selectedFolder}
        selectedTopic={selectedTopic}
        refreshKey={refreshKey}
        collapsed={folderCollapsed}
        onToggleCollapse={() => setFolderCollapsed(c => !c)}
        onFilesChanged={handleFilesChanged}
      />
      <WorkspacePanel
        selectedFolder={selectedFolder}
        selectedTopic={selectedTopic}
        selectedFolderName={selectedFolderName}
        selectedTopicName={selectedTopicName}
        onRefresh={handleRefresh}
        filesRefreshKey={filesRefreshKey}
      />
    </div>
  );
}
