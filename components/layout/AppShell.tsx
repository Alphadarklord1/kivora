'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { trackRouteView } from '@/lib/privacy/preferences';
import { OnboardingModal } from './OnboardingModal';
import { ModelSetupWizard } from './ModelSetupWizard';
import { getStreak } from '@/lib/srs/sm2';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { getGamificationState } from '@/lib/gamification/index';
import { useAchievementToast } from '@/components/gamification/AchievementToast';
import { QuickSearchPalette, QuickSearchItem } from '@/components/layout/QuickSearchPalette';
import { useSyncSubscription } from '@/hooks/useSyncSubscription';
import { useNotificationScheduler } from '@/hooks/useNotificationScheduler';
import { useRateLimitToast } from '@/hooks/useRateLimitToast';
import { installGlobalErrorHandlers } from '@/lib/errors/global-handler';

const CORE_NAV_ITEMS = [
  { href: '/workspace', key: 'Workspace',  icon: '📚' },
  { href: '/math',      key: 'Math',       icon: '∑'  },
  { href: '/coach',     key: 'Scholar Hub', icon: '🎓' },
];

const SUPPORT_NAV_ITEMS = [
  { href: '/library',   key: 'Library',   icon: '🗂️' },
  { href: '/planner',   key: 'Planner',   icon: '📅' },
  { href: '/analytics', key: 'Analytics', icon: '📊' },
  { href: '/sharing',   key: 'Sharing',   icon: '🔗' },
];

