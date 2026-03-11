'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useSettings } from '@/providers/SettingsProvider';

const NAV = [
  { href: '/workspace', label: 'Workspace', icon: '📚' },
  { href: '/planner',   label: 'Planner',   icon: '📅' },
  { href: '/library',   label: 'Library',   icon: '🗂️' },
  { href: '/analytics', label: 'Analytics', icon: '📊' },
  { href: '/sharing',   label: 'Sharing',   icon: '🔗' },
  { href: '/settings',  label: 'Settings',  icon: '⚙️' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { settings, updateSetting } = useSettings();
  const [collapsed, setCollapsed] = useState(false);

  function toggleTheme() {
    updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark');
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace('/login');
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <nav className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-mark">K</div>
          {!collapsed && <span className="sidebar-logo-name">Kivora</span>}
          <button
            className="btn-icon"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ marginLeft: 'auto' }}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <div className="sidebar-nav">
          {!collapsed && (
            <div className="sidebar-section-label">Study</div>
          )}
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname?.startsWith(item.href) ? ' active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
            </Link>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            className="nav-item"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            <span className="nav-icon">{settings.theme === 'dark' ? '☀️' : '🌙'}</span>
            {!collapsed && <span className="nav-label">Theme</span>}
          </button>

          {session?.user ? (
            <button className="nav-item" onClick={handleSignOut} title="Sign out">
              <span className="nav-icon">🚪</span>
              {!collapsed && (
                <span className="nav-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {session.user.name || session.user.email || 'Sign out'}
                </span>
              )}
            </button>
          ) : (
            <Link href="/login" className="nav-item" title="Sign in">
              <span className="nav-icon">👤</span>
              {!collapsed && <span className="nav-label">Sign in</span>}
            </Link>
          )}
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        <div className="page-scroll">{children}</div>
      </main>
    </div>
  );
}
