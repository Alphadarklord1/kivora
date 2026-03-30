'use client';

import styles from '@/app/(dashboard)/coach/page.module.css';

interface WorkspaceFile {
  id: string;
  name: string;
  mimeType: string | null;
  fileSize: number | null;
  localBlobId: string | null;
  folderId: string;
  createdAt: string;
}

interface AssignmentFileBannerProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  filePanelOpen: 'upload' | 'workspace' | null;
  fileLoading: boolean;
  fileName: string;
  fileWords: number;
  fileError: string;
  wsSearch: string;
  wsLoading: boolean;
  wsPicking: string | null;
  filteredWsFiles: WorkspaceFile[];
  onTogglePanel: (panel: 'upload' | 'workspace') => void;
  onFileChange: (file: File | null) => void;
  onWsSearchChange: (value: string) => void;
  onPickWorkspaceFile: (file: WorkspaceFile) => void;
  onClearFile: () => void;
}

export function AssignmentFileBanner({
  fileInputRef,
  filePanelOpen,
  fileLoading,
  fileName,
  fileWords,
  fileError,
  wsSearch,
  wsLoading,
  wsPicking,
  filteredWsFiles,
  onTogglePanel,
  onFileChange,
  onWsSearchChange,
  onPickWorkspaceFile,
  onClearFile,
}: AssignmentFileBannerProps) {
  return (
    <div className={styles.fileInputBanner}>
      <div className={styles.fileInputRow}>
        <span className={styles.fileInputLabel}>Source file</span>
        <div className={styles.fileInputBtns}>
          <button
            className={`${styles.btnSecondary} ${filePanelOpen === 'upload' ? styles.segBtnActive : ''}`}
            onClick={() => onTogglePanel('upload')}
          >
            Upload
          </button>
          <button
            className={`${styles.btnSecondary} ${filePanelOpen === 'workspace' ? styles.segBtnActive : ''}`}
            onClick={() => onTogglePanel('workspace')}
          >
            Workspace
          </button>
        </div>
        {fileName && (
          <div className={styles.fileLoadedChip}>
            <span>{fileName}</span>
            {fileWords > 0 && <span className={styles.wordCountPill}>{fileWords.toLocaleString()} words</span>}
            <button className={styles.iconBtn} onClick={onClearFile} title="Remove file">Remove</button>
          </div>
        )}
      </div>

      {filePanelOpen === 'upload' && (
        <div
          className={styles.fileDropZone}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void onFileChange(event.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className={styles.hiddenInput}
            onChange={(event) => void onFileChange(event.target.files?.[0] ?? null)}
          />
          {fileLoading ? <span>⏳ Extracting text…</span> : <span>Click to choose or drag a PDF / Word file here</span>}
        </div>
      )}

      {filePanelOpen === 'workspace' && (
        <div className={styles.wsPicker}>
          <input
            className={styles.textInput}
            placeholder="Search workspace files…"
            value={wsSearch}
            onChange={(event) => onWsSearchChange(event.target.value)}
          />
          {wsLoading ? (
            <p className={styles.wsPickerHint}>Loading workspace files…</p>
          ) : filteredWsFiles.length === 0 ? (
            <p className={styles.wsPickerHint}>No files with local content found in Workspace.</p>
          ) : (
            <div className={styles.wsFileList}>
              {filteredWsFiles.map((file) => (
                <button
                  key={file.id}
                  className={styles.wsFileRow}
                  disabled={!!wsPicking}
                  onClick={() => void onPickWorkspaceFile(file)}
                >
                  <span className={styles.wsFileName}>{file.name}</span>
                  {wsPicking === file.id ? <span className={styles.wsFileLoading}>Loading…</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {fileError && <div className={styles.errorNote} style={{ marginTop: '0.5rem' }}>⚠️ {fileError}</div>}
    </div>
  );
}
