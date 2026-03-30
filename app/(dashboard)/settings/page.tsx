'use client';

import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/notifications/scheduler';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useSettings, type Density, type Theme } from '@/providers/SettingsProvider';
import { AiRuntimeControls } from '@/components/models/AiRuntimeControls';
import { ReportIssuePanel } from '@/components/settings/ReportIssuePanel';
import { OllamaSetupPanel } from '@/components/settings/OllamaSetupPanel';
import { DesktopModelPanel } from '@/components/settings/DesktopModelPanel';
import styles from './page.module.css';
import {
  crashReportsEnabledClient,
  setCrashReportsEnabled,
  setUsageAnalyticsEnabled,
  usageAnalyticsEnabledClient,
} from '@/lib/privacy/preferences';
import { LOCALE_OPTIONS } from '@/lib/i18n/locales';

const THEME_OPTIONS: { id: Theme; label: string; hint: string }[] = [
  { id: 'system', label: 'System', hint: 'Follow your device preference' },
  { id: 'blue', label: 'Dark', hint: 'Default Kivora dark theme' },
  { id: 'light', label: 'Light', hint: 'Bright workspace' },
  { id: 'black', label: 'Black', hint: 'Highest contrast' },
];

const FONT_OPTIONS = [
  { value: '0.95', label: 'Small text' },
  { value: '1', label: 'Normal text size' },
  { value: '1.05', label: 'Large text' },
  { value: '1.1', label: 'Extra large text' },
] as const;

const LINE_HEIGHT_OPTIONS = [
  { value: '1.4', label: 'Tight' },
  { value: '1.5', label: 'Balanced' },
  { value: '1.65', label: 'Relaxed' },
  { value: '1.8', label: 'Very relaxed' },
] as const;

const DENSITY_OPTIONS: { id: Density; label: string; hint: string }[] = [
  { id: 'compact', label: 'Compact', hint: 'More on screen' },
  { id: 'normal', label: 'Normal', hint: 'Balanced spacing' },
  { id: 'comfortable', label: 'Comfortable', hint: 'Easier scanning and taps' },
];

interface AccountState {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  bio?: string | null;
  studyInterests?: string | null;
  createdAt: string;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  isGuest: boolean;
  connectedAccounts: string[];
  stats: {
    folders: number;
    files: number;
    libraryItems: number;
  };
}

interface TwoFactorSetupState {
  secret: string;
  manualEntryKey: string;
  otpAuthUri: string;
}

interface DownloadsState {
  releaseTag: string;
  releaseUrl: string;
  macAsset: { browser_download_url: string; name: string } | null;
  windowsInstaller: { browser_download_url: string; name: string } | null;
  windowsPortable: { browser_download_url: string; name: string } | null;
  manifestAsset: { browser_download_url: string; name: string } | null;
  checksumsAsset: { browser_download_url: string; name: string } | null;
  hasPublishedModelAssets: boolean;
}

interface AuthCapabilitiesState {
  googleConfigured: boolean;
  githubConfigured: boolean;
  microsoftConfigured: boolean;
  guestModeEnabled: boolean;
  oauthDisabled?: boolean;
  oauthDisabledReason?: string | null;
  dbConfigured?: boolean;
  authDisabled?: boolean;
  authDisabledReason?: string | null;
  supabaseUrlConfigured?: boolean;
  supabaseAnonKeyConfigured?: boolean;
  supabaseServiceRoleConfigured?: boolean;
  supabaseBrowserConfigured?: boolean;
  supabaseAdminConfigured?: boolean;
  supabaseAuthConfigured?: boolean;
  supabaseStorageConfigured?: boolean;
  supabaseStorageBucket?: string | null;
}

interface AiStatusState {
  cloudConfigured: boolean;
  activeCloudProvider: string | null;
  defaultCloudModel: string;
}

type SettingsSectionId =
  | 'account'
  | 'security'
  | 'appearance'
  | 'notifications'
  | 'runtime'
  | 'ai-models'
  | 'utilities'
  | 'reporting'
  | 'privacy';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  icon: string;
  label: string;
  title: string;
  description: string;
}> = [
  { id: 'account', icon: '👤', label: 'Account', title: 'Profile and account basics', description: 'Name, image, bio, and sign-in details.' },
  { id: 'security', icon: '🔒', label: 'Security', title: 'Password and 2-step verification', description: 'Protect the account before you rely on it.' },
  { id: 'appearance', icon: '🎨', label: 'Appearance', title: 'Theme, language, and readability', description: 'Keep the app readable without oversized defaults.' },
  { id: 'notifications', icon: '🔔', label: 'Notifications', title: 'Notification preferences', description: 'Control reminders, review alerts, and system messages.' },
  { id: 'runtime', icon: '⚙️', label: 'Runtime', title: 'What works in this runtime', description: 'Check cloud, auth, and storage readiness.' },
  { id: 'ai-models', icon: '🤖', label: 'AI & Downloads', title: 'AI routing and desktop downloads', description: 'One place for model mode and releases.' },
  { id: 'utilities', icon: '🧰', label: 'Utilities', title: 'Secondary tools', description: 'Analytics, sharing, and status live here.' },
  { id: 'reporting', icon: '🐛', label: 'Report Issue', title: 'Diagnostics and issue reporting', description: 'File bugs without leaving settings.' },
  { id: 'privacy', icon: '🛡️', label: 'Privacy', title: 'Privacy and data control', description: 'Choose how much Kivora stores and sends.' },
];

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--border-2)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--text-sm)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
};

function initials(name: string | null | undefined, email: string | null | undefined) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (email || 'KV').slice(0, 2).toUpperCase();
}

