'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/useI18n';

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

type ShareTab = 'received' | 'sent';
type ShareFilter = 'all' | 'file' | 'folder' | 'topic' | 'library';

// Strings not covered by GLOBAL_TRANSLATIONS — component-specific
const LOCAL_AR: Record<string, string> = {
  'Manage content shared with you and by you': 'إدارة المحتوى الذي تمت مشاركته معك ومن طرفك',
  'Search by name or email…': 'ابحث بالاسم أو البريد الإلكتروني...',
  'Nothing shared with you yet': 'لا يوجد شيء تمت مشاركته معك بعد',
  "You haven't shared anything yet": 'لم تشارك أي شيء بعد',
  'When someone shares content with you, it will appear here.': 'عندما يشارك معك أحد محتوى، سيظهر هنا.',
  'Start sharing from the Workspace, Library, or Folders panel.': 'ابدأ المشاركة من لوحة مساحة العمل أو المكتبة أو المجلدات.',
  'Failed to load shares': 'تعذر تحميل المشاركات',
  'Failed to revoke share': 'تعذر إلغاء المشاركة',
  'Revoke this share?': 'إلغاء هذه المشاركة؟',
  Shared: 'تمت المشاركة',
  'Loading shares…': 'جاري تحميل المشاركات...',
  'Link copied': 'تم نسخ الرابط',
  'Share from workspace': 'شارك من مساحة العمل',
  'Open shared hub': 'افتح مركز المشاركات',
  'Items shared with you': 'العناصر التي تمت مشاركتها معك',
  'Items you shared': 'العناصر التي شاركتها',
  'Link shares': 'مشاركات الروابط',
  'Direct shares': 'مشاركات مباشرة',
  'Expiring soon': 'تنتهي قريبًا',
  'matching results': 'نتائج مطابقة',
  'Filtered by': 'تمت التصفية حسب',
};

const SHARE_FILTERS: ShareFilter[] = ['all', 'file', 'folder', 'topic', 'library'];

const RESOURCE_ICON: Record<Exclude<ShareFilter, 'all'>, string> = {
  file: '📄',
  folder: '📁',
  topic: '📂',
  library: '📚',
};

