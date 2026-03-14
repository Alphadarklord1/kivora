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

const LS_KEY    = 'kivora_local_folders';
const localLoad = (): Folder[] => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); } catch { return []; } };
const localSave = (f: Folder[]) => { try { localStorage.setItem(LS_KEY, JSON.stringify(f)); } catch {} };

const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp';

export function FolderPanel({
  onSelect, selectedFolder, selectedTopic, refreshKey, collapsed = false, onToggleCollapse, onFilesChanged,
}: FolderPanelProps) {
  const { toast } = useToast();
  const [folders,         setFolders]         = useState<Folder[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [creatingFolder,  setCreatingFolder]  = useState(false);
  const [newFolderName,   setNewFolderName]   = useState('');
  const [addTopicFor,     setAddTopicFor]     = useState<string | null>(null);
  const [newTopicName,    setNewTopicName]    = useState('');
  const [uploadingFor,    setUploadingFor]    = useState<{ folderId: string; topicId?: string } | null>(null);
  const [dragOverFolder,  setDragOverFolder]  = useState<string | null>(null);
  const [dragOverSidebar, setDragOverSidebar] = useState(false);
  const [renamingFolder,  setRenamingFolder]  = useState<string | null>(null);
  const [renamingTopic,   setRenamingTopic]   = useState<string | null>(null);
  const [renameValue,     setRenameValue]     = useState('');

  const folderInputRef = useRef<HTMLInputElement>(null);
  const topicInputRef  = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const renameRef      = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    function handleCreateFolderRequest() {
      if (collapsed) onToggleCollapse?.();
      setCreatingFolder(true);
      setTimeout(() => folderInputRef.current?.focus(), 80);
    }

    window.addEventListener('kivora:create-folder', handleCreateFolderRequest);
    return () => window.removeEventListener('kivora:create-folder', handleCreateFolderRequest);
  }, [collapsed, onToggleCollapse]);

  // ── Folder CRUD ───────────────────────────────────────────────────────

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/folders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
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

  async function renameFolder(folder: Folder, newName: string) {
    const name = newName.trim();
    if (!name || name === folder.name) { setRenamingFolder(null); return; }
    try {
      await fetch(`/api/folders/${folder.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch {}
    const updated = folders.map(f => f.id === folder.id ? { ...f, name } : f);
    localSave(updated); setFolders(updated);
    if (selectedFolder === folder.id) onSelect(folder.id, name, selectedTopic, '');
    setRenamingFolder(null);
    toast('Renamed', 'success');
  }

  async function deleteFolder(e: React.MouseEvent, folder: Folder) {
    e.stopPropagation();
    if (!confirm(`Delete "${folder.name}" and all its content? This cannot be undone.`)) return;
    try { await fetch(`/api/folders/${folder.id}`, { method: 'DELETE' }); } catch {}
    deleteLocalFilesForFolder(folder.id);
    const updated = folders.filter(f => f.id !== folder.id);
    localSave(updated); setFolders(updated);
    if (selectedFolder === folder.id) onSelect(null, '', null, '');
    toast('Folder deleted', 'info');
  }

  // ── Topic CRUD ────────────────────────────────────────────────────────

  async function createTopic(folderId: string, e: React.FormEvent) {
    e.preventDefault();
    const name = newTopicName.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/folders/${folderId}/topics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const t = await res.json();
        setFolders(p => p.map(f => f.id === folderId ? { ...f, topics: [...f.topics, t] } : f));
        toast('Topic created', 'success');
      } else throw new Error();
    } catch {
      const t: Topic = { id: uuidv4(), name, folderId };
      setFolders(p => {
        const u = p.map(f => f.id === folderId ? { ...f, topics: [...f.topics, t] } : f);
        localSave(u); return u;
      });
      toast('Topic saved locally', 'info');
    }
    setNewTopicName(''); setAddTopicFor(null);
  }

  async function renameTopic(topic: Topic, folder: Folder, newName: string) {
    const name = newName.trim();
    if (!name || name === topic.name) { setRenamingTopic(null); return; }
    try {
      await fetch(`/api/folders/${folder.id}/topics/${topic.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch {}
    const updated = folders.map(f =>
      f.id === folder.id
        ? { ...f, topics: f.topics.map(t => t.id === topic.id ? { ...t, name } : t) }
        : f
    );
    localSave(updated); setFolders(updated);
    if (selectedTopic === topic.id) onSelect(folder.id, folder.name, topic.id, name);
    setRenamingTopic(null);
    toast('Renamed', 'success');
  }

  async function deleteTopic(e: React.MouseEvent, folder: Folder, topic: Topic) {
    e.stopPropagation();
    if (!confirm(`Delete topic "${topic.name}"?`)) return;
    try { await fetch(`/api/folders/${folder.id}/topics/${topic.id}`, { method: 'DELETE' }); } catch {}
    deleteLocalFilesForTopic(folder.id, topic.id);
    const updated = folders.map(f => f.id === folder.id
      ? { ...f, topics: f.topics.filter(t => t.id !== topic.id) } : f);
    localSave(updated); setFolders(updated);
    if (selectedTopic === topic.id) onSelect(folder.id, folder.name, null, '');
    toast('Topic deleted', 'info');
  }

  // ── Upload ────────────────────────────────────────────────────────────

  async function uploadFile(file: File, folderId: string, topicId?: string) {
    const blobId    = uuidv4();
    const fileId    = uuidv4();
    const createdAt = new Date().toISOString();
    const localFilePath = (file as File & { path?: string }).path ?? undefined;

    await idbStore.put(blobId, { blob: file, name: file.name, type: file.type, size: file.size });
    const local = {
      id: fileId, folderId, topicId: topicId ?? null,
      name: file.name, type: 'upload', localBlobId: blobId,
      localFilePath, mimeType: file.type, fileSize: file.size, createdAt,
    };
    try {
      const res = await fetch('/api/files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local),
      });
      toast(res.ok ? `"${file.name}" uploaded` : `"${file.name}" saved locally`, res.ok ? 'success' : 'info');
      if (!res.ok) upsertLocalFile(local);
    } catch {
      upsertLocalFile(local);
      toast(`"${file.name}" saved locally`, 'info');
    }
    const folder = folders.find(f => f.id === folderId);
    onSelect(folderId, folder?.name ?? '', topicId ?? null, '');
    onFilesChanged?.();
  }

  async function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !uploadingFor) return;
    for (const file of Array.from(files)) {
      await uploadFile(file, uploadingFor.folderId, uploadingFor.topicId);
    }
    e.target.value = ''; setUploadingFor(null);
  }

  // ── Drag-and-drop ─────────────────────────────────────────────────────

  function onDragOver(e: React.DragEvent, folderId: string) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    setDragOverFolder(folderId);
  }

  function onDragLeave(folderId: string) {
    setDragOverFolder(d => d === folderId ? null : d);
  }

  async function onDrop(e: React.DragEvent, folderId: string) {
    e.preventDefault(); setDragOverFolder(null);
    setFolders(p => p.map(f => f.id === folderId ? { ...f, expanded: true } : f));
    for (const file of Array.from(e.dataTransfer.files)) {
      await uploadFile(file, folderId);
    }
  }

  function onSidebarDragOver(e: React.DragEvent) {
    if (!selectedFolder) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    setDragOverSidebar(true);
  }

  async function onSidebarDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOverSidebar(false);
    if (!selectedFolder) return;
    for (const file of Array.from(e.dataTransfer.files)) {
      await uploadFile(file, selectedFolder, selectedTopic ?? undefined);
    }
  }

  // ── Search filter ─────────────────────────────────────────────────────

  const filteredFolders = search.trim()
    ? folders
        .map(f => ({
          ...f,
          topics: f.topics.filter(t => t.name.toLowerCase().includes(search.toLowerCase())),
          _nameMatch: f.name.toLowerCase().includes(search.toLowerCase()),
        }))
        .filter(f => f._nameMatch || f.topics.length > 0)
    : folders;

  // ── Collapsed view ────────────────────────────────────────────────────

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
            style={{ fontSize: 17 }}>
            📁
          </button>
        ))}
        <button className="btn-icon" style={{ marginTop: 'auto' }}
          title="New folder"
          onClick={() => { onToggleCollapse?.(); setCreatingFolder(true); }}>
          ＋
        </button>
      </div>
    );
  }

  // ── Full view ─────────────────────────────────────────────────────────

  return (
    <div
      className={`folder-sidebar${dragOverSidebar ? ' drag-over' : ''}`}
      onDragOver={onSidebarDragOver}
      onDragLeave={() => setDragOverSidebar(false)}
      onDrop={onSidebarDrop}
    >
      {/* Header */}
      <div className="panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span className="panel-title">Folders</span>
          <span
            className="badge"
            style={{
              flexShrink: 0,
              minWidth: 22,
              paddingInline: 8,
              justifyContent: 'center',
              borderRadius: 999,
              fontSize: 11,
            }}
          >
            {folders.length}
          </span>
        </div>
        <button className="btn-icon" title="New folder"
          onClick={() => {
            setCreatingFolder(c => !c);
            setTimeout(() => folderInputRef.current?.focus(), 50);
          }}>＋</button>
        <button className="btn-icon" title="Collapse sidebar" onClick={onToggleCollapse}>←</button>
      </div>

      {/* Search — shows when 3+ folders exist */}
      {folders.length >= 3 && (
        <div style={{ padding: '6px 10px 0' }}>
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setSearch('')}
            style={{
              width: '100%', fontSize: 'var(--text-xs)',
              padding: '5px 10px', borderRadius: 8,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
        </div>
      )}

      {/* New-folder form */}
      {creatingFolder && (
        <form onSubmit={createFolder}
          style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
          <input
            ref={folderInputRef}
            type="text"
            placeholder="Folder name…"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
            }}
            style={{ fontSize: 'var(--text-sm)', padding: '6px 10px' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Create</button>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Hint */}
      {!search && folders.length > 0 && !creatingFolder && (
        <div style={{ padding: '3px 12px', fontSize: 10, color: 'var(--text-3)', userSelect: 'none' }}>
          Drop files onto folders · Double-click to rename
        </div>
      )}

      {/* Tree */}
      <div className="panel-body">
        {loading ? (
          [1,2,3].map(i => (
            <div key={i} className="skeleton" style={{ height: 32, marginBottom: 4, borderRadius: 8 }} />
          ))
        ) : filteredFolders.length === 0 ? (
          search ? (
            <div className="empty-state" style={{ padding: '24px 12px' }}>
              <div className="empty-icon" style={{ fontSize: '1.6rem' }}>🔍</div>
              <p style={{ fontSize: 'var(--text-xs)', textAlign: 'center' }}>
                No results for &ldquo;{search}&rdquo;
              </p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
                onClick={() => setSearch('')}>Clear search</button>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '32px 12px' }}>
              <div className="empty-icon">📂</div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', textAlign: 'center' }}>
                No folders yet.<br />Click <strong>＋</strong> to create one.
              </p>
            </div>
          )
        ) : (
          filteredFolders.map(folder => (
            <div key={folder.id}>

              {/* Folder row */}
              <div
                className={`folder-row${selectedFolder === folder.id && !selectedTopic ? ' active' : ''}${dragOverFolder === folder.id ? ' drag-over' : ''}`}
                onClick={() => {
                  if (renamingFolder === folder.id) return;
                  onSelect(folder.id, folder.name, null, '');
                  setFolders(p => p.map(f => f.id === folder.id ? { ...f, expanded: !f.expanded } : f));
                }}
                onDragOver={e => onDragOver(e, folder.id)}
                onDragLeave={() => onDragLeave(folder.id)}
                onDrop={e => onDrop(e, folder.id)}
                onDoubleClick={e => {
                  e.stopPropagation();
                  setRenamingFolder(folder.id);
                  setRenameValue(folder.name);
                  setTimeout(() => renameRef.current?.select(), 30);
                }}
              >
                <span style={{ fontSize: 11, opacity: 0.5, flexShrink: 0, userSelect: 'none' }}>
                  {folder.expanded ? '▾' : '▸'}
                </span>
                <span style={{ fontSize: 15, flexShrink: 0 }}>
                  {dragOverFolder === folder.id ? '📥' : '📁'}
                </span>

                {renamingFolder === folder.id ? (
                  <input
                    ref={renameRef}
                    className="rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => renameFolder(folder, renameValue)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); renameFolder(folder, renameValue); }
                      if (e.key === 'Escape') setRenamingFolder(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span style={{
                    flex: 1, fontSize: 'var(--text-sm)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {folder.name}
                    {dragOverFolder === folder.id && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--accent)', marginLeft: 6 }}>
                        Drop to upload
                      </span>
                    )}
                    {folder.topics.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 6, fontWeight: 400 }}>
                        {folder.topics.length}
                      </span>
                    )}
                  </span>
                )}

                <div className="folder-actions">
                  <button className="btn-icon" style={{ width: 22, height: 22 }} title="Upload file(s)"
                    onClick={e => {
                      e.stopPropagation();
                      setUploadingFor({ folderId: folder.id });
                      fileInputRef.current?.click();
                    }}>↑</button>
                  <button className="btn-icon" style={{ width: 22, height: 22 }} title="Add topic"
                    onClick={e => {
                      e.stopPropagation();
                      setAddTopicFor(folder.id);
                      setFolders(p => p.map(f => f.id === folder.id ? { ...f, expanded: true } : f));
                      setTimeout(() => topicInputRef.current?.focus(), 40);
                    }}>＋</button>
                  <button className="btn-icon" style={{ width: 22, height: 22, color: 'var(--danger)' }} title="Delete folder"
                    onClick={e => deleteFolder(e, folder)}>✕</button>
                </div>
              </div>

              {/* New-topic form */}
              {addTopicFor === folder.id && (
                <form onSubmit={e => createTopic(folder.id, e)}
                  style={{ padding: '4px 6px 6px 28px' }}>
                  <input
                    ref={topicInputRef}
                    type="text"
                    placeholder="Topic name…"
                    value={newTopicName}
                    onChange={e => setNewTopicName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setAddTopicFor(null); setNewTopicName(''); }
                    }}
                    style={{ fontSize: 'var(--text-xs)', padding: '4px 8px' }}
                    onBlur={() => { if (!newTopicName.trim()) setAddTopicFor(null); }}
                  />
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Add</button>
                    <button type="button" className="btn btn-ghost btn-sm"
                      onClick={() => { setAddTopicFor(null); setNewTopicName(''); }}>✕</button>
                  </div>
                </form>
              )}

              {/* Topics */}
              {folder.expanded && folder.topics.map(topic => (
                <div
                  key={topic.id}
                  className={`topic-row${selectedTopic === topic.id ? ' active' : ''}`}
                  onClick={() => { if (renamingTopic !== topic.id) onSelect(folder.id, folder.name, topic.id, topic.name); }}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    setRenamingTopic(topic.id);
                    setRenameValue(topic.name);
                    setTimeout(() => renameRef.current?.select(), 30);
                  }}
                >
                  <span style={{ fontSize: 12, flexShrink: 0 }}>📄</span>

                  {renamingTopic === topic.id ? (
                    <input
                      ref={renameRef}
                      className="rename-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => renameTopic(topic, folder, renameValue)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); renameTopic(topic, folder, renameValue); }
                        if (e.key === 'Escape') setRenamingTopic(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {topic.name}
                    </span>
                  )}

                  <div className="topic-actions">
                    <button className="btn-icon" style={{ width: 20, height: 20 }} title="Upload to topic"
                      onClick={e => {
                        e.stopPropagation();
                        setUploadingFor({ folderId: folder.id, topicId: topic.id });
                        fileInputRef.current?.click();
                      }}>↑</button>
                    <button className="btn-icon" style={{ width: 20, height: 20, color: 'var(--danger)' }} title="Delete topic"
                      onClick={e => deleteTopic(e, folder, topic)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      {folders.length > 0 && !search && (
        <div style={{
          padding: '5px 12px', borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-3)', userSelect: 'none', flexShrink: 0,
        }}>
          {folders.length} folder{folders.length !== 1 ? 's' : ''} ·{' '}
          {folders.reduce((n, f) => n + f.topics.length, 0)} topic{folders.reduce((n, f) => n + f.topics.length, 0) !== 1 ? 's' : ''}
        </div>
      )}

      {/* Hidden multi-file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
    </div>
  );
}