function AvatarPreview({ image, name, email }: { image?: string | null; name?: string | null; email?: string | null }) {
  const [failed, setFailed] = useState(false);
  const text = initials(name, email);
  const hue = Array.from(email || text).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue}, 60%, 55%)`;

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={text}
        onError={() => setFailed(true)}
        style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-2)' }}
      />
    );
  }

  return (
    <div
      style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontWeight: 700,
        fontSize: '1.2rem',
        color: '#fff',
        background: bg,
        border: '2px solid var(--border-2)',
      }}
    >
      {text}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 4 }}>{title}</h2>
        {subtitle ? <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>{subtitle}</p> : null}
      </div>
      <div className="card card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {children}
      </div>
    </section>
  );
}

function GuestUpgradeNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: compact ? 'center' : 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: compact ? 0 : 14,
        borderRadius: compact ? 0 : 16,
        border: compact ? 'none' : '1px solid var(--border-2)',
        background: compact ? 'transparent' : 'var(--surface-2)',
      }}
    >
      <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', flex: 1, minWidth: 240 }}>
        You are in guest mode. Sign in with a real account to save a profile picture, short description, password, and 2-step verification.
      </span>
      <a href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
        Sign in / Register
      </a>
    </div>
  );
}

function ChoiceButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={`btn ${value === option.id ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onChange(option.id)}
          style={{
            justifyContent: 'flex-start',
            textAlign: 'left',
            padding: '12px 14px',
            minHeight: 0,
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 600 }}>{option.label}</span>
          {option.hint ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{option.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function SettingsRail({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
}) {
  const current = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];
  return (
    <aside className={styles.settingsRail}>
      <div className={styles.railIntro}>
        <span className={styles.railEyebrow}>Settings</span>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
      </div>
      <nav className={styles.railNav}>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`${styles.railButton} ${activeSection === section.id ? styles.railButtonActive : ''}`}
            onClick={() => onSelect(section.id)}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{section.icon}</span>
              <strong>{section.label}</strong>
            </div>
            <span>{section.description}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

function DownloadCard({
  title,
  hint,
  primary,
  secondary,
}: {
  title: string;
  hint: string;
  primary?: { label: string; href: string } | null;
  secondary?: { label: string; href: string } | null;
}) {
  return (
    <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)', display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
        <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {primary ? (
          <a href={primary.href} className="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            {primary.label}
          </a>
        ) : (
          <span className="badge">Not attached yet</span>
        )}
        {secondary ? (
          <a href={secondary.href} className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            {secondary.label}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSetting } = useSettings();
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [saved, setSaved] = useState(false);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupState | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [disableTwoFactorCode, setDisableTwoFactorCode] = useState('');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [bio, setBio] = useState('');
  const [studyInterests, setStudyInterests] = useState('');
  const [downloads, setDownloads] = useState<DownloadsState | null>(null);
  const [downloadsLoading, setDownloadsLoading] = useState(true);
  const [authCapabilities, setAuthCapabilities] = useState<AuthCapabilitiesState | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatusState | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!session?.user) {
      setAccountLoading(false);
      return;
    }

    let cancelled = false;
    setAccountLoading(true);
    fetch('/api/account')
      .then(async response => {
        if (!response.ok) return null;
        return response.json();
      })
      .then(data => {
        if (!data || cancelled) return;
        setAccount(data);
        setName(data.name ?? '');
        setImageUrl(data.image ?? '');
        setBio(data.bio ?? '');
        setStudyInterests(data.studyInterests ?? '');
      })
      .catch(() => {
        if (!cancelled) toast('Could not load your account settings', 'error');
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user, toast]);

  useEffect(() => {
    let cancelled = false;
    setDownloadsLoading(true);
    fetch('/api/models/downloads')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!cancelled) {
          setDownloads(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDownloads(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDownloadsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '') as SettingsSectionId;
      if (SETTINGS_SECTIONS.some((section) => section.id === hash)) setActiveSection(hash);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/capabilities')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setAuthCapabilities(data);
      })
      .catch(() => {
        if (!cancelled) setAuthCapabilities(null);
      });

    fetch('/api/ai/status')
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setAiStatus(data);
      })
      .catch(() => {
        if (!cancelled) setAiStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const accountCreatedLabel = useMemo(() => {
    if (!account?.createdAt) return null;
    return new Date(account.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [account?.createdAt]);

  const publicProfileUrl = useMemo(() => {
    if (!account?.id || typeof window === 'undefined') return '';
    return `${window.location.origin}/profile/${account.id}`;
  }, [account?.id]);

  function markSaved(message?: string) {
    setSaved(true);
    if (message) toast(message, 'success');
    window.setTimeout(() => setSaved(false), 1600);
  }

  function set<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    updateSetting(key, value);
    markSaved();
  }

  function openSection(section: SettingsSectionId) {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${section}`);
    }
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace('/login');
  }

  async function copyPublicProfileLink() {
    if (!publicProfileUrl) return;
    try {
      await navigator.clipboard.writeText(publicProfileUrl);
      toast('Public profile link copied', 'success');
    } catch {
      toast('Could not copy the public profile link', 'error');
    }
  }

  async function saveProfile() {
    if (!account) return;
    setSavingProfile(true);
    try {
      const response = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          image: imageUrl.trim() || null,
          bio: bio.trim() || null,
          studyInterests: studyInterests.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.reason || 'Could not update your profile', 'error');
        return;
      }
        setAccount(prev => prev ? { ...prev, ...data } : prev);
      await updateSession({ user: { name: data.name, image: data.image } });
      markSaved('Profile updated');
    } catch {
      toast('Could not update your profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast('The new passwords do not match', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword || undefined,
          newPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.reason || 'Could not update password', 'error');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setAccount(prev => prev ? { ...prev, hasPassword: true } : prev);
      toast('Password updated', 'success');
    } catch {
      toast('Could not update password', 'error');
    } finally {
      setSavingPassword(false);
    }
  }

  async function beginTwoFactorSetup() {
    setTwoFactorBusy(true);
    try {
      const response = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        toast(data.reason || 'Could not start two-step verification', 'error');
        return;
      }
      setTwoFactorSetup({
        secret: data.secret,
        manualEntryKey: data.manualEntryKey,
        otpAuthUri: data.otpAuthUri,
      });
      toast('Authenticator key ready', 'success');
    } catch {
      toast('Could not start two-step verification', 'error');
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function confirmTwoFactor() {
    if (!twoFactorSetup) return;
    setTwoFactorBusy(true);
    try {
      const response = await fetch('/api/auth/2fa/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: twoFactorSetup.secret, code: twoFactorCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.reason || 'That code did not work', 'error');
        return;
      }
      setTwoFactorCode('');
      setTwoFactorSetup(null);
      setAccount(prev => prev ? { ...prev, twoFactorEnabled: true } : prev);
      toast('Two-step verification enabled', 'success');
    } catch {
      toast('Could not confirm two-step verification', 'error');
    } finally {
      setTwoFactorBusy(false);
    }
  }

  async function disableTwoFactor() {
    setTwoFactorBusy(true);
    try {
      const response = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableTwoFactorCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast(data.reason || 'Could not disable two-step verification', 'error');
        return;
      }
      setDisableTwoFactorCode('');
      setAccount(prev => prev ? { ...prev, twoFactorEnabled: false } : prev);
      toast('Two-step verification disabled', 'success');
    } catch {
      toast('Could not disable two-step verification', 'error');
    } finally {
      setTwoFactorBusy(false);
    }
  }

  const showGuestState = !session?.user || Boolean(account?.isGuest);

  return (
    <div className={styles.pageShell}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>Settings</h1>
          <p className={styles.heroCopy}>
            Manage your profile, security, appearance, and privacy from one place. Changes save automatically where noted.
          </p>
        </div>
        <div className={styles.heroBadges}>
          {account && !account.isGuest ? <span className="badge badge-success">{account.email}</span> : null}
          {session?.user && !account?.isGuest ? null : <span className="badge">Guest mode</span>}
          {saved ? <span className="badge badge-success">Saved ✓</span> : null}
        </div>
      </div>

      <div className={styles.settingsShell}>
        <SettingsRail activeSection={activeSection} onSelect={openSection} />
        <div className={styles.settingsStage}>
      {activeSection === 'account' && (
      <div id="account">
      <Section title="Account" subtitle="Profile, connected sign-in methods, and basic account details.">
        {showGuestState ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <GuestUpgradeNotice />

            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <AvatarPreview image={imageUrl || null} name={name || 'Guest user'} email={session?.user?.email ?? 'guest@kivora.local'} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{name || 'Guest user'}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', marginTop: 4 }}>Profile fields will save after sign-in.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <span className="badge">Profile picture</span>
                  <span className="badge">Short description</span>
                  <span className="badge">Study interests</span>
                  <span className="badge">Connected accounts</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Display name</label>
                <input style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" disabled />
              </div>
              <div>
                <label style={labelStyle}>Profile picture URL</label>
                <input style={fieldStyle} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." disabled />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Short description</label>
              <textarea
                style={{ ...fieldStyle, minHeight: 96, resize: 'vertical' }}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="A short line about what you study, teach, or focus on."
                maxLength={240}
                disabled
              />
            </div>

            <div>
              <label style={labelStyle}>Study interests</label>
              <input
                style={fieldStyle}
                value={studyInterests}
                onChange={e => setStudyInterests(e.target.value)}
                placeholder="Examples: Biology, essay writing, exam prep"
                disabled
              />
            </div>
          </div>
        ) : accountLoading ? (
          <div className="skeleton" style={{ height: 180, borderRadius: 18 }} />
        ) : account ? (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <AvatarPreview image={imageUrl || account.image} name={name || account.name} email={account.email} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{account.name || account.email}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', marginTop: 4 }}>{account.email}</div>
                <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)', marginTop: 6 }}>
                  Member since {accountCreatedLabel || 'recently'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <span className="badge">{account.stats.folders} folders</span>
                  <span className="badge">{account.stats.files} files</span>
                  <span className="badge">{account.stats.libraryItems} library items</span>
                  {studyInterests.trim() ? <span className="badge badge-accent">{studyInterests.split(',')[0]?.trim()}</span> : null}
                  {account.connectedAccounts.map(provider => (
                    <span key={provider} className="badge badge-accent">{provider}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <button className="btn btn-danger btn-sm" onClick={handleSignOut}>Sign out</button>
                <button className="btn btn-ghost btn-sm" onClick={copyPublicProfileLink} disabled={!publicProfileUrl}>
                  Copy public profile link
                </button>
                {publicProfileUrl ? (
                  <a className="btn btn-ghost btn-sm" href={publicProfileUrl} target="_blank" rel="noreferrer">
                    Open public profile
                  </a>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Display name</label>
                <input style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label style={labelStyle}>Profile picture URL</label>
                <input style={fieldStyle} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Short description</label>
              <textarea
                style={{ ...fieldStyle, minHeight: 96, resize: 'vertical' }}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="A short line about what you study, teach, or focus on."
                maxLength={240}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                <span>This shows up as your short profile description across the app.</span>
                <span>{bio.trim().length}/240</span>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Study interests</label>
              <input
                style={fieldStyle}
                value={studyInterests}
                onChange={e => setStudyInterests(e.target.value)}
                placeholder="Examples: Biology, essay writing, exam prep"
                maxLength={180}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                <span>Separate topics with commas so they show up as profile tags.</span>
                <span>{studyInterests.trim().length}/180</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                Profile picture, display name, and description are saved to your account.
              </span>
              <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save profile'}
              </button>
            </div>

            <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Public profile</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                    Give classmates a simple profile card with your picture, bio, study interests, and selected public study items without exposing private account details.
                  </div>
                </div>
                <span className="badge badge-accent">Light social</span>
              </div>
              <code style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border-2)', overflowWrap: 'anywhere' }}>
                {publicProfileUrl || 'Save your account first to generate a public profile link.'}
              </code>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>We could not load your account right now.</p>
        )}
      </Section>
      </div>
      )}

      {activeSection === 'security' && (
      <div id="security">
      <Section title="Security" subtitle="Password changes and two-step verification for your account.">
        {showGuestState ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <GuestUpgradeNotice compact />
            <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)', opacity: 0.76 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Two-step verification</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                    Protect your account with an authenticator app after sign-in.
                  </div>
                </div>
                <span className="badge">Locked in guest mode</span>
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-primary btn-sm" disabled>Set up 2-step verification</button>
              </div>
            </div>

            <form style={{ display: 'grid', gap: 12, opacity: 0.76 }}>
              <div style={{ fontWeight: 700 }}>Password</div>
              <div>
                <label style={labelStyle}>Current password</label>
                <input style={fieldStyle} type="password" placeholder="Current password" disabled />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>New password</label>
                  <input style={fieldStyle} type="password" placeholder="At least 6 characters" disabled />
                </div>
                <div>
                  <label style={labelStyle}>Confirm new password</label>
                  <input style={fieldStyle} type="password" placeholder="Repeat new password" disabled />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" type="button" disabled>
                  Change password
                </button>
              </div>
            </form>
          </div>
        ) : accountLoading ? (
          <div className="skeleton" style={{ height: 210, borderRadius: 18 }} />
        ) : account ? (
          <>
            <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Two-step verification</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                    Add an authenticator app code after password sign-in.
                  </div>
                </div>
                <span className={`badge ${account.twoFactorEnabled ? 'badge-success' : ''}`}>
                  {account.twoFactorEnabled ? 'Enabled' : 'Not enabled'}
                </span>
              </div>

              {!account.twoFactorEnabled && !twoFactorSetup ? (
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', flex: 1 }}>
                    We support authenticator apps like Google Authenticator, 1Password, and Microsoft Authenticator.
                  </p>
                  <button className="btn btn-primary btn-sm" onClick={beginTwoFactorSetup} disabled={twoFactorBusy}>
                    {twoFactorBusy ? 'Preparing…' : 'Set up 2-step verification'}
                  </button>
                </div>
              ) : null}

              {twoFactorSetup ? (
                <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                    Add this manual key in your authenticator app, then confirm with the current 6-digit code.
                  </div>
                  <code style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border-2)', overflowWrap: 'anywhere' }}>
                    {twoFactorSetup.manualEntryKey}
                  </code>
                  <input
                    style={fieldStyle}
                    value={twoFactorCode}
                    onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="Enter 6-digit code"
                  />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={confirmTwoFactor} disabled={twoFactorBusy || twoFactorCode.length !== 6}>
                      {twoFactorBusy ? 'Verifying…' : 'Confirm and enable'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setTwoFactorSetup(null); setTwoFactorCode(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {account.twoFactorEnabled ? (
                <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                    To disable it, enter the current 6-digit code from your authenticator app.
                  </div>
                  <input
                    style={fieldStyle}
                    value={disableTwoFactorCode}
                    onChange={e => setDisableTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="Enter 6-digit code"
                  />
                  <div>
                    <button className="btn btn-danger btn-sm" onClick={disableTwoFactor} disabled={twoFactorBusy || disableTwoFactorCode.length !== 6}>
                      {twoFactorBusy ? 'Disabling…' : 'Disable 2-step verification'}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <form onSubmit={changePassword} style={{ display: 'grid', gap: 12 }}>
              <div style={{ fontWeight: 700 }}>Password</div>
              {account.hasPassword ? (
                <div>
                  <label style={labelStyle}>Current password</label>
                  <input style={fieldStyle} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" />
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                  You signed up with an external provider. Set a password here if you want email + password sign-in as well.
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>New password</label>
                  <input style={fieldStyle} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
                </div>
                <div>
                  <label style={labelStyle}>Confirm new password</label>
                  <input style={fieldStyle} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                  Use at least one long password you are not reusing elsewhere.
                </span>
                <button className="btn btn-primary" type="submit" disabled={savingPassword || !newPassword || newPassword !== confirmPassword}>
                  {savingPassword ? 'Saving…' : 'Change password'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>We could not load your security settings right now.</p>
        )}
      </Section>
      </div>
      )}

      {activeSection === 'notifications' && (
      <div id="notifications">
        <NotificationsSection />
      </div>
      )}

      {activeSection === 'runtime' && (
      <div id="runtime">
      <Section title="Runtime readiness" subtitle="Check what works in this runtime before you rely on cloud sync, sign-in, or hosted AI.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            {
              title: 'Email sign-in & profile sync',
              ready: Boolean(authCapabilities && authCapabilities.dbConfigured !== false && authCapabilities.authDisabled !== true),
              detail: !authCapabilities
                ? 'Checking the current runtime configuration.'
                : authCapabilities.authDisabled
                ? authCapabilities.authDisabledReason || 'Authentication is disabled in this runtime.'
                : authCapabilities?.dbConfigured === false
                  ? 'Database is missing, so account sign-in cannot start here.'
                  : authCapabilities?.supabaseAuthConfigured
                    ? 'Ready for account sync and password changes.'
                    : authCapabilities?.supabaseAdminConfigured
                      ? 'Works with the current auth flow, but browser Supabase keys are still missing for a fuller client-side integration.'
                      : 'Works with the current auth flow, but Supabase Auth sync is not configured here. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to finish it.',
            },
            {
              title: 'OAuth sign-in',
              ready: Boolean(authCapabilities) && !authCapabilities?.oauthDisabled && Boolean(
                authCapabilities?.googleConfigured || authCapabilities?.githubConfigured || authCapabilities?.microsoftConfigured,
              ),
              detail: !authCapabilities
                ? 'Checking provider availability.'
                : (!authCapabilities.oauthDisabled && (authCapabilities.googleConfigured || authCapabilities.githubConfigured || authCapabilities.microsoftConfigured))
                ? 'At least one provider is available in this runtime.'
                : authCapabilities.oauthDisabledReason || 'No external sign-in provider is configured right now.',
            },
            {
              title: 'Cloud file backup',
              ready: Boolean(authCapabilities?.supabaseStorageConfigured),
              detail: authCapabilities?.supabaseStorageConfigured
                ? `Uploads can sync to Supabase Storage bucket "${authCapabilities?.supabaseStorageBucket || 'kivora-files'}" as well as local storage.`
                : authCapabilities?.supabaseAdminConfigured
                  ? `Supabase admin access is available, but storage is not ready yet. Confirm bucket "${authCapabilities?.supabaseStorageBucket || 'kivora-files'}" exists.`
                  : 'Local file storage still works, but cloud file backup is unavailable in this runtime. Add NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET.',
            },
            {
              title: 'Cloud AI',
              ready: Boolean(aiStatus?.cloudConfigured),
              detail: aiStatus?.cloudConfigured
                ? `Using ${aiStatus?.activeCloudProvider ?? 'cloud AI'} with ${aiStatus?.defaultCloudModel ?? 'the default model'}.`
                : 'Cloud AI is unavailable, so Kivora will stay local/offline-first here.',
            },
          ].map((item) => (
            <div key={item.title} style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 700 }}>{item.title}</div>
                <span className={`badge ${item.ready ? 'badge-success' : ''}`}>{item.ready ? 'Ready' : 'Local-only / unavailable'}</span>
              </div>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', margin: 0 }}>{item.detail}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)', display: 'grid', gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Supabase wiring</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${authCapabilities?.supabaseUrlConfigured ? 'badge-success' : ''}`}>URL {authCapabilities?.supabaseUrlConfigured ? 'ready' : 'missing'}</span>
            <span className={`badge ${authCapabilities?.supabaseAnonKeyConfigured ? 'badge-success' : ''}`}>Anon key {authCapabilities?.supabaseAnonKeyConfigured ? 'ready' : 'missing'}</span>
            <span className={`badge ${authCapabilities?.supabaseServiceRoleConfigured ? 'badge-success' : ''}`}>Service role {authCapabilities?.supabaseServiceRoleConfigured ? 'ready' : 'missing'}</span>
            <span className={`badge ${authCapabilities?.supabaseStorageConfigured ? 'badge-success' : ''}`}>Storage {authCapabilities?.supabaseStorageConfigured ? 'ready' : 'not ready'}</span>
          </div>
          <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            Browser features need <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Server-side auth sync and storage need <code>SUPABASE_SERVICE_ROLE_KEY</code>. Current bucket: <code>{authCapabilities?.supabaseStorageBucket || 'kivora-files'}</code>.
          </p>
        </div>
      </Section>
      </div>
      )}

      {activeSection === 'appearance' && (
      <div id="appearance">
      <Section title="Appearance" subtitle="Make the app readable and comfortable without oversized defaults or confusing labels.">
        <div>
          <div style={labelStyle}>Theme</div>
          <ChoiceButtons options={THEME_OPTIONS} value={settings.theme} onChange={value => set('theme', value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <div style={labelStyle}>Font size</div>
            <ChoiceButtons options={FONT_OPTIONS.map(option => ({ id: option.value, label: option.label }))} value={settings.fontSize} onChange={value => set('fontSize', value)} />
          </div>
          <div>
            <div style={labelStyle}>Line spacing</div>
            <ChoiceButtons options={LINE_HEIGHT_OPTIONS.map(option => ({ id: option.value, label: option.label }))} value={settings.lineHeight} onChange={value => set('lineHeight', value)} />
          </div>
        </div>

        <div>
          <div style={labelStyle}>Layout density</div>
          <ChoiceButtons options={DENSITY_OPTIONS} value={settings.density} onChange={value => set('density', value)} />
        </div>

        <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border-2)', background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Live preview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Accent', bg: 'var(--primary, var(--accent))' },
              { label: 'Surface', bg: 'var(--surface)' },
              { label: 'Surface 2', bg: 'var(--surface-2)' },
              { label: 'Background', bg: 'var(--bg)' },
              { label: 'Border', bg: 'var(--border-2)' },
            ].map(swatch => (
              <div key={swatch.label} style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                <div style={{ width: '100%', height: 36, borderRadius: 8, background: swatch.bg, border: '1px solid var(--border-2)' }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', textAlign: 'center' }}>{swatch.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={{ margin: 0 }}>
              The quick brown fox jumps over the lazy dog. This sentence uses your current font size and line spacing.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" type="button" style={{ pointerEvents: 'none' }}>Primary button</button>
              <button className="btn btn-ghost btn-sm" type="button" style={{ pointerEvents: 'none' }}>Ghost button</button>
              <span className="badge">Badge</span>
              <span className="badge badge-success">Success</span>
            </div>
          </div>
        </div>
      </Section>
      <Section title="Language" subtitle="Switch the interface language and text direction.">
        <ChoiceButtons
          options={LOCALE_OPTIONS}
          value={settings.language}
          onChange={value => set('language', value)}
        />
      </Section>
      </div>
      )}

      {activeSection === 'ai-models' && (
      <div id="ai-models">
      <Section title="AI, models & downloads" subtitle="This is now the home for local/cloud mode selection and desktop downloads, instead of separate sidebar entries.">
        <div className={styles.downloadsStack}>
          <div className={styles.downloadPanel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>AI routing</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginBottom: 14 }}>
              Choose whether Kivora should prefer local privacy, cloud convenience, or automatic fallback. For the 1.0 Mac release, Mini must be bundled before we promise first-launch offline AI.
            </p>
            <AiRuntimeControls compact />
          </div>

          <div className={styles.downloadPanel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700 }}>Downloads & releases</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                  Desktop installers and optional local AI assets live here now too.
                </div>
              </div>
              {downloads?.releaseUrl ? (
                <a href={downloads.releaseUrl} className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  Release {downloads.releaseTag}
                </a>
              ) : null}
            </div>

            {downloadsLoading ? (
              <div className="skeleton" style={{ height: 180, borderRadius: 18 }} />
            ) : (
              <div className={styles.downloadGrid}>
                <DownloadCard
                  title="macOS Apple Silicon"
                  hint="Primary 1.0 desktop download. Mini is required in the bundle before we claim first-launch offline AI."
                  primary={downloads?.macAsset ? { label: 'Download DMG', href: downloads.macAsset.browser_download_url } : null}
                />
                <DownloadCard
                  title="Windows x64"
                  hint="Same local-model system, with optional heavier models after install. First-launch offline AI is currently guaranteed on the Mac 1.0 path."
                  primary={downloads?.windowsInstaller ? { label: 'Download installer', href: downloads.windowsInstaller.browser_download_url } : null}
                  secondary={downloads?.windowsPortable ? { label: 'Portable EXE', href: downloads.windowsPortable.browser_download_url } : null}
                />
                <DownloadCard
                  title="Integrity files"
                  hint="Use these to verify model assets and release integrity."
                  primary={downloads?.manifestAsset ? { label: 'Manifest', href: downloads.manifestAsset.browser_download_url } : null}
                  secondary={downloads?.checksumsAsset ? { label: 'Checksums', href: downloads.checksumsAsset.browser_download_url } : null}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <span className="badge">Local = private + offline</span>
              <span className="badge">Cloud = convenience</span>
              <span className="badge">Offline fallback always available</span>
              {downloads?.hasPublishedModelAssets ? <span className="badge badge-success">Optional model assets published</span> : null}
            </div>
          </div>

          {/* ── Desktop: in-app model upgrade ──────────────────────────── */}
          <div className={styles.downloadPanel}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Offline AI model</div>
            <DesktopModelPanel />
          </div>

          {/* ── Web/browser: Ollama + Qwen local AI setup ──────────────── */}
          <div className={styles.downloadPanel} id="ollama-setup">
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Local AI (Ollama + Qwen) — browser only</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginBottom: 14, margin: '0 0 14px' }}>
              If using the web version, run Qwen 2.5 on-device via Ollama for private offline AI. Not needed when using the desktop app.
            </p>
            <OllamaSetupPanel />
          </div>
        </div>
      </Section>
      </div>
      )}

      {activeSection === 'utilities' && (
      <div id="utilities">
      <Section title="Utilities" subtitle="Secondary pages still exist, but the main product now revolves around Workspace, Scholar Hub, and Math.">
        <div className={styles.sectionStack}>
          <div className={styles.utilityGrid}>
            {[
              {
                href: '/analytics',
                icon: '📈',
                title: 'Analytics',
                description: 'Review weak areas, retention, and the next best study actions without leaving the app shell.',
                meta: ['Insights', 'Retention', 'Next actions'],
              },
              {
                href: '/sharing',
                icon: '🔗',
                title: 'Sharing',
                description: 'Manage public profile links, shared files, and review what has already been sent out.',
                meta: ['Profile', 'Links', 'Permissions'],
              },
              {
                href: '/status',
                icon: '🩺',
                title: 'System status',
                description: 'Check runtime, database, cloud AI, and deployment diagnostics before troubleshooting.',
                meta: ['Runtime', 'Database', 'Deployments'],
              },
            ].map((item) => (
              <a key={item.href} href={item.href} className={styles.utilityCard}>
                <div className={styles.utilityCardHeader}>
                  <span className={styles.utilityIcon}>{item.icon}</span>
                  <div>
                    <h3 className={styles.utilityTitle}>{item.title}</h3>
                    <p className={styles.utilityDescription}>{item.description}</p>
                  </div>
                </div>
                <div className={styles.utilityMeta}>
                  {item.meta.map((tag) => (
                    <span key={tag} className={styles.pill}>{tag}</span>
                  ))}
                </div>
              </a>
            ))}
          </div>

          <div className={styles.reportHero}>
            <div className={styles.reportHeroCopy}>
              <h3>Secondary tools, still easy to reach</h3>
              <p>
                These pages are no longer top-level sidebar destinations, but they are still part of the finished product. Keep them here for diagnostics, sharing, and progress review without making the main navigation noisy.
              </p>
            </div>
            <div className={styles.reportActionRow}>
              <a href="/workspace" className="btn btn-primary btn-sm">Open Workspace</a>
              <a href="/sharing" className="btn btn-ghost btn-sm">Open Sharing</a>
            </div>
          </div>
        </div>
      </Section>
      </div>
      )}

      {activeSection === 'reporting' && (
      <div id="reporting">
      <Section title="Report & diagnostics" subtitle="File bugs and feature requests directly from settings, with the current route, theme, and language already included.">
        <div className={styles.reportShell}>
          <div className={styles.reportHero}>
            <div className={styles.reportHeroCopy}>
              <h3>Report a problem without leaving settings</h3>
              <p>
                Use this panel for bugs, broken UI, and missing workflows. Kivora will prefill diagnostics so the issue is easier to act on and you do not have to gather everything manually.
              </p>
            </div>
            <div className={styles.reportActionRow}>
              <a href="/status" className="btn btn-ghost btn-sm">Open status</a>
              <a href="https://github.com/Alphadarklord1/kivora/issues" className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">
                View issues
              </a>
            </div>
          </div>

          <div className={styles.reportPanel}>
            <ReportIssuePanel embedded />
          </div>
        </div>
      </Section>
      </div>
      )}

      {/* ── Privacy & Data Control ─────────────────────────────────────── */}
      {activeSection === 'privacy' && (
      <div id="privacy">
        <PrivacySection />
      </div>
      )}
        </div>
      </div>
    </div>
  );
}

// ── Notifications panel ──────────────────────────────────────────────────────

const NOTIFICATION_PREFS = [
  {
    key: 'kivora_notif_reminders',
    label: 'Daily study reminders',
    hint: 'Get nudged at your chosen time if you have not opened Kivora that day.',
    defaultOn: true,
  },
  {
    key: 'kivora_notif_review',
    label: 'Flashcard review alerts',
    hint: 'Alert when you have cards due for review so your SRS schedule stays on track.',
    defaultOn: true,
  },
  {
    key: 'kivora_notif_uploads',
    label: 'File upload confirmations',
    hint: 'Show a brief success message after each file is saved to the workspace.',
    defaultOn: true,
  },
  {
    key: 'kivora_notif_ai',
    label: 'AI generation updates',
    hint: 'Notify when a long AI generation finishes so you can switch to another tab.',
    defaultOn: false,
  },
  {
    key: 'kivora_notif_system',
    label: 'System and error alerts',
    hint: 'Surface connectivity issues, failed saves, and runtime warnings inline.',
    defaultOn: true,
  },
] as const;

function readNotifPref(key: string, defaultOn: boolean): boolean {
  if (typeof window === 'undefined') return defaultOn;
  const stored = localStorage.getItem(key);
  return stored === null ? defaultOn : stored === '1';
}

// ── Reusable toggle row used in NotificationsSection ─────────────────────────
function NotifToggleRow({
  checked,
  label,
  hint,
  onToggle,
  disabled,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 14, padding: '12px 14px', borderRadius: 12,
        border: `1.5px solid ${checked ? 'color-mix(in srgb, var(--primary) 28%, var(--border-2))' : 'var(--border-2)'}`,
        background: checked ? 'color-mix(in srgb, var(--primary) 5%, var(--surface-2))' : 'var(--surface-2)',
        transition: 'border-color 0.14s, background 0.14s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{hint}</div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-label={`${checked ? 'Disable' : 'Enable'} ${label}`}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: checked ? 'var(--primary, var(--accent))' : 'var(--border-2)',
          position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          left: checked ? 22 : 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
        }} />
      </button>
    </div>
  );
}

