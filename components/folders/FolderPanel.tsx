'use client';

import { useState, useEffect } from 'react';
import { useToastHelpers } from '@/components/ui/Toast';
import { SkeletonFolderTree } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ShareDialog } from '@/components/share';
import { useSettings } from '@/providers/SettingsProvider';

interface Topic {
  id: string;
  name: string;
}

interface Folder {
  id: string;
  name: string;
  expanded: boolean;
  topics: Topic[];
}

interface FolderPanelProps {
  onSelect: (folderId: string | null, folderName: string, topicId: string | null, topicName: string) => void;
  selectedFolder: string | null;
  selectedTopic: string | null;
  refreshKey: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function FolderPanel({ onSelect, selectedFolder, selectedTopic, refreshKey, collapsed = false, onToggleCollapse }: FolderPanelProps) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = (key: string) => {
    const ar: Record<string, string> = {
      'Study Folders': 'مجلدات الدراسة',
      'Organize your study materials': 'نظّم موادك الدراسية',
      folders: 'مجلدات',
      'Toggle folders': 'تبديل المجلدات',
      'New folder name...': 'اسم المجلد الجديد...',
      'Folder created': 'تم إنشاء المجلد',
      'Failed to create folder': 'فشل إنشاء المجلد',
      'Please try again': 'يرجى المحاولة مرة أخرى',
      'Subfolder created': 'تم إنشاء المجلد الفرعي',
      'Failed to create subfolder': 'فشل إنشاء المجلد الفرعي',
      'No subfolders': 'لا توجد مجلدات فرعية',
      'Share folder': 'مشاركة المجلد',
      'Delete folder': 'حذف المجلد',
      'Share subfolder': 'مشاركة المجلد الفرعي',
      'Delete subfolder': 'حذف المجلد الفرعي',
      'New subfolder name...': 'اسم المجلد الفرعي الجديد...',
      'Add a subfolder to store files': 'أضف مجلدًا فرعيًا لحفظ الملفات',
      'Reset Selection': 'إعادة التحديد',
      'Delete this folder and all its contents?': 'حذف هذا المجلد وكل محتوياته؟',
      'Delete this subfolder?': 'حذف هذا المجلد الفرعي؟',
      'No folders yet': 'لا توجد مجلدات بعد',
      'Create a folder to organize your study materials': 'أنشئ مجلدًا لتنظيم موادك الدراسية',
      'Create Folder': 'إنشاء مجلد',
    };
    return isArabic ? (ar[key] || key) : key;
  };

