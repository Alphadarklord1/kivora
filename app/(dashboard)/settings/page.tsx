'use client';

import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { requestNotificationPermission, getNotificationPermission } from '@/lib/notifications/scheduler';
import { signOut, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useI18n } from '@/lib/i18n/useI18n';

const THEME_OPTIONS: { id: Theme; label: string; hint: string; color: string }[] = [
  { id: 'system',  label: 'System', hint: 'Follow device', color: 'linear-gradient(135deg, #1a1f2e 50%, #f8f9fa 50%)' },
  { id: 'blue',   label: 'Dark',   hint: 'Navy dark',     color: '#1a1f2e' },
  { id: 'light',  label: 'Light',  hint: 'Bright',        color: '#f0f2f5' },
  { id: 'black',  label: 'Black',  hint: 'Contrast',      color: '#000000' },
];

const FONT_OPTIONS = [
  { value: '0.95', label: 'S' },
  { value: '1',    label: 'M' },
  { value: '1.05', label: 'L' },
  { value: '1.1',  label: 'XL' },
] as const;

const LINE_HEIGHT_OPTIONS = [
  { value: '1.4',  label: 'Tight' },
  { value: '1.5',  label: 'Normal' },
  { value: '1.65', label: 'Relaxed' },
  { value: '1.8',  label: 'Wide' },
] as const;

const DENSITY_OPTIONS: { id: Density; label: string; hint: string }[] = [
  { id: 'compact',     label: 'Compact',     hint: 'More on screen' },
  { id: 'normal',      label: 'Normal',      hint: 'Balanced spacing' },
  { id: 'comfortable', label: 'Comfortable', hint: 'Easier tapping' },
];

const LANGUAGE_SAMPLE: Record<string, { greeting: string; note: string }> = {
  en: { greeting: 'Workspace, Scholar Hub, and Math stay in sync.', note: 'Best if you want the default interface copy.' },
  ar: { greeting: 'مساحة العمل وScholar Hub والرياضيات تبقى متناسقة.', note: 'Right-to-left layout turns on automatically.' },
  fr: { greeting: 'Workspace, Scholar Hub et Maths restent cohérents.', note: 'Useful if you want French labels while studying.' },
};

const RUNTIME_READINESS_ITEMS = [
  'Email sign-in & profile sync',
  'OAuth sign-in',
  'Cloud file backup',
  'Cloud AI',
] as const;

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
  emailVerified: string | null;
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
  hasIntegrityReadyOptionalModels: boolean;
  manifestLooksReleaseReady: boolean;
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
  { id: 'account',       icon: '👤', label: 'Account',      title: 'Profile & account',              description: 'Name, image, bio, and sign-in details.' },
  { id: 'security',      icon: '🔒', label: 'Security',     title: 'Password & 2-step verification',  description: 'Protect the account before you rely on it.' },
  { id: 'appearance',    icon: '🎨', label: 'Appearance',   title: 'Theme, language & readability',   description: 'Keep the app readable and language switching deliberate.' },
  { id: 'notifications', icon: '🔔', label: 'Notifications',title: 'Notification preferences',        description: 'Control reminders, review alerts, and system messages.' },
  { id: 'runtime',       icon: '⚙️', label: 'Runtime',      title: 'Runtime readiness',               description: 'Check cloud, auth, and storage readiness.' },
  { id: 'ai-models',     icon: '🤖', label: 'AI & Downloads',title: 'AI routing & downloads',         description: 'Model mode, offline AI, and desktop releases.' },
  { id: 'utilities',     icon: '🧰', label: 'Labs & Tools', title: 'Labs & secondary tools',          description: 'Math labs, analytics, sharing, and status.' },
  { id: 'reporting',     icon: '🐛', label: 'Report Issue', title: 'Diagnostics & issue reporting',   description: 'File bugs without leaving settings.' },
  { id: 'privacy',       icon: '🛡️', label: 'Privacy',      title: 'Privacy & data control',          description: 'Choose how much Kivora stores and sends.' },
];

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '10px 13px',
  borderRadius: 10,
  border: '1px solid var(--border-2)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontSize: 'var(--text-sm)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--text-secondary)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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
        style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-2)', flexShrink: 0 }}
      />
    );
  }

  return (
    <div
      style={{
        width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center',
        fontWeight: 700, fontSize: '1.1rem', color: '#fff', background: bg,
        border: '2px solid var(--border-2)', flexShrink: 0,
      }}
    >
      {text}
    </div>
  );
}

function GuestUpgradeNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: compact ? 'center' : 'flex-start',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: compact ? 0 : 14, borderRadius: compact ? 0 : 14,
        border: compact ? 'none' : '1px solid var(--border-2)',
        background: compact ? 'transparent' : 'var(--surface-2)',
      }}
    >
      <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', flex: 1, minWidth: 240 }}>
        You are in guest mode. Sign in to save a profile picture, short description, password, and 2-step verification.
      </span>
      <a href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
        Sign in / Register
      </a>
    </div>
  );
}

// ── Segmented control ─────────────────────────────────────────────────────────

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles.segmented}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`${styles.segmentBtn} ${value === o.value ? styles.segmentBtnActive : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── ChoiceButtons (kept for density and other multi-option pickers) ────────────

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
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className={`btn ${value === option.id ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onChange(option.id)}
          style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 13px', minHeight: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}
        >
          <span style={{ fontWeight: 600 }}>{option.label}</span>
          {option.hint ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{option.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowMain}>
        <span className={styles.settingRowLabel}>{label}</span>
        {hint ? <p className={styles.settingRowHint}>{hint}</p> : null}
      </div>
      <div className={styles.settingRowControl}>{children}</div>
    </div>
  );
}

// ── Toggle switch (standalone, reused in SettingRow) ─────────────────────────

function Toggle({ checked, onToggle, disabled }: { checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={checked ? 'Disable' : 'Enable'}
      className={styles.toggleSwitch}
      data-on={checked ? 'true' : 'false'}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
    >
      <span className={styles.toggleThumb} data-on={checked ? 'true' : 'false'} />
    </button>
  );
}

// ── Slim settings rail ────────────────────────────────────────────────────────

function SettingsRail({
  activeSection,
  onSelect,
}: {
  activeSection: SettingsSectionId;
  onSelect: (section: SettingsSectionId) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className={styles.railSlim} aria-label="Settings navigation">
      {SETTINGS_SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          className={`${styles.railItem} ${activeSection === section.id ? styles.railItemActive : ''}`}
          onClick={() => onSelect(section.id)}
        >
          <span className={styles.railItemIcon}>{section.icon}</span>
          <span>{t(section.label)}</span>
        </button>
      ))}
    </nav>
  );
}

