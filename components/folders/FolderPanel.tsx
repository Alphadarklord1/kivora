'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/providers/ToastProvider';
import { idbStore } from '@/lib/idb';
import { v4 as uuidv4 } from 'uuid';
import { deleteLocalFilesForFolder, deleteLocalFilesForTopic, upsertLocalFile } from '@/lib/files/local-files';

interface Topic  { id: string; name: string; folderId: string; }
interface Folder { id: string; name: string; expanded: boolean; topics: Topic[]; }

export interface FolderPanelProps {
  onSelect: (folderId: string | null, folderName: string, topicId: string | null, topicName: string) => void;
  selectedFolder: string | null;
  selectedTopic:  string | null;
  refreshKey: number;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onFilesChanged?: () => void;
}

const LS_KEY = 'kivora_local_folders';
const localLoad  = (): Folder[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; } };
const localSave  = (f: Folder[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch {} };

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg';

export function FolderPanel({
  onSelect, selectedFolder, selectedTopic, refreshKey, collapsed = false, onToggleCollapse, onFilesChanged,
}: FolderPanelProps) {
  const { toast } = useToast();
  const [folders,        setFolders]        = useState<Folder[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName,  setNewFolderName]  = useState('');
  const [addTopicFor,    setAddTopicFor]    = useState<string | null>(null);
  const [newTopicName,   setNewTopicName]   = useState('');
  const [uploadingFor,   setUploadingFor]   = useState<{ folderId: string; topicId?: string } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dragOverSidebar,setDragOverSidebar]= useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const topicInputRef  = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/folders');
      if (res.ok) setFolders(await res.json());
      else setFolders(localLoad());
    } catch { setFolders(localLoad()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const f = await res.json();
        setFolders(p => [...p, { ...f, topics: [] }]);
        toast('Folder created', 'success');
      } else throw new Error();
    } catch {
      const f: Folder = { id: uuidv4(), name, expanded: true, topics: [] };
      const updated = [...folders, f];
      localSave(updated); setFolders(updated);
      toast('Folder saved locally', 'info');
    }
    setNewFolderName(''); setCreatingFolder(false);
  }

  async function createTopic(folderId: string, e: React.FormEvent) {
    e.preventDefault();
    const name = newTopicName.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/folders/${folderId}/topics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const t = await res.json();
        setFolders(p => p.map(f => f.id === folderId ? { ...f, topics: [...f.topics, t] } : f));
        toast('Topic created', 'success');
      } else throw new Error();
    } catch {
      const t: Topic = { id: uuidv4(), name, folderId };
      setFolders(p => { const u = p.map(f => f.id === folderId ? { ...f, topics: [...f.topics, t] } : f); localSave(u); return u; });
      toast('Topic saved locally', 'info');
    }
    setNewTopicName(''); setAddTopicFor(null);
  }

  async function deleteFolder(e: React.MouseEvent, folder: Folder) {
    e.stopPropagation();
    if (!confirm(`Delete "${folder.name}" and all its content?`)) return;
    try { await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' }); } catch {}
    deleteLocalFilesForFolder(folder.id);
    const updated = folders.filter(f => f.id !== folder.id);
    localSave(updated); setFolders(updated);
    if (selectedFolder === folder.id) onSelect(null, '', null, '');
    toast('Folder deleted', 'info');
  }

  async function deleteTopic(e: React.MouseEvent, folder: Folder, topic: Topic) {
    e.stopPropagation();
    if (!confirm(`Delete topic "${topic.name}"?`)) return;
    try { await fetch(`/api/folders/${folder.id}/topics/${topic.id}`, { method: 'DELETE' }); } catch {}
    deleteLocalFilesForTopic(folder.id, topic.id);
    const updated = folders.map(f => f.id === folder.id ? { ...f, topics: f.topics.filter(t => t.id !== topic.id) } : f);
    localSave(updated); setFolders(updated);
    if (selectedTopic === topic.id) onSelect(folder.id, folder.name, null, '');
    toast('Topic deleted', 'info');
  }

  // Core upload logic shared by both click-upload and drag-drop
  async function uploadFile(file: File, folderId: string, topicId?: string) {
    const blobId = uuidv4();
    await idbStore.put(blobId, { blob: file, name: file.name, type: file.type, size: file.size });
    const fileId = uuidv4();
    const createdAt = new Date().toISOString();
    const localFilePath = (file as File & { path?: string }).path || undefined;
    try {
      const res = await fetch('/api/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId, topicId: topicId ?? null,
          id: fileId,
          name: file.name, type: 'upload', localBlobId: blobId, mimeType: file.type, fileSize: file.size,
          localFilePath,
        }),
      });
      if (res.ok) {
        toast(`"${file.name}" uploaded`, 'success');
      } else {
        upsertLocalFile({
          id: fileId,
          folderId,
          topicId: topicId ?? null,
          name: file.name,
          type: 'upload',
          localBlobId: blobId || undefined,
          localFilePath,
          mimeType: file.type || undefined,
          fileSize: file.size || undefined,
          createdAt,
        });
        toast(`"${file.name}" saved locally`, 'info');
      }
    } catch {
      upsertLocalFile({
        id: fileId,
        folderId,
        topicId: topicId ?? null,
        name: file.name,
        type: 'upload',
        localBlobId: blobId || undefined,
        localFilePath,
        mimeType: file.type || undefined,
        fileSize: file.size || undefined,
        createdAt,
      });
      toast(`"${file.name}" saved locally`, 'info');
    }
    const folder = folders.find(f => f.id === folderId);
    onSelect(folderId, folder?.name ?? '', topicId ?? null, '');
    onFilesChanged?.();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingFor) return;
    await uploadFile(file, uploadingFor.folderId, uploadingFor.topicId);
    e.target.value = ''; setUploadingFor(null);
  }

  // Drag-and-drop onto a folder row
  function onDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverFolder(folderId);
  }

  function onDragLeave(folderId: string) {
    setDragOverFolder(d => d === folderId ? null : d);
  }

  async function onDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault();
    setDragOverFolder(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Expand the folder after drop
    setFolders(p => p.map(f => f.id === folderId ? { ...f, expanded: true } : f));
    await uploadFile(file, folderId);
  }

  // Drag over the whole sidebar (fallback to selected folder)
  function onSidebarDragOver(e: React.DragEvent) {
    if (!selectedFolder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverSidebar(true);
  }

  async function onSidebarDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverSidebar(false);
    if (!selectedFolder) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file, selectedFolder, selectedTopic ?? undefined);
  }

  /* ── Collapsed view ─────────────────────────────────────────────────── */
  if (collapsed) {
    return (
      <div className="folder-sidebar collapsed" style={{ alignItems: 'center', padding: '10px 6px', gap: 6 }}>
        <button className="btn-icon" onClick={onToggleCollapse} title="Expand sidebar">→</button>
        <div className="divider" style={{ margin: '4px 0', width: '100%' }} />
        {folders.map(f => (
          <button
            key={f.id}
            className={`btn-icon${selectedFolder === f.id ? ' active' : ''}`}
            title={f.name}
            onClick={() => onSelect(f.id, f.name, null, '')}
            style={{ fontSize: 17 }}
          >📁</button>
        ))}
      </div>
    );
  }

  /* ── Full view ──────────────────────────────────────────────────────── */
  return (
    <div
      className={`folder-sidebar${dragOverSidebar ? ' drag-over' : ''}`}
      onDragOver={onSidebarDragOver}
      onDragLeave={() => setDragOverSidebar(false)}
      onDrop={onSidebarDrop}
    >
      {/* Header */}
      <div className="panel-header">
        <span className="panel-title">📚 Folders</span>
        <button className="btn-icon" title="New folder"
          onClick={() => { setCreatingFolder(c => !c); setTimeout(() => folderInputRef.current?.focus(), 40); }}>
          ＋
        </button>
        <button className="btn-icon" title="Collapse" onClick={onToggleCollapse}>←</button>
      </div>

      {/* New-folder form */}
      {creatingFolder && (
        <form onSubmit={createFolder} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
          <input ref={folderInputRef} type="text" placeholder="Folder name…"
            value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            style={{ fontSize: 'var(--text-sm)', padding: '6px 10px' }} autoFocus />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Create</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreatingFolder(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Drag hint */}
      {folders.length > 0 && (
        <div style={{ padding: '4px 12px 2px', fontSize: 'var(--text-xs)', color: 'var(--text-3)', userSelect: 'none' }}>
          Drop files onto a folder to upload
        </div>
      )}

      {/* Tree */}
      <div className="panel-body">
        {loading ? (
          [1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 32, marginBottom: 4, borderRadius: 8 }} />)
        ) : folders.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 12px' }}>
            <div className="empty-icon">📂</div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', textAlign: 'center' }}>
              No folders yet.<br />Click <strong>＋</strong> to create one.
            </p>
          </div>
        ) : (
          folders.map(folder => (
            <div key={folder.id}>
              {/* Folder row — droppable */}
              <div
                className={`folder-row${selectedFolder === folder.id && !selectedTopic ? ' active' : ''}${dragOverFolder === folder.id ? ' drag-over' : ''}`}
                onClick={() => { onSelect(folder.id, folder.name, null, ''); setFolders(p => p.map(f => f.id === folder.id ? { ...f, expanded: !f.expanded } : f)); }}
                onDragOver={e => onDragOver(e, folder.id)}
                onDragLeave={() => onDragLeave(folder.id)}
                onDrop={e => onDrop(e, folder.id)}
              >
                <span style={{ fontSize: 11, opacity: 0.55, flexShrink: 0 }}>{folder.expanded ? '▾' : '▸'}</span>
                <span style={{ fontSize: 15, flexShrink: 0 }}>
                  {dragOverFolder === folder.id ? '📥' : '📁'}
                </span>
                <span style={{ flex: 1, fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.name}
                  {dragOverFolder === folder.id && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginLeft: 6 }}>Drop to upload</span>
                  )}
                </span>
                <div className="folder-actions">
                  <button className="btn-icon" style={{ width: 22, height: 22 }} title="Upload file"
                    onClick={e => { e.stopPropagation(); setUploadingFor({ folderId: folder.id }); fileInputRef.current?.click(); }}>
                    ↑
                  </button>
                  <button className="btn-icon" style={{ width: 22, height: 22 }} title="Add topic"
                    onClick={e => { e.stopPropagation(); setAddTopicFor(folder.id); setTimeout(() => topicInputRef.current?.focus(), 40); }}>
                    ＋
                  </button>
                  <button className="btn-icon" style={{ width: 22, height: 22, color: 'var(--danger)' }} title="Delete"
                    onClick={e => deleteFolder(e, folder)}>
                    ✕
                  </button>
                </div>
              </div>

              {/* Add-topic form */}
              {addTopicFor === folder.id && (
                <form onSubmit={e => createTopic(folder.id, e)} style={{ padding: '4px 6px 4px 28px' }}>
                  <input ref={topicInputRef} type="text" placeholder="Topic name…"
                    value={newTopicName} onChange={e => setNewTopicName(e.target.value)}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    onBlur={() => { if (!newTopicName.trim()) setAddTopicFor(null); }} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Add</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddTopicFor(null)}>✕</button>
                  </div>
                </form>
              )}

              {/* Topics */}
              {folder.expanded && folder.topics.map(topic => (
                <div
                  key={topic.id}
                  className={`topic-row${selectedTopic === topic.id ? ' active' : ''}`}
                  onClick={() => onSelect(folder.id, folder.name, topic.id, topic.name)}
                >
                  <span style={{ fontSize: 13 }}>📄</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.name}</span>
                  <div className="topic-actions">
                    <button className="btn-icon" style={{ width: 20, height: 20, color: 'var(--danger)' }} title="Delete topic"
                      onClick={e => deleteTopic(e, folder, topic)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Hidden file picker */}
      <input ref={fileInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={handleFileInputChange} />
    </div>
  );
}
