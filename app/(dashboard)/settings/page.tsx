'use client';

import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useSettings, type Density, type Theme } from '@/providers/SettingsProvider';
import { AiRuntimeControls } from '@/components/models/AiRuntimeControls';
import { ReportIssuePanel } from '@/components/settings/ReportIssuePanel';
import {
  crashReportsEnabledClient,
  setCrashReportsEnabled,
  setUsageAnalyticsEnabled,
  usageAnalyticsEnabledClient,
} from '@/lib/privacy/preferences';

// ── Constants ────────────────────────────────────────────────────────────────

const THEME_OPTIONS: { id: Theme; label: string; hint: string; icon: string }[] = [
  { id: 'system', label: 'System',  hint: 'Follow your device', icon: '💻' },
  { id: 'blue',   label: 'Dark',    hint: 'Kivora default',     icon: '🌙' },
  { id: 'light',  label: 'Light',   hint: 'Bright workspace',   icon: '☀️' },
  { id: 'black',  label: 'Black',   hint: 'High contrast',      icon: '⬛' },
];

const FONT_OPTIONS = [
  { value: '0.95', label: 'Small text' },
  { value: '1',    label: 'Normal text size' },
  { value: '1.05', label: 'Large text' },
  { value: '1.1',  label: 'Extra large text' },
] as const;

const LINE_HEIGHT_OPTIONS = [
  { value: '1.4',  label: 'Tight' },
  { value: '1.5',  label: 'Balanced' },
  { value: '1.65', label: 'Relaxed' },
  { value: '1.8',  label: 'Very relaxed' },
] as const;

const DENSITY_OPTIONS: { id: Density; label: string; hint: string }[] = [
  { id: 'compact',     label: 'Compact',     hint: 'More on screen' },
  { id: 'normal',      label: 'Normal',      hint: 'Balanced spacing' },
  { id: 'comfortable', label: 'Comfortable', hint: 'Easier to scan' },
];

