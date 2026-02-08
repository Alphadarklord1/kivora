'use client';

import { useState } from 'react';
import { Modal, Button } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { useToastHelpers } from '@/components/ui/Toast';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  resourceType: 'file' | 'folder' | 'topic' | 'library';
  resourceId: string;
  resourceName: string;
}

type ShareType = 'link' | 'user';
type Permission = 'view' | 'edit';

export function ShareDialog({
  isOpen,
  onClose,
  resourceType,
  resourceId,
  resourceName,
}: ShareDialogProps) {
  const toast = useToastHelpers();
  const [shareType, setShareType] = useState<ShareType>('link');
  const [permission, setPermission] = useState<Permission>('view');
  const [email, setEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleShare = async () => {
    if (shareType === 'user' && !email) {
      toast.error('Email required', 'Please enter the email address to share with');
      return;
    }

    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        shareType,
        permission,
      };

      // Set the resource ID based on type
      if (resourceType === 'file') body.fileId = resourceId;
      if (resourceType === 'folder') body.folderId = resourceId;
      if (resourceType === 'topic') body.topicId = resourceId;
      if (resourceType === 'library') body.libraryItemId = resourceId;

      if (shareType === 'user') {
        body.sharedWithEmail = email;
      }

      if (expiresInDays) {
        body.expiresInDays = parseInt(expiresInDays, 10);
      }

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create share');
      }

      const data = await res.json();

      if (data.shareUrl) {
        setShareUrl(data.shareUrl);
        toast.success('Share link created');
      } else {
        toast.success('Shared successfully', `Shared with ${email}`);
        onClose();
      }
    } catch (error) {
      toast.error('Failed to share', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard');
    }
  };

  const handleClose = () => {
    setShareUrl(null);
    setEmail('');
    setExpiresInDays('');
    setShareType('link');
    setPermission('view');
    onClose();
  };

  const getResourceIcon = () => {
    const icons = {
      file: '📄',
      folder: '📁',
      topic: '📂',
      library: '📚',
    };
    return icons[resourceType];
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Share ${resourceType}`}
      size="md"
    >
      <div className="share-dialog">
        {/* Resource info */}
        <div className="resource-info">
          <span className="resource-icon">{getResourceIcon()}</span>
          <span className="resource-name">{resourceName}</span>
        </div>

        {shareUrl ? (
          // Share link created
          <div className="share-result">
            <div className="share-link-container">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="share-link-input"
              />
              <Button onClick={handleCopyLink}>
                Copy Link
              </Button>
            </div>
            <p className="share-hint">
              {shareType === 'user'
                ? 'Only invited users can open this link.'
                : `Anyone with this link can ${permission === 'view' ? 'view' : 'edit'} this ${resourceType}.`}
              {expiresInDays && ` Link expires in ${expiresInDays} days.`}
            </p>
            <div className="share-actions">
              <Button variant="secondary" onClick={() => setShareUrl(null)}>
                Create Another
              </Button>
              <Button onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          // Share form
          <>
            {/* Share type tabs */}
            <div className="share-tabs">
              <button
                className={`share-tab ${shareType === 'link' ? 'active' : ''}`}
                onClick={() => setShareType('link')}
              >
                <span className="tab-icon">🔗</span>
                Share Link
              </button>
              <button
                className={`share-tab ${shareType === 'user' ? 'active' : ''}`}
                onClick={() => setShareType('user')}
              >
                <span className="tab-icon">👤</span>
                Share with User
              </button>
            </div>

            {/* Share form */}
            <div className="share-form">
              {shareType === 'user' && (
                <Input
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email to share with..."
                />
              )}

              <Select
                label="Permission"
                value={permission}
                onChange={(e) => setPermission(e.target.value as Permission)}
                options={[
                  { value: 'view', label: 'Can view' },
                  { value: 'edit', label: 'Can edit' },
                ]}
              />

              {shareType === 'link' && (
                <Select
                  label="Link expiration"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  options={[
                    { value: '', label: 'Never expires' },
                    { value: '1', label: '1 day' },
                    { value: '7', label: '7 days' },
                    { value: '30', label: '30 days' },
                    { value: '90', label: '90 days' },
                  ]}
                />
              )}
            </div>

            {/* Actions */}
            <div className="share-actions">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleShare} disabled={loading}>
                {loading ? 'Creating...' : shareType === 'link' ? 'Create Link' : 'Share'}
              </Button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .share-dialog {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .resource-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .resource-icon {
          font-size: 24px;
        }

        .resource-name {
          font-weight: 500;
          word-break: break-word;
        }

        .share-tabs {
          display: flex;
          gap: var(--space-2);
          padding: var(--space-1);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .share-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border: none;
          background: transparent;
          border-radius: var(--radius-sm);
          font-size: var(--font-meta);
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }

        .share-tab:hover {
          color: var(--text-primary);
        }

        .share-tab.active {
          background: var(--bg-surface);
          color: var(--text-primary);
          box-shadow: var(--shadow-sm);
        }

        .tab-icon {
          font-size: 16px;
        }

        .share-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .share-result {
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .share-link-container {
          display: flex;
          gap: var(--space-2);
        }

        .share-link-input {
          flex: 1;
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          font-size: var(--font-meta);
          background: var(--bg-inset);
          color: var(--text-primary);
        }

        .share-hint {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .share-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-2);
          padding-top: var(--space-4);
          border-top: 1px solid var(--border-subtle);
        }
      `}</style>
    </Modal>
  );
}

// Export a hook for easy use
export function useShareDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{
    resourceType: 'file' | 'folder' | 'topic' | 'library';
    resourceId: string;
    resourceName: string;
  } | null>(null);

  const openShare = (
    resourceType: 'file' | 'folder' | 'topic' | 'library',
    resourceId: string,
    resourceName: string
  ) => {
    setShareTarget({ resourceType, resourceId, resourceName });
    setIsOpen(true);
  };

  const closeShare = () => {
    setIsOpen(false);
    setShareTarget(null);
  };

  return {
    isOpen,
    shareTarget,
    openShare,
    closeShare,
  };
}
