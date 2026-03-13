'use client';

import { useEffect, useState } from 'react';
import { useSettings, type Theme, type Density } from '@/providers/SettingsProvider';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

const OLLAMA_MODEL_KEY = 'kivora_ollama_model';
const DEFAULT_MODEL = 'mistral';

const AVAILABLE_MODELS = [
  { id: 'mistral',         label: 'Mistral 7B',       hint: 'Best overall · 4.1 GB' },
  { id: 'qwen2.5',         label: 'Qwen2.5 1.5B',     hint: 'Ultra-fast · 1.1 GB' },
  { id: 'qwen2.5-math',    label: 'Qwen2.5-Math 1.5B', hint: 'Math specialist · 1.1 GB' },
  { id: 'phi4-mini',       label: 'Phi-4 Mini 3.8B',  hint: 'STEM reasoning · 2.3 GB' },
  { id: 'llama3.2:3b',     label: 'Llama 3.2 3B',     hint: 'Balanced · 2.0 GB' },
  { id: 'gemma3:4b',       label: 'Gemma 3 4B',       hint: 'Writing & analysis · 3.3 GB' },
  { id: 'deepseek-r1:7b',  label: 'DeepSeek R1 7B',   hint: 'Chain-of-thought · 4.7 GB' },
  { id: 'mistral:latest',  label: 'Mistral Large 24B', hint: 'Maximum quality · 14 GB' },
];

export default function SettingsPage() {
  const { settings, updateSetting } = useSettings();
  const { data: session } = useSession();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [activeModel, setActiveModel] = useState(DEFAULT_MODEL);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'ok' | 'none'>('checking');

  useEffect(() => {
    const stored = localStorage.getItem(OLLAMA_MODEL_KEY);
    if (stored) setActiveModel(stored);
    // Quick Ollama check
    const base = process.env.NEXT_PUBLIC_OLLAMA_URL ?? 'http://localhost:11434';
    fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2500) })
      .then(r => setOllamaStatus(r.ok ? 'ok' : 'none'))
      .catch(() => setOllamaStatus('none'));
  }, []);

  function set<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    updateSetting(key, value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function setModel(id: string) {
    setActiveModel(id);
    localStorage.setItem(OLLAMA_MODEL_KEY, id);
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {([
              ['English',  'en'],
              ['العربية',  'ar'],
              ['Français', 'fr'],
              ['Español',  'es'],
              ['Deutsch',  'de'],
              ['中文',      'zh'],
            ] as [string,string][]).map(([label, code]) => (
              <button key={code} className={`btn btn-sm ${settings.language === code ? 'btn-primary' : 'btn-ghost'}`} onClick={() => set('language', code)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* AI Model */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>AI Model</h2>
        <div className="card card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Ollama status</span>
            <span className={`badge${ollamaStatus === 'ok' ? ' badge-success' : ''}`} style={{ marginLeft: 'auto' }}>
              {ollamaStatus === 'checking' ? '⟳ Checking…' : ollamaStatus === 'ok' ? '✓ Connected' : '⚪ Not detected'}
            </span>
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 10 }}>
              Active model
              <span style={{ fontWeight: 400, marginLeft: 8, color: 'var(--text-3)' }}>
                — used for all AI generation, math verification, and flashcard tutoring
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {AVAILABLE_MODELS.map(m => (
                <div key={m.id}
                  onClick={() => setModel(m.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
                    borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s',
                    border: `1.5px solid ${activeModel === m.id ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: activeModel === m.id ? 'var(--accent-dim, rgba(96,165,250,0.08))' : 'var(--surface)',
                  }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${activeModel === m.id ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: activeModel === m.id ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {activeModel === m.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{m.label}</span>
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{m.hint}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', margin: 0 }}>
            Make sure the selected model is installed via <code>ollama pull {activeModel}</code>.
            Visit the <a href="/models" style={{ color: 'var(--accent)' }}>AI Models</a> page to install models.
          </p>
        </div>
      </section>

      {/* Support */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>Support</h2>
        <div className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-3)', fontSize: 'var(--text-sm)', flex: 1 }}>Open the guided report form to share crashes, UI issues, auth problems, or feature requests with diagnostics.</span>
          <a href="/report" className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>Report an issue</a>
          <a href="/status" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Status & support</a>
        </div>
      </section>

      {/* AI Runtime */}
      <section>
        <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 14 }}>AI Runtime</h2>
        <div className="card card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Offline fallback</span>
            <span className="badge badge-success" style={{ marginLeft: 'auto' }}>✅ Always available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }}>Ollama (local AI)</span>
            <span className={`badge${ollamaStatus === 'ok' ? ' badge-success' : ''}`} style={{ marginLeft: 'auto' }}>
              {ollamaStatus === 'checking' ? '⟳ Detecting…' : ollamaStatus === 'ok' ? '✓ Active' : '⚪ Not running'}
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', margin: 0 }}>
            Ollama runs AI locally on your machine — no data leaves your device.
            Set <code>NEXT_PUBLIC_OLLAMA_URL</code> if using a non-default port.
          </p>
        </div>
      </section>
    </div>
  );
}