function NotificationsSection() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    return Object.fromEntries(
      NOTIFICATION_PREFS.map(p => [p.key, readNotifPref(p.key, p.defaultOn)]),
    );
  });

  // Browser notification permission state
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [requestingPermission, setRequestingPermission] = useState(false);

  // Browser-scheduled notification preferences
  const [examNotifEnabled, setExamNotifEnabled] = useState(true);
  const [streakNotifEnabled, setStreakNotifEnabled] = useState(true);

  useEffect(() => {
    setBrowserPermission(getNotificationPermission());
    if (typeof window !== 'undefined') {
      setExamNotifEnabled(localStorage.getItem('kivora-notif-exams') !== 'false');
      setStreakNotifEnabled(localStorage.getItem('kivora-notif-streak') !== 'false');
    }
  }, []);

  const handleRequestPermission = useCallback(async () => {
    setRequestingPermission(true);
    try {
      const granted = await requestNotificationPermission();
      setBrowserPermission(getNotificationPermission());
      if (granted) {
        toast('Browser notifications enabled', 'success');
      } else {
        toast('Permission was not granted. Check your browser settings.', 'warning');
      }
    } finally {
      setRequestingPermission(false);
    }
  }, [toast]);

  function toggleExamNotif() {
    const next = !examNotifEnabled;
    setExamNotifEnabled(next);
    localStorage.setItem('kivora-notif-exams', next ? 'true' : 'false');
    toast('Exam reminder preference saved', 'success');
  }

  function toggleStreakNotif() {
    const next = !streakNotifEnabled;
    setStreakNotifEnabled(next);
    localStorage.setItem('kivora-notif-streak', next ? 'true' : 'false');
    toast('Streak alert preference saved', 'success');
  }

  function toggle(key: string) {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(key, next[key] ? '1' : '0');
      return next;
    });
    toast('Notification preference saved', 'success');
  }

  function enableAll() {
    const next: Record<string, boolean> = {};
    for (const p of NOTIFICATION_PREFS) {
      next[p.key] = true;
      localStorage.setItem(p.key, '1');
    }
    setPrefs(next);
    toast('All notifications enabled', 'success');
  }

  function disableAll() {
    const next: Record<string, boolean> = {};
    for (const p of NOTIFICATION_PREFS) {
      next[p.key] = false;
      localStorage.setItem(p.key, '0');
    }
    setPrefs(next);
    toast('All notifications disabled', 'warning');
  }

  const enabledCount = Object.values(prefs).filter(Boolean).length;

  const permissionLabel: Record<NotificationPermission | 'unsupported', string> = {
    granted: 'Granted',
    denied: 'Denied',
    default: 'Not yet granted',
    unsupported: 'Not supported in this browser',
  };

  const permissionColor: Record<NotificationPermission | 'unsupported', string> = {
    granted: 'var(--success, #22c55e)',
    denied: 'var(--danger, #ef4444)',
    default: 'var(--text-3)',
    unsupported: 'var(--text-3)',
  };

  return (
    <>
      <Section
        title="Notifications"
        subtitle="Control which reminders and alerts Kivora surfaces during your study sessions."
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
            {enabledCount} of {NOTIFICATION_PREFS.length} notification types active
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={enableAll} type="button">Enable all</button>
            <button className="btn btn-ghost btn-sm" onClick={disableAll} type="button">Disable all</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {NOTIFICATION_PREFS.map(item => (
            <div
              key={item.key}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 14, padding: '12px 14px', borderRadius: 12,
                border: `1.5px solid ${prefs[item.key] ? 'color-mix(in srgb, var(--primary) 28%, var(--border-2))' : 'var(--border-2)'}`,
                background: prefs[item.key] ? 'color-mix(in srgb, var(--primary) 5%, var(--surface-2))' : 'var(--surface-2)',
                transition: 'border-color 0.14s, background 0.14s',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{item.hint}</div>
              </div>
              <button
                type="button"
                onClick={() => toggle(item.key)}
                aria-label={`${prefs[item.key] ? 'Disable' : 'Enable'} ${item.label}`}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: prefs[item.key] ? 'var(--primary, var(--accent))' : 'var(--border-2)',
                  position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  left: prefs[item.key] ? 22 : 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
                }} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-2)', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
          Preferences are stored locally on this device and do not sync across browsers. Browser notification permission is separate — grant it when prompted by your browser.
        </div>
      </Section>

      {/* ── Browser Notifications ─────────────────────────────────────────── */}
      <Section
        title="Browser Notifications"
        subtitle="Allow Kivora to send timed OS-level alerts even when you are away from the tab."
      >
        {/* Permission status row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12, padding: '14px 16px', borderRadius: 12,
          border: '1px solid var(--border-2)', background: 'var(--surface-2)',
        }}>
          <div>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Permission status</div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: 2, color: permissionColor[browserPermission] }}>
              {permissionLabel[browserPermission]}
            </div>
          </div>
          {browserPermission !== 'granted' && browserPermission !== 'unsupported' && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleRequestPermission}
              disabled={requestingPermission || browserPermission === 'denied'}
            >
              {browserPermission === 'denied' ? 'Blocked by browser' : requestingPermission ? 'Requesting…' : 'Enable notifications'}
            </button>
          )}
          {browserPermission === 'denied' && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
              To re-enable, click the lock icon in your browser address bar and allow notifications.
            </span>
          )}
        </div>

        {/* Exam reminders toggle */}
        <NotifToggleRow
          checked={examNotifEnabled}
          label="Exam reminders"
          hint="Sends a reminder the evening before and the morning of any exam in your Planner. Requires browser notification permission."
          onToggle={toggleExamNotif}
          disabled={browserPermission !== 'granted'}
        />

        {/* Daily streak alerts toggle */}
        <NotifToggleRow
          checked={streakNotifEnabled}
          label="Daily streak alerts"
          hint="Notifies you at 8 pm if you have not studied any flashcards yet today, so you can keep your streak going."
          onToggle={toggleStreakNotif}
          disabled={browserPermission !== 'granted'}
        />

        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-2)', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
          Scheduled alerts are set up when the app loads and require the browser tab to be open at the scheduled time. Reminders are deduplicated so you will not receive the same alert twice.
        </div>
      </Section>
    </>
  );
}

