'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import styles from '../auth.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setError('Password reset is not available — Supabase is not configured.');
      setLoading(false);
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error: sbErr } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${origin}/reset-password` },
    );

    setLoading(false);
    if (sbErr) {
      setError(sbErr.message || 'Something went wrong. Please try again.');
    } else {
      setSent(true);
    }
  }

  return (
    <div className={styles.shell} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className={styles.card} style={{ width: '100%', maxWidth: 420, padding: '2.5rem' }}>
        <div className={styles.cardHeader}>
          <h1>Reset password</h1>
          <p>Enter your email and we&apos;ll send a reset link.</p>
        </div>

        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>📬</div>
            <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
              Check your inbox — if an account exists for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, you&apos;ll receive a reset link shortly.
            </p>
            <Link
              href="/login"
              style={{ color: 'var(--primary, #4f86f7)', fontSize: 14, textDecoration: 'none', marginTop: 8 }}
            >
              ← Back to sign in
            </Link>
          </div>
        ) : (
          <div className={styles.stack}>
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {error && (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#f87171' }}>{error}</p>
              )}
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Sending…' : 'Send reset link'}
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
