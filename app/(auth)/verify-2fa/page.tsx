'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function VerifyTwoFactorPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isArabic = typeof document !== 'undefined'
    ? document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl'
    : false;
  const t = (key: string) => {
    const ar: Record<string, string> = {
      'Two-step verification': 'التحقق بخطوتين',
      'Enter the 6-digit code from your authenticator app to continue.': 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة للمتابعة.',
      'Verification code': 'رمز التحقق',
      '6-digit code': 'رمز مكوّن من 6 أرقام',
      'Verify and continue': 'تحقق وتابع',
      Verifying: 'جارٍ التحقق...',
      'Sign out': 'تسجيل الخروج',
      'Enter the 6-digit code from your authenticator app': 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة',
      'Verification failed': 'فشل التحقق',
    };
    return isArabic ? (ar[key] || key) : key;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(String(payload.reason || payload.error || t('Verification failed')));
        return;
      }

      router.push('/workspace');
      router.refresh();
    } catch {
      setError(t('Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>StudyHarbor</h1>
        <p>{t('Two-step verification')}</p>
        <p className="auth-hint">{t('Enter the 6-digit code from your authenticator app to continue.')}</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="two-factor-code">{t('Verification code')}</label>
            <input
              id="two-factor-code"
              className="auth-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('6-digit code')}
              required
            />
          </div>

          <button type="submit" className="btn" disabled={loading || code.length !== 6}>
            {loading ? t('Verifying') : t('Verify and continue')}
          </button>
        </form>

        <button className="auth-secondary-btn" onClick={() => signOut({ callbackUrl: '/login' })}>
          {t('Sign out')}
        </button>
      </div>
    </div>
  );
}