  const toast = useToastHelpers();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [newTopicName, setNewTopicName] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ type: 'folder' | 'topic'; id: string; name: string } | null>(null);

  const handleShareFolder = (folder: Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareTarget({ type: 'folder', id: folder.id, name: folder.name });
    setShareDialogOpen(true);
  };

  const handleShareTopic = (folderId: string, topic: Topic, e: React.MouseEvent) => {
    e.stopPropagation();
    setShareTarget({ type: 'topic', id: topic.id, name: topic.name });
    setShareDialogOpen(true);
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/folders', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFolders(Array.isArray(data) ? data : []);
      } else {
        console.error('Failed to fetch folders:', res.status);
        setFolders([]);
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, [refreshKey]);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || addingFolder) return;

    setAddingFolder(true);
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
        credentials: 'include',
      });

      if (res.ok) {
        setNewFolderName('');
        await fetchFolders();
        toast.success(t('Folder created'));
      } else {
        const error = await res.json();
        toast.error(t('Failed to create folder'), error.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
      toast.error(t('Failed to create folder'), t('Please try again'));
    } finally {
      setAddingFolder(false);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim() || !selectedFolder || addingTopic) return;

    setAddingTopic(true);
    try {
      const res = await fetch(`/api/folders/${selectedFolder}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTopicName.trim() }),
        credentials: 'include',
      });

      if (res.ok) {
        setNewTopicName('');
        await fetchFolders();
        toast.success(t('Subfolder created'));
      } else {
        const error = await res.json();
        toast.error(t('Failed to create subfolder'), error.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Failed to create topic:', error);
      toast.error(t('Failed to create subfolder'), t('Please try again'));
    } finally {
      setAddingTopic(false);
    }
  };

  const toggleFolder = async (folder: Folder) => {
    // Optimistic update
    setFolders(prev => prev.map(f =>
      f.id === folder.id ? { ...f, expanded: !f.expanded } : f
    ));

    try {
      await fetch(`/api/folders/${folder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expanded: !folder.expanded }),
        credentials: 'include',
      });
    } catch (error) {
      console.error('Failed to toggle folder:', error);
      // Revert on error
      setFolders(prev => prev.map(f =>
        f.id === folder.id ? { ...f, expanded: folder.expanded } : f
      ));
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm(t('Delete this folder and all its contents?'))) return;

    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        if (selectedFolder === folderId) {
          onSelect(null, '', null, '');
        }
        await fetchFolders();
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const deleteTopic = async (folderId: string, topicId: string) => {
    if (!confirm(t('Delete this subfolder?'))) return;

    try {
      const res = await fetch(`/api/folders/${folderId}/topics/${topicId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        if (selectedTopic === topicId) {
          const folder = folders.find(f => f.id === folderId);
          onSelect(folderId, folder?.name || '', null, '');
        }
        await fetchFolders();
      }
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  return (
    <aside className={`panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-header">
        <div>
          <h2>{t('Study Folders')}</h2>
          <p className="sub">{t('Organize your study materials')}</p>
        </div>
        <span className="panel-badge">{folders.length} {t('folders')}</span>
        {collapsed && <span className="panel-icon">📁</span>}
        <button className="collapse-btn" onClick={onToggleCollapse} aria-label={t('Toggle folders')}>
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {!collapsed && <div className="panel-body">
        {/* Add Folder Form */}
        <form onSubmit={handleAddFolder} className="add-form">
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={t('New folder name...')}
            disabled={addingFolder}
          />
          <button type="submit" className="btn" disabled={addingFolder || !newFolderName.trim()}>
            {addingFolder ? '...' : '+'}
          </button>
        </form>

        {/* Folder List */}
        {loading ? (
          <SkeletonFolderTree />
        ) : folders.length === 0 ? (
          <EmptyState
            icon="folder"
            title={t('No folders yet')}
            description={t('Create a folder to organize your study materials')}
            action={{
              label: t('Create Folder'),
              onClick: () => document.querySelector<HTMLInputElement>('.add-form input')?.focus(),
            }}
            size="md"
          />
        ) : (
          <div className="folder-list">
            {folders.map((folder) => (
              <div key={folder.id} className="folder-item">
                <div
                  className={`folder ${folder.expanded ? 'expanded' : ''} ${selectedFolder === folder.id && !selectedTopic ? 'active' : ''}`}
                  onClick={() => {
                    onSelect(folder.id, folder.name, null, '');
                    if (!folder.expanded) toggleFolder(folder);
                  }}
                >
                  <span
                    className="expand-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolder(folder);
                    }}
                  >
                    {folder.expanded ? '▼' : '▶'}
                  </span>
                  <span className="folder-name">{folder.name}</span>
                  <button
                    className="icon-btn"
                    onClick={(e) => handleShareFolder(folder, e)}
                    title={t('Share folder')}
                  >
                    🔗
                  </button>
                  <button
                    className="icon-btn danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteFolder(folder.id);
                    }}
                    title={t('Delete folder')}
                  >
                    ×
                  </button>
                </div>

                {folder.expanded && (
                  <div className="topic-list">
                    {folder.topics.length === 0 ? (
                      <div className="empty-topics">{t('No subfolders')}</div>
                    ) : (
                      folder.topics.map((topic) => (
                        <div
                          key={topic.id}
                          className={`topic ${selectedTopic === topic.id ? 'active' : ''}`}
                          onClick={() => onSelect(folder.id, folder.name, topic.id, topic.name)}
                        >
                          <span className="topic-name">{topic.name}</span>
                          <button
                            className="icon-btn"
                            onClick={(e) => handleShareTopic(folder.id, topic, e)}
                            title={t('Share subfolder')}
                          >
                            🔗
                          </button>
                          <button
                            className="icon-btn danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTopic(folder.id, topic.id);
                            }}
                            title={t('Delete subfolder')}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Subfolder Form */}
        {selectedFolder && (
          <>
            <div className="divider" />
            <form onSubmit={handleAddTopic} className="add-form">
              <input
                type="text"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder={t('New subfolder name...')}
                disabled={addingTopic}
              />
              <button type="submit" className="btn secondary" disabled={addingTopic || !newTopicName.trim()}>
                {addingTopic ? '...' : '+'}
              </button>
            </form>
            <p className="hint">{t('Add a subfolder to store files')}</p>
          </>
        )}

        {/* Reset Selection Button */}
        {(selectedFolder || selectedTopic) && (
          <>
            <div className="divider" />
            <button
              className="reset-btn"
              onClick={() => onSelect(null, '', null, '')}
            >
              ↺ {t('Reset Selection')}
            </button>
          </>
        )}
      </div>}

      <style jsx>{`
        .panel {
          position: relative;
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }

        .panel.collapsed {
          align-items: center;
          padding-bottom: var(--space-3);
        }

        .panel.collapsed .panel-header {
          flex-direction: column;
          align-items: center;
        }

        .panel-header {
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-3);
        }

        .panel-header h2 {
          font-size: var(--font-lg);
          font-weight: 600;
          margin: 0;
        }

        .panel-header .sub {
          font-size: var(--font-meta);
          color: var(--text-muted);
          margin: var(--space-1) 0 0;
        }

        .panel-badge {
          padding: 4px 10px;
          border-radius: var(--radius-full);
          background: color-mix(in srgb, var(--primary-muted) 58%, transparent);
          color: var(--primary);
          font-size: var(--font-tiny);
          font-weight: 600;
          white-space: nowrap;
        }

        .panel-icon {
          font-size: 20px;
        }

        .collapse-btn {
          width: 30px;
          height: 30px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-base);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .collapse-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
        }

        .panel-body {
          flex: 1;
          padding: var(--space-4);
          overflow-y: auto;
          background: var(--bg-base);
        }

        .add-form {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-4);
        }

        .add-form input {
          flex: 1;
          height: 38px;
          padding: 0 var(--space-3);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          font-size: var(--font-meta);
          background: var(--bg-surface);
        }

        .add-form input:focus {
          outline: none;
          border-color: var(--primary);
        }

        .add-form .btn {
          height: 38px;
          min-width: 38px;
          padding: 0;
          border-radius: 10px;
        }

        .folder-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .folder-item {
          border-radius: var(--radius-md);
        }

        .folder {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
        }

        .folder:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
        }

        .folder.active {
          background: color-mix(in srgb, var(--primary-muted) 42%, transparent);
          border-color: color-mix(in srgb, var(--primary) 32%, var(--border-subtle));
          color: var(--primary);
        }

        .expand-icon {
          font-size: 10px;
          width: 16px;
          color: var(--text-muted);
        }

        .folder-name {
          flex: 1;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .topic-list {
          margin-left: var(--space-4);
          padding-left: var(--space-1);
          display: grid;
          gap: var(--space-1);
        }

        .topic {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 8px 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
          border: 1px solid transparent;
        }

        .topic:hover {
          background: var(--bg-hover);
          border-color: var(--border-subtle);
        }

        .topic.active {
          background: color-mix(in srgb, var(--primary-muted) 42%, transparent);
          border-color: color-mix(in srgb, var(--primary) 28%, var(--border-subtle));
          color: var(--primary);
        }

        .topic-name {
          flex: 1;
          font-size: var(--font-meta);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty-topics {
          padding: var(--space-2) var(--space-3);
          font-size: var(--font-tiny);
          color: var(--text-muted);
          font-style: italic;
        }

        .icon-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          color: var(--text-muted);
          opacity: 0.55;
          transition: all 0.15s;
        }

        .icon-btn:hover {
          background: var(--bg-inset);
          color: var(--text-primary);
          opacity: 1;
        }

        .icon-btn.danger:hover {
          background: var(--error-muted);
          color: var(--error);
        }

        .divider {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-4) 0;
        }

        .hint {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-top: var(--space-2);
        }

        .empty-state {
          text-align: center;
          padding: var(--space-6);
          color: var(--text-muted);
          font-size: var(--font-meta);
        }

        .reset-btn {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          border-radius: 10px;
          font-size: var(--font-meta);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }

        .reset-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--border-default);
          color: var(--text-primary);
        }

        @media (max-width: 600px) {
          .panel {
            height: auto;
          }

          .panel-header {
            flex-direction: column;
            align-items: flex-start;
          }

          .panel-badge {
            align-self: flex-start;
          }
        }

        .panel.collapsed h2,
        .panel.collapsed .sub,
        .panel.collapsed .panel-badge {
          display: none;
        }

        :global(html[dir='rtl']) .panel {
          direction: rtl;
        }

        :global(html[dir='rtl']) .panel-header,
        :global(html[dir='rtl']) .folder,
        :global(html[dir='rtl']) .topic,
        :global(html[dir='rtl']) .add-form,
        :global(html[dir='rtl']) .reset-btn {
          direction: rtl;
        }

        :global(html[dir='rtl']) .panel-header,
        :global(html[dir='rtl']) .panel-body,
        :global(html[dir='rtl']) .hint,
        :global(html[dir='rtl']) .empty-topics {
          text-align: right;
        }

        :global(html[dir='rtl']) .topic-list {
          margin-left: 0;
          margin-right: var(--space-4);
          padding-left: 0;
          padding-right: var(--space-1);
        }
      `}</style>

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
    </aside>
  );
}