const NAV_SECTIONS = [
  { id: 'account',    label: 'Account',         icon: '👤' },
  { id: 'security',   label: 'Security',         icon: '🔐' },
  { id: 'appearance', label: 'Appearance',       icon: '🎨' },
  { id: 'ai-models',  label: 'AI & Downloads',   icon: '🤖' },
  { id: 'reporting',  label: 'Report Issue',     icon: '🐛' },
  { id: 'privacy',    label: 'Privacy & Data',   icon: '🔒' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

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
  stats: { folders: number; files: number; libraryItems: number };
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

// ── Shared sub-components ─────────────────────────────────────────────────────

/** Section wrapper with a left accent rail and consistent card box */
function Section({
  id,
  title,
  subtitle,
  icon,
  accent = 'var(--primary, #6366f1)',
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        scrollMarginTop: 72,
        marginBottom: 32,
        borderRadius: 16,
        border: '1px solid var(--border-2, var(--border-subtle))',
        background: 'var(--surface, var(--bg-elevated))',
        overflow: 'hidden',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '16px 20px 14px',
        borderBottom: '1px solid var(--border-2, var(--border-subtle))',
        background: `${accent}08`,
        boxSizing: 'border-box',
      }}>
        {icon && (
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `${accent}15`,
            border: `1.5px solid ${accent}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17,
          }}>
            {icon}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text, var(--text-primary))' }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', marginTop: 2, lineHeight: 1.4 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {/* Body */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 18, boxSizing: 'border-box' }}>
        {children}
      </div>
    </section>
  );
}

/** Row within a section — label + content side by side on wide, stacked on narrow */
function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', boxSizing: 'border-box' }}>
      <div style={{ minWidth: 140, flex: '0 0 140px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text, var(--text-primary))' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-3, var(--text-muted))', marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 180, boxSizing: 'border-box' }}>{children}</div>
    </div>
  );
}

/** Divider line */
function Divider() {
  return <div style={{ height: 1, background: 'var(--border-2, var(--border-subtle))', margin: '2px 0' }} />;
}

/** Pill-style choice buttons — flex-wrap so they never overflow */
function ChoiceButtons<T extends string>({
  options,
  value,
  onChange,
  accent = 'var(--primary, #6366f1)',
}: {
  options: { id: T; label: string; hint?: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, boxSizing: 'border-box' }}>
      {options.map(opt => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
              padding: '10px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              border: `1.5px solid ${isActive ? accent : 'var(--border-2, var(--border-subtle))'}`,
              background: isActive ? `${accent}15` : 'var(--surface-2, var(--bg-2))',
              color: isActive ? accent : 'var(--text, var(--text-primary))',
              fontSize: 13, fontWeight: isActive ? 700 : 400,
              minWidth: 100, flex: '0 0 auto',
              transition: 'all 0.12s', boxSizing: 'border-box',
            }}
          >
            {opt.icon && <span style={{ fontSize: 16, marginBottom: 2 }}>{opt.icon}</span>}
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{opt.label}</span>
            {opt.hint && <span style={{ fontSize: 11, color: isActive ? `${accent}cc` : 'var(--text-3, var(--text-muted))', whiteSpace: 'nowrap' }}>{opt.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Form field input */
const inputStyle: CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  border: '1.5px solid var(--border-2, var(--border-subtle))',
  background: 'var(--surface, var(--bg-elevated))', color: 'var(--text, var(--text-primary))',
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};
const labelStyle: CSSProperties = {
  display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600,
  color: 'var(--text-2, var(--text-secondary))',
};

/** Avatar circle */
function AvatarPreview({ image, name, email }: { image?: string | null; name?: string | null; email?: string | null }) {
  const [failed, setFailed] = useState(false);
  const text = (() => {
    if (name?.trim()) {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    }
    return (email || 'KV').slice(0, 2).toUpperCase();
  })();
  const hue = Array.from(email || text).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt={text} onError={() => setFailed(true)}
        style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-2, var(--border-subtle))', flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
      display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '1.2rem',
      color: '#fff', background: `hsl(${hue}, 60%, 55%)`,
      border: '2px solid var(--border-2, var(--border-subtle))',
    }}>
      {text}
    </div>
  );
}

/** Guest upgrade notice */
function GuestUpgradeNotice() {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', padding: '14px 16px', borderRadius: 12,
      border: '1px solid var(--border-2, var(--border-subtle))',
      background: 'var(--surface-2, var(--bg-2))', boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 13, color: 'var(--text-3, var(--text-muted))', flex: 1, minWidth: 0, lineHeight: 1.5 }}>
        You are in guest mode. Sign in with a real account to save your profile, password, and two-step verification.
      </div>
      <a href="/login" style={{
        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: 'var(--primary, #6366f1)', color: '#fff', textDecoration: 'none', flexShrink: 0,
      }}>
        Sign in / Register
      </a>
    </div>
  );
}

/** Download card */
function DownloadCard({ title, hint, primary, secondary }: {
  title: string; hint: string;
  primary?: { label: string; href: string } | null;
  secondary?: { label: string; href: string } | null;
}) {
  return (
    <div style={{
      padding: 16, borderRadius: 12, border: '1px solid var(--border-2, var(--border-subtle))',
      background: 'var(--surface-2, var(--bg-2))', display: 'flex', flexDirection: 'column',
      gap: 12, boxSizing: 'border-box', minWidth: 0,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, wordBreak: 'break-word' }}>{title}</div>
        <div style={{ color: 'var(--text-3, var(--text-muted))', fontSize: 12, lineHeight: 1.4 }}>{hint}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {primary ? (
          <a href={primary.href} target="_blank" rel="noopener noreferrer" style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--primary, #6366f1)', color: '#fff', textDecoration: 'none', flexShrink: 0,
          }}>{primary.label}</a>
        ) : (
          <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--surface-2, var(--bg-2))', border: '1px solid var(--border-2, var(--border-subtle))', color: 'var(--text-3, var(--text-muted))' }}>Not attached yet</span>
        )}
        {secondary && (
          <a href={secondary.href} target="_blank" rel="noopener noreferrer" style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            border: '1px solid var(--border-2, var(--border-subtle))', textDecoration: 'none',
            color: 'var(--text, var(--text-primary))', background: 'transparent', flexShrink: 0,
          }}>{secondary.label}</a>
        )}
      </div>
    </div>
  );
}

// ── Main settings page ────────────────────────────────────────────────────────

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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeSection, setActiveSection] = useState('account');

  useEffect(() => {
    if (!session?.user) { setAccountLoading(false); return; }
    let cancelled = false;
    setAccountLoading(true);
    fetch('/api/account')
      .then(async r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || cancelled) return;
        setAccount(data); setName(data.name ?? ''); setImageUrl(data.image ?? ''); setBio(data.bio ?? '');
      })
      .catch(() => { if (!cancelled) toast('Could not load your account settings', 'error'); })
      .finally(() => { if (!cancelled) setAccountLoading(false); });
    return () => { cancelled = true; };
  }, [session?.user, toast]);

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

  // Scroll-spy to keep nav active section in sync
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    for (const sec of NAV_SECTIONS) {
      const el = document.getElementById(sec.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
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
    updateSetting(key, value); markSaved();
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace('/login');
  }

  async function saveProfile() {
    if (!account) return;
    setSavingProfile(true);
    try {
      const r = await fetch('/api/account', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), image: imageUrl.trim() || null, bio: bio.trim() || null }) });
      const data = await r.json();
      if (!r.ok) { toast(data.reason || 'Could not update your profile', 'error'); return; }
      setAccount(prev => prev ? { ...prev, ...data } : prev);
      await updateSession({ user: { name: data.name, image: data.image } });
      markSaved('Profile updated');
    } catch { toast('Could not update your profile', 'error'); }
    finally { setSavingProfile(false); }
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast('The new passwords do not match', 'error'); return; }
    setSavingPassword(true);
    try {
      const r = await fetch('/api/account/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }) });
      const data = await r.json();
      if (!r.ok) { toast(data.reason || 'Could not update password', 'error'); return; }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setAccount(prev => prev ? { ...prev, hasPassword: true } : prev);
      toast('Password updated', 'success');
    } catch { toast('Could not update password', 'error'); }
    finally { setSavingPassword(false); }
  }

  async function beginTwoFactorSetup() {
    setTwoFactorBusy(true);
    try {
      const r = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) { toast(data.reason || 'Could not start two-step verification', 'error'); return; }
      setTwoFactorSetup({ secret: data.secret, manualEntryKey: data.manualEntryKey, otpAuthUri: data.otpAuthUri });
      toast('Authenticator key ready', 'success');
    } catch { toast('Could not start two-step verification', 'error'); }
    finally { setTwoFactorBusy(false); }
  }

  async function confirmTwoFactor() {
    if (!twoFactorSetup) return;
    setTwoFactorBusy(true);
    try {
      const r = await fetch('/api/auth/2fa/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret: twoFactorSetup.secret, code: twoFactorCode }) });
      const data = await r.json();
      if (!r.ok) { toast(data.reason || 'That code did not work', 'error'); return; }
      setTwoFactorCode(''); setTwoFactorSetup(null);
      setAccount(prev => prev ? { ...prev, twoFactorEnabled: true } : prev);
      toast('Two-step verification enabled', 'success');
    } catch { toast('Could not confirm two-step verification', 'error'); }
    finally { setTwoFactorBusy(false); }
  }

  async function disableTwoFactor() {
    setTwoFactorBusy(true);
    try {
      const r = await fetch('/api/auth/2fa/disable', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: disableTwoFactorCode }) });
      const data = await r.json();
      if (!r.ok) { toast(data.reason || 'Could not disable two-step verification', 'error'); return; }
      setDisableTwoFactorCode('');
      setAccount(prev => prev ? { ...prev, twoFactorEnabled: false } : prev);
      toast('Two-step verification disabled', 'success');
    } catch { toast('Could not disable two-step verification', 'error'); }
    finally { setTwoFactorBusy(false); }
  }

  const showGuestState = !session?.user || Boolean(account?.isGuest);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', minHeight: 0, boxSizing: 'border-box', overflow: 'hidden' }}>

      {/* ── Left nav ── */}
      <aside style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border-2, var(--border-subtle))',
        background: 'var(--surface-2, var(--bg-2))', overflowY: 'auto',
        position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100%',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Nav header */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border-2, var(--border-subtle))' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>⚙ Settings</div>
          {saved && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#22c55e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              ✓ Saved
            </div>
          )}
        </div>

        {/* Nav links */}
        <nav style={{ padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_SECTIONS.map(sec => {
            const isActive = activeSection === sec.id;
            return (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                onClick={() => setActiveSection(sec.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                  borderRadius: 9, textDecoration: 'none', fontSize: 13,
                  fontWeight: isActive ? 700 : 400, transition: 'all 0.1s',
                  color: isActive ? 'var(--primary, #6366f1)' : 'var(--text-2, var(--text-secondary))',
                  background: isActive ? 'var(--primary-subtle, color-mix(in srgb, var(--primary, #6366f1) 10%, transparent))' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--primary, #6366f1)' : 'transparent'}`,
                }}
              >
                <span style={{ flexShrink: 0, fontSize: 14 }}>{sec.icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.label}</span>
              </a>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ── */}
      <main style={{
        flex: 1, minWidth: 0, overflowY: 'auto', padding: '28px 32px',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--border-2, var(--border-subtle))' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3, var(--text-muted))', marginTop: 4 }}>
            Manage your account, appearance, AI setup, and privacy from one place.
          </p>
        </div>

        {/* ══ ACCOUNT ══════════════════════════════════════════════════════════ */}
        <Section id="account" title="Account" icon="👤" accent="#6366f1"
          subtitle="Profile picture, display name, and basic account info.">
          {showGuestState ? (
            <>
              <GuestUpgradeNotice />
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <AvatarPreview image={null} name="Guest user" email="guest@kivora.local" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Guest user</div>
                  <div style={{ color: 'var(--text-3, var(--text-muted))', fontSize: 12, marginTop: 3 }}>Profile fields save after sign-in.</div>
                </div>
              </div>
            </>
          ) : accountLoading ? (
            <div style={{ height: 160, borderRadius: 12, background: 'var(--surface-2, var(--bg-2))', animation: 'pulse 1.4s ease-in-out infinite' }} />
          ) : account ? (
            <>
              {/* Profile header */}
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <AvatarPreview image={imageUrl || account.image} name={name || account.name} email={account.email} />
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{account.name || account.email}</div>
                  <div style={{ color: 'var(--text-3, var(--text-muted))', fontSize: 12, marginTop: 3 }}>{account.email}</div>
                  <div style={{ color: 'var(--text-3, var(--text-muted))', fontSize: 11, marginTop: 4 }}>
                    Member since {accountCreatedLabel || 'recently'}
                  </div>
                  {/* Stats badges */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {[
                      `${account.stats.folders} folders`,
                      `${account.stats.files} files`,
                      `${account.stats.libraryItems} library items`,
                      ...account.connectedAccounts,
                    ].map(label => (
                      <span key={label} style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 999,
                        border: '1px solid var(--border-2, var(--border-subtle))',
                        background: 'var(--surface-2, var(--bg-2))',
                        color: 'var(--text-2, var(--text-secondary))',
                        whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{label}</span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1.5px solid #ef4444', color: '#ef4444', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>
                  Sign out
                </button>
              </div>

              <Divider />

              {/* Profile fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, boxSizing: 'border-box' }}>
                <div>
                  <label style={labelStyle}>Display name</label>
                  <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />
                </div>
                <div>
                  <label style={labelStyle}>Profile picture URL</label>
                  <input style={inputStyle} value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Short description</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 88, resize: 'vertical', lineHeight: 1.5 }}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="A short line about what you study, teach, or focus on."
                  maxLength={240}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, color: 'var(--text-3, var(--text-muted))' }}>
                  <span>Shown as your profile bio across the app.</span>
                  <span>{bio.trim().length}/240</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={saveProfile} disabled={savingProfile}
                  style={{ padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', opacity: savingProfile ? 0.6 : 1 }}>
                  {savingProfile ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-3, var(--text-muted))', fontSize: 13 }}>Could not load your account right now.</p>
          )}
        </Section>

        {/* ══ SECURITY ═════════════════════════════════════════════════════════ */}
        <Section id="security" title="Security" icon="🔐" accent="#f97316"
          subtitle="Password changes and two-step verification.">
          {showGuestState ? (
            <>
              <GuestUpgradeNotice />
              <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-2, var(--border-subtle))', background: 'var(--surface-2, var(--bg-2))', opacity: 0.75 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Two-step verification</div>
                <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))' }}>Available after you sign in with a real account.</div>
                <button style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: '#6366f1', color: '#fff', opacity: 0.5, cursor: 'not-allowed' }} disabled>
                  Set up 2-step verification
                </button>
              </div>
            </>
          ) : accountLoading ? (
            <div style={{ height: 180, borderRadius: 12, background: 'var(--surface-2, var(--bg-2))', animation: 'pulse 1.4s ease-in-out infinite' }} />
          ) : account ? (
            <>
              {/* 2FA */}
              <div style={{ padding: 16, borderRadius: 12, border: '1.5px solid var(--border-2, var(--border-subtle))', background: 'var(--surface-2, var(--bg-2))', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Two-step verification</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', marginTop: 3 }}>
                      Protect your account with an authenticator app.
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 700, flexShrink: 0,
                    border: `1px solid ${account.twoFactorEnabled ? '#22c55e50' : 'var(--border-2, var(--border-subtle))'}`,
                    background: account.twoFactorEnabled ? '#22c55e15' : 'transparent',
                    color: account.twoFactorEnabled ? '#22c55e' : 'var(--text-3, var(--text-muted))',
                  }}>
                    {account.twoFactorEnabled ? '✓ Enabled' : 'Not enabled'}
                  </span>
                </div>

                {!account.twoFactorEnabled && !twoFactorSetup && (
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', flex: 1, minWidth: 0, margin: 0 }}>
                      Works with Google Authenticator, 1Password, and Microsoft Authenticator.
                    </p>
                    <button onClick={beginTwoFactorSetup} disabled={twoFactorBusy}
                      style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: '#f97316', color: '#fff', cursor: 'pointer', flexShrink: 0, opacity: twoFactorBusy ? 0.6 : 1 }}>
                      {twoFactorBusy ? 'Preparing…' : 'Set up 2-step verification'}
                    </button>
                  </div>
                )}

                {twoFactorSetup && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))' }}>
                      Add this key in your authenticator app, then confirm with the current 6-digit code.
                    </div>
                    <code style={{
                      padding: '11px 14px', borderRadius: 10, background: 'var(--surface, var(--bg-elevated))',
                      border: '1px solid var(--border-2, var(--border-subtle))', fontSize: 13,
                      overflowWrap: 'anywhere', wordBreak: 'break-all', display: 'block',
                    }}>
                      {twoFactorSetup.manualEntryKey}
                    </code>
                    <input style={inputStyle} value={twoFactorCode}
                      onChange={e => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric" placeholder="Enter 6-digit code" />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={confirmTwoFactor} disabled={twoFactorBusy || twoFactorCode.length !== 6}
                        style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: '#f97316', color: '#fff', cursor: 'pointer', opacity: (twoFactorBusy || twoFactorCode.length !== 6) ? 0.5 : 1 }}>
                        {twoFactorBusy ? 'Verifying…' : 'Confirm and enable'}
                      </button>
                      <button onClick={() => { setTwoFactorSetup(null); setTwoFactorCode(''); }}
                        style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-2, var(--border-subtle))', background: 'transparent', color: 'var(--text, var(--text-primary))', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {account.twoFactorEnabled && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))' }}>
                      Enter the current 6-digit code from your authenticator app to disable it.
                    </div>
                    <input style={inputStyle} value={disableTwoFactorCode}
                      onChange={e => setDisableTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric" placeholder="Enter 6-digit code" />
                    <div>
                      <button onClick={disableTwoFactor} disabled={twoFactorBusy || disableTwoFactorCode.length !== 6}
                        style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1.5px solid #ef4444', color: '#ef4444', background: 'transparent', cursor: 'pointer', opacity: (twoFactorBusy || disableTwoFactorCode.length !== 6) ? 0.5 : 1 }}>
                        {twoFactorBusy ? 'Disabling…' : 'Disable 2-step verification'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Divider />

              {/* Password */}
              <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Password</div>
                {account.hasPassword ? (
                  <div>
                    <label style={labelStyle}>Current password</label>
                    <input style={inputStyle} type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Current password" />
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', margin: 0 }}>
                    You signed up with an external provider. Set a password here to also enable email + password sign-in.
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, boxSizing: 'border-box' }}>
                  <div>
                    <label style={labelStyle}>New password</label>
                    <input style={inputStyle} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
                  </div>
                  <div>
                    <label style={labelStyle}>Confirm new password</label>
                    <input style={inputStyle} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" disabled={savingPassword || !newPassword || newPassword !== confirmPassword}
                    style={{ padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700, border: 'none', background: '#f97316', color: '#fff', cursor: 'pointer', opacity: (savingPassword || !newPassword || newPassword !== confirmPassword) ? 0.5 : 1 }}>
                    {savingPassword ? 'Saving…' : 'Change password'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <p style={{ color: 'var(--text-3, var(--text-muted))', fontSize: 13 }}>Could not load your security settings right now.</p>
          )}
        </Section>

        {/* ══ APPEARANCE ═══════════════════════════════════════════════════════ */}
        <Section id="appearance" title="Appearance" icon="🎨" accent="#8b5cf6"
          subtitle="Theme, text size, line spacing, and density.">

          <SettingRow label="Theme">
            <ChoiceButtons accent="#8b5cf6" options={THEME_OPTIONS} value={settings.theme} onChange={v => set('theme', v)} />
          </SettingRow>

          <Divider />

          <SettingRow label="Font size">
            <ChoiceButtons accent="#8b5cf6" options={FONT_OPTIONS.map(o => ({ id: o.value, label: o.label }))} value={settings.fontSize} onChange={v => set('fontSize', v)} />
          </SettingRow>

          <Divider />

          <SettingRow label="Line spacing">
            <ChoiceButtons accent="#8b5cf6" options={LINE_HEIGHT_OPTIONS.map(o => ({ id: o.value, label: o.label }))} value={settings.lineHeight} onChange={v => set('lineHeight', v)} />
          </SettingRow>

          <Divider />

          <SettingRow label="Density" hint="Controls padding and spacing throughout the UI.">
            <ChoiceButtons accent="#8b5cf6" options={DENSITY_OPTIONS} value={settings.density} onChange={v => set('density', v)} />
          </SettingRow>

          <Divider />

          <SettingRow label="Language">
            <ChoiceButtons accent="#8b5cf6"
              options={[
                { id: 'en', label: 'English' },
                { id: 'ar', label: 'العربية' },
                { id: 'fr', label: 'Français' },
                { id: 'es', label: 'Español' },
                { id: 'de', label: 'Deutsch' },
                { id: 'zh', label: '中文' },
              ]}
              value={settings.language}
              onChange={v => set('language', v)}
            />
          </SettingRow>

          <Divider />

          {/* Live preview box */}
          <div style={{
            padding: 16, borderRadius: 12, border: '1.5px solid #8b5cf640',
            background: '#8b5cf608', boxSizing: 'border-box',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Live preview</div>
            <p style={{ margin: 0, marginBottom: 10, fontSize: 'var(--text-base, 1rem)', lineHeight: 'var(--leading, 1.5)' }}>
              This text uses your current font size and line spacing. Switch any setting above and this updates immediately so you can feel the difference.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Normal text', 'Readable spacing', 'Better contrast'].map(label => (
                <span key={label} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, border: '1px solid #8b5cf640', color: '#8b5cf6', background: '#8b5cf610' }}>{label}</span>
              ))}
            </div>
          </div>
        </Section>

        {/* ══ AI & DOWNLOADS ═══════════════════════════════════════════════════ */}
        <Section id="ai-models" title="AI, Models & Downloads" icon="🤖" accent="#06b6d4"
          subtitle="Local/cloud routing, desktop installers, and optional local AI assets.">

          <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-2, var(--border-subtle))', background: 'var(--surface-2, var(--bg-2))', boxSizing: 'border-box' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>AI routing</div>
            <p style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', marginBottom: 14, marginTop: 0 }}>
              Choose whether Kivora prefers local privacy, cloud convenience, or automatic fallback.
            </p>
            <AiRuntimeControls compact />
          </div>

          <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border-2, var(--border-subtle))', background: 'var(--surface-2, var(--bg-2))', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Downloads & releases</div>
                <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', marginTop: 3 }}>
                  Desktop installers and optional local AI assets.
                </div>
              </div>
              {downloads?.releaseUrl && (
                <a href={downloads.releaseUrl} target="_blank" rel="noopener noreferrer"
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-2, var(--border-subtle))', color: 'var(--text, var(--text-primary))', textDecoration: 'none', flexShrink: 0, background: 'transparent' }}>
                  Release {downloads.releaseTag}
                </a>
              )}
            </div>

            {downloadsLoading ? (
              <div style={{ height: 150, borderRadius: 10, background: 'var(--surface, var(--bg-elevated))', animation: 'pulse 1.4s ease-in-out infinite' }} />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, boxSizing: 'border-box' }}>
                <DownloadCard title="macOS Apple Silicon" hint="Desktop download with offline-first local AI support."
                  primary={downloads?.macAsset ? { label: 'Download DMG', href: downloads.macAsset.browser_download_url } : null}
                />
                <DownloadCard title="Windows x64" hint="Installer with portable build option."
                  primary={downloads?.windowsInstaller ? { label: 'Download installer', href: downloads.windowsInstaller.browser_download_url } : null}
                  secondary={downloads?.windowsPortable ? { label: 'Portable EXE', href: downloads.windowsPortable.browser_download_url } : null}
                />
                <DownloadCard title="Integrity files" hint="Verify model assets and release integrity."
                  primary={downloads?.manifestAsset ? { label: 'Manifest', href: downloads.manifestAsset.browser_download_url } : null}
                  secondary={downloads?.checksumsAsset ? { label: 'Checksums', href: downloads.checksumsAsset.browser_download_url } : null}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
              {[
                'Local = private + offline',
                'Cloud = convenience',
                'Offline fallback always on',
                ...(downloads?.hasPublishedModelAssets ? ['Model assets published ✓'] : []),
              ].map(label => (
                <span key={label} style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
                  border: '1px solid var(--border-2, var(--border-subtle))',
                  color: 'var(--text-3, var(--text-muted))', background: 'var(--surface, var(--bg-elevated))',
                }}>{label}</span>
              ))}
            </div>
          </div>
        </Section>

        {/* ══ REPORT ISSUE ═════════════════════════════════════════════════════ */}
        <Section id="reporting" title="Report Issue & Diagnostics" icon="🐛" accent="#f59e0b"
          subtitle="File bugs and feature requests with current route, theme, and language automatically included.">
          <ReportIssuePanel embedded />
        </Section>

        {/* ══ PRIVACY ══════════════════════════════════════════════════════════ */}
        <div id="privacy">
          <PrivacySection />
        </div>

        <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>
      </main>
    </div>
  );
}