export default function SharedWithMePage() {
  const { t, formatDate, locale } = useI18n(LOCAL_AR);

  const [shares, setShares]       = useState<Share[]>([]);
  const [owners, setOwners]       = useState<Record<string, Owner>>({});
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<ShareTab>('received');
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState<ShareFilter>('all');
  const [errorMsg, setErrorMsg]   = useState('');
  const [copyMsg, setCopyMsg]     = useState('');

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const type = activeTab === 'received' ? 'shared' : 'owned';
      const res = await fetch(`/api/share?type=${type}`, { credentials: 'include' });
      if (res.ok) {
        const data: Share[] = await res.json();
        setShares(data);
        setErrorMsg('');

        if (activeTab === 'received') {
          const ids = [...new Set(data.map(s => s.ownerId))];
          const ownerMap: Record<string, Owner> = {};
          await Promise.all(ids.map(async id => {
            try {
              const r = await fetch(`/api/users/${id}`, { credentials: 'include' });
              if (r.ok) ownerMap[id as string] = await r.json();
            } catch { /* ignore */ }
          }));
          setOwners(ownerMap);
        }
      } else {
        const payload = (await res.json()) as ApiErrorLike;
        setShares([]);
        setErrorMsg(payload.reason || payload.error || t('Failed to load shares'));
      }
    } catch {
      setErrorMsg(t('Failed to load shares'));
    } finally {
      setLoading(false);
    }
  }, [activeTab, t]);

  useEffect(() => { void fetchShares(); }, [fetchShares]);

  async function handleRevoke(id: string) {
    if (!confirm(t('Revoke this share?'))) return;
    try {
      const res = await fetch(`/api/share?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setShares(prev => prev.filter(s => s.id !== id));
      } else {
        const payload = (await res.json()) as ApiErrorLike;
        setErrorMsg(payload.reason || payload.error || t('Failed to revoke share'));
      }
    } catch {
      setErrorMsg(t('Failed to revoke share'));
    }
  }

  function copyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopyMsg(t('Link copied'));
      setTimeout(() => setCopyMsg(''), 2000);
    });
  }

  function isExpired(expiresAt: string | null) {
    return !!expiresAt && new Date(expiresAt) < new Date();
  }

  const filtered = useMemo(() => shares.filter(s => {
    if (typeFilter !== 'all' && s.resourceType !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      s.resourceName.toLowerCase().includes(q) ||
      (s.sharedWithEmail ?? '').toLowerCase().includes(q) ||
      (owners[s.ownerId]?.email ?? '').toLowerCase().includes(q) ||
      (owners[s.ownerId]?.name ?? '').toLowerCase().includes(q)
    );
  }), [owners, search, shares, typeFilter]);

  const typeLabels: Record<ShareFilter, string> = {
    all: t('All'), file: t('File'), folder: t('Folder'), topic: t('Topic'), library: t('Library'),
  };

  const shareStats = useMemo(() => {
    const activeShares = shares.filter((share) => !isExpired(share.expiresAt));
    const expiringSoon = activeShares.filter((share) => {
      if (!share.expiresAt) return false;
      const expiry = new Date(share.expiresAt).getTime();
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      return expiry - Date.now() <= threeDays;
    });
    return {
      total: shares.length,
      linkShares: shares.filter((share) => share.shareType === 'link').length,
      directShares: shares.filter((share) => share.shareType === 'user').length,
      expiringSoon: expiringSoon.length,
    };
  }, [shares]);

  const statCards = [
    {
      icon: activeTab === 'received' ? '📥' : '📤',
      value: shareStats.total,
      label: activeTab === 'received' ? t('Items shared with you') : t('Items you shared'),
    },
    { icon: '🔗', value: shareStats.linkShares, label: t('Link shares') },
    { icon: '👥', value: shareStats.directShares, label: t('Direct shares') },
    { icon: '⏳', value: shareStats.expiringSoon, label: t('Expiring soon') },
  ];

  const emptyState = activeTab === 'received'
    ? {
        icon: '📥',
        title: t('Nothing shared with you yet'),
        body: t('When someone shares content with you, it will appear here.'),
      }
    : {
        icon: '📤',
        title: t("You haven't shared anything yet"),
        body: t('Start sharing from the Workspace, Library, or Folders panel.'),
      };

  return (
    <div className="sp-page" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* ── Header ── */}
      <div className="sp-page-header">
        <div>
          <h1 className="sp-page-title">{t('Sharing')}</h1>
          <p className="sp-page-sub">{t('Manage content shared with you and by you')}</p>
        </div>
        <div className="sp-header-actions">
          <Link href="/workspace" className="sp-btn sp-btn-primary">{t('Share from workspace')}</Link>
          <Link href="/shared" className="sp-btn sp-btn-ghost">{t('Open shared hub')}</Link>
        </div>
      </div>

      <div className="sp-stats">
        {statCards.map((card) => (
          <div key={card.label} className="sp-stat-card">
            <span className="sp-stat-icon">{card.icon}</span>
            <div>
              <strong>{card.value}</strong>
              <span>{card.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Error banner ── */}
      {errorMsg && (
        <div className="sp-banner sp-banner-error" role="alert">
          <span>⚠️</span>
          <span>{errorMsg}</span>
          <button className="sp-banner-close" onClick={() => setErrorMsg('')}>✕</button>
        </div>
      )}

      {/* ── Copy toast ── */}
      {copyMsg && (
        <div className="sp-toast" role="status">{copyMsg}</div>
      )}

      {/* ── Toolbar ── */}
      <div className="sp-toolbar">
        <input
          className="sp-search"
          type="search"
          placeholder={t('Search by name or email…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="sp-filter-pills">
          {SHARE_FILTERS.map(type => (
            <button
              key={type}
              className={`sp-pill${typeFilter === type ? ' active' : ''}`}
              onClick={() => setTypeFilter(type)}
            >
              {type !== 'all' && <span>{RESOURCE_ICON[type]}</span>}
              {typeLabels[type]}
            </button>
          ))}
        </div>
        <div className="sp-toolbar-meta">
          <span>{filtered.length} {t('matching results')}</span>
          {typeFilter !== 'all' && <span>{t('Filtered by')} {typeLabels[typeFilter]}</span>}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sp-tabs">
        <button
          className={`sp-tab${activeTab === 'received' ? ' active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          📥 {t('Shared with me')}
        </button>
        <button
          className={`sp-tab${activeTab === 'sent' ? ' active' : ''}`}
          onClick={() => setActiveTab('sent')}
        >
          📤 {t('My shares')}
        </button>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="sp-loading">
          <div className="sp-spinner" />
          <span>{t('Loading shares…')}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-icon">{emptyState.icon}</div>
          <h3 className="sp-empty-title">{emptyState.title}</h3>
          <p className="sp-empty-body">{emptyState.body}</p>
          {activeTab === 'sent' && (
            <Link href="/workspace" className="sp-btn sp-btn-primary" style={{ display: 'inline-block', marginTop: 12 }}>
              {t('Workspace')} →
            </Link>
          )}
        </div>
      ) : (
        <div className="sp-shares-list">
          {filtered.map(share => {
            const expired = isExpired(share.expiresAt);
            const perm = share.permission === 'edit' ? `✏️ ${t('Can edit')}` : `👁 ${t('View only')}`;
            const owner = owners[share.ownerId];
            return (
              <div key={share.id} className={`sp-card${expired ? ' expired' : ''}`}>
                <div className="sp-card-icon" data-type={share.resourceType}>
                  {RESOURCE_ICON[share.resourceType as keyof typeof RESOURCE_ICON] ?? '📄'}
                </div>
                <div className="sp-card-body">
                  <div className="sp-card-name">{share.resourceName}</div>
                  <div className="sp-card-meta">
                    {activeTab === 'received' && owner && (
                      <span className="sp-meta-item">
                        {t('From')}: <strong>{owner.name || owner.email}</strong>
                      </span>
                    )}
                    {activeTab === 'sent' && share.sharedWithEmail && (
                      <span className="sp-meta-item">
                        {t('To')}: <strong>{share.sharedWithEmail}</strong>
                      </span>
                    )}
                    <span className="sp-badge sp-badge-perm">{perm}</span>
                    <span className="sp-meta-item">
                      {t('Shared')} {formatDate(share.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {share.expiresAt && (
                      <span className={`sp-badge${expired ? ' sp-badge-expired' : ' sp-badge-expiry'}`}>
                        {expired
                          ? `⏰ ${t('Expired')}`
                          : `⏳ ${t('Expires')} ${formatDate(share.expiresAt, { month: 'short', day: 'numeric' })}`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="sp-card-actions">
                  {share.shareUrl && !expired && (
                    <>
                      <Link href={share.shareUrl} className="sp-btn sp-btn-ghost sp-btn-sm" target="_blank" rel="noopener noreferrer">
                        {t('Open')}
                      </Link>
                      <button className="sp-btn sp-btn-ghost sp-btn-sm" onClick={() => copyLink(share.shareUrl!)}>
                        📋 {t('Copy Link')}
                      </button>
                    </>
                  )}
                  {activeTab === 'sent' && (
                    <button
                      className="sp-btn sp-btn-ghost sp-btn-sm sp-btn-danger"
                      onClick={() => void handleRevoke(share.id)}
                    >
                      {t('Revoke')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .sp-page { max-width: 1080px; margin: 0 auto; padding: 0 0 60px; }

        .sp-page-header { margin-bottom: 20px; display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
        .sp-page-title  { font-size: var(--text-3xl, 1.75rem); font-weight: 700; margin: 0 0 4px; }
        .sp-page-sub    { color: var(--text-3); font-size: var(--text-sm); margin: 0; }
        .sp-header-actions { display:flex; gap:8px; flex-wrap:wrap; }

        .sp-stats {
          display:grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 18px;
        }
        .sp-stat-card {
          display:flex; align-items:center; gap:12px; padding:14px 16px;
          border-radius: 16px; border: 1px solid var(--border-2);
          background: var(--bg-elevated);
        }
        .sp-stat-icon {
          width: 40px; height: 40px; border-radius: 12px;
          display:flex; align-items:center; justify-content:center;
          background: color-mix(in srgb, var(--accent) 10%, var(--bg-surface));
          font-size: 18px;
        }
        .sp-stat-card strong { display:block; font-size: 20px; line-height: 1; color: var(--text-1); }
        .sp-stat-card span:last-child { display:block; margin-top: 3px; font-size: 12px; color: var(--text-3); }

        /* Banner */
        .sp-banner {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-radius: 10px; margin-bottom: 16px; font-size: var(--text-sm);
        }
        .sp-banner-error {
          background: color-mix(in srgb, var(--danger, #ef4444) 12%, var(--bg-surface));
          border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 30%, transparent);
          color: var(--danger, #ef4444);
        }
        .sp-banner-close { margin-left: auto; background: none; border: none; cursor: pointer; color: inherit; font-size: 14px; }

        /* Toast */
        .sp-toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: var(--bg-elevated); border: 1px solid var(--border-2);
          padding: 8px 20px; border-radius: 999px; font-size: var(--text-sm);
          box-shadow: 0 4px 16px rgba(0,0,0,0.2); z-index: 9999;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

        /* Toolbar */
        .sp-toolbar { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
        .sp-search {
          width: 100%; padding: 9px 14px; border: 1px solid var(--border-2);
          border-radius: 8px; background: var(--bg-surface); color: var(--text-1);
          font-size: var(--text-sm);
        }
        .sp-search::placeholder { color: var(--text-3); }
        .sp-filter-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .sp-toolbar-meta { display:flex; gap:10px; flex-wrap:wrap; font-size:12px; color:var(--text-3); }
        .sp-pill {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border-2);
          background: var(--bg-surface); color: var(--text-2); font-size: 13px; cursor: pointer;
          transition: all 0.15s;
        }
        .sp-pill.active, .sp-pill:hover {
          background: var(--accent); border-color: var(--accent); color: #fff;
        }

        /* Tabs */
        .sp-tabs { display: flex; gap: 6px; margin-bottom: 20px; padding: 4px; background: var(--bg-inset); border-radius: 10px; }
        .sp-tab {
          flex: 1; padding: 9px; border: none; background: transparent; border-radius: 7px;
          font-size: var(--text-sm); font-weight: 500; color: var(--text-2); cursor: pointer; transition: all 0.15s;
        }
        .sp-tab:hover { color: var(--text-1); }
        .sp-tab.active { background: var(--bg-surface); color: var(--text-1); box-shadow: 0 1px 4px rgba(0,0,0,0.12); }

        /* Loading */
        .sp-loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px; color: var(--text-3); }
        .sp-spinner {
          width: 20px; height: 20px; border: 2px solid var(--border-2);
          border-top-color: var(--accent); border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Empty */
        .sp-empty { text-align: center; padding: 60px 20px; border: 1.5px dashed var(--border-2); border-radius: 14px; }
        .sp-empty-icon { font-size: 52px; margin-bottom: 14px; }
        .sp-empty-title { font-size: var(--text-lg); font-weight: 600; margin: 0 0 8px; }
        .sp-empty-body { color: var(--text-3); font-size: var(--text-sm); margin: 0; }

        /* Share cards */
        .sp-shares-list { display: flex; flex-direction: column; gap: 10px; }
        .sp-card {
          display: flex; align-items: center; gap: 14px; padding: 14px 16px;
          background: var(--bg-surface); border: 1px solid var(--border-2);
          border-radius: 12px; transition: border-color 0.15s, box-shadow 0.15s;
        }
        .sp-card:hover { border-color: var(--accent); box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
        .sp-card.expired { opacity: 0.55; }

        .sp-card-icon {
          font-size: 26px; width: 46px; height: 46px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-inset); border-radius: 10px;
        }

        .sp-card-body { flex: 1; min-width: 0; }
        .sp-card-name { font-weight: 600; font-size: var(--text-sm); margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sp-card-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px; color: var(--text-3); }
        .sp-meta-item strong { color: var(--text-2); font-weight: 500; }

        .sp-badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
        .sp-badge-perm { background: color-mix(in srgb, var(--accent) 12%, var(--bg-inset)); color: var(--accent); }
        .sp-badge-expiry { background: color-mix(in srgb, var(--warning, #f59e0b) 12%, var(--bg-inset)); color: var(--warning, #f59e0b); }
        .sp-badge-expired { background: color-mix(in srgb, var(--danger, #ef4444) 12%, var(--bg-inset)); color: var(--danger, #ef4444); }

        /* Buttons */
        .sp-card-actions { display: flex; gap: 6px; flex-shrink: 0; }
        .sp-btn { display: inline-flex; align-items: center; gap: 5px; border-radius: 8px; font-weight: 500; cursor: pointer; text-decoration: none; transition: all 0.15s; }
        .sp-btn-primary { padding: 8px 16px; background: var(--accent); color: #fff; border: none; font-size: var(--text-sm); }
        .sp-btn-primary:hover { opacity: 0.88; }
        .sp-btn-ghost { padding: 6px 12px; background: transparent; border: 1px solid var(--border-2); color: var(--text-2); font-size: 12px; }
        .sp-btn-ghost:hover { background: var(--bg-inset); border-color: var(--border-default); color: var(--text-1); }
        .sp-btn-sm { font-size: 12px; padding: 5px 10px; }
        .sp-btn-danger { color: var(--danger, #ef4444) !important; border-color: color-mix(in srgb, var(--danger, #ef4444) 30%, transparent) !important; }
        .sp-btn-danger:hover { background: color-mix(in srgb, var(--danger, #ef4444) 10%, var(--bg-inset)) !important; }

        @media (max-width: 600px) {
          .sp-stats { grid-template-columns: 1fr 1fr; }
          .sp-card { flex-direction: column; align-items: flex-start; }
          .sp-card-actions { width: 100%; margin-top: 8px; }
          .sp-card-actions .sp-btn { flex: 1; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
