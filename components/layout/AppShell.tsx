'use client';

import { useState, useEffect, ReactNode, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { VaultStatus } from '@/components/security/VaultStatus';
import { useKeyboardShortcuts, formatShortcut, SHORTCUTS } from '@/hooks/useKeyboardShortcuts';
import { useToastHelpers } from '@/components/ui/Toast';

interface AppShellProps {
  children: ReactNode;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

const SvgIcons = {
  workspace: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  ),
  tools: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
  planner: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  podcast: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  ),
  library: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  sharing: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  logo: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <line x1="8" y1="7" x2="16" y2="7" />
      <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
  ),
  chevronLeft: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  signOut: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

const navItems = [
  { href: '/workspace', label: 'Workspace', iconKey: 'workspace' as const },
  { href: '/tools', label: 'Tools', iconKey: 'tools' as const },
  { href: '/planner', label: 'Planner', iconKey: 'planner' as const },
  { href: '/podcast', label: 'Podcast', iconKey: 'podcast' as const },
  { href: '/library', label: 'Library', iconKey: 'library' as const },
  { href: '/shared', label: 'Sharing', iconKey: 'sharing' as const },
];

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToastHelpers();
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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

  const handleEscape = useCallback(() => {
    if (showUserMenu) {
      setShowUserMenu(false);
    }
    if (showShortcutsHelp) {
      setShowShortcutsHelp(false);
    }
  }, [showUserMenu, showShortcutsHelp]);

  const handleShowHelp = useCallback(() => {
    setShowShortcutsHelp(prev => !prev);
  }, []);

  const handleExportData = useCallback(async () => {
    try {
      toast.info('Exporting...', 'Preparing your data for download');

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
      a.download = `studypilot-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Export complete', 'Your data has been downloaded');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed', 'Could not export your data');
    }
  }, [toast]);

  useKeyboardShortcuts([
    { key: ',', meta: true, handler: handleGoToSettings, description: 'Settings' },
    { key: 'b', meta: true, handler: handleToggleSidebar, description: 'Toggle sidebar' },
    { key: 'Escape', handler: handleEscape, description: 'Close menus' },
    { key: '/', meta: true, handler: handleShowHelp, description: 'Show shortcuts' },
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

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      {!isMobile && (
        <aside className={`app-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          {/* Logo */}
          <div className="sidebar-header">
            <Link href="/workspace" className="logo">
              <span className="logo-icon">{SvgIcons.logo}</span>
              {sidebarOpen && <span className="logo-text">StudyPilot</span>}
            </Link>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarOpen ? SvgIcons.chevronLeft : SvgIcons.chevronRight}
            </button>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">{SvgIcons[item.iconKey]}</span>
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
              </Link>
            ))}
          </nav>

          {/* User Section */}
          <div className="sidebar-footer">
            {/* Settings Nav Item */}
            <Link
              href="/settings"
              className={`nav-item settings-nav ${isActive('/settings') ? 'active' : ''}`}
              title="Settings"
            >
              <span className="nav-icon">{SvgIcons.settings}</span>
              {sidebarOpen && <span className="nav-label">Settings</span>}
            </Link>

            {sidebarOpen && (
              <>
                <div className="security-status">
                  <VaultStatus />
                </div>
                <button
                  className="download-btn"
                  onClick={handleExportData}
                  title="Export all your data"
                >
                  <span className="download-icon">{SvgIcons.download}</span>
                  <span>Export Data</span>
                </button>
              </>
            )}
            {!sidebarOpen && (
              <button
                className="download-btn-icon"
                onClick={handleExportData}
                title="Export all your data"
              >
                {SvgIcons.download}
              </button>
            )}
            <div
              className="user-profile"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="user-avatar">
                {user.image ? (
                  <img src={user.image} alt="" />
                ) : (
                  <span>{getInitials(user.name, user.email)}</span>
                )}
              </div>
              {sidebarOpen && (
                <div className="user-info">
                  <span className="user-name">{user.name || 'User'}</span>
                  <span className="user-email">{user.email}</span>
                </div>
              )}
            </div>

            {showUserMenu && sidebarOpen && (
              <div className="user-menu">
                <Link href="/settings" className="user-menu-item">
                  <span className="menu-item-icon">{SvgIcons.settings}</span> Settings
                </Link>
                <button
                  className="user-menu-item"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                >
                  <span className="menu-item-icon">{SvgIcons.signOut}</span> Sign Out
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className={`app-main ${!isMobile && sidebarOpen ? 'with-sidebar' : ''} ${!isMobile && !sidebarOpen ? 'with-collapsed-sidebar' : ''}`}>
        {/* Mobile Header */}
        {isMobile && (
          <header className="mobile-header">
            <Link href="/workspace" className="mobile-logo">
              <span className="mobile-logo-icon">{SvgIcons.logo}</span>
              <span>StudyPilot</span>
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
                  <button
                    className="mobile-menu-item"
                    onClick={() => { handleExportData(); setShowUserMenu(false); }}
                  >
                    <span className="menu-item-icon">{SvgIcons.download}</span> Export Data
                  </button>
                  <Link href="/settings" className="mobile-menu-item" onClick={() => setShowUserMenu(false)}>
                    <span className="menu-item-icon">{SvgIcons.settings}</span> Settings
                  </Link>
                  <button
                    className="mobile-menu-item"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                  >
                    <span className="menu-item-icon">{SvgIcons.signOut}</span> Sign Out
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
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive(item.href) ? 'active' : ''}`}
            >
              <span className="mobile-nav-icon">{SvgIcons[item.iconKey]}</span>
              <span className="mobile-nav-label">{item.label}</span>
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
              <h3>Keyboard Shortcuts</h3>
              <button className="close-btn" onClick={() => setShowShortcutsHelp(false)}>
                <span>Esc</span>
              </button>
            </div>
            <div className="shortcuts-content">
              <div className="shortcuts-section">
                <h4>Navigation</h4>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Go to Settings</span>
                  <kbd>{formatShortcut({ key: ',', meta: true })}</kbd>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Toggle Sidebar</span>
                  <kbd>{formatShortcut({ key: 'b', meta: true })}</kbd>
                </div>
              </div>
              <div className="shortcuts-section">
                <h4>General</h4>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Show Shortcuts</span>
                  <kbd>{formatShortcut({ key: '/', meta: true })}</kbd>
                </div>
                <div className="shortcut-item">
                  <span className="shortcut-desc">Close/Cancel</span>
                  <kbd>Esc</kbd>
                </div>
              </div>
            </div>
          </div>
        </>
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
          background: var(--bg-surface);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          transition: width 0.2s ease;
          z-index: 100;
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
          gap: var(--space-3);
          text-decoration: none;
          color: var(--text-primary);
          font-weight: 700;
          font-size: var(--font-lg);
        }

        .logo-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--primary);
          filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
        }

        .logo-text {
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-size: var(--font-xl);
          letter-spacing: -0.02em;
        }

        .sidebar-toggle {
          width: 28px;
          height: 28px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          color: var(--text-muted);
          transition: all 0.15s ease;
        }

        .sidebar-toggle:hover {
          background: var(--bg-hover);
          border-color: var(--primary);
          color: var(--primary);
        }

        .sidebar-nav {
          flex: 1;
          padding: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          text-decoration: none;
          color: var(--text-secondary);
          font-weight: 500;
          transition: all var(--transition-fast);
          border: 1px solid transparent;
          position: relative;
        }

        .nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: var(--primary-muted);
          color: var(--primary-text);
          border-left: 3px solid var(--primary);
          padding-left: calc(var(--space-3) - 2px);
        }

        .nav-icon {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .settings-nav {
          margin-bottom: var(--space-3);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
        }

        .nav-label {
          font-weight: 600;
          font-size: var(--font-body);
          letter-spacing: -0.01em;
        }

        .sidebar-footer {
          padding: var(--space-3);
          border-top: 1px solid var(--border-subtle);
        }

        .security-status {
          margin-bottom: var(--space-3);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
        }

        .download-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          width: 100%;
          padding: var(--space-2) var(--space-3);
          margin-bottom: var(--space-3);
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: var(--font-meta);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .download-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--primary);
          color: var(--primary);
        }

        .download-btn-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: var(--space-2);
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          font-size: 18px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .download-btn-icon:hover {
          background: var(--bg-elevated);
          border-color: var(--primary);
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
          border-radius: var(--radius-md);
          cursor: pointer;
        }

        .user-profile:hover {
          background: var(--bg-inset);
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
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-email {
          font-size: var(--font-tiny);
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-menu {
          margin-top: var(--space-2);
          padding: var(--space-2);
          background: var(--bg-elevated);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
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

        .app-content {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-4);
        }

        /* Mobile Header */
        .mobile-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: var(--space-3) var(--space-4);
          background: var(--bg-surface);
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
          width: 32px;
          height: 32px;
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
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          min-width: 200px;
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
        }

        .mobile-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: var(--space-2) var(--space-1);
          text-decoration: none;
          color: var(--text-muted);
          font-size: var(--font-tiny);
          transition: color 0.15s ease;
        }

        .mobile-nav-item.active {
          color: var(--primary);
        }

        .mobile-nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
        }

        .menu-item-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        .download-icon {
          display: inline-flex;
          align-items: center;
        }

        .mobile-logo-icon {
          display: inline-flex;
          align-items: center;
          color: var(--primary);
        }

        .mobile-nav-label {
          font-weight: 500;
        }

        /* Add padding for mobile bottom nav */
        @media (max-width: 767px) {
          .app-content {
            padding-bottom: calc(60px + env(safe-area-inset-bottom) + var(--space-4));
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