// ── Privacy & Data Control panel ────────────────────────────────────────────

function PrivacySection() {
  const { toast } = useToast();
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [aiMode, setAiMode] = useState<'full' | 'metadata-only' | 'offline'>(() => {
    if (typeof window === 'undefined') return 'full';
    return (localStorage.getItem('kivora_ai_mode') as 'full' | 'metadata-only' | 'offline') ?? 'full';
  });
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => {
    return usageAnalyticsEnabledClient();
  });
  const [crashReports, setCrashReports] = useState(() => {
    return crashReportsEnabledClient();
  });

  function saveAiMode(mode: 'full' | 'metadata-only' | 'offline') {
    setAiMode(mode);
    localStorage.setItem('kivora_ai_mode', mode);
    toast('AI data mode updated', 'success');
  }

  function toggleAnalytics(enabled: boolean) {
    setAnalyticsEnabled(enabled);
    setUsageAnalyticsEnabled(enabled);
    toast(enabled ? 'Local usage diagnostics enabled' : 'Local usage diagnostics cleared', enabled ? 'success' : 'warning');
  }

  function toggleCrash(enabled: boolean) {
    setCrashReports(enabled);
    setCrashReportsEnabled(enabled);
    toast(enabled ? 'Crash summaries enabled' : 'Crash summaries cleared', enabled ? 'success' : 'warning');
  }

  async function exportData() {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export', { method: 'GET', credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kivora-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Data exported — check your downloads', 'success');
    } catch {
      toast('Export failed. Please try again.', 'error');
    } finally {
      setExportLoading(false);
    }
  }

  async function deleteAllData() {
    if (deleteConfirm.trim().toLowerCase() !== 'delete my data') {
      toast('Type "delete my data" to confirm', 'error');
      return;
    }
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/user/delete-data', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      toast('All data deleted. Signing you out…', 'success');
      setTimeout(() => window.location.href = '/api/auth/signout', 1500);
    } catch {
      toast('Data deletion failed. Contact support.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }

  const AI_MODES: { id: 'full' | 'metadata-only' | 'offline'; label: string; hint: string; icon: string }[] = [
    {
      id: 'full',
      label: 'Full context',
      hint: 'Your file text is sent to cloud AI for generation. Best results.',
      icon: '🌐',
    },
    {
      id: 'metadata-only',
      label: 'Metadata only',
      hint: 'Only file names and word counts are sent — content stays local.',
      icon: '🔒',
    },
    {
      id: 'offline',
      label: 'Offline only',
      hint: 'No data leaves your device. Uses built-in generation (no cloud AI).',
      icon: '✈️',
    },
  ];

  const dataItems = [
    { icon: '📁', label: 'Folders & files', where: 'Cloud (PostgreSQL)', note: 'File metadata — names, sizes, dates' },
    { icon: '📄', label: 'File content', where: 'Local only (IndexedDB)', note: 'Blobs never leave your browser' },
    { icon: '📇', label: 'Review sets', where: 'Local + Cloud sync', note: 'SRS schedule stored on device' },
    { icon: '🗂', label: 'Library items', where: 'Cloud (PostgreSQL)', note: 'Saved generated outputs' },
    { icon: '📊', label: 'Study analytics', where: 'Cloud (PostgreSQL)', note: 'Quiz scores and review history' },
    { icon: '⚙️', label: 'Settings', where: 'Cloud (PostgreSQL)', note: 'Theme, font, density preferences' },
  ];

  const aiCantItems = [
    'Access your raw file blobs stored in IndexedDB',
    'Retain or train on your content between sessions',
    'Share your data with third parties',
    'Access data from other users',
    'Store credentials, passwords, or payment information',
  ];

  const aiCanItems = [
    'Receive extracted text from files you choose to send',
    'Generate study material from that text',
    'Use anonymised usage metadata for quality monitoring',
  ];

  return (
    <>
      <Section
        title="🔒 Privacy & Data control"
        subtitle="Understand exactly what is stored, where, and what you can do with it."
      >
        {/* Data map */}
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 10 }}>Where your data lives</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {dataItems.map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{item.note}</div>
                </div>
                <span className="badge" style={{ flexShrink: 0, fontSize: 10 }}>{item.where}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="🤖 AI API data controls"
        subtitle="Control what your content is used for and what can be sent to AI APIs."
      >
        {/* What AI can/cannot do */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 8, color: '#4ade80' }}>✓ What AI can do</div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 'var(--text-xs)', color: 'var(--text-2)', lineHeight: 1.8 }}>
              {aiCanItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div style={{ padding: 14, borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 8, color: '#ef4444' }}>✗ What AI cannot do</div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 'var(--text-xs)', color: 'var(--text-2)', lineHeight: 1.8 }}>
              {aiCantItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>

        {/* AI data mode */}
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 10 }}>Content sent to AI</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {AI_MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => saveAiMode(mode.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                  border: aiMode === mode.id ? '2px solid var(--accent)' : '1.5px solid var(--border-2)',
                  background: aiMode === mode.id ? 'var(--accent-subtle, color-mix(in srgb, var(--accent) 10%, var(--surface)))' : 'var(--surface-2)',
                  transition: 'all 0.14s',
                }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{mode.icon}</span>
                <div>
                  <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 2 }}>
                    {mode.label}
                    {aiMode === mode.id && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginLeft: 6 }}>● Active</span>}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{mode.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="📈 Telemetry & tracking"
        subtitle="Control whether Kivora keeps local usage diagnostics and recent crash summaries for troubleshooting."
      >
        <div style={{ display: 'grid', gap: 12 }}>
          {[
            {
              label: 'Usage analytics',
              hint: 'Store local page and tool counts so issue reports can include useful diagnostics. Turning this off clears the saved snapshot.',
              value: analyticsEnabled,
              onChange: toggleAnalytics,
            },
            {
              label: 'Crash reports',
              hint: 'Store recent runtime error summaries locally when something breaks. No file content is included.',
              value: crashReports,
              onChange: toggleCrash,
            },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{item.hint}</div>
              </div>
              <button
                onClick={() => item.onChange(!item.value)}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: item.value ? 'var(--accent)' : 'var(--border-2)',
                  position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                }}
                aria-label={`${item.value ? 'Disable' : 'Enable'} ${item.label}`}
              >
                <span style={{
                  position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s',
                  left: item.value ? 22 : 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="📦 Data portability"
        subtitle="Export or delete all your Kivora data at any time. No lock-in."
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Export everything</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
              Download a JSON file of all your folders, files metadata, library items, review sets, quiz history, and study plans.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportData} disabled={exportLoading} style={{ flexShrink: 0 }}>
            {exportLoading ? '⏳ Exporting…' : '⬇ Export my data'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 6 }}>Delete all data</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginBottom: 10 }}>
            Permanently removes all your folders, files metadata, library items, and account. This cannot be undone.
            File content stored locally in your browser (IndexedDB) is also cleared.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder='Type "delete my data" to unlock'
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 'var(--text-sm)',
                border: `1.5px solid ${deleteConfirm.trim().toLowerCase() === 'delete my data' ? 'var(--danger)' : 'var(--border-2)'}`,
                background: 'var(--surface)', color: 'var(--text)',
              }}
            />
            <button
              className="btn btn-sm"
              style={{ background: 'var(--danger)', color: '#fff', border: 'none', flexShrink: 0 }}
              disabled={deleteConfirm.trim().toLowerCase() !== 'delete my data' || deleteLoading}
              onClick={deleteAllData}
            >
              {deleteLoading ? '⏳ Deleting…' : '🗑 Delete all'}
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}
