'use client';

import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useSettings, type Density, type Theme } from '@/providers/SettingsProvider';

const OLLAMA_MODEL_KEY = 'kivora_ollama_model';
const DEFAULT_MODEL = 'mistral';

const AVAILABLE_MODELS = [
  { id: 'mistral', label: 'Mistral 7B', hint: 'Best overall · 4.1 GB' },
  { id: 'qwen2.5', label: 'Qwen2.5 1.5B', hint: 'Ultra-fast · 1.1 GB' },
  { id: 'qwen2.5-math', label: 'Qwen2.5-Math 1.5B', hint: 'Math specialist · 1.1 GB' },
  { id: 'phi4-mini', label: 'Phi-4 Mini 3.8B', hint: 'STEM reasoning · 2.3 GB' },
  { id: 'llama3.2:3b', label: 'Llama 3.2 3B', hint: 'Balanced · 2.0 GB' },
  { id: 'gemma3:4b', label: 'Gemma 3 4B', hint: 'Writing & analysis · 3.3 GB' },
  { id: 'deepseek-r1:7b', label: 'DeepSeek R1 7B', hint: 'Chain-of-thought · 4.7 GB' },
  { id: 'mistral:latest', label: 'Mistral Large 24B', hint: 'Maximum quality · 14 GB' },
];

const THEME_OPTIONS: { id: Theme; label: string; hint: string }[] = [
  { id: 'system', label: 'System', hint: 'Follow your device preference' },
  { id: 'blue', label: 'Blue', hint: 'Default Kivora theme' },
  { id: 'light', label: 'Light', hint: 'Bright workspace' },
  { id: 'black', label: 'Black', hint: 'Highest contrast' },
];

const FONT_OPTIONS = [
  { value: '0.9', label: 'Small' },
  { value: '1', label: 'Normal' },
  { value: '1.1', label: 'Large' },
  { value: '1.2', label: 'Extra large' },
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [activeModel, setActiveModel] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL;
    return localStorage.getItem(OLLAMA_MODEL_KEY) || DEFAULT_MODEL;
  });
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'ok' | 'none'>('checking');

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
    fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2500) })
      .then(response => setOllamaStatus(response.ok ? 'ok' : 'none'))
      .catch(() => setOllamaStatus('none'));
  }, []);

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

  function setModel(id: string) {
    setActiveModel(id);
    localStorage.setItem(OLLAMA_MODEL_KEY, id);
    markSaved('AI model preference updated');
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
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, marginBottom: 4 }}>Settings</h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
            Keep your account, appearance, security, and local AI setup in one place.
          </p>
        </div>
        {saved ? <span className="badge badge-success">Saved ✓</span> : null}
      </div>

      <Section title="Account" subtitle="Profile, connected sign-in methods, and basic account details.">
        {showGuestState ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', flex: 1 }}>
              You are in guest mode. Appearance settings still work locally, but account features like profile, password, and two-step verification need a real sign-in.
            </span>
            <a href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Sign in / Register</a>
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

      <Section title="Security" subtitle="Password changes and two-step verification for your account.">
        {showGuestState ? (
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>
            Security settings become available after you sign in with an account.
          </p>
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

      <Section title="Appearance" subtitle="Make the app readable and comfortable for your workflow.">
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
            This preview uses your live font size, line spacing, and density settings so you can immediately feel whether the UI is too tight or too loose.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge">Readable cards</span>
            <span className="badge">Cleaner spacing</span>
            <span className="badge">Better contrast</span>
          </div>
        </div>
      </Section>

      <Section title="Language" subtitle="Switch the interface language and text direction.">
        <ChoiceButtons
          options={[
            { id: 'en', label: 'English', hint: 'Default interface language' },
            { id: 'ar', label: 'العربية', hint: 'Arabic with RTL layout' },
            { id: 'fr', label: 'Français' },
            { id: 'es', label: 'Español' },
            { id: 'de', label: 'Deutsch' },
            { id: 'zh', label: '中文' },
          ]}
          value={settings.language}
          onChange={value => set('language', value)}
        />
      </Section>

      <Section title="AI model" subtitle="Choose the local model Kivora should prefer when Ollama is available.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Ollama status</span>
          <span className={`badge${ollamaStatus === 'ok' ? ' badge-success' : ''}`} style={{ marginLeft: 'auto' }}>
            {ollamaStatus === 'checking' ? 'Checking…' : ollamaStatus === 'ok' ? 'Connected' : 'Not detected'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {AVAILABLE_MODELS.map(model => (
            <button
              key={model.id}
              type="button"
              className={`btn ${activeModel === model.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setModel(model.id)}
              style={{ justifyContent: 'space-between', textAlign: 'left', padding: '12px 14px', minHeight: 0 }}
            >
              <span>
                <span style={{ display: 'block', fontWeight: 600 }}>{model.label}</span>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: activeModel === model.id ? 'rgba(255,255,255,0.85)' : 'var(--text-3)' }}>{model.hint}</span>
              </span>
              <span className="badge">{activeModel === model.id ? 'Active' : 'Select'}</span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
          Install new models from <a href="/models" style={{ color: 'var(--accent)' }}>Models & Downloads</a>, or run <code>ollama pull {activeModel}</code> locally.
        </p>
      </Section>

      <Section title="Support" subtitle="Quick access to reporting and system status when something feels off.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', flex: 1 }}>
            Share crashes, UI issues, auth problems, or workflow bugs with guided diagnostics.
          </span>
          <a href="/report" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Report an issue</a>
          <a href="/status" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Status & support</a>
        </div>
      </Section>

      <Section title="AI runtime" subtitle="Understand which local runtime Kivora can use right now.">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Offline fallback</span>
            <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Always available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Ollama (local AI)</span>
            <span className={`badge${ollamaStatus === 'ok' ? ' badge-success' : ''}`} style={{ marginLeft: 'auto' }}>
              {ollamaStatus === 'checking' ? 'Detecting…' : ollamaStatus === 'ok' ? 'Active' : 'Not running'}
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            Ollama runs models entirely on your machine. If you host it on a different port, set <code>NEXT_PUBLIC_OLLAMA_URL</code>.
          </p>
        </div>
      </Section>
    </div>
  );
}
