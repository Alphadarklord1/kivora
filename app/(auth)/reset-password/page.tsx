'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import styles from '../auth.module.css';

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customToken = searchParams.get('token'); // set by our /api/auth/forgot-password flow

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // Supabase path: wait for session token in URL hash
  const [supabaseSessionReady, setSupabaseSessionReady] = useState(false);
  useEffect(() => {
    if (customToken) return; // using custom token path — skip Supabase
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSupabaseSessionReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setSupabaseSessionReady(true);
    });
    return () => { listener.subscription.unsubscribe(); };
  }, [customToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    if (customToken) {
      // Credential-auth path
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: customToken, password }),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (data.ok) {
          setDone(true);
          setTimeout(() => router.replace('/login'), 2500);
        } else {
          setError(data.error || 'Could not reset password. The link may have expired.');
        }
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Supabase path
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError('Password reset is not available — Supabase is not configured.');
      setLoading(false);
      return;
    }
    const { error: sbErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (sbErr) {
      setError(sbErr.message || 'Could not update password. The link may have expired.');
    } else {
      setDone(true);
      setTimeout(() => router.replace('/workspace'), 2500);
    }
  }

  const sessionReady = customToken ? true : supabaseSessionReady;

  return (
    <div className={styles.shell} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className={styles.card} style={{ width: '100%', maxWidth: 420, padding: '2.5rem' }}>
        <div className={styles.cardHeader}>
          <h1>Set new password</h1>
          <p>Choose a strong password for your account.</p>
        </div>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14, margin: 0 }}>
              Password updated! {customToken ? 'Redirecting to sign in…' : 'Redirecting to your workspace…'}
            </p>
          </div>
        ) : (
          <div className={styles.stack}>
            {!sessionReady && (
              <div className={styles.notice}>
                Verifying your reset link… If nothing happens, try requesting a new one.
              </div>
            )}
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="password">New password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9cadc8', fontSize: 14, padding: 0 }}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                  >
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="confirm">Confirm password</label>
                <input
                  id="confirm"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#f87171' }}>{error}</p>
              )}
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading || !sessionReady}
                style={{ width: '100%' }}
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
            <div className={styles.footerRow}>
              <Link href="/login">← Back to sign in</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className={styles.shell} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><div className={styles.card} style={{ width: '100%', maxWidth: 420, padding: '2.5rem' }}><div className={styles.cardHeader}><h1>Set new password</h1><p>Loading reset link…</p></div></div></div>}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