// ── Download card ─────────────────────────────────────────────────────────────

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
    <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--border-2)', background: 'var(--surface-2)', display: 'grid', gap: 10 }}>
      <div>
        <div style={{ fontWeight: 700, marginBottom: 3 }}>{title}</div>
        <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {primary ? (
          <a href={primary.href} className="btn btn-primary btn-sm" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            {primary.label}
          </a>
        ) : (
          <span className="badge">Unavailable in this release</span>
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

// ── Section header (inside stage) ─────────────────────────────────────────────

function SectionHeader({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionHeaderIcon}>{icon}</span>
      <div>
        <h2 className={styles.sectionHeaderTitle}>{title}</h2>
        <p className={styles.sectionHeaderSub}>{description}</p>
      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={styles.settingsFeatureCard} style={style}>
      {children}
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────

function SettingsPageContent() {
  const { settings, updateSetting } = useSettings();
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();

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
  const [sendingVerification, setSendingVerification] = useState(false);
  const searchParams = useSearchParams();

  const refreshAccount = useCallback(async () => {
    if (!session?.user) {
      setAccountLoading(false);
      return null;
    }
    setAccountLoading(true);
    try {
      const response = await fetch('/api/account');
      if (!response.ok) throw new Error('Could not load account');
      const data = await response.json();
      setAccount(data);
      setName(data.name ?? '');
      setImageUrl(data.image ?? '');
      setBio(data.bio ?? '');
      setStudyInterests(data.studyInterests ?? '');
      return data;
    } catch {
      toast('Could not load your account settings', 'error');
      return null;
    } finally {
      setAccountLoading(false);
    }
  }, [session?.user, toast]);

  useEffect(() => {
    const v = searchParams.get('verified');
    if (!v) return;

    let cancelled = false;
    const handleVerificationState = async () => {
      if (v === '1') {
        const refreshed = await refreshAccount();
        if (!cancelled) {
          if (refreshed?.emailVerified) {
            toast('Email verified successfully', 'success');
          } else if (refreshed) {
            toast('Email verification is still processing. Refresh in a moment if the badge has not updated.', 'warning');
          }
        }
      } else if (!cancelled && v === 'error') {
        toast('Verification link is invalid or has expired', 'error');
      }
      if (!cancelled) router.replace('/settings', { scroll: false });
    };

    void handleVerificationState();
    return () => { cancelled = true; };
  }, [refreshAccount, router, searchParams, toast]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    let cancelled = false;
    setDownloadsLoading(true);
    fetch('/api/models/downloads')
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setDownloads(data); })
      .catch(() => { if (!cancelled) setDownloads(null); })
      .finally(() => { if (!cancelled) setDownloadsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '') as SettingsSectionId;
      if (SETTINGS_SECTIONS.some(s => s.id === hash)) setActiveSection(hash);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/capabilities')
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setAuthCapabilities(data); })
      .catch(() => { if (!cancelled) setAuthCapabilities(null); });
    fetch('/api/ai/status')
      .then(async r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled) setAiStatus(data); })
      .catch(() => { if (!cancelled) setAiStatus(null); });
    return () => { cancelled = true; };
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
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${section}`);
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
        body: JSON.stringify({ name: name.trim(), image: imageUrl.trim() || null, bio: bio.trim() || null, studyInterests: studyInterests.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) { toast(data.reason || 'Could not update your profile', 'error'); return; }
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
    if (newPassword !== confirmPassword) { toast('The new passwords do not match', 'error'); return; }
    setSavingPassword(true);
    try {
      const response = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) { toast(data.reason || 'Could not update password', 'error'); return; }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
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
      if (!response.ok) { toast(data.reason || 'Could not start two-step verification', 'error'); return; }
      setTwoFactorSetup({ secret: data.secret, manualEntryKey: data.manualEntryKey, otpAuthUri: data.otpAuthUri });
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
      if (!response.ok) { toast(data.reason || 'That code did not work', 'error'); return; }
      setTwoFactorCode(''); setTwoFactorSetup(null);
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
      if (!response.ok) { toast(data.reason || 'Could not disable two-step verification', 'error'); return; }
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
  const currentSectionMeta = SETTINGS_SECTIONS.find(s => s.id === activeSection) ?? SETTINGS_SECTIONS[0];

  return (
    <div className={styles.pageShell}>

      {/* ── Page hero ───────────────────────────────────────────── */}
      <div className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>{t('Settings')}</h1>
          <p className={styles.heroCopy}>
            {t('Manage your profile, security, appearance, and privacy from one place.')}
          </p>
        </div>
        <div className={styles.heroBadges}>
          {account && !account.isGuest ? <span className="badge badge-success">{account.email}</span> : null}
          {!session?.user || account?.isGuest ? <span className="badge">Guest mode</span> : null}
          {saved ? <span className="badge badge-success">Saved ✓</span> : null}
        </div>
      </div>

      <div className={styles.settingsShell}>
        {/* ── Rail ──────────────────────────────────────────────── */}
        <SettingsRail activeSection={activeSection} onSelect={openSection} />

        {/* ── Stage ─────────────────────────────────────────────── */}
        <div className={styles.settingsStage}>
          <SectionHeader
            icon={currentSectionMeta.icon}
            title={t(currentSectionMeta.title)}
            description={t(currentSectionMeta.description)}
          />

          {/* ── Account ─────────────────────────────────────────── */}
          {activeSection === 'account' && (
            <div className={styles.sectionStack}>
              {showGuestState ? (
                <>
                  <GuestUpgradeNotice />
                  <Card>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                      <AvatarPreview image={null} name="Guest user" email="guest@kivora.local" />
                      <div>
                        <div style={{ fontWeight: 700 }}>Guest user</div>
                        <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', marginTop: 3 }}>
                          Profile fields will save after sign-in.
                        </div>
                        <div className={styles.runtimeChipRow} style={{ marginTop: 10 }}>
                          <span className="badge">Profile picture</span>
                          <span className="badge">Bio</span>
                          <span className="badge">Study interests</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                  <div className={styles.formGrid}>
                    <div>
                      <label style={labelStyle}>Display name</label>
                      <input style={fieldStyle} value="" onChange={() => {}} placeholder="Your name" disabled />
                    </div>
                    <div>
                      <label style={labelStyle}>Profile picture URL</label>
                      <input style={fieldStyle} value="" onChange={() => {}} placeholder="https://…" disabled />
                    </div>
                  </div>
                </>
              ) : accountLoading ? (
                <div className="skeleton" style={{ height: 160, borderRadius: 16 }} />
              ) : account ? (
                <>
                  {/* Profile hero */}
                  <Card>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <AvatarPreview image={imageUrl || account.image} name={name || account.name} email={account.email} />
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', lineHeight: 1.2 }}>
                          {account.name || account.email}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>{account.email}</span>
                          {account.emailVerified
                            ? <span className="badge badge-success" style={{ fontSize: 'var(--text-xs)' }}>✓ Verified</span>
                            : (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                                disabled={sendingVerification || account.isGuest}
                                onClick={async () => {
                                  setSendingVerification(true);
                                  try {
                                    const res = await fetch('/api/auth/send-verification', { method: 'POST' });
                                    const data = await res.json() as { ok?: boolean; dev?: boolean; error?: string };
                                    if (data.ok) {
                                      toast(data.dev ? 'Dev mode — check server console' : `Verification email sent to ${account.email}`, 'success');
                                    } else {
                                      toast(data.error || 'Could not send verification email', 'error');
                                    }
                                  } catch {
                                    toast('Could not send verification email', 'error');
                                  } finally {
                                    setSendingVerification(false);
                                  }
                                }}
                              >
                                {sendingVerification ? 'Sending…' : 'Verify email'}
                              </button>
                            )}
                        </div>
                        <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-xs)', marginTop: 4 }}>
                          Member since {accountCreatedLabel || 'recently'}
                        </div>
                        <div className={styles.runtimeChipRow} style={{ marginTop: 10 }}>
                          <span className="badge">{account.stats.folders} folders</span>
                          <span className="badge">{account.stats.files} files</span>
                          <span className="badge">{account.stats.libraryItems} library items</span>
                          {account.connectedAccounts.map(p => <span key={p} className="badge badge-accent">{p}</span>)}
                        </div>
                      </div>
                      <div className={styles.accountActionStack}>
                        <button className="btn btn-danger btn-sm" onClick={handleSignOut}>{t('Sign out')}</button>
                        <button className="btn btn-ghost btn-sm" onClick={copyPublicProfileLink} disabled={!publicProfileUrl}>
                          Copy profile link
                        </button>
                        {publicProfileUrl ? (
                          <a className="btn btn-ghost btn-sm" href={publicProfileUrl} target="_blank" rel="noreferrer">
                            View public profile
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </Card>

                  {/* Edit profile fields */}
                  <Card>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>Edit profile</div>
                    <div className={styles.formGrid} style={{ marginBottom: 12 }}>
                      <div>
                        <label style={labelStyle}>{t('Display name')}</label>
                        <input style={fieldStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
                      </div>
                      <div>
                        <label style={labelStyle}>{t('Profile picture URL')}</label>
                        <input style={fieldStyle} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" />
                      </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>{t('Short description')}</label>
                      <textarea
                        style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }}
                        value={bio}
                        onChange={e => setBio(e.target.value)}
                        placeholder="A short line about what you study, teach, or focus on."
                        maxLength={240}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                        <span>Shown on your public profile.</span>
                        <span>{bio.trim().length}/240</span>
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>{t('Study interests')}</label>
                      <input
                        style={fieldStyle}
                        value={studyInterests}
                        onChange={e => setStudyInterests(e.target.value)}
                        placeholder="Biology, essay writing, exam prep"
                        maxLength={180}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                        <span>Separate topics with commas for profile tags.</span>
                        <span>{studyInterests.trim().length}/180</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
                        {savingProfile ? 'Saving…' : t('Save profile')}
                      </button>
                    </div>
                  </Card>

                  {/* Public profile */}
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Public profile</div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4, maxWidth: '52ch' }}>
                          A card with your picture, bio, and selected public study items — no private account details.
                        </div>
                      </div>
                      <span className="badge badge-accent">Light social</span>
                    </div>
                    <code style={{ display: 'block', marginTop: 12, padding: '10px 13px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-2)', fontSize: '0.84rem', overflowWrap: 'anywhere' }}>
                      {publicProfileUrl || 'Save your account first to generate a public profile link.'}
                    </code>
                  </Card>
                </>
              ) : (
                <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>We could not load your account right now.</p>
              )}
            </div>
          )}

          {/* ── Security ─────────────────────────────────────────── */}
          {activeSection === 'security' && (
            <div className={styles.sectionStack}>
              {showGuestState ? (
                <>
                  <GuestUpgradeNotice compact />
                  <Card style={{ opacity: 0.7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Two-step verification</div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                          Protect your account with an authenticator app.
                        </div>
                      </div>
                      <span className="badge">Locked in guest mode</span>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <button className="btn btn-primary btn-sm" disabled>Set up 2-step verification</button>
                    </div>
                  </Card>
                </>
              ) : accountLoading ? (
                <div className="skeleton" style={{ height: 200, borderRadius: 16 }} />
              ) : account ? (
                <>
                  {/* 2FA */}
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
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

                    {!account.twoFactorEnabled && !twoFactorSetup && (
                      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', flex: 1 }}>
                          Supports Google Authenticator, 1Password, and Microsoft Authenticator.
                        </p>
                        <button className="btn btn-primary btn-sm" onClick={beginTwoFactorSetup} disabled={twoFactorBusy}>
                          {twoFactorBusy ? 'Preparing…' : 'Set up 2-step verification'}
                        </button>
                      </div>
                    )}

                    {twoFactorSetup && (
                      <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                          Open your authenticator app and add a new account. Tap &ldquo;Enter setup key&rdquo; and paste the key below.
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <code style={{ flex: 1, padding: '10px 13px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border-2)', overflowWrap: 'anywhere', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                            {twoFactorSetup.manualEntryKey}
                          </code>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <a href={twoFactorSetup.otpAuthUri} className="btn btn-primary btn-sm" style={{ textDecoration: 'none', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              📱 Open authenticator
                            </a>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                navigator.clipboard.writeText(twoFactorSetup!.manualEntryKey)
                                  .then(() => toast('Key copied', 'success'))
                                  .catch(() => toast('Could not copy the key', 'error'));
                              }}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              📋 Copy key
                            </button>
                          </div>
                        </div>
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
                    )}

                    {account.twoFactorEnabled && (
                      <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                          To disable, enter the current 6-digit code from your authenticator app.
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
                    )}
                  </Card>

                  {/* Password */}
                  <Card>
                    <form onSubmit={changePassword} style={{ display: 'grid', gap: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>Password</div>
                          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                            {account.hasPassword ? 'Update your current password.' : 'Set a password to enable email + password sign-in.'}
                          </div>
                        </div>
                      </div>
                      {account.hasPassword && (
                        <div>
                          <label style={labelStyle}>{t('Current password')}</label>
                          <input style={fieldStyle} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" />
                        </div>
                      )}
                      <div className={styles.formGrid}>
                        <div>
                          <label style={labelStyle}>{t('New password')}</label>
                          <input style={fieldStyle} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
                        </div>
                        <div>
                          <label style={labelStyle}>{t('Confirm password')}</label>
                          <input style={fieldStyle} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" type="submit" disabled={savingPassword || !newPassword || newPassword !== confirmPassword}>
                          {savingPassword ? 'Saving…' : t('Change password')}
                        </button>
                      </div>
                    </form>
                  </Card>
                </>
              ) : (
                <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>We could not load your security settings right now.</p>
              )}
            </div>
          )}

          {/* ── Notifications ────────────────────────────────────── */}
          {activeSection === 'notifications' && <NotificationsSection />}

          {/* ── Appearance ──────────────────────────────────────── */}
          {activeSection === 'appearance' && (
            <div className={styles.sectionStack}>

              {/* Theme picker */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Theme</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                      Pick the overall look before fine-tuning readability.
                    </div>
                  </div>
                  <span className="badge">{THEME_OPTIONS.find(o => o.id === settings.theme)?.label ?? settings.theme}</span>
                </div>
                <div className={styles.themeSwatches}>
                  {THEME_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`${styles.themeSwatch} ${settings.theme === opt.id ? styles.themeSwatchActive : ''}`}
                      onClick={() => set('theme', opt.id)}
                      title={opt.hint}
                    >
                      <div className={styles.themeSwatchCircle} style={{ background: opt.color }} />
                      <span className={styles.themeSwatchLabel}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </Card>

              {/* Readability */}
              <Card>
                <div style={{ fontWeight: 700, marginBottom: 14 }}>Readability</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <SettingRow label="Font size" hint="Scales text throughout the app.">
                    <Segmented<string>
                      options={FONT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                      value={settings.fontSize}
                      onChange={v => set('fontSize', v)}
                    />
                  </SettingRow>
                  <SettingRow label="Line spacing" hint="Controls how close lines of text sit together.">
                    <Segmented<string>
                      options={LINE_HEIGHT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                      value={settings.lineHeight}
                      onChange={v => set('lineHeight', v)}
                    />
                  </SettingRow>
                  <SettingRow label="Layout density" hint="How much space is added between elements.">
                    <ChoiceButtons options={DENSITY_OPTIONS} value={settings.density} onChange={v => set('density', v)} />
                  </SettingRow>
                </div>
              </Card>

              {/* Live preview */}
              <div className={styles.previewSurface}>
                <div className={styles.previewCopy}>
                  <span className={styles.previewEyebrow}>Live preview</span>
                  <h3 className={styles.previewTitle}>See your current settings together</h3>
                  <p className={styles.previewText}>
                    The quick brown fox jumps over the lazy dog. This preview uses your active theme, font size, line spacing, and density.
                  </p>
                </div>
                <div className={styles.previewGrid}>
                  {[
                    { label: 'Accent',     bg: 'var(--primary, var(--accent))' },
                    { label: 'Surface',    bg: 'var(--surface)' },
                    { label: 'Surface 2',  bg: 'var(--surface-2)' },
                    { label: 'Background', bg: 'var(--bg)' },
                    { label: 'Border',     bg: 'var(--border-2)' },
                  ].map(swatch => (
                    <div key={swatch.label} className={styles.previewSwatch}>
                      <div className={styles.previewSwatchBlock} style={{ background: swatch.bg }} />
                      <span className={styles.previewSwatchLabel}>{swatch.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-sm" type="button" style={{ pointerEvents: 'none' }}>Primary button</button>
                  <button className="btn btn-ghost btn-sm" type="button" style={{ pointerEvents: 'none' }}>Ghost button</button>
                  <span className="badge">Badge</span>
                  <span className="badge badge-success">Success</span>
                </div>
              </div>

              {/* Language */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>Language</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginBottom: 12 }}>
                  Switches the main navigation and study surfaces immediately.
                </div>
                <div className={styles.languageGrid}>
                  {LOCALE_OPTIONS.map(opt => {
                    const active = settings.language === opt.id;
                    const sample = LANGUAGE_SAMPLE[opt.id];
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => set('language', opt.id)}
                        className={`${styles.languageCard} ${active ? styles.languageCardActive : ''}`}
                        style={{ alignItems: opt.rtl ? 'flex-end' : 'flex-start', textAlign: opt.rtl ? 'right' : 'left' }}
                      >
                        <div className={styles.languageCardHeader}>
                          <span className={styles.languageLabel} style={{ color: active ? 'var(--accent)' : 'var(--text)', direction: opt.rtl ? 'rtl' : 'ltr' }}>
                            {opt.label}
                          </span>
                          {active ? <span className={styles.languageBadge}>Current</span> : null}
                        </div>
                        <span className={styles.languageHint}>{opt.hint}</span>
                        {sample && (
                          <>
                            <span className={styles.languageSample} style={{ direction: opt.rtl ? 'rtl' : 'ltr' }}>{sample.greeting}</span>
                            <span className={styles.languageNote}>{sample.note}</span>
                          </>
                        )}
                        {opt.rtl && <span className={styles.languageRtlBadge}>RTL</span>}
                      </button>
                    );
                  })}
                </div>
                {settings.language !== 'en' && (
                  <p style={{ marginTop: 10, fontSize: '12px', color: 'var(--text-3)' }}>
                    Some labels may fall back to English when a translation is not yet available.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Runtime ─────────────────────────────────────────── */}
          {activeSection === 'runtime' && (
            <div className={styles.sectionStack}>
              <div className={styles.runtimeSummaryCard}>
                <div className={styles.runtimeSummaryHead}>
                  <div>
                    <strong>At a glance</strong>
                    <p>Quick view: can you sign in, sync files, and use cloud AI here?</p>
                  </div>
                  <span className="badge">
                    {RUNTIME_READINESS_ITEMS.filter((title) => {
                      if (title === 'Email sign-in & profile sync') return Boolean(authCapabilities && authCapabilities.dbConfigured !== false && authCapabilities.authDisabled !== true);
                      if (title === 'OAuth sign-in') return Boolean(authCapabilities) && !authCapabilities?.oauthDisabled && Boolean(authCapabilities?.googleConfigured || authCapabilities?.githubConfigured || authCapabilities?.microsoftConfigured);
                      if (title === 'Cloud file backup') return Boolean(authCapabilities?.supabaseStorageConfigured);
                      return Boolean(aiStatus?.cloudConfigured);
                    }).length}/{RUNTIME_READINESS_ITEMS.length} ready
                  </span>
                </div>
                <div className={styles.runtimeChipRow}>
                  <span className={`badge ${authCapabilities && authCapabilities.dbConfigured !== false && authCapabilities.authDisabled !== true ? 'badge-success' : ''}`}>Sign-in</span>
                  <span className={`badge ${Boolean(authCapabilities) && !authCapabilities?.oauthDisabled && Boolean(authCapabilities?.googleConfigured || authCapabilities?.githubConfigured || authCapabilities?.microsoftConfigured) ? 'badge-success' : ''}`}>OAuth</span>
                  <span className={`badge ${authCapabilities?.supabaseStorageConfigured ? 'badge-success' : ''}`}>Cloud files</span>
                  <span className={`badge ${aiStatus?.cloudConfigured ? 'badge-success' : ''}`}>Cloud AI</span>
                </div>
              </div>

              <div className={styles.runtimeGrid}>
                {[
                  {
                    title: 'Email sign-in & profile sync',
                    ready: Boolean(authCapabilities && authCapabilities.dbConfigured !== false && authCapabilities.authDisabled !== true),
                    detail: !authCapabilities ? 'Checking the current runtime configuration.'
                      : authCapabilities.authDisabled ? (authCapabilities.authDisabledReason || 'Authentication is disabled in this runtime.')
                      : authCapabilities?.dbConfigured === false ? 'Database is missing, so account sign-in cannot start here.'
                      : authCapabilities?.supabaseAuthConfigured ? 'Ready for account sync and password changes.'
                      : authCapabilities?.supabaseAdminConfigured ? 'Works with the current auth flow, but browser Supabase keys are still missing.'
                      : 'Works with the current auth flow, but Supabase Auth sync is not configured here.',
                  },
                  {
                    title: 'OAuth sign-in',
                    ready: Boolean(authCapabilities) && !authCapabilities?.oauthDisabled && Boolean(authCapabilities?.googleConfigured || authCapabilities?.githubConfigured || authCapabilities?.microsoftConfigured),
                    detail: !authCapabilities ? 'Checking provider availability.'
                      : (!authCapabilities.oauthDisabled && (authCapabilities.googleConfigured || authCapabilities.githubConfigured || authCapabilities.microsoftConfigured)) ? 'At least one provider is available in this runtime.'
                      : (authCapabilities.oauthDisabledReason || 'No external sign-in provider is configured right now.'),
                  },
                  {
                    title: 'Cloud file backup',
                    ready: Boolean(authCapabilities?.supabaseStorageConfigured),
                    detail: authCapabilities?.supabaseStorageConfigured ? `Uploads can sync to bucket "${authCapabilities?.supabaseStorageBucket || 'kivora-files'}".`
                      : authCapabilities?.supabaseAdminConfigured ? `Supabase admin available, but confirm bucket "${authCapabilities?.supabaseStorageBucket || 'kivora-files'}" exists.`
                      : 'Local storage works, but cloud backup is unavailable here.',
                  },
                  {
                    title: 'Cloud AI',
                    ready: Boolean(aiStatus?.cloudConfigured),
                    detail: aiStatus?.cloudConfigured ? `Using ${aiStatus?.activeCloudProvider ?? 'cloud AI'} with ${aiStatus?.defaultCloudModel ?? 'the default model'}.`
                      : 'Cloud AI is unavailable — local/offline mode only.',
                  },
                ].map((item) => (
                  <div key={item.title} className={styles.runtimeCard}>
                    <div className={styles.runtimeCardHead}>
                      <div style={{ fontWeight: 700 }}>{item.title}</div>
                      <span className={`badge ${item.ready ? 'badge-success' : ''}`}>{item.ready ? 'Ready' : 'Local-only'}</span>
                    </div>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', margin: 0 }}>{item.detail}</p>
                  </div>
                ))}
              </div>

              <div className={styles.runtimeWiringCard}>
                <div className={styles.runtimeSummaryHead}>
                  <div>
                    <strong>Supabase wiring</strong>
                    <p>Technical key status — useful for deployment debugging.</p>
                  </div>
                </div>
                <div className={styles.runtimeChipRow}>
                  <span className={`badge ${authCapabilities?.supabaseUrlConfigured ? 'badge-success' : ''}`}>URL {authCapabilities?.supabaseUrlConfigured ? 'ready' : 'missing'}</span>
                  <span className={`badge ${authCapabilities?.supabaseAnonKeyConfigured ? 'badge-success' : ''}`}>Anon key {authCapabilities?.supabaseAnonKeyConfigured ? 'ready' : 'missing'}</span>
                  <span className={`badge ${authCapabilities?.supabaseServiceRoleConfigured ? 'badge-success' : ''}`}>Service role {authCapabilities?.supabaseServiceRoleConfigured ? 'ready' : 'missing'}</span>
                  <span className={`badge ${authCapabilities?.supabaseStorageConfigured ? 'badge-success' : ''}`}>Storage {authCapabilities?.supabaseStorageConfigured ? 'ready' : 'not ready'}</span>
                </div>
                <p style={{ margin: 0, color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
                  Browser features need <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Server-side auth and storage need <code>SUPABASE_SERVICE_ROLE_KEY</code>. Bucket: <code>{authCapabilities?.supabaseStorageBucket || 'kivora-files'}</code>.
                </p>
              </div>
            </div>
          )}

          {/* ── AI & Downloads ────────────────────────────────────── */}
          {activeSection === 'ai-models' && (
            <div className={styles.downloadsStack}>
              <div className={styles.aiHero}>
                <div className={styles.aiHeroCopy}>
                  <span className={styles.previewEyebrow}>{t('AI control center')}</span>
                  <h3>{t('Choose how Kivora thinks before you download anything else.')}</h3>
                  <p>{t('Start with local-first privacy, switch to cloud when you want it, and keep the included Mini model as the simplest offline default.')}</p>
                </div>
                <div className={styles.aiHeroBadges}>
                  <span className="badge">{t('Local-first')}</span>
                  <span className="badge">{t('Cloud optional')}</span>
                  <span className="badge badge-success">{t('Mac Mini path')}</span>
                </div>
              </div>

              {!downloadsLoading && downloads && !downloads.manifestLooksReleaseReady ? (
                <Card>
                  <div className={styles.settingsFeatureHead}>
                    <div>
                      <strong>{t('Optional model downloads are not ready yet')}</strong>
                      <p>
                        {t('Keep using Mini until the larger local models are ready to install from inside Kivora.')}
                      </p>
                    </div>
                    <span className="badge" style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309' }}>{t('Mini first')}</span>
                  </div>
                </Card>
              ) : null}

              <Card>
                <div className={styles.settingsFeatureHead}>
                  <div>
                    <strong>{t('AI routing')}</strong>
                    <p>{t('Pick the behavior you want first, then layer downloads on top only if they help your machine.')}</p>
                  </div>
                </div>
                <AiRuntimeControls compact />
              </Card>

              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{t('Downloads & releases')}</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginTop: 4 }}>
                      {t('Install the app first, use Mini by default, then add bigger models only if you need more local quality.')}
                    </div>
                  </div>
                  {downloads?.releaseUrl ? (
                    <a href={downloads.releaseUrl} className="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      Release {downloads.releaseTag}
                    </a>
                  ) : null}
                </div>
                {downloadsLoading ? (
                  <div className="skeleton" style={{ height: 160, borderRadius: 16 }} />
                ) : (
                  <div className={styles.downloadGrid}>
                    <DownloadCard
                      title={t('macOS Apple Silicon')}
                      hint={t('Primary 1.0 desktop download. Mini is the default offline path.')}
                      primary={downloads?.macAsset ? { label: t('Download DMG'), href: downloads.macAsset.browser_download_url } : null}
                    />
                    <DownloadCard
                      title={t('Windows x64')}
                      hint={t('Same local-model system, with installer and portable options.')}
                      primary={downloads?.windowsInstaller ? { label: t('Download installer'), href: downloads.windowsInstaller.browser_download_url } : null}
                      secondary={downloads?.windowsPortable ? { label: t('Portable EXE'), href: downloads.windowsPortable.browser_download_url } : null}
                    />
                    <DownloadCard
                      title={t('Advanced release files')}
                      hint={t('Only needed if you are validating the published model package manually.')}
                      primary={downloads?.manifestAsset ? { label: t('Manifest'), href: downloads.manifestAsset.browser_download_url } : null}
                      secondary={downloads?.checksumsAsset ? { label: t('Checksums'), href: downloads.checksumsAsset.browser_download_url } : null}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <span className="badge">{t('Local-first')}</span>
                  <span className="badge">{t('Cloud optional')}</span>
                  {downloads?.hasPublishedModelAssets ? <span className="badge badge-success">{t('Optional model assets published')}</span> : null}
                  {downloads?.hasIntegrityReadyOptionalModels ? (
                    <span className="badge badge-success">{t('Bigger models ready')}</span>
                  ) : (
                    <span className="badge">{t('Mini is the current safe default')}</span>
                  )}
                </div>
              </Card>

              <Card>
                <div className={styles.settingsFeatureHead}>
                  <div>
                    <strong>{t('Offline AI model')}</strong>
                    <p>{t('Use the bundled Mini when available, then install Balanced or Pro only if you want more local quality.')}</p>
                  </div>
                </div>
                <DesktopModelPanel />
              </Card>

              <div id="ollama-setup" className={styles.settingsFeatureCard}>
                <div className={styles.settingsFeatureHead}>
                  <div>
                    <strong>{t('Browser local AI (Ollama)')}</strong>
                    <p>{t('If you are in the web version instead of the desktop app, Ollama is the local path. Desktop users do not need this.')}</p>
                  </div>
                  <span className="badge">{t('Web only')}</span>
                </div>
                <OllamaSetupPanel />
              </div>
            </div>
          )}

          {/* ── Labs & Tools ─────────────────────────────────────── */}
          {activeSection === 'utilities' && (
            <div className={styles.sectionStack}>
              <div className={styles.utilityGrid}>
                {[
                  { href: '/math',     icon: '∑',  title: 'Math labs',    description: 'Solver, graphing, question scan, formulas, units, and MATLAB-style workspaces.', meta: ['Solver', 'Graphs', 'Question scan'] },
                  { href: '/workspace', icon: '📚', title: 'Workspace tools', description: 'Generators, notes, quiz, chat, and study outputs inside the main workspace.', meta: ['Generate', 'Review', 'Chat'] },
                  { href: '/analytics',icon: '📈', title: 'Analytics',    description: 'Weak areas, retention, and next best study actions.',               meta: ['Insights', 'Retention', 'Next actions'] },
                  { href: '/sharing',  icon: '🔗', title: 'Sharing',      description: 'Manage public profile links, shared files, and permissions.',        meta: ['Profile', 'Links', 'Permissions'] },
                  { href: '/status',   icon: '🩺', title: 'System status',description: 'Runtime, database, cloud AI, and deployment diagnostics.',           meta: ['Runtime', 'Database', 'Deployments'] },
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
                      {item.meta.map(tag => <span key={tag} className={styles.pill}>{tag}</span>)}
                    </div>
                  </a>
                ))}
              </div>

              <div className={styles.reportHero}>
                <div className={styles.reportHeroCopy}>
                  <h3>Labs stay close, but the product stays focused</h3>
                  <p>Workspace, Scholar Hub, and Math are the main pillars. This section keeps labs, diagnostics, and secondary tools one click away.</p>
                </div>
                <div className={styles.reportActionRow}>
                  <a href="/workspace" className="btn btn-primary btn-sm">Open Workspace</a>
                  <a href="/math" className="btn btn-ghost btn-sm">Open Math</a>
                </div>
              </div>
            </div>
          )}

          {/* ── Report Issue ─────────────────────────────────────── */}
          {activeSection === 'reporting' && (
            <div className={styles.reportGrid}>
              <div className={styles.reportShell}>
                <div className={styles.reportHero}>
                  <div className={styles.reportHeroCopy}>
                    <h3>Report a problem without leaving settings</h3>
                    <p>Kivora prefills route, theme, and language diagnostics so the report is useful immediately.</p>
                  </div>
                  <div className={styles.reportActionRow}>
                    <a href="/status" className="btn btn-ghost btn-sm">Open status</a>
                    <a href="https://github.com/Alphadarklord1/kivora/issues" className="btn btn-ghost btn-sm" target="_blank" rel="noreferrer">View issues</a>
                  </div>
                </div>
                <div className={styles.reportPanel}>
                  <ReportIssuePanel embedded />
                </div>
              </div>

              <aside className={styles.reportChecklist}>
                <h3>Before you send it</h3>
                <p>Good reports are short, specific, and reproducible.</p>
                <div className={styles.reportChecklistList}>
                  {[
                    { title: 'Say what you expected', body: 'Describe the intended result first, then explain what actually happened.' },
                    { title: 'Include the screen or flow', body: 'Mention the exact page, tool, or tab so we can reproduce the issue quickly.' },
                    { title: 'Attach useful context', body: 'Add a screenshot if the bug is visual. Mention guest, local, or signed-in mode if data-related.' },
                  ].map((item, i) => (
                    <div key={item.title} className={styles.reportChecklistItem}>
                      <span className={styles.reportChecklistDot}>{i + 1}</span>
                      <div className={styles.reportChecklistBody}>
                        <strong>{item.title}</strong>
                        <span>{item.body}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge">Bug</span>
                  <span className="badge">Feature request</span>
                  <span className="badge badge-success">Diagnostics included</span>
                </div>
              </aside>
            </div>
          )}

          {/* ── Privacy ─────────────────────────────────────────── */}
          {activeSection === 'privacy' && <PrivacySection />}

        </div>
      </div>
    </div>
  );
}

// ── Notifications panel ───────────────────────────────────────────────────────

const NOTIFICATION_PREFS = [
  { key: 'kivora_notif_reminders', label: 'Daily study reminders',    hint: 'Get nudged at your chosen time if you have not opened Kivora that day.',                  defaultOn: true  },
  { key: 'kivora_notif_review',    label: 'Flashcard review alerts',  hint: 'Alert when you have cards due for review so your SRS schedule stays on track.',           defaultOn: true  },
  { key: 'kivora_notif_uploads',   label: 'File upload confirmations',hint: 'Show a brief success message after each file is saved to the workspace.',                  defaultOn: true  },
  { key: 'kivora_notif_ai',        label: 'AI generation updates',    hint: 'Notify when a long AI generation finishes so you can switch to another tab.',             defaultOn: false },
  { key: 'kivora_notif_system',    label: 'System and error alerts',  hint: 'Surface connectivity issues, failed saves, and runtime warnings inline.',                  defaultOn: true  },
] as const;

function readNotifPref(key: string, defaultOn: boolean): boolean {
  if (typeof window === 'undefined') return defaultOn;
  const stored = localStorage.getItem(key);
  return stored === null ? defaultOn : stored === '1';
}

function NotifToggleRow({
  checked, label, hint, onToggle, disabled,
}: { checked: boolean; label: string; hint: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className={`${styles.toggleRow} ${checked ? styles.toggleRowActive : ''}`} style={{ opacity: disabled ? 0.5 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{hint}</div>
      </div>
      <Toggle checked={checked} onToggle={onToggle} disabled={disabled} />
    </div>
  );
}

function NotificationsSection() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_PREFS.map(p => [p.key, readNotifPref(p.key, p.defaultOn)])),
  );
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [requestingPermission, setRequestingPermission] = useState(false);
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
      toast(granted ? 'Browser notifications enabled' : 'Permission was not granted. Check your browser settings.', granted ? 'success' : 'warning');
    } finally {
      setRequestingPermission(false);
    }
  }, [toast]);

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
    for (const p of NOTIFICATION_PREFS) { next[p.key] = true; localStorage.setItem(p.key, '1'); }
    setPrefs(next);
    setExamNotifEnabled(true);
    setStreakNotifEnabled(true);
    localStorage.setItem('kivora-notif-exams', 'true');
    localStorage.setItem('kivora-notif-streak', 'true');
    toast('All notifications enabled', 'success');
  }

  function disableAll() {
    const next: Record<string, boolean> = {};
    for (const p of NOTIFICATION_PREFS) { next[p.key] = false; localStorage.setItem(p.key, '0'); }
    setPrefs(next);
    setExamNotifEnabled(false);
    setStreakNotifEnabled(false);
    localStorage.setItem('kivora-notif-exams', 'false');
    localStorage.setItem('kivora-notif-streak', 'false');
    toast('All notifications disabled', 'warning');
  }

  const enabledCount = Object.values(prefs).filter(Boolean).length + Number(examNotifEnabled) + Number(streakNotifEnabled);
  const totalNotificationCount = NOTIFICATION_PREFS.length + 2;

  const permissionLabel: Record<NotificationPermission | 'unsupported', string> = {
    granted: 'Granted', denied: 'Denied', default: 'Not yet granted', unsupported: 'Not supported',
  };
  const permissionColor: Record<NotificationPermission | 'unsupported', string> = {
    granted: 'var(--success, #22c55e)', denied: 'var(--danger, #ef4444)', default: 'var(--text-3)', unsupported: 'var(--text-3)',
  };

  return (
    <div className={styles.sectionStack}>
      {/* In-app preferences */}
      <div className={styles.settingsFeatureCard}>
        <div className={styles.settingsFeatureHead}>
          <div>
            <strong>Notification plan</strong>
            <p>Enable the reminders that help your study flow — drop the ones that create noise.</p>
          </div>
          <span className="badge">{enabledCount}/{totalNotificationCount} active</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={enableAll} type="button">Enable all</button>
          <button className="btn btn-ghost btn-sm" onClick={disableAll} type="button">Disable all</button>
        </div>
      </div>

      <div className={styles.toggleGrid}>
        {NOTIFICATION_PREFS.map(item => (
          <NotifToggleRow
            key={item.key}
            checked={prefs[item.key]}
            label={item.label}
            hint={item.hint}
            onToggle={() => toggle(item.key)}
          />
        ))}
      </div>

      <div className={styles.inlineNote}>
        Preferences are stored locally and do not sync across browsers. Browser notification permission is separate.
      </div>

      {/* Browser notifications */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>Browser notifications</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', marginBottom: 12 }}>
          OS-level alerts even when you are away from the tab.
        </div>
      </div>

      <div className={styles.settingsFeatureCard}>
        <div className={styles.settingsFeatureHead}>
          <div>
            <strong>Permission status</strong>
            <p>Browser-level notifications need one extra permission beyond the in-app toggles above.</p>
          </div>
          <span className="badge" style={{ color: permissionColor[browserPermission] }}>{permissionLabel[browserPermission]}</span>
        </div>
        {browserPermission !== 'granted' && browserPermission !== 'unsupported' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleRequestPermission} disabled={requestingPermission || browserPermission === 'denied'}>
            {browserPermission === 'denied' ? 'Blocked by browser' : requestingPermission ? 'Requesting…' : 'Enable notifications'}
          </button>
        )}
        {browserPermission === 'denied' && (
          <div className={styles.inlineNote}>Click the lock icon in your browser address bar and allow notifications.</div>
        )}
      </div>

      <div className={styles.toggleGrid}>
        <NotifToggleRow
          checked={examNotifEnabled}
          label="Exam reminders"
          hint="Sends a reminder the evening before and morning of any exam in your Planner."
          onToggle={() => { const n = !examNotifEnabled; setExamNotifEnabled(n); localStorage.setItem('kivora-notif-exams', n ? 'true' : 'false'); toast('Exam reminder preference saved', 'success'); }}
          disabled={browserPermission !== 'granted'}
        />
        <NotifToggleRow
          checked={streakNotifEnabled}
          label="Daily streak alerts"
          hint="Notifies you at 8 pm if you have not studied any flashcards yet today."
          onToggle={() => { const n = !streakNotifEnabled; setStreakNotifEnabled(n); localStorage.setItem('kivora-notif-streak', n ? 'true' : 'false'); toast('Streak alert preference saved', 'success'); }}
          disabled={browserPermission !== 'granted'}
        />
      </div>

      <div className={styles.inlineNote}>
        Scheduled alerts require the browser tab to be open at the scheduled time. Reminders are deduplicated.
      </div>
    </div>
  );
}

// ── Privacy & Data Control panel ──────────────────────────────────────────────

function PrivacySection() {
  const { toast } = useToast();
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [aiMode, setAiMode] = useState<'full' | 'metadata-only' | 'offline'>(() => {
    if (typeof window === 'undefined') return 'full';
    return (localStorage.getItem('kivora_ai_mode') as 'full' | 'metadata-only' | 'offline') ?? 'full';
  });
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => usageAnalyticsEnabledClient());
  const [crashReports, setCrashReports] = useState(() => crashReportsEnabledClient());

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
      setTimeout(() => { window.location.href = '/api/auth/signout'; }, 1500);
    } catch {
      toast('Data deletion failed. Contact support.', 'error');
    } finally {
      setDeleteLoading(false);
    }
  }

  const AI_MODES: { id: 'full' | 'metadata-only' | 'offline'; label: string; hint: string; icon: string }[] = [
    { id: 'full',          label: 'Full context',   hint: 'File text is sent to cloud AI. Best results.',                        icon: '🌐' },
    { id: 'metadata-only', label: 'Metadata only',  hint: 'Only file names and word counts are sent — content stays local.',    icon: '🔒' },
    { id: 'offline',       label: 'Offline only',   hint: 'No data leaves your device. Uses built-in generation.',               icon: '✈️' },
  ];

  const dataItems = [
    { icon: '📁', label: 'Folders & files',   where: 'Cloud (PostgreSQL)',     note: 'File metadata — names, sizes, dates' },
    { icon: '📄', label: 'File content',       where: 'Local only (IndexedDB)', note: 'Blobs never leave your browser' },
    { icon: '📇', label: 'Review sets',        where: 'Local + Cloud sync',     note: 'SRS schedule stored on device' },
    { icon: '🗂',  label: 'Library items',      where: 'Cloud (PostgreSQL)',     note: 'Saved generated outputs' },
    { icon: '📊', label: 'Study analytics',    where: 'Cloud (PostgreSQL)',     note: 'Quiz scores and review history' },
    { icon: '⚙️', label: 'Settings',           where: 'Cloud (PostgreSQL)',     note: 'Theme, font, density preferences' },
  ];

  return (
    <div className={styles.sectionStack}>

      {/* Data map */}
      <div className={styles.settingsFeatureCard}>
        <div className={styles.settingsFeatureHead}>
          <div>
            <strong>Where your data lives</strong>
            <p>What stays local, what syncs, and what is only metadata.</p>
          </div>
          <span className="badge">Transparent by default</span>
        </div>
        <div className={styles.privacyDataMap}>
          {dataItems.map(item => (
            <div key={item.label} className={styles.privacyDataRow}>
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

      {/* AI/Cloud data compare */}
      <div className={styles.privacyCompareGrid}>
        <div className={styles.privacyGoodCard}>
          <div className={styles.privacyCompareTitle}>What AI can do</div>
          <ul className={styles.privacyList}>
            <li>Receive extracted text from files you choose to send</li>
            <li>Generate study material from that text</li>
            <li>Use anonymised usage metadata for quality monitoring</li>
          </ul>
        </div>
        <div className={styles.privacyWarnCard}>
          <div className={styles.privacyCompareTitle}>What AI cannot do</div>
          <ul className={styles.privacyList}>
            <li>Access your raw file blobs stored in IndexedDB</li>
            <li>Retain or train on your content between sessions</li>
            <li>Share your data with third parties</li>
            <li>Access data from other users</li>
          </ul>
        </div>
      </div>

      {/* AI mode picker */}
      <div className={styles.settingsFeatureCard}>
        <div className={styles.settingsFeatureHead}>
          <div>
            <strong>Content sent to AI</strong>
            <p>Pick the privacy mode. Kivora adapts the AI workflow around your choice.</p>
          </div>
          <span className="badge">{AI_MODES.find(m => m.id === aiMode)?.label ?? 'Unknown'}</span>
        </div>
        <div className={styles.privacyModeGrid}>
          {AI_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => saveAiMode(mode.id)}
              className={`${styles.privacyModeCard} ${aiMode === mode.id ? styles.privacyModeCardActive : ''}`}
            >
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{mode.icon}</span>
              <div>
                <div className={styles.privacyModeTitle}>
                  {mode.label}
                  {aiMode === mode.id && <span className={styles.privacyActiveDot}>Active</span>}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{mode.hint}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Telemetry */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Telemetry & tracking</div>
        <div className={styles.toggleGrid}>
          {[
            { label: 'Usage analytics', hint: 'Store local page and tool counts for issue report diagnostics. Turning off clears the snapshot.', value: analyticsEnabled, onChange: toggleAnalytics },
            { label: 'Crash reports',   hint: 'Store recent runtime error summaries locally when something breaks. No file content included.',  value: crashReports,      onChange: toggleCrash },
          ].map(item => (
            <NotifToggleRow
              key={item.label}
              checked={item.value}
              label={item.label}
              hint={item.hint}
              onToggle={() => item.onChange(!item.value)}
            />
          ))}
        </div>
      </div>

      {/* Data portability */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Data portability</div>
        <div className={styles.settingsFeatureCard} style={{ marginBottom: 10 }}>
          <div className={styles.settingsFeatureHead}>
            <div>
              <strong>Export everything</strong>
              <p>JSON export of your folders, library items, review sets, quiz history, and study plans.</p>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={exportData} disabled={exportLoading} style={{ flexShrink: 0 }}>
              {exportLoading ? 'Exporting…' : 'Export my data'}
            </button>
          </div>
        </div>

        <div className={styles.deleteCard}>
          <div className={styles.settingsFeatureHead}>
            <div>
              <strong>Delete all data</strong>
              <p>Permanently removes your folders, files metadata, library items, and account. Local IndexedDB content is cleared too.</p>
            </div>
            <span className="badge">Irreversible</span>
          </div>
          <div className={styles.deleteRow}>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder='Type "delete my data" to unlock'
              className={styles.deleteInput}
            />
            <button
              className="btn btn-sm"
              style={{ background: 'var(--danger)', color: '#fff', border: 'none', flexShrink: 0 }}
              disabled={deleteConfirm.trim().toLowerCase() !== 'delete my data' || deleteLoading}
              onClick={deleteAllData}
            >
              {deleteLoading ? 'Deleting…' : 'Delete all'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--text-3)' }}>Loading settings…</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
