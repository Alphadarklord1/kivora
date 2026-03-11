'use client';

import { useState } from 'react';
import { useSettings, type Theme, type Density } from '@/providers/SettingsProvider';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { settings, updateSetting } = useSettings();
  const { data: session } = useSession();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    updateSetting(key, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace('/login');
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Settings</h1>
        {saved && <span className="badge badge-success">Saved ✓</span>}
      </div>

      {/* Account */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>Account</h2>
        <div className="card card-sm">
          {session?.user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{session.user.name || 'User'}</div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>{session.user.email}</div>
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }} onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)' }}>Guest mode — no account required.</span>
              <a href="/login" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Sign in / Register</a>
            </div>
          )}
        </div>
      </section>

      {/* Appearance */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>Appearance</h2>
        <div className="card card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="form-label">Theme</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['dark', 'light', 'black'] as Theme[]).map(t => (
                <button key={t} className={`btn btn-sm ${settings.theme === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('theme', t)}>
                  {t === 'dark' ? '🌙 Blue' : t === 'light' ? '☀️ Light' : '⬛ Black'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="form-label">Font size</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([['Small', '0.9'], ['Normal', '1'], ['Large', '1.1'], ['XL', '1.2']] as [string,string][]).map(([label, val]) => (
                <button key={val} className={`btn btn-sm ${settings.fontSize === val ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('fontSize', val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="form-label">Density</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['compact', 'normal', 'spacious'] as Density[]).map(d => (
                <button key={d} className={`btn btn-sm ${settings.density === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('density', d)} style={{ textTransform: 'capitalize' }}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Language */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>Language</h2>
        <div className="card card-sm">
          <div className="form-label">Interface language</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['English', 'en'], ['العربية', 'ar']] as [string,string][]).map(([label, code]) => (
              <button key={code} className={`btn btn-sm ${settings.language === code ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('language', code)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* AI Runtime */}
      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>AI Runtime</h2>
        <div className="card card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Local model (llama.cpp)</span>
            <span className="badge" style={{ marginLeft: 'auto' }}>⚪ Not configured</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Offline fallback</span>
            <span className="badge badge-success" style={{ marginLeft: 'auto' }}>✅ Always available</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
            Set <code>LLAMA_PROXY_URL</code> in your environment to enable local AI on desktop.
          </p>
        </div>
      </section>
    </div>
  );
}
