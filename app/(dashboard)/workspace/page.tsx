'use client';

import { useState, useCallback } from 'react';
import { FolderPanel } from '@/components/folders/FolderPanel';
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel';

export default function WorkspacePage() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [selectedTopicName, setSelectedTopicName] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleFolderSelect = useCallback((folderId: string | null, folderName: string, topicId: string | null, topicName: string) => {
    setSelectedFolder(folderId);
    setSelectedFolderName(folderName);
    setSelectedTopic(topicId);
    setSelectedTopicName(topicName);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="workspace-layout">
      <FolderPanel
        onSelect={handleFolderSelect}
        selectedFolder={selectedFolder}
        selectedTopic={selectedTopic}
        refreshKey={refreshKey}
      />
      <WorkspacePanel
        selectedFolder={selectedFolder}
        selectedTopic={selectedTopic}
        selectedFolderName={selectedFolderName}
        selectedTopicName={selectedTopicName}
        onRefresh={handleRefresh}
      />

      <style jsx>{`
        .workspace-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: var(--space-4);
          height: calc(100vh - 120px);
          height: calc(100dvh - 120px);
        }

        @media (max-width: 1023px) and (min-width: 768px) {
          .workspace-layout {
            grid-template-columns: 260px 1fr;
            gap: var(--space-3);
          }
        }

        @media (max-width: 767px) {
          .workspace-layout {
            grid-template-columns: 1fr;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}
