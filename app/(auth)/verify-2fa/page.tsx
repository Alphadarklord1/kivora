'use client';

import Link from 'next/link';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import styles from '../auth.module.css';

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
      'Second step before workspace access': 'الخطوة الثانية قبل دخول مساحة العمل',
      'Enter the 6-digit code from your authenticator app to continue.': 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة للمتابعة.',
      'Verification code': 'رمز التحقق',
      '6-digit code': 'رمز مكوّن من 6 أرقام',
      'Verify and continue': 'تحقق وتابع',
      Verifying: 'جارٍ التحقق...',
      'Sign out': 'تسجيل الخروج',
      'Verification failed': 'فشل التحقق',
      'This extra step protects synced plans, shared content, and account settings.': 'هذه الخطوة الإضافية تحمي المخططات المتزامنة والمحتوى المشترك وإعدادات الحساب.',
      'Guest mode remains available on the main login screen if you only need local study tools.': 'يبقى وضع الضيف متاحًا في شاشة الدخول الرئيسية إذا كنت تحتاج الأدوات الدراسية المحلية فقط.',
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
    <div className={styles.shell} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>◢</span>
            <span className={styles.brandText}>Kivora</span>
          </Link>
          <span className={styles.eyebrow}>{t('Second step before workspace access')}</span>
          <h1 className={styles.panelTitle}>{t('Two-step verification')}</h1>
          <p className={styles.panelBody}>{t('This extra step protects synced plans, shared content, and account settings.')}</p>
          <div className={styles.proofGrid}>
            <div className={styles.proofCard}>
              <strong>{t('Verification code')}</strong>
              <p>{t('Enter the 6-digit code from your authenticator app to continue.')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>{t('Continue as guest')}</strong>
              <p>{t('Guest mode remains available on the main login screen if you only need local study tools.')}</p>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h1>{t('Two-step verification')}</h1>
            <p>{t('Enter the 6-digit code from your authenticator app to continue.')}</p>
          </div>

          <div className={styles.stack}>
            {error && <div className={styles.notice}>{error}</div>}

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="two-factor-code">{t('Verification code')}</label>
                <input
                  id="two-factor-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('6-digit code')}
                  required
                />
              </div>

              <button type="submit" className={styles.submitButton} disabled={loading || code.length !== 6}>
                {loading ? t('Verifying') : t('Verify and continue')}
              </button>
            </form>

            <button type="button" className={styles.secondaryLink} onClick={() => signOut({ callbackUrl: '/login' })}>
              {t('Sign out')}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