const BOTTOM_NAV_ITEMS = [
  { href: '/workspace', key: 'Workspace',  icon: '📚' },
  { href: '/math',      key: 'Math',       icon: '∑'  },
  { href: '/coach',     key: 'Scholar Hub', icon: '🎓' },
  { href: '/planner',   key: 'Planner',    icon: '📅' },
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
  // Cross-tab real-time sync — keeps all open tabs in sync when data changes
  useSyncSubscription();
  // Schedule browser notifications for exam reminders and streak alerts
  useNotificationScheduler();

  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { settings, updateSetting } = useSettings();
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [showModelWizard, setShowModelWizard] = useState(false);
  const [xp, setXp] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { toastJsx } = useAchievementToast();
  const { toastJsx: rateLimitToastJsx } = useRateLimitToast();

  useEffect(() => {
    installGlobalErrorHandlers();
    // Read streak from localStorage on mount (client-side only, no external subscription)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setStreak(getStreak()); } catch { /* noop */ }
    try { setXp(getGamificationState().xp); } catch { /* noop */ }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pathname) return;
    trackRouteView(pathname);
  }, [pathname]);

  useEffect(() => {
    let alive = true;
    if (!window.electronAPI?.desktopAI) return () => { alive = false; };

    void window.electronAPI.desktopAI.getSelection()
      .then((selection) => {
        if (!alive) return;
        if (selection.wizardEnabled && !selection.setupCompleted) {
          setShowModelWizard(true);
        }
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  // Cmd+K / Ctrl+K opens the quick search palette
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function toggleTheme() {
    updateSetting('theme', settings.theme === 'light' ? 'blue' : 'light');
  }

  const themeIcon = !mounted ? '◐' : settings.theme === 'light' ? '🌙' : '☀️';

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace('/login');
  }

  // Build search items from nav items for the quick search palette
  const searchItems: QuickSearchItem[] = [
    ...CORE_NAV_ITEMS,
    ...SUPPORT_NAV_ITEMS,
  ].map((item) => ({
    id: item.href,
    type: 'page' as const,
    href: item.href,
    icon: item.icon,
    title: item.key,
    searchText: item.key,
  }));

  // Sidebar nav content (shared between desktop sidebar and mobile drawer)
  const sidebarNavContent = (
    <>
      <div className="sidebar-header">
        <div className="sidebar-logo-mark">K</div>
        {!collapsed && <span className="sidebar-logo-name">Kivora</span>}
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="sidebar-toggle-arrow" style={{ display: 'inline-flex', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>›</span>
        </button>
      </div>

      <div className="sidebar-nav">
        {!collapsed && (
          <div className="sidebar-section-label">Core</div>
        )}
        {CORE_NAV_ITEMS.map(item => (
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

        {!collapsed && (
          <div className="sidebar-section-label" style={{ marginTop: 10 }}>Tools</div>
        )}
        {SUPPORT_NAV_ITEMS.map(item => (
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
            background: 'linear-gradient(135deg, color-mix(in srgb, var(--warning) 90%, #ff4500) 0%, var(--warning) 100%)',
            color: 'var(--bg)',
            fontWeight: 700,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 6,
            cursor: 'default',
            userSelect: 'none',
            boxShadow: '0 2px 8px color-mix(in srgb, var(--warning) 35%, transparent)',
          }}
        >
          <span style={{ fontSize: 16 }}>🔥</span>
          {!collapsed && <span>{streak} day{streak !== 1 ? 's' : ''}</span>}
        </div>
      )}

      {/* Level badge — only shown client-side when user has earned some XP */}
      {mounted && xp > 0 && (
        <div
          style={{
            margin: collapsed ? '4px 8px' : '4px 8px',
            display: 'flex',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <LevelBadge compact />
        </div>
      )}

      <div className="sidebar-footer">
        <button
          className="nav-item"
          onClick={() => setSearchOpen(true)}
          title="Search (⌘K)"
        >
          <span className="nav-icon">🔍</span>
          {!collapsed && <span className="nav-label">Search</span>}
        </button>

        <Link
          href="/settings"
          className={`nav-item${pathname?.startsWith('/settings') ? ' active' : ''}`}
          title={t('Settings')}
        >
          <span className="nav-icon">⚙️</span>
          {!collapsed && <span className="nav-label">{t('Settings')}</span>}
        </Link>

        <button
          className="nav-item"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          <span className="nav-icon">{themeIcon}</span>
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
    </>
  );

  return (
    <div className="app-shell">
      <OnboardingModal />

      {/* Global achievement toast — fixed bottom-right, self-positions via styled-jsx */}
      {toastJsx}
      {/* Global rate-limit toast — fixed bottom-center, shows when any AI call returns 429 */}
      {rateLimitToastJsx}

      {/* Quick search palette — rendered globally, triggered by Cmd+K or search button */}
      <QuickSearchPalette
        isOpen={searchOpen}
        isArabic={settings.language === 'ar'}
        query={searchQuery}
        items={searchItems}
        loading={false}
        onQueryChange={setSearchQuery}
        onClose={() => { setSearchOpen(false); setSearchQuery(''); }}
        onSelect={(item) => { router.push(item.href); setSearchOpen(false); setSearchQuery(''); }}
      />

      {showModelWizard && (
        <ModelSetupWizard
          isArabic={settings.language === 'ar'}
          onComplete={() => setShowModelWizard(false)}
        />
      )}

      {/* Mobile header bar — shown only on ≤768px */}
      <div className="mobile-header">
        {!mobileOpen && (
          <button
            className="mobile-hamburger"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <span />
            <span />
            <span />
          </button>
        )}
        <div className="mobile-header-logo">
          <div className="mobile-header-logo-mark">K</div>
          <span>Kivora</span>
        </div>
      </div>

      {/* Mobile drawer overlay — shown only on ≤768px when mobileOpen */}
      {mobileOpen && (
        <div className="mobile-drawer-overlay" aria-modal="true" role="dialog">
          {/* Nav panel */}
          <nav className="mobile-drawer-panel">
            {sidebarNavContent}
          </nav>
          {/* Tap-to-dismiss backdrop */}
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
        </div>
      )}

      {/* Desktop sidebar — hidden on mobile via CSS */}
      <nav className={`sidebar sidebar-desktop${collapsed ? ' collapsed' : ''}`}>
        {sidebarNavContent}
      </nav>

      {/* Main */}
      <main className="main-content">
        <div className="page-scroll">{children}</div>
      </main>

      {/* Bottom navigation bar — shown only on ≤768px */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {BOTTOM_NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`bottom-nav-item${pathname?.startsWith(item.href) ? ' active' : ''}`}
            aria-label={t(item.key)}
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span className="bottom-nav-label">{t(item.key)}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
