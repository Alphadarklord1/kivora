'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { trackRouteView } from '@/lib/privacy/preferences';
import { OnboardingModal } from './OnboardingModal';
import { ModelSetupWizard } from './ModelSetupWizard';
import { getStreak, loadSessions, getGoalPreferences, loadDecks } from '@/lib/srs/sm2';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { getGamificationState } from '@/lib/gamification/index';
import { useAchievementToast } from '@/components/gamification/AchievementToast';
import { QuickSearchPalette, QuickSearchItem } from '@/components/layout/QuickSearchPalette';
import { useSyncSubscription } from '@/hooks/useSyncSubscription';
import { useNotificationScheduler } from '@/hooks/useNotificationScheduler';
import { useRateLimitToast } from '@/hooks/useRateLimitToast';
import { installGlobalErrorHandlers } from '@/lib/errors/global-handler';
import { loadLocalStudyPlans } from '@/lib/planner/local-plans';

const CORE_NAV_ITEMS = [
  { href: '/workspace', key: 'Workspace',  icon: '📚' },
  { href: '/math',      key: 'Math',       icon: '∑'  },
  { href: '/coach',     key: 'Scholar Hub', icon: '🎓' },
];

const SUPPORT_NAV_ITEMS = [
  { href: '/library',   key: 'Library',   icon: '🗂️' },
  { href: '/planner',   key: 'Planner',   icon: '📅' },
  { href: '/analytics', key: 'Analytics', icon: '📊' },
  { href: '/groups',    key: 'Groups',    icon: '👥' },
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
  const [todayCards, setTodayCards] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(20);
  const [mounted, setMounted] = useState(false);
  const [showModelWizard, setShowModelWizard] = useState(false);
  const [xp, setXp] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchContent, setSearchContent] = useState<QuickSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchContentLoaded = useRef(false);
  const { toastJsx } = useAchievementToast();
  const { toastJsx: rateLimitToastJsx } = useRateLimitToast();

  useEffect(() => {
    installGlobalErrorHandlers();
    // Read streak + goal from localStorage on mount (client-side only)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setStreak(getStreak()); } catch { /* noop */ }
    try { setXp(getGamificationState().xp); } catch { /* noop */ }
    try {
      const today = new Date().toISOString().split('T')[0];
      const sessions = loadSessions();
      const todaySession = sessions.find(s => s.date === today);
      setTodayCards(todaySession?.cards ?? 0);
      setDailyGoal(getGoalPreferences().dailyGoal);
    } catch { /* noop */ }
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
        if (!searchContentLoaded.current) setSearchLoading(true);
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

  // Lazy-load content (library, saved sources, decks) the first time search opens
  useEffect(() => {
    if (!searchOpen || searchContentLoaded.current) return;
    searchContentLoaded.current = true;

    const items: QuickSearchItem[] = [];

    // Local SRS decks
    try {
      const decks = loadDecks();
      for (const deck of decks) {
        items.push({
          id: `deck-${deck.id}`,
          type: 'file',
          icon: '🃏',
          title: deck.name,
          subtitle: `${deck.cards.length} cards`,
          href: `/decks/${deck.id}`,
          searchText: deck.name,
        });
      }
    } catch { /* localStorage unavailable */ }

    // Cloud library + saved sources in parallel
    Promise.all([
      fetch('/api/library?summary=1', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []) as Promise<{ id: string; mode: string; metadata?: { title?: string; category?: string } }[]>,
      fetch('/api/sources', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []) as Promise<{ id: string; title: string; url: string; journal?: string | null; year?: number | null }[]>,
      fetch('/api/study-plans', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []) as Promise<{ id: string; title: string; topics?: { name: string }[]; status?: string; examDate?: string }[]>,
    ]).then(([libraryRows, sourceRows, remotePlans]) => {
      const modeIcon: Record<string, string> = {
        summary: '📝', quiz: '📝', mcq: '📝', notes: '📒',
        flashcards: '🃏', research: '🔍', report: '📄',
      };
      for (const item of libraryRows) {
        const title = item.metadata?.title ?? item.mode;
        items.push({
          id: `lib-${item.id}`,
          type: 'library',
          icon: modeIcon[item.mode] ?? '🗂️',
          title,
          subtitle: item.metadata?.category ?? item.mode,
          href: `/library`,
          searchText: title,
        });
      }
      for (const src of sourceRows) {
        items.push({
          id: `src-${src.id}`,
          type: 'library',
          icon: '🔖',
          title: src.title,
          subtitle: [src.journal, src.year].filter(Boolean).join(' · ') || 'Saved source',
          href: src.url,
          searchText: src.title,
        });
      }

      const localPlans = (() => {
        try {
          return loadLocalStudyPlans();
        } catch {
          return [];
        }
      })();
      const allPlans = [...remotePlans, ...localPlans].filter((plan, index, arr) => arr.findIndex((candidate) => candidate.id === plan.id) === index);
      for (const plan of allPlans) {
        const topicNames = Array.isArray(plan.topics) ? plan.topics.map((topic) => topic.name).filter(Boolean) : [];
        items.push({
          id: `plan-${plan.id}`,
          type: 'page',
          icon: '📅',
          title: plan.title,
          subtitle: topicNames.slice(0, 2).join(' · ') || plan.status || 'Study plan',
          href: '/planner',
          searchText: [plan.title, ...topicNames, plan.status, plan.examDate].filter(Boolean).join(' '),
        });
      }

      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || !key.startsWith('kivora-notes-')) continue;
          const value = localStorage.getItem(key)?.trim();
          if (!value) continue;
          const lines = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
          const title = lines[0]?.replace(/^#\s*/, '').slice(0, 72) || 'Workspace notes';
          const preview = (lines.slice(1).find(Boolean) ?? value).slice(0, 90);
          items.push({
            id: `note-${key}`,
            type: 'file',
            icon: '📝',
            title,
            subtitle: preview,
            href: '/workspace',
            searchText: `${title} ${value}`,
          });
        }
      } catch { /* localStorage unavailable */ }

      setSearchContent(items);
      setSearchLoading(false);
    });
  }, [searchOpen]);

  // Build search items from nav items + lazy-loaded content
  const searchItems: QuickSearchItem[] = [
    ...[...CORE_NAV_ITEMS, ...SUPPORT_NAV_ITEMS].map((item) => ({
      id: item.href,
      type: 'page' as const,
      href: item.href,
      icon: item.icon,
      title: item.key,
      searchText: item.key,
    })),
    ...searchContent,
  ];

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
          <div className="sidebar-section-label">{t('Core')}</div>
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
          <div className="sidebar-section-label" style={{ marginTop: 10 }}>{t('Tools')}</div>
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

      {/* Daily goal progress */}
      {mounted && (
        <div
          title={`Today: ${todayCards} / ${dailyGoal} cards`}
          style={{
            margin: collapsed ? '2px 8px 4px' : '2px 8px 4px',
            padding: collapsed ? '6px 0' : '6px 10px',
            borderRadius: 8,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, marginBottom: 4, color: todayCards >= dailyGoal ? '#22c55e' : 'var(--text-2)' }}>
              <span>{todayCards >= dailyGoal ? '✓ Goal done!' : `Today's goal`}</span>
              <span>{todayCards}/{dailyGoal}</span>
            </div>
          )}
          <div style={{ height: 5, borderRadius: 3, background: 'var(--border-2)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${Math.min(100, (todayCards / dailyGoal) * 100)}%`,
              background: todayCards >= dailyGoal
                ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                : 'linear-gradient(90deg, var(--primary), var(--accent, #7c53e8))',
              transition: 'width 0.4s ease',
              minWidth: todayCards > 0 ? 6 : 0,
            }} />
          </div>
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
          {!collapsed && <span className="nav-label">{t('Search')}</span>}
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
        query={searchQuery}
        items={searchItems}
        loading={searchLoading}
        onQueryChange={setSearchQuery}
        onClose={() => { setSearchOpen(false); setSearchQuery(''); }}
        onSelect={(item) => { router.push(item.href); setSearchOpen(false); setSearchQuery(''); }}
      />

      {showModelWizard && (
        <ModelSetupWizard
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
        <div className="mobile-header-actions">
          <button
            className="mobile-header-action"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            title="Search (⌘K)"
          >
            🔍
          </button>
          <Link
            href="/settings"
            className="mobile-header-action"
            aria-label={t('Settings')}
            title={t('Settings')}
          >
            ⚙️
          </Link>
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