// ── Privacy & Data Control section ────────────────────────────────────────────

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
      a.href = url; a.download = `kivora-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      toast('Data exported — check your downloads', 'success');
    } catch { toast('Export failed. Please try again.', 'error'); }
    finally { setExportLoading(false); }
  }

  async function deleteAllData() {
    if (deleteConfirm.trim().toLowerCase() !== 'delete my data') { toast('Type "delete my data" to confirm', 'error'); return; }
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/user/delete-data', { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      toast('All data deleted. Signing you out…', 'success');
      setTimeout(() => { window.location.href = '/api/auth/signout'; }, 1500);
    } catch { toast('Data deletion failed. Contact support.', 'error'); }
    finally { setDeleteLoading(false); }
  }

  const dataItems = [
    { icon: '📁', label: 'Folders & files',  where: 'Cloud (PostgreSQL)',    note: 'File metadata — names, sizes, dates' },
    { icon: '📄', label: 'File content',      where: 'Local (IndexedDB)',     note: 'Blobs never leave your browser' },
    { icon: '📇', label: 'Flashcard decks',   where: 'Local + Cloud sync',   note: 'SRS schedule stored on device' },
    { icon: '🗂',  label: 'Library items',    where: 'Cloud (PostgreSQL)',    note: 'Saved generated outputs' },
    { icon: '📊', label: 'Study analytics',   where: 'Cloud (PostgreSQL)',    note: 'Quiz scores and review history' },
    { icon: '⚙️', label: 'Settings',          where: 'Cloud (PostgreSQL)',    note: 'Theme, font, density prefs' },
  ];

  const aiCanItems    = ['Receive extracted text from files you send', 'Generate study material from that text', 'Use anonymised usage metadata for quality'];
  const aiCantItems   = ['Access raw file blobs in IndexedDB', 'Retain or train on your content', 'Share data with third parties', 'Access other users\' data', 'Store credentials or payment data'];

  const AI_MODES: { id: 'full' | 'metadata-only' | 'offline'; label: string; hint: string; icon: string }[] = [
    { id: 'full',          label: 'Full context',    hint: 'File text sent to cloud AI. Best results.',          icon: '🌐' },
    { id: 'metadata-only', label: 'Metadata only',   hint: 'Only filenames/counts sent — content stays local.',  icon: '🔒' },
    { id: 'offline',       label: 'Offline only',    hint: 'No data leaves your device. Built-in generation.',   icon: '✈️' },
  ];

  const toggleSwitchStyle = (on: boolean): CSSProperties => ({
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: on ? '#6366f1' : 'var(--border-2, var(--border-subtle))',
    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
  });

  return (
    <>
      {/* Data map */}
      <Section title="Privacy & Data" icon="🔒" accent="#6366f1"
        subtitle="Understand exactly what is stored, where, and what you can do with it.">

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3, var(--text-muted))', marginBottom: 10 }}>Where your data lives</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box' }}>
            {dataItems.map(item => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 10, background: 'var(--surface-2, var(--bg-2))',
                border: '1px solid var(--border-2, var(--border-subtle))', boxSizing: 'border-box',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3, var(--text-muted))' }}>{item.note}</div>
                </div>
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 999, flexShrink: 0,
                  border: '1px solid var(--border-2, var(--border-subtle))',
                  background: 'var(--surface, var(--bg-elevated))',
                  color: 'var(--text-2, var(--text-secondary))',
                  whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{item.where}</span>
              </div>
            ))}
          </div>
        </div>

        <Divider />

        {/* AI Can / Cannot */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3, var(--text-muted))', marginBottom: 10 }}>AI API data boundaries</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, boxSizing: 'border-box' }}>
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#4ade80' }}>✓ What AI can do</div>
              <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 12, color: 'var(--text-2, var(--text-secondary))', lineHeight: 1.8 }}>
                {aiCanItems.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#ef4444' }}>✗ What AI cannot do</div>
              <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 12, color: 'var(--text-2, var(--text-secondary))', lineHeight: 1.8 }}>
                {aiCantItems.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <Divider />

        {/* AI data mode */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3, var(--text-muted))', marginBottom: 10 }}>Content sent to AI</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AI_MODES.map(mode => {
              const isActive = aiMode === mode.id;
              return (
                <button key={mode.id} onClick={() => saveAiMode(mode.id)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                  border: `1.5px solid ${isActive ? '#6366f1' : 'var(--border-2, var(--border-subtle))'}`,
                  background: isActive ? '#6366f115' : 'var(--surface-2, var(--bg-2))',
                  transition: 'all 0.12s', boxSizing: 'border-box',
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>{mode.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
                      {mode.label}
                      {isActive && <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', marginLeft: 8 }}>● Active</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))' }}>{mode.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Telemetry */}
      <Section title="Telemetry & Tracking" icon="📈" accent="#10b981"
        subtitle="Control whether Kivora keeps local usage diagnostics and recent crash summaries for troubleshooting.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Usage analytics', hint: 'Store local page and tool counts so reports can include useful diagnostics. Turning this off clears the saved snapshot.', value: analyticsEnabled, onChange: toggleAnalytics },
            { label: 'Crash reports',   hint: 'Store recent runtime error summaries locally when something breaks. No file content is included.', value: crashReports, onChange: toggleCrash },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', marginTop: 2 }}>{item.hint}</div>
              </div>
              <button onClick={() => item.onChange(!item.value)} style={toggleSwitchStyle(item.value)}
                aria-label={`${item.value ? 'Disable' : 'Enable'} ${item.label}`}>
                <span style={{
                  position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.2s', left: item.value ? 22 : 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* Data portability */}
      <Section title="Data Portability" icon="📦" accent="#f59e0b"
        subtitle="Export or permanently delete all your Kivora data. No lock-in.">

        {/* Export */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', boxSizing: 'border-box' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Export everything</div>
            <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', lineHeight: 1.5 }}>
              Download a JSON file of all your folders, files, library items, flashcard decks, quiz history, and study plans.
            </div>
          </div>
          <button onClick={exportData} disabled={exportLoading}
            style={{ padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1.5px solid #f59e0b', color: '#f59e0b', background: 'transparent', cursor: 'pointer', flexShrink: 0, opacity: exportLoading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {exportLoading ? '⏳ Exporting…' : '⬇ Export my data'}
          </button>
        </div>

        <Divider />

        {/* Delete */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>Delete all data</div>
          <div style={{ fontSize: 12, color: 'var(--text-3, var(--text-muted))', marginBottom: 12, lineHeight: 1.5 }}>
            Permanently removes all your folders, files, library items, and account. This cannot be undone.
            File content stored locally in IndexedDB is also cleared.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', boxSizing: 'border-box' }}>
            <input
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder='Type "delete my data" to unlock'
              style={{
                flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 10, fontSize: 13, boxSizing: 'border-box',
                border: `1.5px solid ${deleteConfirm.trim().toLowerCase() === 'delete my data' ? '#ef4444' : 'var(--border-2, var(--border-subtle))'}`,
                background: 'var(--surface, var(--bg-elevated))', color: 'var(--text, var(--text-primary))', outline: 'none',
              }}
            />
            <button
              disabled={deleteConfirm.trim().toLowerCase() !== 'delete my data' || deleteLoading}
              onClick={deleteAllData}
              style={{ padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', flexShrink: 0, opacity: (deleteConfirm.trim().toLowerCase() !== 'delete my data' || deleteLoading) ? 0.4 : 1, whiteSpace: 'nowrap' }}>
              {deleteLoading ? '⏳ Deleting…' : '🗑 Delete all'}
            </button>
          </div>
        </div>
      </Section>
    </>
  );
}
