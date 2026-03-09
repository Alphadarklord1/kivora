'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderPanel } from '@/components/folders/FolderPanel';
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel';

export default function WorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedFolderName, setSelectedFolderName] = useState<string>('');
  const [selectedTopicName, setSelectedTopicName] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [folderCollapsed, setFolderCollapsed] = useState(false);
  const openFileId = searchParams.get('openFileId');

  const handleFolderSelect = useCallback((folderId: string | null, folderName: string, topicId: string | null, topicName: string) => {
    setSelectedFolder(folderId);
    setSelectedFolderName(folderName);
    setSelectedTopic(topicId);
    setSelectedTopicName(topicName);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleOpenFileHandled = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('openFileId')) return;
    params.delete('openFileId');
    const nextUrl = params.toString() ? `/workspace?${params.toString()}` : '/workspace';
    router.replace(nextUrl);
  }, [router, searchParams]);

  return (
    <div className="workspace-shell">
      <div className={`workspace-layout ${folderCollapsed ? 'collapsed' : ''}`}>
        <FolderPanel
          onSelect={handleFolderSelect}
          selectedFolder={selectedFolder}
          selectedTopic={selectedTopic}
          refreshKey={refreshKey}
          collapsed={folderCollapsed}
          onToggleCollapse={() => setFolderCollapsed(prev => !prev)}
        />
        <WorkspacePanel
          selectedFolder={selectedFolder}
          selectedTopic={selectedTopic}
          selectedFolderName={selectedFolderName}
          selectedTopicName={selectedTopicName}
          onRefresh={handleRefresh}
          openFileId={openFileId}
          onOpenFileHandled={handleOpenFileHandled}
        />
      </div>

      <style jsx>{`
        .workspace-shell {
          position: relative;
          padding: var(--space-4);
          background:
            radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 32%),
            radial-gradient(circle at 92% 0%, color-mix(in srgb, var(--hero-accent) 6%, transparent), transparent 28%),
            linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 70%, transparent), transparent 65%);
          border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent);
          box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
          border-radius: 28px;
          min-height: calc(100vh - 120px);
          min-height: calc(100dvh - 120px);
        }

        .workspace-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: var(--space-5);
          height: 100%;
        }

        .workspace-layout.collapsed {
          grid-template-columns: 72px 1fr;
        }

        @media (max-width: 1023px) and (min-width: 768px) {
          .workspace-layout {
            grid-template-columns: 260px 1fr;
            gap: var(--space-3);
          }
          .workspace-layout.collapsed {
            grid-template-columns: 72px 1fr;
          }
        }

        @media (max-width: 767px) {
          .workspace-shell {
            padding: var(--space-3);
            min-height: auto;
            border-radius: 22px;
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
