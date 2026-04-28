'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { getGamificationState, ACHIEVEMENTS, type GamificationState } from '@/lib/gamification/index';
import { validatePasswordPolicy } from '@/lib/auth/password-policy';

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  hasPassword: boolean;
  createdAt: string;
}

// ── Avatar helper ─────────────────────────────────────────────────────────

function initials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function AvatarCircle({ src, name, email, size = 72 }: { src?: string | null; name: string | null; email: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const text = initials(name, email);
  const hue = Array.from(email).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const bg = `hsl(${hue},55%,55%)`;

  if (src && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- src is an arbitrary user-supplied avatar URL; next/image needs a configured remotePatterns list which we don't want to constrain here
      <img
        src={src}
        alt={text}
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-2)' }}
      />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      border: '2px solid var(--border-2)', userSelect: 'none',
    }}>
      {text}
    </div>
  );
}

// ── Account page ──────────────────────────────────────────────────────────

export default function AccountPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [profile,     setProfile]     = useState<UserProfile | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [section,     setSection]     = useState<'profile' | 'security' | 'progress' | 'danger'>('profile');
  const [gamification, setGamification] = useState<GamificationState | null>(null);

  // Profile form
  const [name,        setName]        = useState('');
  const [imageUrl,    setImageUrl]    = useState('');
  const [savingPro,   setSavingPro]   = useState(false);

  // Password form
  const [curPwd,      setCurPwd]      = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [savingPwd,   setSavingPwd]   = useState(false);
  const [showCur,     setShowCur]     = useState(false);
  const [showNew,     setShowNew]     = useState(false);

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting,      setDeleting]      = useState(false);

  // Load gamification state from localStorage (client-side only)
  useEffect(() => {
    setGamification(getGamificationState());
  }, []);

  // Fetch profile on mount
  useEffect(() => {
    fetch('/api/users/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setProfile(data);
          setName(data.name ?? '');
          setImageUrl(data.image ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Redirect guests
  useEffect(() => {
    if (!loading && !session?.user && !profile) {
      router.replace('/login');
    }
  }, [loading, session, profile, router]);

  // ── Save profile ─────────────────────────────────────────────────────

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingPro(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), image: imageUrl.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Update failed', 'error'); return; }
      setProfile(prev => prev ? { ...prev, name: data.name, image: data.image } : prev);
      await updateSession({ user: { name: data.name, image: data.image } });
      toast('Profile updated ✓', 'success');
    } catch { toast('Failed to save. Try again.', 'error'); }
    finally { setSavingPro(false); }
  }

  // ── Change password ──────────────────────────────────────────────────

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast('Passwords do not match', 'error'); return; }
    const policyError = validatePasswordPolicy(newPwd);
    if (policyError) { toast(policyError, 'error'); return; }
    setSavingPwd(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: curPwd || undefined,
          newPassword: newPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'Password change failed', 'error'); return; }
      setCurPwd(''); setNewPwd(''); setConfirmPwd('');
      setProfile(prev => prev ? { ...prev, hasPassword: true } : prev);
      toast('Password updated ✓', 'success');
    } catch { toast('Failed to update password', 'error'); }
    finally { setSavingPwd(false); }
  }

  // ── Delete account ───────────────────────────────────────────────────

  async function deleteAccount() {
    if (deleteConfirm !== profile?.email) { toast('Email does not match', 'error'); return; }
    setDeleting(true);
    try {
      const res = await fetch('/api/users/me', { method: 'DELETE' });
      if (res.ok || res.status === 200) {
        await signOut({ redirect: false });
        router.replace('/');
        toast('Account deleted', 'info');
      } else {
        toast('Could not delete account — try again', 'error');
      }
    } catch { toast('Delete failed', 'error'); }
    finally { setDeleting(false); }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
        {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, marginBottom: 12, borderRadius: 10 }} />)}
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="empty-state" style={{ padding: 48 }}>
        <div className="empty-icon">🔒</div>
        <h3>Sign in to view your account</h3>
        <a href="/login" className="btn btn-primary" style={{ marginTop: 12, textDecoration: 'none' }}>Sign in</a>
      </div>
    );
  }

  const SECTIONS: { id: typeof section; label: string; icon: string }[] = [
    { id: 'profile',  label: 'Profile',  icon: '👤' },
    { id: 'security', label: 'Security', icon: '🔐' },
    { id: 'progress', label: 'Progress', icon: '🏆' },
    { id: 'danger',   label: 'Danger Zone', icon: '⚠️' },
  ];

  const pwdStrength = (pwd: string): { label: string; color: string; width: string } => {
    if (pwd.length === 0) return { label: '', color: 'transparent', width: '0%' };
    // Policy floor is 10 chars + letter + digit. Anything shorter is "Weak"
    // regardless of complexity so the meter never lies about acceptability.
    const meetsPolicy = pwd.length >= 10 && /[A-Za-z]/.test(pwd) && /[0-9]/.test(pwd);
    if (!meetsPolicy) return { label: 'Too short', color: '#e05252', width: '20%' };
    const score = [pwd.length >= 12, /[A-Z]/.test(pwd), /[^A-Za-z0-9]/.test(pwd), pwd.length >= 16].filter(Boolean).length;
    if (score === 0) return { label: 'Fair', color: '#f59e0b', width: '45%' };
    if (score <= 2) return { label: 'Good', color: '#4f86f7', width: '70%' };
    return { label: 'Strong', color: '#52b788', width: '100%' };
  };
  const strength = pwdStrength(newPwd);

  return (
    <div className="page-scroll" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <AvatarCircle src={profile.image} name={profile.name} email={profile.email} size={64} />
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 700 }}>{profile.name || profile.email}</h1>
          <div style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', marginTop: 3 }}>{profile.email}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>
            Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 'var(--text-sm)', fontWeight: section === s.id ? 600 : 400,
              color: section === s.id ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: `2px solid ${section === s.id ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.14s',
            }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* ── Profile section ─────────────────────────────────────────────── */}
      {section === 'profile' && (
        <form onSubmit={saveProfile}>
          <div className="settings-card" style={{ padding: '24px 24px 20px' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 'var(--text-lg)' }}>Profile information</h2>

            {/* Avatar preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <AvatarCircle src={imageUrl || profile.image} name={name || profile.name} email={profile.email} size={56} />
              <div style={{ flex: 1 }}>
                <label className="form-label">Avatar URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 4 }}>
                  Link to a publicly accessible image. Leave empty to use initials.
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="acc-name">Display name</label>
              <input
                id="acc-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                maxLength={80}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                value={profile.email}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 4 }}>
                Email cannot be changed here.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={savingPro}>
                {savingPro ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── Security section ─────────────────────────────────────────────── */}
      {section === 'security' && (
        <div className="settings-card" style={{ padding: '24px 24px 20px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 'var(--text-lg)' }}>
            {profile.hasPassword ? 'Change password' : 'Set a password'}
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', margin: '0 0 24px' }}>
            {profile.hasPassword
              ? 'Update your password. You\'ll remain signed in on this device.'
              : 'Add a password to enable email/password login alongside your existing provider.'}
          </p>
          <form onSubmit={changePassword}>
            {profile.hasPassword && (
              <div className="form-group">
                <label className="form-label" htmlFor="cur-pwd">Current password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="cur-pwd"
                    type={showCur ? 'text' : 'password'}
                    value={curPwd}
                    onChange={e => setCurPwd(e.target.value)}
                    placeholder="Current password"
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button type="button"
                    onClick={() => setShowCur(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14 }}>
                    {showCur ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="new-pwd">New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="new-pwd"
                  type={showNew ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  style={{ paddingRight: 44 }}
                />
                <button type="button"
                  onClick={() => setShowNew(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14 }}>
                  {showNew ? '🙈' : '👁'}
                </button>
              </div>
              {/* Password strength bar */}
              {newPwd && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 3, borderRadius: 2, background: 'var(--border-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: strength.width, background: strength.color, transition: 'width 0.3s, background 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: strength.color, marginTop: 3 }}>{strength.label}</div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-pwd">Confirm new password</label>
              <input
                id="confirm-pwd"
                type="password"
                value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Repeat new password"
                required
                autoComplete="new-password"
                style={{ borderColor: confirmPwd && confirmPwd !== newPwd ? 'var(--danger)' : undefined }}
              />
              {confirmPwd && confirmPwd !== newPwd && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', marginTop: 4 }}>Passwords don&apos;t match</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savingPwd || (confirmPwd !== newPwd && confirmPwd.length > 0)}>
                {savingPwd ? 'Updating…' : profile.hasPassword ? 'Update password' : 'Set password'}
              </button>
            </div>
          </form>

          {/* Connected providers */}
          <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 'var(--text-base)', fontWeight: 600 }}>Sign-in options</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10 }}>
              <span style={{ fontSize: 20 }}>{profile.hasPassword ? '🔑' : '🌐'}</span>
              <div>
                <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                  {profile.hasPassword ? 'Email & password' : 'OAuth only (no password set)'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{profile.email}</div>
              </div>
              {profile.hasPassword && (
                <span className="badge badge-accent" style={{ marginLeft: 'auto', fontSize: 10 }}>Active</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Progress / Gamification section ──────────────────────────────── */}
      {section === 'progress' && (
        <div className="settings-card" style={{ padding: '24px 24px 20px' }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 'var(--text-lg)' }}>Your Progress</h2>

          {/* Level badge with XP bar */}
          <div style={{ marginBottom: 28 }}>
            <LevelBadge compact={false} />
          </div>

          {/* Achievements grid */}
          <h3 style={{ margin: '0 0 14px', fontSize: 'var(--text-base)', fontWeight: 600 }}>
            Achievements{' '}
            {gamification && (
              <span style={{ color: 'var(--text-3)', fontWeight: 400, fontSize: 'var(--text-sm)' }}>
                ({gamification.achievements.length} / {ACHIEVEMENTS.length})
              </span>
            )}
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}>
            {ACHIEVEMENTS.map(ach => {
              const earned = gamification?.achievements.includes(ach.id) ?? false;
              return (
                <div
                  key={ach.id}
                  title={earned ? ach.description : `Locked: ${ach.description}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: '14px 10px',
                    borderRadius: 10,
                    border: `1px solid ${earned ? 'var(--accent, #4f86f7)' : 'var(--border, rgba(255,255,255,0.08))'}`,
                    background: earned ? 'rgba(79,134,247,0.08)' : 'var(--bg-2, rgba(255,255,255,0.03))',
                    opacity: earned ? 1 : 0.45,
                    filter: earned ? 'none' : 'grayscale(1)',
                    cursor: 'default',
                    userSelect: 'none',
                    transition: 'opacity 0.2s, filter 0.2s',
                  }}
                >
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{earned ? ach.icon : '🔒'}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    lineHeight: 1.3,
                  }}>
                    {ach.title}
                  </span>
                  {earned && (
                    <span style={{ fontSize: 10, color: '#f7c948', fontWeight: 700 }}>
                      +{ach.xp} XP
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      {section === 'danger' && (
        <div className="settings-card" style={{ padding: '24px 24px 20px', borderColor: 'rgba(224,82,82,0.35)' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 'var(--text-lg)', color: 'var(--danger)' }}>⚠️ Delete account</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', margin: '0 0 20px' }}>
            Permanently deletes your account, all folders, files (metadata), library items, and study data.
            File blobs stored locally in your browser are <strong>not</strong> affected.
            <br /><br />
            <strong>This cannot be undone.</strong>
          </p>

          <div className="form-group">
            <label className="form-label">
              Type your email <strong>{profile.email}</strong> to confirm
            </label>
            <input
              type="email"
              placeholder={profile.email}
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              style={{ borderColor: deleteConfirm && deleteConfirm !== profile.email ? 'var(--danger)' : undefined }}
            />
          </div>

          <button
            className="btn btn-danger"
            disabled={deleting || deleteConfirm !== profile.email}
            onClick={deleteAccount}
            style={{
              marginTop: 8, background: 'var(--danger)', color: '#fff',
              opacity: deleteConfirm !== profile.email ? 0.5 : 1,
            }}>
            {deleting ? 'Deleting…' : 'Permanently delete my account'}
          </button>
        </div>
      )}
    </div>
  );
}
