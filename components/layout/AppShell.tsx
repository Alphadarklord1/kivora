'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { OnboardingModal } from './OnboardingModal';
import { getStreak } from '@/lib/srs/sm2';

const NAV_ITEMS = [
  { href: '/workspace', key: 'Workspace',          icon: '📚' },
  { href: '/planner',   key: 'Planner',             icon: '📅' },
  { href: '/math',      key: 'Math',                icon: '∑'  },
  { href: '/library',   key: 'Library',             icon: '🗂️' },
  { href: '/coach',     key: 'Revision Coach',     icon: '🧭' },
  { href: '/analytics', key: 'Analytics',           icon: '📊' },
  { href: '/sharing',   key: 'Sharing',             icon: '🔗' },
  { href: '/settings',  key: 'Settings',            icon: '⚙️' },
];

// ── Tiny inline avatar ────────────────────────────────────────────────────
function SidebarAvatar({ src, name, email }: { src?: string | null; name?: string | null; email?: string | null }) {
  const letters = (() => {
    if (name?.trim()) {
      const p = name.trim().split(/\s+/);
      return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : p[0].slice(0,2).toUpperCase();
    }
    return (email ?? '?').slice(0,2).toUpperCase();
  })();
  const hue = Array.from(email ?? '').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={letters} style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
  }
  return (
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: `hsl(${hue},55%,55%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 10, flexShrink: 0, userSelect: 'none' }}>
      {letters}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { settings, updateSetting } = useSettings();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    // Read streak from localStorage on mount (client-side only, no external subscription)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setStreak(getStreak()); } catch { /* noop */ }
  }, []);

  function toggleTheme() {
    updateSetting('theme', settings.theme === 'light' ? 'blue' : 'light');
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace('/login');
  }

  return (
    <div className="app-shell">
      <OnboardingModal />

      {/* Mobile header bar */}
      <div className="mobile-header">
        <button
          className="mobile-hamburger"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Open navigation"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="mobile-header-logo">
          <div className="mobile-header-logo-mark">K</div>
          <span>Kivora</span>
        </div>
      </div>

      {/* Overlay */}
      <div
        className={`mobile-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <nav className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
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
            <div className="sidebar-section-label">{t('Study')}</div>
          )}
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${pathname?.startsWith(item.href) ? ' active' : ''}`}
              title={collapsed ? item.key : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{t(item.key)}</span>}
            </Link>
          ))}
        </div>

        {/* Streak badge */}
        {streak > 0 && (
          <div
            title={`${streak}-day study streak!`}
            style={{
              margin: '8px 8px 4px',
              padding: collapsed ? '6px 0' : '6px 10px',
              borderRadius: 8,
              background: 'linear-gradient(135deg,#ff6b35 0%,#f7931e 100%)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 6,
              cursor: 'default',
              userSelect: 'none',
              boxShadow: '0 2px 6px rgba(255,107,53,0.35)',
            }}
          >
            <span style={{ fontSize: 16 }}>🔥</span>
            {!collapsed && <span>{streak} day{streak !== 1 ? 's' : ''}</span>}
          </div>
        )}

        <div className="sidebar-footer">
          <button
            className="nav-item"
            onClick={toggleTheme}
            title="Toggle theme"
          >
            <span className="nav-icon">{settings.theme === 'light' ? '🌙' : '☀️'}</span>
            {!collapsed && <span className="nav-label">{t('Theme')}</span>}
          </button>

          {session?.user ? (
            <>
              {/* Account link */}
              <Link
                href="/account"
                className={`nav-item${pathname?.startsWith('/account') ? ' active' : ''}`}
                title={t('Account')}
              >
                <span className="nav-icon">
                  <SidebarAvatar src={session.user.image} name={session.user.name} email={session.user.email} />
                </span>
                {!collapsed && (
                  <span className="nav-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.user.name || session.user.email || t('Account')}
                  </span>
                )}
              </Link>
              {/* Sign out */}
              <button className="nav-item" onClick={handleSignOut} title={t('Sign out')} style={{ color: 'var(--text-3)' }}>
                <span className="nav-icon">🚪</span>
                {!collapsed && <span className="nav-label">{t('Sign out')}</span>}
              </button>
            </>
          ) : (
            <Link href="/login" className="nav-item" title={t('Sign in')}>
              <span className="nav-icon">👤</span>
              {!collapsed && <span className="nav-label">{t('Sign in')}</span>}
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
