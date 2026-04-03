'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';
import { useSettings } from '@/providers/SettingsProvider';

interface AuthCapabilities {
  googleConfigured: boolean;
  githubConfigured: boolean;
  microsoftConfigured: boolean;
  oauthDisabled?: boolean;
  dbConfigured?: boolean;
  guestModeEnabled?: boolean;
  supabaseAdminConfigured?: boolean;
  supabaseBrowserConfigured?: boolean;
  supabaseStorageConfigured?: boolean;
}

export default function RegisterPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [caps, setCaps]         = useState<AuthCapabilities | null>(null);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/capabilities')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCaps(d))
      .catch(() => {});
  }, []);

  async function handleOAuth(provider: string) {
    setOauthLoading(provider);
    await signIn(provider, { callbackUrl: '/workspace' });
  }

  const hasOAuth = !caps?.oauthDisabled && (caps?.googleConfigured || caps?.microsoftConfigured || caps?.githubConfigured);
  const dbReady  = caps?.dbConfigured !== false;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (caps && caps.dbConfigured === false) {
      setError('Account creation requires a database. Configure DATABASE_URL or SUPABASE_DATABASE_URL in your environment first.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string };

    if (!res.ok) {
      setLoading(false);
      setError(data.error ?? 'Registration failed. Please try again.');
      return;
    }

    const signInResult = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);

    if (signInResult?.error) {
      setError('Account created! Automatic sign-in failed — please sign in from the login page.');
      router.replace('/login');
      return;
    }

    router.replace('/workspace');
  }

  return (
    <div className={styles.shell} dir={settings.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.grid}>
        {/* Left panel — branding */}
        <div className={styles.panel}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>K</span>
            <span className={styles.brandText}>Kivora</span>
          </Link>
          <p className={styles.eyebrow}>Free forever for students</p>
          <h1 className={styles.panelTitle}>Start studying smarter today</h1>
          <p className={styles.panelBody}>
            Create your free account to sync study materials across devices, track your progress
            with detailed analytics, and build a personal library of AI-generated content.
          </p>
          <div className={styles.proofGrid}>
            <div className={styles.proofCard}>
              <strong>✓ No credit card needed</strong>
              <p>Free to sign up. Core features work offline without a paid plan.</p>
            </div>
            <div className={styles.proofCard}>
              <strong>☁ Cloud sync</strong>
              <p>Your review sets, plans, and library sync when account features are configured.</p>
            </div>
            <div className={styles.proofCard}>
              <strong>🔒 Privacy-first</strong>
              <p>Run AI models locally — your files never leave your device.</p>
            </div>
          </div>
          <div className={styles.panelFooter}>
            <span>Already have an account?</span>
            <Link href="/login" style={{ color: '#9ebdff', textDecoration: 'none', fontWeight: 600 }}>
              Sign in →
            </Link>
          </div>
        </div>

        {/* Right panel — form */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h1>Create account</h1>
            <p>Get started — it takes 30 seconds.</p>
          </div>

          <div className={styles.stack}>
            {/* No-DB warning */}
            {!dbReady && caps !== null && (
              <div className={styles.warning}>
                <strong>Database not connected.</strong> Account creation requires a database.
                Add <code>DATABASE_URL</code> or <code>SUPABASE_DATABASE_URL</code> to your environment.
                You can still <Link href="/workspace" style={{ color: '#fbbf24', fontWeight: 600 }}>continue as Guest</Link>.
              </div>
            )}
            {dbReady && caps !== null && !caps.supabaseAdminConfigured && (
              <div className={styles.notice}>
                <strong>Supabase setup is incomplete.</strong> Registration can still create local accounts,
                but full Supabase Auth sync and storage backup need <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>.
              </div>
            )}

            {/* OAuth quick-register */}
            {hasOAuth && (
              <div className={styles.oauthButtons}>
                {caps?.googleConfigured && (
                  <button type="button" className={styles.oauthButton} disabled={!!oauthLoading}
                    onClick={() => handleOAuth('google')}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    {oauthLoading === 'google' ? 'Redirecting…' : 'Sign up with Google'}
                  </button>
                )}
                {caps?.microsoftConfigured && (
                  <button type="button" className={styles.oauthButton} disabled={!!oauthLoading}
                    onClick={() => handleOAuth('microsoft-entra-id')}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="1" y="1" width="7" height="7" fill="#F25022"/>
                      <rect x="10" y="1" width="7" height="7" fill="#7FBA00"/>
                      <rect x="1" y="10" width="7" height="7" fill="#00A4EF"/>
                      <rect x="10" y="10" width="7" height="7" fill="#FFB900"/>
                    </svg>
                    {oauthLoading === 'microsoft-entra-id' ? 'Redirecting…' : 'Sign up with Microsoft'}
                  </button>
                )}
                {caps?.githubConfigured && (
                  <button type="button" className={styles.oauthButton} disabled={!!oauthLoading}
                    onClick={() => handleOAuth('github')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                    </svg>
                    {oauthLoading === 'github' ? 'Redirecting…' : 'Sign up with GitHub'}
                  </button>
                )}
              </div>
            )}

            {hasOAuth && <div className={styles.divider}>or create account with email</div>}

            {/* Email registration form */}
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="name">Name</label>
                <input id="name" type="text" placeholder="Your name" value={name}
                  onChange={e => setName(e.target.value)} required autoComplete="name" />
              </div>
              <div className={styles.field}>
                <label htmlFor="email">Email</label>
                <input id="email" type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className={styles.field}>
                <label htmlFor="password">Password</label>
                <input id="password" type="password" placeholder="At least 8 characters" value={password}
                  onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              </div>
              {error && <p style={{ margin: 0, fontSize: '0.875rem', color: '#f87171' }}>{error}</p>}
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            {/* Guest access */}
            {caps?.guestModeEnabled !== false && (
              <>
                <div className={styles.divider}>or</div>
                <Link href="/workspace" className={styles.guestLink}>
                  Continue as Guest — no account needed
                </Link>
              </>
            )}

            <div className={styles.footerRow}>
              <span>Already have an account?</span>
              <Link href="/login">Sign in →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
