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
    <div className="workspace-shell">
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
      </div>

      <style jsx>{`
        .workspace-shell {
          position: relative;
          padding: var(--space-4);
          background: radial-gradient(circle at 10% 10%, rgba(37, 99, 235, 0.06), transparent 45%),
            radial-gradient(circle at 80% 0%, rgba(99, 102, 241, 0.05), transparent 40%);
          border-radius: 24px;
          min-height: calc(100vh - 120px);
          min-height: calc(100dvh - 120px);
        }

        .workspace-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: var(--space-4);
          height: 100%;
        }

        @media (max-width: 1023px) and (min-width: 768px) {
          .workspace-layout {
            grid-template-columns: 260px 1fr;
            gap: var(--space-3);
          }
        }

        @media (max-width: 767px) {
          .workspace-shell {
            padding: var(--space-3);
            min-height: auto;
          }

          .workspace-layout {
            grid-template-columns: 1fr;
            height: auto;
          }
        }
      `}</style>
    </div>
  );
}
