'use client';

import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useSettings, type Density, type Theme } from '@/providers/SettingsProvider';
import { AiRuntimeControls } from '@/components/models/AiRuntimeControls';
import { ReportIssuePanel } from '@/components/settings/ReportIssuePanel';
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
  | 'runtime'
  | 'ai-models'
  | 'utilities'
  | 'reporting'
  | 'privacy';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId;
  label: string;
  title: string;
  description: string;
}> = [
  { id: 'account', label: 'Account', title: 'Profile and account basics', description: 'Name, image, bio, and sign-in details.' },
  { id: 'security', label: 'Security', title: 'Password and 2-step verification', description: 'Protect the account before you rely on it.' },
  { id: 'appearance', label: 'Appearance', title: 'Theme, language, and readability', description: 'Keep the app readable without oversized defaults.' },
  { id: 'runtime', label: 'Runtime', title: 'What works in this runtime', description: 'Check cloud, auth, and storage readiness.' },
  { id: 'ai-models', label: 'AI & Downloads', title: 'AI routing and desktop downloads', description: 'One place for model mode and releases.' },
  { id: 'utilities', label: 'Utilities', title: 'Secondary tools', description: 'Analytics, sharing, and status live here.' },
  { id: 'reporting', label: 'Report Issue', title: 'Diagnostics and issue reporting', description: 'File bugs without leaving settings.' },
  { id: 'privacy', label: 'Privacy', title: 'Privacy and data control', description: 'Choose how much Kivora stores and sends.' },
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
            <strong>{section.label}</strong>
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
            Split into focused sections so account, privacy, downloads, and appearance no longer fight for the same page.
          </p>
        </div>
        <div className={styles.heroBadges}>
          <span className="badge">Workspace + Scholar Hub + Math</span>
          <span className="badge">Downloads live here now</span>
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
                  {account.connectedAccounts.map(provider => (
                    <span key={provider} className="badge badge-accent">{provider}</span>
                  ))}
                </div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={handleSignOut}>Sign out</button>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                Profile picture, display name, and description are saved to your account.
              </span>
              <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save profile'}
              </button>
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
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Preview</div>
          <p style={{ marginBottom: 10 }}>
            This preview uses your live font size, line spacing, and density settings so you can feel whether the interface reads as normal, too tight, or too large.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge">Normal text size</span>
            <span className="badge">Cleaner spacing</span>
            <span className="badge">Better contrast</span>
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
              Choose whether Kivora should prefer local privacy, cloud convenience, or automatic fallback. This replaces the separate models sidebar destination.
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
                  hint="Primary desktop download with offline-first local AI support."
                  primary={downloads?.macAsset ? { label: 'Download DMG', href: downloads.macAsset.browser_download_url } : null}
                />
                <DownloadCard
                  title="Windows x64"
                  hint="Installer first, with portable build when attached to the release."
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
        </div>
      </Section>
      </div>
      )}

      {activeSection === 'utilities' && (
      <div id="utilities">
      <Section title="Utilities" subtitle="Secondary pages still exist, but the main product now revolves around Workspace, Scholar Hub, and Math.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { href: '/analytics', title: 'Analytics', description: 'Review weak areas, retention, and next-study actions.' },
            { href: '/sharing', title: 'Sharing', description: 'Manage shared links for library items and files.' },
            { href: '/status', title: 'System status', description: 'Check runtime, database, and deployment diagnostics.' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '16px', minHeight: 0, display: 'grid', gap: 6, textDecoration: 'none' }}
            >
              <span style={{ fontWeight: 700 }}>{item.title}</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>{item.description}</span>
            </a>
          ))}
        </div>
      </Section>
      </div>
      )}

      {activeSection === 'reporting' && (
      <div id="reporting">
      <Section title="Report & diagnostics" subtitle="File bugs and feature requests directly from settings, with the current route, theme, and language already included.">
        <ReportIssuePanel embedded />
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
