'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSettings } from '@/providers/SettingsProvider';

interface Share {
  id: string;
  ownerId: string;
  fileId: string | null;
  folderId: string | null;
  topicId: string | null;
  libraryItemId: string | null;
  shareType: string;
  shareToken: string | null;
  permission: string;
  createdAt: string;
  expiresAt: string | null;
  resourceName: string;
  resourceType: string;
  shareUrl: string | null;
  ownerName?: string;
  ownerEmail?: string;
  sharedWithEmail?: string | null;
}

interface Owner {
  name: string;
  email: string;
}

interface ApiErrorLike {
  error?: string;
  reason?: string;
}

export default function SharedWithMePage() {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = (key: string) => {
    const ar: Record<string, string> = {
      Sharing: 'المشاركة',
      'Manage content shared with you and by you': 'إدارة المحتوى الذي تمت مشاركته معك ومن طرفك',
      'Search by name or email...': 'ابحث بالاسم أو البريد الإلكتروني...',
      All: 'الكل',
      File: 'ملف',
      Folder: 'مجلد',
      Topic: 'موضوع',
      Library: 'المكتبة',
      'Shared with me': 'تمت مشاركته معي',
      'My shares': 'مشاركاتي',
      'Loading shares...': 'جاري تحميل المشاركات...',
      'Nothing shared with you yet': 'لا يوجد شيء تمت مشاركته معك بعد',
      'You haven\'t shared anything yet': 'لم تشارك أي شيء بعد',
      'When someone shares content with you, it will appear here.': 'عندما يشارك معك أحد محتوى، سيظهر هنا.',
      'Share files, folders, or library items to see them here.': 'شارك الملفات أو المجلدات أو عناصر المكتبة لتظهر هنا.',
      From: 'من',
      To: 'إلى',
      Shared: 'تمت المشاركة',
      Expired: 'منتهي',
      Expires: 'ينتهي',
      Open: 'فتح',
      'Copy Link': 'نسخ الرابط',
      Revoke: 'إلغاء المشاركة',
      'Can edit': 'يمكن التعديل',
      'View only': 'عرض فقط',
      'Revoke this share? The recipient will no longer have access.': 'إلغاء هذه المشاركة؟ لن يتمكن المستلم من الوصول بعد الآن.',
    };
    return isArabic ? (ar[key] || key) : key;
  };

  const [shares, setShares] = useState<Share[]>([]);
  const [owners, setOwners] = useState<Record<string, Owner>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'file' | 'folder' | 'topic' | 'library'>('all');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const fetchShares = async () => {
    setLoading(true);
    try {
      const type = activeTab === 'received' ? 'shared' : 'owned';
      const res = await fetch(`/api/share?type=${type}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setShares(data);
        setErrorMessage('');

        // Fetch owner info for received shares
        if (activeTab === 'received') {
          const ownerIds = [...new Set(data.map((s: Share) => s.ownerId))];
          const ownerInfo: Record<string, Owner> = {};
          for (const ownerId of ownerIds) {
            try {
              const ownerRes = await fetch(`/api/users/${ownerId}`, { credentials: 'include' });
              if (ownerRes.ok) {
                const ownerData = await ownerRes.json();
                ownerInfo[ownerId as string] = { name: ownerData.name, email: ownerData.email };
              }
            } catch {
              // Ignore errors fetching owner info
            }
          }
          setOwners(ownerInfo);
        }
      } else {
        const payload = (await res.json()) as ApiErrorLike;
        setShares([]);
        setErrorMessage(payload.reason || payload.error || (isArabic ? 'تعذر تحميل المشاركات' : 'Failed to load shares'));
      }
    } catch (error) {
      console.error('Failed to fetch shares:', error);
      setErrorMessage(isArabic ? 'تعذر تحميل المشاركات' : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShares();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm(t('Revoke this share? The recipient will no longer have access.'))) return;
    try {
      const res = await fetch(`/api/share?id=${shareId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        setShares(shares.filter(s => s.id !== shareId));
        setErrorMessage('');
      } else {
        const payload = (await res.json()) as ApiErrorLike;
        setErrorMessage(payload.reason || payload.error || (isArabic ? 'تعذر إلغاء المشاركة' : 'Failed to revoke share'));
      }
    } catch (error) {
      console.error('Failed to revoke share:', error);
      setErrorMessage(isArabic ? 'تعذر إلغاء المشاركة' : 'Failed to revoke share');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getResourceIcon = (type: string) => {
    const icons: Record<string, string> = {
      file: '📄',
      folder: '📁',
      topic: '📂',
      library: '📚',
    };
    return icons[type] || '📄';
  };

  const getPermissionBadge = (permission: string) => {
    return permission === 'edit' ? `✏️ ${t('Can edit')}` : `👁️ ${t('View only')}`;
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
  };

  const filteredShares = shares.filter((share) => {
    if (typeFilter !== 'all' && share.resourceType !== typeFilter) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    return (
      share.resourceName.toLowerCase().includes(query) ||
      (share.sharedWithEmail || '').toLowerCase().includes(query) ||
      (owners[share.ownerId]?.email || '').toLowerCase().includes(query) ||
      (owners[share.ownerId]?.name || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="shared-page">
      <div className="page-header">
        <div>
          <h1>{t('Sharing')}</h1>
          <p>{t('Manage content shared with you and by you')}</p>
        </div>
      </div>

      {errorMessage && <div className="share-error-banner">{errorMessage}</div>}

      <div className="share-toolbar">
        <input
          className="share-search"
          placeholder={t('Search by name or email...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="share-filters">
          {(['all', 'file', 'folder', 'topic', 'library'] as const).map((type) => (
            <button
              key={type}
              className={`filter-pill ${typeFilter === type ? 'active' : ''}`}
              onClick={() => setTypeFilter(type)}
            >
              {type === 'all'
                ? t('All')
                : type === 'file'
                  ? t('File')
                  : type === 'folder'
                    ? t('Folder')
                    : type === 'topic'
                      ? t('Topic')
                      : t('Library')}
            </button>
          ))}
        </div>
      </div>

      <div className="share-tabs">
        <button
          className={`share-tab ${activeTab === 'received' ? 'active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          📥 {t('Shared with me')}
        </button>
        <button
          className={`share-tab ${activeTab === 'sent' ? 'active' : ''}`}
          onClick={() => setActiveTab('sent')}
        >
          📤 {t('My shares')}
        </button>
      </div>

      {loading ? (
        <div className="loading-state">{t('Loading shares...')}</div>
      ) : filteredShares.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{activeTab === 'received' ? '📥' : '📤'}</div>
          <h3>{activeTab === 'received' ? t('Nothing shared with you yet') : t('You haven\'t shared anything yet')}</h3>
          <p>
            {activeTab === 'received'
              ? t('When someone shares content with you, it will appear here.')
              : t('Share files, folders, or library items to see them here.')}
          </p>
        </div>
      ) : (
        <div className="shares-list">
          {filteredShares.map((share) => (
            <div key={share.id} className={`share-card ${isExpired(share.expiresAt) ? 'expired' : ''}`}>
              <div className="share-icon">{getResourceIcon(share.resourceType)}</div>
              <div className="share-info">
                <div className="share-name">{share.resourceName}</div>
                <div className="share-meta">
                  {activeTab === 'received' && owners[share.ownerId] && (
                    <span>{t('From')}: {owners[share.ownerId].name || owners[share.ownerId].email}</span>
                  )}
                  {activeTab === 'sent' && share.sharedWithEmail && (
                    <span>{t('To')}: {share.sharedWithEmail}</span>
                  )}
                  <span>{getPermissionBadge(share.permission)}</span>
                  <span>{t('Shared')} {formatDate(share.createdAt)}</span>
                  {share.expiresAt && (
                    <span className={isExpired(share.expiresAt) ? 'expired-badge' : ''}>
                      {isExpired(share.expiresAt) ? t('Expired') : `${t('Expires')} ${formatDate(share.expiresAt)}`}
                    </span>
                  )}
                </div>
              </div>
              <div className="share-actions">
                {share.shareUrl && !isExpired(share.expiresAt) && (
                  <>
                    <Link href={share.shareUrl} className="btn secondary" target="_blank">
                      {t('Open')}
                    </Link>
                    <button
                      className="btn ghost"
                      onClick={() => handleCopyLink(share.shareUrl!)}
                    >
                      📋 {t('Copy Link')}
                    </button>
                  </>
                )}
                {activeTab === 'sent' && (
                  <button
                    className="btn ghost danger"
                    onClick={() => handleRevokeShare(share.id)}
                  >
                    {t('Revoke')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .shared-page {
          max-width: 900px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: var(--space-6);
        }

        .page-header h1 {
          font-size: var(--font-2xl);
          margin-bottom: var(--space-1);
        }

        .page-header p {
          color: var(--text-muted);
        }

        .share-tabs {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-6);
          padding: var(--space-1);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .share-toolbar {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          margin-bottom: var(--space-4);
        }

        .share-error-banner {
          margin-bottom: var(--space-4);
          padding: var(--space-3) var(--space-4);
          border: 1px solid color-mix(in srgb, var(--danger) 35%, var(--border-default));
          background: color-mix(in srgb, var(--danger) 12%, var(--bg-surface));
          color: var(--danger);
          border-radius: var(--radius-lg);
        }

        .share-search {
          width: 100%;
          padding: var(--space-3) var(--space-4);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-md);
          background: var(--bg-surface);
          color: var(--text-primary);
          font-size: var(--font-meta);
        }

        .share-search::placeholder {
          color: var(--text-muted);
        }

        .share-filters {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-2);
        }

        .filter-pill {
          padding: var(--space-2) var(--space-3);
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          color: var(--text-muted);
          font-size: var(--font-tiny);
          cursor: pointer;
          transition: all 0.15s;
        }

        .filter-pill.active,
        .filter-pill:hover {
          color: var(--text-primary);
          border-color: var(--border-default);
          background: var(--bg-inset);
        }

        .share-tab {
          flex: 1;
          padding: var(--space-3);
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

        .loading-state {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-muted);
        }

        .empty-state {
          text-align: center;
          padding: var(--space-8);
          background: var(--bg-surface);
          border: 1px dashed var(--border-default);
          border-radius: var(--radius-lg);
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: var(--space-4);
        }

        .empty-state h3 {
          margin-bottom: var(--space-2);
        }

        .empty-state p {
          color: var(--text-muted);
        }

        .shares-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .share-card {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-4);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: border-color 0.15s;
        }

        .share-card:hover {
          border-color: var(--border-default);
        }

        .share-card.expired {
          opacity: 0.6;
        }

        .share-icon {
          font-size: 28px;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          flex-shrink: 0;
        }

        .share-info {
          flex: 1;
          min-width: 0;
        }

        .share-name {
          font-weight: 600;
          margin-bottom: var(--space-1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .share-meta {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-3);
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .expired-badge {
          color: var(--error);
        }

        .share-actions {
          display: flex;
          gap: var(--space-2);
          flex-shrink: 0;
        }

        .btn.ghost.danger {
          color: var(--error);
        }

        .btn.ghost.danger:hover {
          background: var(--error-muted);
        }

        @media (max-width: 600px) {
          .share-card {
            flex-direction: column;
            align-items: flex-start;
          }

          .share-actions {
            width: 100%;
            margin-top: var(--space-3);
          }

          .share-actions .btn {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
