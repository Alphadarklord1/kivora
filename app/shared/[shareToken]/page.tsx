'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface SharedContent {
  share: {
    id: string;
    permission: string;
    createdAt: string;
    expiresAt: string | null;
  };
  owner: {
    name: string;
    image: string | null;
  };
  contentType: 'file' | 'folder' | 'topic' | 'library';
  contentName: string;
  content: Record<string, unknown>;
}

export default function SharedContentPage() {
  const params = useParams();
  const shareToken = params.shareToken as string;

  const [data, setData] = useState<SharedContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) return;

    fetch(`/api/share/${shareToken}`)
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Failed to load shared content');
          });
        }
        return res.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [shareToken]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getContentTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      file: '📄',
      folder: '📁',
      topic: '📂',
      library: '📚',
    };
    return icons[type] || '📄';
  };

  const getFileTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      upload: '📎',
      pdf: '📕',
      assignment: '📝',
      summarize: '📋',
      mcq: '✅',
      quiz: '🧠',
      pop: '⚡',
      notes: '📝',
      math: '🧮',
    };
    return icons[type] || '📄';
  };

  if (loading) {
    return (
      <div className="shared-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading shared content...</p>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-page">
        <div className="error-container">
          <div className="error-icon">🔗</div>
          <h1>Unable to Load Content</h1>
          <p>{error}</p>
          <Link href="/login" className="btn">
            Sign in to StudyPilot
          </Link>
        </div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="shared-page">
      {/* Header */}
      <header className="shared-header">
        <Link href="/" className="logo">
          <span className="logo-icon">📘</span>
          <span className="logo-text">StudyPilot</span>
        </Link>
        <Link href="/login" className="btn secondary">
          Sign In
        </Link>
      </header>

      {/* Content */}
      <main className="shared-content">
        <div className="content-card">
          {/* Shared by info */}
          <div className="shared-by">
            <div className="owner-avatar">
              {data.owner.image ? (
                <img src={data.owner.image} alt={data.owner.name} />
              ) : (
                <span>{data.owner.name.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="owner-info">
              <span className="owner-name">{data.owner.name}</span>
              <span className="share-meta">
                Shared on {formatDate(data.share.createdAt)}
                {data.share.expiresAt && (
                  <> · Expires {formatDate(data.share.expiresAt)}</>
                )}
              </span>
            </div>
          </div>

          {/* Content header */}
          <div className="content-header">
            <span className="content-icon">{getContentTypeIcon(data.contentType)}</span>
            <div>
              <h1>{data.contentName}</h1>
              <span className="content-type">{data.contentType}</span>
            </div>
          </div>

          {/* Content body */}
          <div className="content-body">
            {data.contentType === 'file' && (
              <FileContent content={data.content} getFileTypeIcon={getFileTypeIcon} />
            )}
            {data.contentType === 'folder' && (
              <FolderContent content={data.content} getFileTypeIcon={getFileTypeIcon} />
            )}
            {data.contentType === 'topic' && (
              <TopicContent content={data.content} getFileTypeIcon={getFileTypeIcon} />
            )}
            {data.contentType === 'library' && (
              <LibraryContent content={data.content} />
            )}
          </div>

          {/* Actions */}
          <div className="content-actions">
            <button
              className="btn secondary"
              onClick={() => {
                const text = data.contentType === 'library'
                  ? (data.content.content as string)
                  : JSON.stringify(data.content, null, 2);
                navigator.clipboard.writeText(text);
              }}
            >
              📋 Copy Content
            </button>
            <Link href="/register" className="btn">
              Create Your Own
            </Link>
          </div>
        </div>

        {/* CTA */}
        <div className="cta-card">
          <h2>Want to create your own study materials?</h2>
          <p>
            StudyPilot helps you generate MCQs, summaries, quizzes, and notes from any content.
          </p>
          <Link href="/register" className="btn">
            Get Started Free
          </Link>
        </div>
      </main>

      <style jsx>{styles}</style>
    </div>
  );
}

function FileContent({ content, getFileTypeIcon }: { content: Record<string, unknown>; getFileTypeIcon: (type: string) => string }) {
  const fileContent = content.content as string | null;
  const fileType = content.type as string;
  const hasBlob = content.hasBlob as boolean | undefined;

  return (
    <div className="file-content">
      <div className="file-meta">
        <span>{getFileTypeIcon(fileType)} {fileType}</span>
        {hasBlob && (
          <span className="blob-notice">
            This file has an attachment that&apos;s only available on the owner&apos;s device.
          </span>
        )}
      </div>
      {fileContent ? (
        <pre className="content-preview">{fileContent}</pre>
      ) : (
        <p className="no-content">No text content available for this file.</p>
      )}
    </div>
  );
}

function FolderContent({ content, getFileTypeIcon }: { content: Record<string, unknown>; getFileTypeIcon: (type: string) => string }) {
  const topics = content.topics as Array<{ id: string; name: string }>;
  const files = content.files as Array<{ id: string; name: string; type: string; content: string | null }>;

  return (
    <div className="folder-content">
      {topics && topics.length > 0 && (
        <div className="folder-section">
          <h3>Subfolders ({topics.length})</h3>
          <ul className="item-list">
            {topics.map(topic => (
              <li key={topic.id}>
                <span className="item-icon">📂</span>
                <span className="item-name">{topic.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {files && files.length > 0 && (
        <div className="folder-section">
          <h3>Files ({files.length})</h3>
          <ul className="item-list">
            {files.map(file => (
              <li key={file.id}>
                <span className="item-icon">{getFileTypeIcon(file.type)}</span>
                <span className="item-name">{file.name}</span>
                {file.content && (
                  <details className="file-details">
                    <summary>View content</summary>
                    <pre>{file.content}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TopicContent({ content, getFileTypeIcon }: { content: Record<string, unknown>; getFileTypeIcon: (type: string) => string }) {
  const files = content.files as Array<{ id: string; name: string; type: string; content: string | null }>;

  return (
    <div className="topic-content">
      {files && files.length > 0 ? (
        <ul className="item-list">
          {files.map(file => (
            <li key={file.id}>
              <span className="item-icon">{getFileTypeIcon(file.type)}</span>
              <span className="item-name">{file.name}</span>
              {file.content && (
                <details className="file-details">
                  <summary>View content</summary>
                  <pre>{file.content}</pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="no-content">This subfolder is empty.</p>
      )}
    </div>
  );
}

function LibraryContent({ content }: { content: Record<string, unknown> }) {
  const mode = content.mode as string;
  const textContent = content.content as string;

  const getModeLabel = (mode: string) => {
    const labels: Record<string, string> = {
      assignment: 'Assignment',
      summarize: 'Summary',
      mcq: 'Multiple Choice Questions',
      quiz: 'Quiz',
      pop: 'Pop Quiz',
      notes: 'Study Notes',
      math: 'Math Solution',
    };
    return labels[mode] || mode;
  };

  return (
    <div className="library-content">
      <div className="library-badge">{getModeLabel(mode)}</div>
      <pre className="content-preview">{textContent}</pre>
    </div>
  );
}

const styles = `
  .shared-page {
    min-height: 100vh;
    background: var(--bg-base);
  }

  .loading-container,
  .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
    padding: var(--space-4);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-subtle);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: var(--space-4);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-icon {
    font-size: 64px;
    margin-bottom: var(--space-4);
  }

  .error-container h1 {
    font-size: var(--font-xl);
    margin-bottom: var(--space-2);
  }

  .error-container p {
    color: var(--text-muted);
    margin-bottom: var(--space-6);
  }

  .shared-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    text-decoration: none;
    color: var(--text-primary);
    font-weight: 700;
    font-size: var(--font-lg);
  }

  .logo-icon {
    font-size: 24px;
  }

  .shared-content {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  .content-card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
  }

  .shared-by {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--border-subtle);
    margin-bottom: var(--space-4);
  }

  .owner-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    overflow: hidden;
  }

  .owner-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .owner-info {
    display: flex;
    flex-direction: column;
  }

  .owner-name {
    font-weight: 600;
  }

  .share-meta {
    font-size: var(--font-meta);
    color: var(--text-muted);
  }

  .content-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .content-icon {
    font-size: 48px;
  }

  .content-header h1 {
    font-size: var(--font-xl);
    margin: 0;
  }

  .content-type {
    font-size: var(--font-meta);
    color: var(--text-muted);
    text-transform: capitalize;
  }

  .content-body {
    margin-bottom: var(--space-4);
  }

  .content-preview {
    background: var(--bg-inset);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    font-family: "SF Mono", Consolas, monospace;
    font-size: var(--font-meta);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 400px;
    overflow-y: auto;
  }

  .no-content {
    color: var(--text-muted);
    font-style: italic;
    padding: var(--space-4);
    text-align: center;
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    font-size: var(--font-meta);
    color: var(--text-secondary);
  }

  .blob-notice {
    font-size: var(--font-tiny);
    color: var(--text-muted);
    font-style: italic;
  }

  .folder-section {
    margin-bottom: var(--space-4);
  }

  .folder-section h3 {
    font-size: var(--font-meta);
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: var(--space-2);
  }

  .item-list {
    list-style: none;
  }

  .item-list li {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .item-list li:last-child {
    border-bottom: none;
  }

  .item-icon {
    flex-shrink: 0;
  }

  .item-name {
    flex: 1;
    word-break: break-word;
  }

  .file-details {
    width: 100%;
    margin-top: var(--space-2);
  }

  .file-details summary {
    cursor: pointer;
    color: var(--primary);
    font-size: var(--font-meta);
  }

  .file-details pre {
    margin-top: var(--space-2);
    background: var(--bg-inset);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-tiny);
    max-height: 200px;
    overflow-y: auto;
  }

  .library-badge {
    display: inline-block;
    padding: var(--space-1) var(--space-3);
    background: var(--primary-muted);
    color: var(--primary-text);
    border-radius: var(--radius-full);
    font-size: var(--font-meta);
    font-weight: 500;
    margin-bottom: var(--space-3);
  }

  .content-actions {
    display: flex;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }

  .cta-card {
    background: var(--primary-muted);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    text-align: center;
  }

  .cta-card h2 {
    font-size: var(--font-lg);
    margin-bottom: var(--space-2);
  }

  .cta-card p {
    color: var(--text-secondary);
    margin-bottom: var(--space-4);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-meta);
    font-weight: 500;
    border-radius: var(--radius-md);
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s;
    background: var(--primary);
    color: white;
  }

  .btn:hover {
    background: var(--primary-hover);
  }

  .btn.secondary {
    background: var(--bg-inset);
    color: var(--text-primary);
  }

  .btn.secondary:hover {
    background: var(--bg-hover);
  }

  @media (max-width: 600px) {
    .shared-content {
      padding: var(--space-4);
    }

    .content-card {
      padding: var(--space-4);
    }

    .content-actions {
      flex-direction: column;
    }
  }
`;
