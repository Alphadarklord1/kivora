// Folder types
export interface Folder {
  id: string;
  userId: string;
  name: string;
  expanded: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  topics?: Topic[];
}

export interface Topic {
  id: string;
  folderId: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// File types
export type FileType = 'upload' | 'pdf' | 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes';

export interface FileItem {
  id: string;
  userId: string;
  folderId: string;
  topicId: string | null;
  name: string;
  type: FileType;
  content: string | null;
  localBlobId: string | null;
  mimeType: string | null;
  fileSize: number | null;
  liked: boolean;
  pinned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Library types
export type ToolMode = 'assignment' | 'summarize' | 'mcq' | 'quiz' | 'pop' | 'notes';

export interface LibraryItem {
  id: string;
  userId: string;
  mode: ToolMode;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// Settings types
export interface UserSettings {
  id: string;
  userId: string;
  theme: 'light' | 'dark';
  fontSize: string;
  lineHeight: string;
  density: 'compact' | 'normal' | 'comfortable';
}

// Share types
export type ShareType = 'link' | 'user';
export type SharePermission = 'view' | 'edit';

export interface Share {
  id: string;
  ownerId: string;
  folderId?: string | null;
  topicId?: string | null;
  fileId?: string | null;
  libraryItemId?: string | null;
  shareType: ShareType;
  shareToken?: string | null;
  sharedWithUserId?: string | null;
  permission: SharePermission;
  expiresAt?: Date | null;
  createdAt: Date;
}

// IndexedDB Blob payload
export interface BlobPayload {
  blob: Blob;
  name: string;
  type: string;
  size: number;
}

// API response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
