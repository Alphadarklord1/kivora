'use client';

import { useEffect, useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/useI18n';
import styles from '../auth.module.css';

interface AuthCapabilities {
  googleConfigured: boolean;
  githubConfigured: boolean;
  guestModeEnabled: boolean;
  authSecretConfigured: boolean;
  authDisabled: boolean;
  authDisabledReason: string | null;
  desktopAuthPort: number | null;
  oauthDisabled: boolean;
  oauthDisabledReason: string | null;
}

function mapOAuthErrorMessage(errorCode: string, isArabic: boolean) {
  const messages: Record<string, { en: string; ar: string }> = {
    OAuthSignin: {
      en: 'OAuth sign-up could not start. Please try again.',
      ar: 'تعذر بدء التسجيل عبر OAuth. يرجى المحاولة مرة أخرى.',
    },
    OAuthCallback: {
      en: 'OAuth callback failed. Check Google redirect URI configuration.',
      ar: 'فشلت عودة OAuth. تحقق من إعداد عنوان إعادة التوجيه في Google.',
    },
    OAuthCreateAccount: {
      en: 'Could not create account from OAuth login.',
      ar: 'تعذر إنشاء الحساب من تسجيل OAuth.',
    },
    OAuthAccountNotLinked: {
      en: 'This email is already used with another sign-in method. Sign in using your existing method first.',
      ar: 'هذا البريد مستخدم بطريقة دخول أخرى. سجّل الدخول بالطريقة الحالية أولاً.',
    },
    Configuration: {
      en: 'Sign-in provider is not configured by admin.',
      ar: 'مزود تسجيل الدخول غير مضبوط من قبل المسؤول.',
    },
    AccessDenied: {
      en: 'Access denied by the sign-in provider.',
      ar: 'تم رفض الوصول من مزود تسجيل الدخول.',
    },
    Default: {
      en: 'Sign-up failed. Please try again.',
      ar: 'فشل التسجيل. حاول مرة أخرى.',
    },
  };

  const chosen = messages[errorCode] || messages.Default;
  return isArabic ? chosen.ar : chosen.en;
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);
  const [authCapabilities, setAuthCapabilities] = useState<AuthCapabilities | null>(null);
  const { t, isArabic } = useI18n({
    'Create your account': 'أنشئ حسابك',
    'Create a StudyHarbor account for synced plans, analytics, and shared workspaces.': 'أنشئ حساب StudyHarbor للمخططات المتزامنة والتحليلات ومساحات العمل المشتركة.',
    'Set up the study workspace properly': 'جهّز مساحة الدراسة بشكل صحيح',
    'Create an account when you want synced plans, analytics, sharing, and external login providers.': 'أنشئ حسابًا عندما تريد مزامنة المخططات والتحليلات والمشاركة وربط مزودات الدخول.',
    'Guest mode stays available for quick starts': 'يبقى وضع الضيف متاحًا للبداية السريعة',
    'You can switch to a full account later': 'يمكنك التحول إلى حساب كامل لاحقًا',
    'OAuth stays optional when configured': 'يبقى OAuth اختياريًا عند الإعداد',
    'Email and password are required': 'البريد الإلكتروني وكلمة المرور مطلوبان',
    'Password must be at least 6 characters': 'يجب أن تكون كلمة المرور 6 أحرف على الأقل',
    'Passwords do not match': 'كلمتا المرور غير متطابقتين',
    'Registration failed': 'فشل إنشاء الحساب',
    'Something went wrong': 'حدث خطأ ما',
    'Signing up...': 'جارٍ إنشاء الحساب...',
    'Continue with Google': 'المتابعة باستخدام Google',
    'Continue with GitHub': 'المتابعة باستخدام GitHub',
    'or register with email': 'أو أنشئ حسابًا بالبريد الإلكتروني',
    Name: 'الاسم',
    'Your name': 'اسمك',
    Email: 'البريد الإلكتروني',
    Password: 'كلمة المرور',
    'At least 6 characters': '6 أحرف على الأقل',
    'Confirm Password': 'تأكيد كلمة المرور',
    'Re-enter your password': 'أعد إدخال كلمة المرور',
    'Create Account': 'إنشاء الحساب',
    'Already have an account?': 'لديك حساب بالفعل؟',
    'Sign in': 'تسجيل الدخول',
    'Continue as guest': 'المتابعة كضيف',
    'Use StudyHarbor without creating an account': 'استخدم StudyHarbor بدون إنشاء حساب',
    'Google login is not configured by admin.': 'تسجيل الدخول عبر Google غير مضبوط من قبل المسؤول.',
    'GitHub login is not configured by admin.': 'تسجيل الدخول عبر GitHub غير مضبوط من قبل المسؤول.',
    'Failed to sign in with {provider}': 'تعذر تسجيل الدخول باستخدام {provider}',
    'Google login': 'تسجيل الدخول عبر Google',
    'GitHub login': 'تسجيل الدخول عبر GitHub',
    Ready: 'جاهز',
    'Setup required': 'يلزم الإعداد',
    'Desktop OAuth disabled': 'OAuth معطل على سطح المكتب',
    'Guest access is enabled by default.': 'وضع الضيف متاح بشكل افتراضي.',
    'Google sign-in is ready.': 'تسجيل الدخول عبر Google جاهز.',
    'GitHub sign-in is ready.': 'تسجيل الدخول عبر GitHub جاهز.',
    'Add Google client credentials in the deployment environment to enable it.': 'أضف بيانات اعتماد Google في بيئة النشر لتفعيله.',
    'Add GitHub client credentials in the deployment environment to enable it.': 'أضف بيانات اعتماد GitHub في بيئة النشر لتفعيله.',
    'Use your browser, or continue as guest if you only need local study tools.': 'استخدم المتصفح، أو تابع كضيف إذا كنت تحتاج الأدوات الدراسية المحلية فقط.',
    'Example: you@example.com': 'مثال: you@example.com',
    'Sign-in is temporarily unavailable until the admin configures AUTH_SECRET.': 'تسجيل الدخول غير متاح مؤقتًا حتى يضبط المسؤول AUTH_SECRET.',
    'Guest mode is still available.': 'وضع الضيف لا يزال متاحًا.',
  });

  useEffect(() => {
    getProviders().then(setProviders).catch(() => setProviders(null));
    fetch('/api/auth/capabilities', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAuthCapabilities(data))
      .catch(() => setAuthCapabilities(null));

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      setError(mapOAuthErrorMessage(oauthError, isArabic));
    }
  }, [isArabic]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    if (!normalizedEmail || !password) {
      setError(t('Email and password are required'));
      return;
    }
    if (password.length < 6) {
      setError(t('Password must be at least 6 characters'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('Passwords do not match'));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: normalizedName, email: normalizedEmail, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.reason || data.error || t('Registration failed'));
      } else {
        const result = await signIn('credentials', {
          email: normalizedEmail,
          password,
          redirect: false,
        });
        if (result?.error) {
          router.push('/login');
        } else {
          router.push('/workspace');
          router.refresh();
        }
      }
    } catch {
      setError(t('Something went wrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setOauthLoading(provider);
    setError('');
    try {
      if (authCapabilities?.authDisabled) {
        setError(t('Sign-in is temporarily unavailable until the admin configures AUTH_SECRET.'));
        setOauthLoading(null);
        return;
      }
      if (authCapabilities?.oauthDisabled) {
        setError(authCapabilities.oauthDisabledReason || (isArabic ? 'OAuth معطل حاليًا على سطح المكتب.' : 'OAuth is currently disabled in desktop mode.'));
        setOauthLoading(null);
        return;
      }
      if (!providers?.[provider]) {
        setError(provider === 'google' ? t('Google login is not configured by admin.') : t('GitHub login is not configured by admin.'));
        setOauthLoading(null);
        return;
      }
      await signIn(provider, { callbackUrl: '/workspace' });
    } catch {
      setError(t('Failed to sign in with {provider}').replace('{provider}', provider));
      setOauthLoading(null);
    }
  };

  const googleReady = Boolean(providers?.google) && !Boolean(authCapabilities?.oauthDisabled);
  const githubReady = Boolean(providers?.github) && !Boolean(authCapabilities?.oauthDisabled);

  return (
    <div className={styles.shell} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={styles.grid}>
        <section className={styles.panel}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>◢</span>
            <span className={styles.brandText}>StudyHarbor</span>
          </Link>
          <span className={styles.eyebrow}>{t('Set up the study workspace properly')}</span>
          <h1 className={styles.panelTitle}>{t('Create your account')}</h1>
          <p className={styles.panelBody}>{t('Create an account when you want synced plans, analytics, sharing, and external login providers.')}</p>
          <div className={styles.proofGrid}>
            <div className={styles.proofCard}>
              <strong>{t('Guest mode stays available for quick starts')}</strong>
              <p>{t('Use StudyHarbor without creating an account')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>{t('You can switch to a full account later')}</strong>
              <p>{t('Create a StudyHarbor account for synced plans, analytics, and shared workspaces.')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>{t('OAuth stays optional when configured')}</strong>
              <p>{t('Use your browser, or continue as guest if you only need local study tools.')}</p>
            </div>
          </div>
          <div className={styles.panelFooter}>
            <span>Synced planner</span>
            <span>Analytics</span>
            <span>Shared workspace links</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h1>{t('Create your account')}</h1>
            <p>{t('Create a StudyHarbor account for synced plans, analytics, and shared workspaces.')}</p>
          </div>

          <div className={styles.stack}>
            {error && <div className={styles.notice}>{error}</div>}
            {authCapabilities?.authDisabled && (
              <div className={styles.warning}>
                {t('Sign-in is temporarily unavailable until the admin configures AUTH_SECRET.')} {authCapabilities.guestModeEnabled ? t('Guest mode is still available.') : ''}
              </div>
            )}

            <div className={styles.oauthButtons}>
              <button
                type="button"
                className={styles.oauthButton}
                onClick={() => handleOAuthSignIn('google')}
                disabled={oauthLoading !== null || !providers?.google || Boolean(authCapabilities?.oauthDisabled) || Boolean(authCapabilities?.authDisabled)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {oauthLoading === 'google' ? t('Signing up...') : t('Continue with Google')}
              </button>

              <button
                type="button"
                className={styles.oauthButton}
                onClick={() => handleOAuthSignIn('github')}
                disabled={oauthLoading !== null || !providers?.github || Boolean(authCapabilities?.oauthDisabled) || Boolean(authCapabilities?.authDisabled)}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                {oauthLoading === 'github' ? t('Signing up...') : t('Continue with GitHub')}
              </button>
            </div>

            <div className={styles.providerGrid}>
              <div className={styles.providerCard}>
                <div className={styles.providerRow}>
                  <strong>{t('Google login')}</strong>
                  <span className={`${styles.badge} ${googleReady ? styles.badgeReady : styles.badgeSetup}`}>
                    {googleReady ? t('Ready') : t('Setup required')}
                  </span>
                </div>
                <p>{googleReady ? t('Google sign-in is ready.') : t('Add Google client credentials in the deployment environment to enable it.')}</p>
              </div>
              <div className={styles.providerCard}>
                <div className={styles.providerRow}>
                  <strong>{t('GitHub login')}</strong>
                  <span className={`${styles.badge} ${githubReady ? styles.badgeReady : styles.badgeSetup}`}>
                    {githubReady ? t('Ready') : t('Setup required')}
                  </span>
                </div>
                <p>{githubReady ? t('GitHub sign-in is ready.') : t('Add GitHub client credentials in the deployment environment to enable it.')}</p>
              </div>
            </div>

            {authCapabilities?.oauthDisabledReason && (
              <div className={styles.hint}>
                <strong>{t('Desktop OAuth disabled')}</strong> {authCapabilities.oauthDisabledReason}
              </div>
            )}

            {authCapabilities?.guestModeEnabled && <div className={styles.hint}>{t('Guest access is enabled by default.')}</div>}

            <div className={styles.divider}>{t('or register with email')}</div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label htmlFor="name">{t('Name')}</label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Your name')} />
              </div>
              <div className={styles.field}>
                <label htmlFor="email">{t('Email')}</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('Example: you@example.com')} required />
              </div>
              <div className={styles.field}>
                <label htmlFor="password">{t('Password')}</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('At least 6 characters')} required minLength={6} />
              </div>
              <div className={styles.field}>
                <label htmlFor="confirmPassword">{t('Confirm Password')}</label>
                <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder={t('Re-enter your password')} required minLength={6} />
              </div>
              <button type="submit" className={styles.submitButton} disabled={loading || oauthLoading !== null || Boolean(authCapabilities?.authDisabled)}>
                {loading ? t('Signing up...') : t('Create Account')}
              </button>
            </form>

            {authCapabilities?.guestModeEnabled && (
              <Link href="/workspace" className={styles.guestLink}>
                {t('Continue as guest')}
              </Link>
            )}
            <div className={styles.muted}>{t('Use StudyHarbor without creating an account')}</div>

            <div className={styles.footerRow}>
              <span>{t('Already have an account?')}</span>
              <Link href="/login">{t('Sign in')}</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
