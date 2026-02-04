'use client';

import { useState, useEffect } from 'react';
import { FolderList } from '@/components/folders/FolderList';

interface FolderItem {
  id: string;
  name: string;
  expanded: boolean;
  sortOrder: number;
  topics: {
    id: string;
    name: string;
    sortOrder: number;
  }[];
}

export function Sidebar() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');

  const fetchFolders = async () => {
    try {
      const res = await fetch('/api/folders');
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName }),
      });

      if (res.ok) {
        setNewFolderName('');
        fetchFolders();
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  return (
    <aside className="panel">
      <div className="panel-header">
        <h2>Folders</h2>
        <p className="sub">Organize your study materials</p>
      </div>
      <div className="panel-body">
        <form onSubmit={handleAddFolder} className="row" style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="New folder name..."
          />
          <button type="submit" className="btn" style={{ marginTop: 0 }}>
            Add
          </button>
        </form>

        {loading ? (
          <div className="empty-state">Loading folders...</div>
        ) : folders.length === 0 ? (
          <div className="empty-state">No folders yet. Create one above!</div>
        ) : (
          <FolderList folders={folders} onUpdate={fetchFolders} />
        )}
      </div>
    </aside>
  );
}
