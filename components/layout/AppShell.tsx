'use client';

import { useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { VaultStatus } from '@/components/security/VaultStatus';
import { useKeyboardShortcuts, formatShortcut } from '@/hooks/useKeyboardShortcuts';
import { useToastHelpers } from '@/components/ui/Toast';
import { useSettings } from '@/providers/SettingsProvider';
import { QuickSearchPalette, type QuickSearchItem } from '@/components/layout/QuickSearchPalette';
import { ModelSetupWizard } from '@/components/layout/ModelSetupWizard';

interface AppShellProps {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

interface QuickSearchFile {
  id: string;
  name: string;
  type: string;
}

interface QuickSearchLibraryItem {
  id: string;
  mode: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

const navGroups = [
  {
    label: 'Main',
    items: [
      { href: '/workspace', label: 'Workspace', icon: '🎒', activeIcon: '🎒' },
      { href: '/planner', label: 'Planner', icon: '📅', activeIcon: '📅' },
      { href: '/library', label: 'Library', icon: '📚', activeIcon: '📚' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/tools', label: 'Tools', icon: '🛠️', activeIcon: '🛠️' },
      { href: '/analytics', label: 'Analytics', icon: '📊', activeIcon: '📊' },
      { href: '/sharing', label: 'Sharing', icon: '🔗', activeIcon: '🔗' },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

// Mobile bottom nav shows only the 5 most important items
const mobileNavItems = navItems.filter(item =>
  ['/workspace', '/planner', '/tools', '/library', '/analytics'].includes(item.href)
);

// Extra items go in the mobile user menu
const mobileMenuExtras = navItems.filter(item =>
  ['/sharing'].includes(item.href)
);

export function AppShell({ children, user }: AppShellProps) {
  const { settings, updateSettings } = useSettings();
  const isArabic = settings.language === 'ar';
  const t = useCallback((key: string) => {
    const ar: Record<string, string> = {
      Main: 'الرئيسية',
      Tools: 'الأدوات',
      Workspace: 'مساحة العمل',
      Planner: 'المخطط',
      Library: 'المكتبة',
      Analytics: 'التحليلات',
      Sharing: 'المشاركة',
      Rephrase: 'إعادة صياغة',
      Assignment: 'واجب',
      Summarize: 'تلخيص',
      MCQ: 'اختيار متعدد',
      Quiz: 'اختبار',
      Notes: 'ملاحظات',
      Math: 'رياضيات',
      Settings: 'الإعدادات',
      User: 'مستخدم',
      System: 'النظام',
      'Exporting...': 'جارِ التصدير...',
      'Preparing your data for download': 'جارِ تجهيز بياناتك للتنزيل',
      'Export complete': 'اكتمل التصدير',
      'Your data has been downloaded': 'تم تنزيل بياناتك',
      'Export failed': 'فشل التصدير',
      'Could not export your data': 'تعذر تصدير بياناتك',
      'Export Data': 'تصدير البيانات',
      'Sign Out': 'تسجيل الخروج',
      'Keyboard Shortcuts': 'اختصارات لوحة المفاتيح',
      Navigation: 'التنقل',
      General: 'عام',
      'Go to Settings': 'الانتقال إلى الإعدادات',
      'Toggle Sidebar': 'تبديل الشريط الجانبي',
      'Show Shortcuts': 'عرض الاختصارات',
      'Close/Cancel': 'إغلاق/إلغاء',
      Language: 'اللغة',
      Arabic: 'العربية',
      English: 'الإنجليزية',
      'Switch to Arabic': 'التبديل إلى العربية',
      'Switch to English': 'التبديل إلى الإنجليزية',
      'Quick Search': 'بحث سريع',
      'Search pages, files, and library...': 'ابحث في الصفحات والملفات والمكتبة...',
      Pages: 'الصفحات',
      Files: 'الملفات',
      'No results': 'لا توجد نتائج',
      Loading: 'جارٍ التحميل',
      'Type to search pages, files, and library items.': 'اكتب للبحث في الصفحات والملفات وعناصر المكتبة.',
      'Use arrows to navigate, Enter to open, Esc to close': 'استخدم الأسهم للتنقل، Enter للفتح، Esc للإغلاق',
      'Open quick search': 'فتح البحث السريع',
      'Account actions': 'إجراءات الحساب',
    };
    return isArabic ? (ar[key] || key) : key;
  }, [isArabic]);
  const toggleLanguage = () => {
    void updateSettings({ language: isArabic ? 'en' : 'ar' });
  };

  const pathname = usePathname();
  const router = useRouter();
  const toast = useToastHelpers();
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [quickSearchLoading, setQuickSearchLoading] = useState(false);
  const [quickSearchLoaded, setQuickSearchLoaded] = useState(false);
  const [quickSearchFiles, setQuickSearchFiles] = useState<QuickSearchFile[]>([]);
  const [quickSearchLibrary, setQuickSearchLibrary] = useState<QuickSearchLibraryItem[]>([]);
  const [showModelSetupWizard, setShowModelSetupWizard] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setShowUserMenu(false);
  }, [pathname]);

  // Set mounted after initial render (hydration flag - intentional)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') return;
    if (!window.electronAPI?.desktopAI) return;

    let cancelled = false;
    const checkWizard = async () => {
      try {
        const selection = await window.electronAPI?.desktopAI?.getSelection();
        if (!selection || cancelled) return;
        const localCompleted = localStorage.getItem('studypilot_model_setup_done') === 'true';
        if (selection.setupCompleted && !localCompleted) {
          localStorage.setItem('studypilot_model_setup_done', 'true');
        }
        if (selection.wizardEnabled && !selection.setupCompleted && !localCompleted) {
          setShowModelSetupWizard(true);
        }
      } catch {
        // keep dashboard available even if setup check fails
      }
    };

    void checkWizard();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  const handleModelWizardComplete = useCallback(() => {
    localStorage.setItem('studypilot_model_setup_done', 'true');
    setShowModelSetupWizard(false);
  }, []);

  // Keyboard shortcuts
  const handleGoToSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const handleToggleSidebar = useCallback(() => {
    if (!isMobile) {
      setSidebarOpen(prev => !prev);
    }
  }, [isMobile]);

  const handleOpenQuickSearch = useCallback(() => {
    if (!quickSearchLoaded) {
      setQuickSearchLoading(true);
    }
    setQuickSearchOpen(true);
  }, [quickSearchLoaded]);

  const handleCloseQuickSearch = useCallback(() => {
    setQuickSearchOpen(false);
    setQuickSearchQuery('');
  }, []);

  const handleEscape = useCallback(() => {
    if (quickSearchOpen) {
      handleCloseQuickSearch();
      return;
    }
    if (showUserMenu) {
      setShowUserMenu(false);
    }
    if (showShortcutsHelp) {
      setShowShortcutsHelp(false);
    }
  }, [handleCloseQuickSearch, quickSearchOpen, showShortcutsHelp, showUserMenu]);

  const handleShowHelp = useCallback(() => {
    setShowShortcutsHelp(prev => !prev);
  }, []);

  const handleSignOut = useCallback(() => {
    setShowUserMenu(false);
    void signOut({ callbackUrl: '/login' });
  }, []);

  const handleExportData = useCallback(async () => {
    try {
      toast.info(t('Exporting...'), t('Preparing your data for download'));

      // Fetch all user data
      const [foldersRes, filesRes, libraryRes] = await Promise.all([
        fetch('/api/folders', { credentials: 'include' }),
        fetch('/api/files', { credentials: 'include' }),
        fetch('/api/library', { credentials: 'include' }),
      ]);

      const folders = foldersRes.ok ? await foldersRes.json() : [];
      const files = filesRes.ok ? await filesRes.json() : [];
      const library = libraryRes.ok ? await libraryRes.json() : [];

      const exportData = {
        exportedAt: new Date().toISOString(),
        folders,
        files: files.map((f: Record<string, unknown>) => ({
          ...f,
          // Exclude blob references as they're device-local
          localBlobId: undefined,
        })),
        library,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `studyharbor-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(t('Export complete'), t('Your data has been downloaded'));
    } catch (error) {
      console.error('Export failed:', error);
      toast.error(t('Export failed'), t('Could not export your data'));
    }
  }, [toast, t]);

  useEffect(() => {
    if (!quickSearchOpen || quickSearchLoaded || quickSearchLoading) return;

    let cancelled = false;

    Promise.all([
      fetch('/api/files', { credentials: 'include' }).then(async (res) => (res.ok ? res.json() : [])),
      fetch('/api/library', { credentials: 'include' }).then(async (res) => (res.ok ? res.json() : [])),
    ])
      .then(([fileData, libraryData]) => {
        if (cancelled) return;
        setQuickSearchFiles(Array.isArray(fileData) ? fileData : []);
        setQuickSearchLibrary(Array.isArray(libraryData) ? libraryData : []);
        setQuickSearchLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setQuickSearchFiles([]);
        setQuickSearchLibrary([]);
      })
      .finally(() => {
        if (!cancelled) setQuickSearchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quickSearchLoaded, quickSearchLoading, quickSearchOpen]);

  const formatLibraryMode = useCallback((mode: string) => {
    const map: Record<string, string> = {
      assignment: t('Assignment'),
      summarize: t('Summarize'),
      mcq: t('MCQ'),
      quiz: t('Quiz'),
      notes: t('Notes'),
      rephrase: t('Rephrase'),
      math: t('Math'),
    };
    return map[mode] || mode;
  }, [t]);

  const quickSearchItems = useMemo<QuickSearchItem[]>(() => {
    const pageItems: QuickSearchItem[] = [
      { id: 'page-workspace', type: 'page', title: t('Workspace'), subtitle: '/workspace', href: '/workspace', icon: '🎒', searchText: `${t('Workspace')} workspace` },
      { id: 'page-planner', type: 'page', title: t('Planner'), subtitle: '/planner', href: '/planner', icon: '📅', searchText: `${t('Planner')} planner` },
      { id: 'page-library', type: 'page', title: t('Library'), subtitle: '/library', href: '/library', icon: '📚', searchText: `${t('Library')} library` },
      { id: 'page-tools', type: 'page', title: t('Tools'), subtitle: '/tools', href: '/tools', icon: '🛠️', searchText: `${t('Tools')} tools` },
      { id: 'page-analytics', type: 'page', title: t('Analytics'), subtitle: '/analytics', href: '/analytics', icon: '📊', searchText: `${t('Analytics')} analytics` },
      { id: 'page-sharing', type: 'page', title: t('Sharing'), subtitle: '/sharing', href: '/sharing', icon: '🔗', searchText: `${t('Sharing')} sharing` },
      { id: 'page-settings', type: 'page', title: t('Settings'), subtitle: '/settings', href: '/settings', icon: '⚙️', searchText: `${t('Settings')} settings` },
    ];

    const fileItems = quickSearchFiles.slice(0, 25).map<QuickSearchItem>((file) => ({
      id: `file-${file.id}`,
      type: 'file',
      title: file.name,
      subtitle: `${t('Files')} • ${file.type}`,
      href: `/workspace?openFileId=${encodeURIComponent(file.id)}`,
      icon: file.type === 'upload' || file.type === 'pdf' ? '📄' : '📝',
      searchText: `${file.name} ${file.type} ${t('Files')}`,
    }));

    const libraryItems = quickSearchLibrary.slice(0, 25).map<QuickSearchItem>((item) => {
      const meta = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const customTitle = typeof meta.title === 'string' ? meta.title.trim() : '';
      const title = customTitle || `${formatLibraryMode(item.mode)} • ${new Date(item.createdAt).toLocaleDateString()}`;
      const snippet = item.content?.slice(0, 120) || '';
      return {
        id: `library-${item.id}`,
        type: 'library',
        title,
        subtitle: `${t('Library')} • ${formatLibraryMode(item.mode)}`,
        href: `/library?openItemId=${encodeURIComponent(item.id)}&search=${encodeURIComponent(quickSearchQuery.trim())}`,
        icon: '📚',
        searchText: `${title} ${snippet} ${item.mode}`,
      };
    });

    return [...pageItems, ...fileItems, ...libraryItems];
  }, [formatLibraryMode, quickSearchFiles, quickSearchLibrary, quickSearchQuery, t]);

  const handleQuickSearchSelect = useCallback((item: QuickSearchItem) => {
    setQuickSearchOpen(false);
    setQuickSearchQuery('');
    router.push(item.href);
  }, [router]);

  useKeyboardShortcuts([
    { key: 'k', meta: true, handler: handleOpenQuickSearch, description: t('Open quick search') },
    { key: ',', meta: true, handler: handleGoToSettings, description: t('Settings') },
    { key: 'b', meta: true, handler: handleToggleSidebar, description: t('Toggle Sidebar') },
    { key: 'Escape', handler: handleEscape, description: t('Close/Cancel') },
    { key: '/', meta: true, handler: handleShowHelp, description: t('Show Shortcuts') },
  ]);

  const isActive = (href: string) => {
    if (href === '/workspace' && pathname === '/') return true;
    return pathname.startsWith(href);
  };

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  // Don't render layout chrome until client hydration to prevent sidebar flash
  if (!mounted) {
    return (
      <div className="app-shell">
        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className={`app-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          {/* Logo */}
          <div className="sidebar-header">
            <Link href="/workspace" className="logo">
              <span className="logo-icon">📘</span>
              {sidebarOpen && <span className="logo-text">StudyHarbor</span>}
            </Link>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            {navGroups.map((group) => (
              <div key={group.label} className="nav-group">
                {sidebarOpen && <div className="nav-group-label">{t(group.label)}</div>}
                {group.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                    title={t(item.label)}
                  >
                    <span className="nav-icon">{isActive(item.href) ? item.activeIcon : item.icon}</span>
                    {sidebarOpen && <span className="nav-label">{t(item.label)}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </nav>

          {/* User Section */}
          <div className="sidebar-footer">
            {sidebarOpen && (
              <>
                <div className="footer-label">{t('System')}</div>
                <div className="vault-pill">
                  <VaultStatus />
                </div>
                <button
                  className="download-btn"
                  onClick={handleGoToSettings}
                  title={t('Settings')}
                >
                  <span>⚙️</span>
                  <span>{t('Settings')}</span>
                </button>
                <button
                  className="download-btn"
                  onClick={handleExportData}
                  title={t('Export Data')}
                >
                  <span>⬇️</span>
                  <span>{t('Export Data')}</span>
                </button>
                <button
                  className="download-btn"
                  onClick={toggleLanguage}
                  title={isArabic ? t('Switch to English') : t('Switch to Arabic')}
                >
                  <span>🌐</span>
                  <span>{isArabic ? 'EN' : 'AR'}</span>
                </button>
                <button
                  className="download-btn"
                  onClick={handleSignOut}
                  title={t('Sign Out')}
                >
                  <span>🚪</span>
                  <span>{t('Sign Out')}</span>
                </button>
              </>
            )}
            {!sidebarOpen && (
              <div className="sidebar-icon-actions">
                <button
                  className="download-btn-icon"
                  onClick={handleGoToSettings}
                  title={t('Settings')}
                >
                  ⚙️
                </button>
                <button
                  className="download-btn-icon"
                  onClick={handleExportData}
                  title={t('Export Data')}
                >
                  ⬇️
                </button>
                <button
                  className="download-btn-icon"
                  onClick={toggleLanguage}
                  title={isArabic ? t('Switch to English') : t('Switch to Arabic')}
                >
                  🌐
                </button>
                <button
                  className="download-btn-icon"
                  onClick={handleSignOut}
                  title={t('Sign Out')}
                >
                  🚪
                </button>
              </div>
            )}
            <div className="user-profile" aria-label={t('Account actions')}>
              <div className="user-avatar">
                {user.image ? (
                  <img src={user.image} alt="" />
                ) : (
                  <span>{getInitials(user.name, user.email)}</span>
                )}
              </div>
              {sidebarOpen && (
                <div className="user-info">
                  <span className="user-name">{user.name || t('User')}</span>
                  <span className="user-email">{user.email}</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={`app-main ${!isMobile && sidebarOpen ? 'with-sidebar' : ''} ${!isMobile && !sidebarOpen ? 'with-collapsed-sidebar' : ''}`}>
        {/* Mobile Header */}
        {isMobile && (
          <header className="mobile-header">
            <Link href="/workspace" className="mobile-logo">
              <span>📘</span>
              <span>StudyHarbor</span>
            </Link>
            <div className="mobile-header-actions">
              <VaultStatus />
              <div
                className="mobile-user-avatar"
                onClick={() => setShowUserMenu(!showUserMenu)}
              >
                {user.image ? (
                  <img src={user.image} alt="" />
                ) : (
                  <span>{getInitials(user.name, user.email)}</span>
                )}
              </div>
            </div>

            {showUserMenu && (
              <>
                <div className="mobile-menu-backdrop" onClick={() => setShowUserMenu(false)} />
                <div className="mobile-user-menu">
                  <div className="mobile-menu-header">
                    <strong>{user.name || 'User'}</strong>
                    <span>{user.email}</span>
                  </div>
                  {mobileMenuExtras.map((item) => (
                    <Link key={item.href} href={item.href} className="mobile-menu-item" onClick={() => setShowUserMenu(false)}>
                      {item.icon} {t(item.label)}
                    </Link>
                  ))}
                  <div className="mobile-menu-divider" />
                  <Link href="/settings" className="mobile-menu-item" onClick={() => setShowUserMenu(false)}>
                    ⚙️ {t('Settings')}
                  </Link>
                  <button
                    className="mobile-menu-item"
                    onClick={() => { handleExportData(); setShowUserMenu(false); }}
                  >
                    ⬇️ {t('Export Data')}
                  </button>
                  <button
                    className="mobile-menu-item"
                    onClick={() => { toggleLanguage(); setShowUserMenu(false); }}
                  >
                    🌐 {t('Language')}: {isArabic ? t('Arabic') : t('English')}
                  </button>
                  <button
                    className="mobile-menu-item"
                    onClick={handleSignOut}
                  >
                    🚪 {t('Sign Out')}
                  </button>
                </div>
              </>
            )}
          </header>
        )}

        {/* Page Content */}
        <div className="app-content">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav className="mobile-nav">
          {mobileNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive(item.href) ? 'active' : ''}`}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              <span className="mobile-nav-label">{t(item.label)}</span>
            </Link>
          ))}
        </nav>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {showShortcutsHelp && (
        <>
          <div className="shortcuts-backdrop" onClick={() => setShowShortcutsHelp(false)} />
          <div className="shortcuts-modal">
              <div className="shortcuts-header">
              <h3>{t('Keyboard Shortcuts')}</h3>
              <button className="close-btn" onClick={() => setShowShortcutsHelp(false)}>
                <span>Esc</span>
              </button>
            </div>
            <div className="shortcuts-content">
              <div className="shortcuts-section">
                <h4>{t('Navigation')}</h4>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t('Open quick search')}</span>
                  <kbd>{formatShortcut({ key: 'k', meta: true })}</kbd>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t('Go to Settings')}</span>
                  <kbd>{formatShortcut({ key: ',', meta: true })}</kbd>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t('Toggle Sidebar')}</span>
                  <kbd>{formatShortcut({ key: 'b', meta: true })}</kbd>
                </div>
              </div>
              <div className="shortcuts-section">
                <h4>{t('General')}</h4>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t('Show Shortcuts')}</span>
                  <kbd>{formatShortcut({ key: '/', meta: true })}</kbd>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">{t('Close/Cancel')}</span>
                  <kbd>Esc</kbd>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <QuickSearchPalette
        isOpen={quickSearchOpen}
        isArabic={isArabic}
        query={quickSearchQuery}
        items={quickSearchItems}
        loading={quickSearchLoading}
        onQueryChange={setQuickSearchQuery}
        onClose={handleCloseQuickSearch}
        onSelect={handleQuickSearchSelect}
      />

      {showModelSetupWizard && (
        <ModelSetupWizard
          isArabic={isArabic}
          onComplete={handleModelWizardComplete}
        />
      )}

      <style jsx>{`
        .app-shell {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          background: var(--bg-base);
        }

        /* Desktop Sidebar */
        .app-sidebar {
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          width: 240px;
          background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
          backdrop-filter: blur(18px);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          transition: width var(--transition-base), background var(--transition-base);
          z-index: 100;
          min-height: 0;
        }

        .app-sidebar.collapsed {
          width: 72px;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-4);
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

        .sidebar-toggle {
          width: 32px;
          height: 32px;
          border: 1px solid var(--border-subtle);
          background: color-mix(in srgb, var(--bg-base) 88%, var(--bg-surface));
          border-radius: var(--radius-md);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: var(--text-muted);
        }

        .sidebar-toggle:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .sidebar-nav {
          flex: 1;
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
          overflow-y: auto;
          min-height: 0;
        }

        .app-sidebar.collapsed .sidebar-nav {
          gap: var(--space-2);
          padding: var(--space-2);
        }

        .nav-group {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .nav-group-label {
          font-size: var(--font-tiny);
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 600;
          padding: 0 var(--space-3) var(--space-1);
        }

        .nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 11px 12px;
          border-radius: 14px;
          text-decoration: none;
          color: var(--text-secondary);
          transition: all var(--transition-fast);
          border: 1px solid transparent;
        }

        .app-sidebar.collapsed .nav-item {
          justify-content: center;
          padding: 10px 6px;
        }

        .nav-item::before {
          content: '';
          position: absolute;
          left: 2px;
          top: 20%;
          bottom: 20%;
          width: 2px;
          border-radius: var(--radius-full);
          background: transparent;
        }

        .nav-item:hover {
          background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
          border-color: color-mix(in srgb, var(--border-subtle) 80%, transparent);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: color-mix(in srgb, var(--primary-muted) 42%, transparent);
          border-color: color-mix(in srgb, var(--primary) 18%, transparent);
          color: var(--primary);
          box-shadow: inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
        }

        .nav-item.active::before {
          background: var(--primary);
        }

        .nav-icon {
          font-size: 16px;
          width: 20px;
          min-width: 20px;
          text-align: center;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .nav-label {
          font-weight: 500;
          font-size: var(--font-meta);
          line-height: 1.2;
          white-space: nowrap;
        }

        .sidebar-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          background: color-mix(in srgb, var(--bg-surface) 94%, transparent);
        }

        .footer-label {
          font-size: var(--font-tiny);
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 600;
          padding: 0 var(--space-1);
        }

        .vault-pill {
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-full);
          padding: 2px 8px;
          width: fit-content;
          max-width: 100%;
        }

        .download-btn {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          min-height: var(--control-height);
          padding: 10px 12px;
          background: color-mix(in srgb, var(--bg-base) 90%, var(--bg-surface));
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          color: var(--text-secondary);
          font-size: var(--font-meta);
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .download-btn:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
          color: var(--text-primary);
        }

        .download-btn span:first-child {
          width: 18px;
          min-width: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          flex-shrink: 0;
        }

        .sidebar-icon-actions {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .download-btn-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: var(--space-1);
          background: var(--bg-base);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          font-size: 16px;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .download-btn-icon:hover {
          background: var(--bg-hover);
          border-color: var(--border-default);
        }

        .mobile-header-actions {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2);
          border-radius: 14px;
          cursor: default;
        }

        .user-profile:hover {
          background: var(--bg-hover);
        }

        .nav-item:focus-visible,
        .download-btn:focus-visible,
        .download-btn-icon:focus-visible,
        .user-profile:focus-visible,
        .mobile-nav-item:focus-visible,
        .mobile-menu-item:focus-visible,
        .user-menu-item:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--primary) 72%, transparent);
          outline-offset: 2px;
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
          flex-shrink: 0;
        }

        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .user-name {
          font-weight: 600;
          font-size: var(--font-meta);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-email {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-menu {
          margin-top: var(--space-2);
          padding: var(--space-2);
          background: var(--panel-gradient);
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-subtle);
          box-shadow: var(--shadow-md);
        }

        .user-menu-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-sm);
          text-decoration: none;
          color: var(--text-secondary);
          width: 100%;
          border: none;
          background: none;
          cursor: pointer;
          font-size: var(--font-meta);
        }

        .user-menu-item:hover {
          background: var(--bg-inset);
          color: var(--text-primary);
        }

        /* Main Content */
        .app-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          min-height: 100dvh;
        }

        .app-main.with-sidebar {
          margin-left: 240px;
        }

        .app-main.with-collapsed-sidebar {
          margin-left: 72px;
        }

        :global(html[dir='rtl']) .app-sidebar {
          left: auto;
          right: 0;
          border-right: none;
          border-left: 1px solid var(--border-subtle);
        }

        :global(html[dir='rtl']) .app-main.with-sidebar {
          margin-left: 0;
          margin-right: 240px;
        }

        :global(html[dir='rtl']) .app-main.with-collapsed-sidebar {
          margin-left: 0;
          margin-right: 72px;
        }

        :global(html[dir='rtl']) .nav-item::before {
          left: auto;
          right: 2px;
        }

        :global(html[dir='rtl']) .nav-item,
        :global(html[dir='rtl']) .download-btn,
        :global(html[dir='rtl']) .sidebar-header,
        :global(html[dir='rtl']) .user-profile {
          flex-direction: row-reverse;
        }

        :global(html[dir='rtl']) .nav-group-label,
        :global(html[dir='rtl']) .footer-label,
        :global(html[dir='rtl']) .user-info,
        :global(html[dir='rtl']) .mobile-menu-header {
          text-align: right;
        }

        :global(html[dir='rtl']) .mobile-user-menu {
          right: auto;
          left: var(--space-4);
        }

        .app-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-5);
        }

        /* Mobile Header */
        .mobile-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: calc(env(safe-area-inset-top) + var(--space-3)) var(--space-4) var(--space-3);
          background: color-mix(in srgb, var(--bg-surface) 88%, transparent);
          backdrop-filter: blur(18px);
          border-bottom: 1px solid var(--border-subtle);
        }

        .mobile-logo {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          text-decoration: none;
          color: var(--text-primary);
          font-weight: 700;
        }

        .mobile-user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          overflow: hidden;
          cursor: pointer;
        }

        .mobile-user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .mobile-menu-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 99;
        }

        .mobile-user-menu {
          position: absolute;
          top: 100%;
          right: var(--space-4);
          margin-top: var(--space-2);
          background: var(--bg-surface);
          box-shadow: var(--shadow-lg);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          min-width: min(240px, calc(100vw - 32px));
          z-index: 100;
          overflow: hidden;
        }

        .mobile-menu-header {
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
        }

        .mobile-menu-header span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .mobile-menu-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          text-decoration: none;
          color: var(--text-primary);
          width: 100%;
          border: none;
          background: none;
          cursor: pointer;
          font-size: var(--font-body);
        }

        .mobile-menu-item:hover {
          background: var(--bg-inset);
        }

        .mobile-menu-divider {
          border-top: 1px solid var(--border-subtle);
          margin: var(--space-1) 0;
        }

        /* Mobile Bottom Navigation */
        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          background: var(--bg-surface);
          border-top: 1px solid var(--border-subtle);
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 100;
          backdrop-filter: blur(14px);
        }

        .mobile-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: var(--space-3) var(--space-2);
          text-decoration: none;
          color: var(--text-muted);
          font-size: var(--font-tiny);
          transition: color 0.15s ease;
          min-height: 44px;
        }

        .mobile-nav-item.active {
          color: var(--primary);
        }

        .mobile-nav-icon {
          font-size: 20px;
          line-height: 1;
        }

        .mobile-nav-label {
          font-weight: 500;
          line-height: 1.1;
          text-align: center;
        }

        /* Add padding for mobile bottom nav */
        @media (max-width: 1023px) {
          .app-content {
            padding: var(--space-4);
            padding-bottom: calc(60px + env(safe-area-inset-bottom) + var(--space-4));
            overflow-x: hidden;
          }
        }

        /* Keyboard Shortcuts Modal */
        .shortcuts-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 999;
        }

        .shortcuts-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--bg-surface);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          width: 90%;
          max-width: 400px;
          z-index: 1000;
          overflow: hidden;
        }

        .shortcuts-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-4);
          border-bottom: 1px solid var(--border-subtle);
        }

        .shortcuts-header h3 {
          margin: 0;
          font-size: var(--font-lg);
          font-weight: 600;
        }

        .shortcuts-header .close-btn {
          padding: var(--space-1) var(--space-2);
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          font-size: var(--font-tiny);
          color: var(--text-muted);
          cursor: pointer;
        }

        .shortcuts-header .close-btn:hover {
          background: var(--bg-elevated);
        }

        .shortcuts-content {
          padding: var(--space-4);
        }

        .shortcuts-section {
          margin-bottom: var(--space-4);
        }

        .shortcuts-section:last-child {
          margin-bottom: 0;
        }

        .shortcuts-section h4 {
          font-size: var(--font-meta);
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 var(--space-2);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .shortcut-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-2) 0;
        }

        .shortcut-desc {
          font-size: var(--font-body);
          color: var(--text-primary);
        }

        .shortcut-item kbd {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: var(--font-meta);
          font-weight: 500;
          padding: var(--space-1) var(--space-2);
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
