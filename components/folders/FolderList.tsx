'use client';

import { useState } from 'react';

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

interface FolderListProps {
  folders: Folder[];
  onUpdate: () => void;
}

export function FolderList({ folders, onUpdate }: FolderListProps) {
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState('');
  const [addingTopicTo, setAddingTopicTo] = useState<string | null>(null);

  const toggleFolder = async (folderId: string, currentExpanded: boolean) => {
    try {
      await fetch(`/api/folders/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expanded: !currentExpanded }),
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to toggle folder:', error);
    }
  };

  const deleteFolder = async (folderId: string) => {
    if (!confirm('Delete this folder and all its contents?')) return;

    try {
      await fetch(`/api/folders/${folderId}`, { method: 'DELETE' });
      onUpdate();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const addTopic = async (folderId: string) => {
    if (!newTopicName.trim()) return;

    try {
      await fetch(`/api/folders/${folderId}/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTopicName }),
      });
      setNewTopicName('');
      setAddingTopicTo(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to add topic:', error);
    }
  };

  const deleteTopic = async (folderId: string, topicId: string) => {
    if (!confirm('Delete this topic?')) return;

    try {
      await fetch(`/api/folders/${folderId}/topics/${topicId}`, {
        method: 'DELETE',
      });
      onUpdate();
    } catch (error) {
      console.error('Failed to delete topic:', error);
    }
  };

  return (
    <div className="folder-list">
      {folders.map((folder) => (
        <div key={folder.id}>
          <div
            className={`folder ${activeFolder === folder.id ? 'active' : ''}`}
            onClick={() => {
              setActiveFolder(folder.id);
              setActiveTopic(null);
            }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id, folder.expanded);
              }}
              style={{ cursor: 'pointer' }}
            >
              {folder.expanded ? '▼' : '▶'}
            </span>
            <strong>{folder.name}</strong>
            <div className="folder-actions">
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingTopicTo(addingTopicTo === folder.id ? null : folder.id);
                }}
                title="Add subfolder"
              >
                +
              </button>
              <button
                className="icon-btn danger"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteFolder(folder.id);
                }}
                title="Delete folder"
              >
                🗑
              </button>
            </div>
          </div>

          {folder.expanded && (
            <div className="topic-list">
              {addingTopicTo === folder.id && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="Topic name..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTopic(folder.id);
                      if (e.key === 'Escape') setAddingTopicTo(null);
                    }}
                  />
                  <button
                    className="btn"
                    onClick={() => addTopic(folder.id)}
                    style={{ marginTop: 0 }}
                  >
                    Add
                  </button>
                </div>
              )}

              {folder.topics.map((topic) => (
                <div
                  key={topic.id}
                  className={`topic ${activeTopic === topic.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveFolder(folder.id);
                    setActiveTopic(topic.id);
                  }}
                >
                  <strong>{topic.name}</strong>
                  <div className="topic-actions">
                    <button
                      className="icon-btn danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTopic(folder.id, topic.id);
                      }}
                      title="Delete topic"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
