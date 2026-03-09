'use client';

import { useState, useEffect } from 'react';
import { signIn, getProviders } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/useI18n';

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
      en: 'OAuth sign-in could not start. Please try again.',
      ar: 'تعذر بدء تسجيل الدخول عبر OAuth. يرجى المحاولة مرة أخرى.',
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
      en: 'Sign-in failed. Please try again.',
      ar: 'فشل تسجيل الدخول. حاول مرة أخرى.',
    },
  };

  const chosen = messages[errorCode] || messages.Default;
  return isArabic ? chosen.ar : chosen.en;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);
  const [authCapabilities, setAuthCapabilities] = useState<AuthCapabilities | null>(null);
  const { t, isArabic } = useI18n({
    'Sign in to your account': 'سجّل الدخول إلى حسابك',
    'Access your study workspace, planner, and offline AI tools.': 'ادخل إلى مساحة الدراسة والمخطط وأدوات الذكاء الاصطناعي المحلية.',
    'Invalid email or password': 'البريد الإلكتروني أو كلمة المرور غير صحيحين',
    'Something went wrong': 'حدث خطأ ما',
    'Signing in...': 'جارٍ تسجيل الدخول...',
    'Continue with Google': 'المتابعة باستخدام Google',
    'Continue with GitHub': 'المتابعة باستخدام GitHub',
    'or sign in with email': 'أو سجّل الدخول بالبريد الإلكتروني',
    Email: 'البريد الإلكتروني',
    Password: 'كلمة المرور',
    'Your password': 'كلمة المرور',
    'Sign In': 'تسجيل الدخول',
    "Don't have an account?": 'ليس لديك حساب؟',
    'Sign up': 'إنشاء حساب',
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
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await signIn('credentials', {
        email: normalizedEmail,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('Invalid email or password'));
      } else {
        router.push('/workspace');
        router.refresh();
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
        if (provider === 'google') {
          setError(t('Google login is not configured by admin.'));
        } else {
          setError(t('GitHub login is not configured by admin.'));
        }
        setOauthLoading(null);
        return;
      }
      await signIn(provider, { callbackUrl: '/workspace' });
    } catch {
      setError(t('Failed to sign in with {provider}').replace('{provider}', provider));
      setOauthLoading(null);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>StudyHarbor</h1>
        <p>{t('Sign in to your account')}</p>
        <p className="auth-subtle-copy">{t('Access your study workspace, planner, and offline AI tools.')}</p>

        {error && <div className="auth-error">{error}</div>}
        {authCapabilities?.authDisabled && (
          <div className="auth-warning">
            {t('Sign-in is temporarily unavailable until the admin configures AUTH_SECRET.')}{' '}
            {authCapabilities.guestModeEnabled ? t('Guest mode is still available.') : ''}
          </div>
        )}

        {/* OAuth Buttons */}
        <div className="oauth-buttons">
          <button
            type="button"
            className="btn oauth-btn google"
            onClick={() => handleOAuthSignIn('google')}
            disabled={oauthLoading !== null || !providers?.google || Boolean(authCapabilities?.oauthDisabled) || Boolean(authCapabilities?.authDisabled)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {oauthLoading === 'google' ? t('Signing in...') : t('Continue with Google')}
          </button>

          <button
            type="button"
            className="btn oauth-btn github"
            onClick={() => handleOAuthSignIn('github')}
            disabled={oauthLoading !== null || !providers?.github || Boolean(authCapabilities?.oauthDisabled) || Boolean(authCapabilities?.authDisabled)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            {oauthLoading === 'github' ? t('Signing in...') : t('Continue with GitHub')}
          </button>
        </div>

        <div className="auth-status-grid">
          <div className="auth-status-card">
            <div className="auth-status-row">
              <strong>{t('Google login')}</strong>
              <span className={`auth-status-badge ${providers?.google && !authCapabilities?.oauthDisabled ? 'ready' : 'setup'}`}>
                {providers?.google && !authCapabilities?.oauthDisabled ? t('Ready') : t('Setup required')}
              </span>
            </div>
            <p>
              {providers?.google && !authCapabilities?.oauthDisabled
                ? t('Google sign-in is ready.')
                : t('Add Google client credentials in the deployment environment to enable it.')}
            </p>
          </div>
          <div className="auth-status-card">
            <div className="auth-status-row">
              <strong>{t('GitHub login')}</strong>
              <span className={`auth-status-badge ${providers?.github && !authCapabilities?.oauthDisabled ? 'ready' : 'setup'}`}>
                {providers?.github && !authCapabilities?.oauthDisabled ? t('Ready') : t('Setup required')}
              </span>
            </div>
            <p>
              {providers?.github && !authCapabilities?.oauthDisabled
                ? t('GitHub sign-in is ready.')
                : t('Add GitHub client credentials in the deployment environment to enable it.')}
            </p>
          </div>
        </div>

        {authCapabilities?.oauthDisabledReason && (
          <div className="auth-hint">
            <strong>{t('Desktop OAuth disabled')}</strong> {authCapabilities.oauthDisabledReason}
            <br />
            {t('Use your browser, or continue as guest if you only need local study tools.')}
          </div>
        )}

        {authCapabilities?.guestModeEnabled && (
          <div className="auth-hint">
            {t('Guest access is enabled by default.')}
          </div>
        )}

        <div className="auth-divider">
          <span>{t('or sign in with email')}</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email">{t('Email')}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('Example: you@example.com')}
              required
            />
          </div>

          <div>
            <label htmlFor="password">{t('Password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('Your password')}
              required
            />
          </div>

          <button type="submit" className="btn" disabled={loading || oauthLoading !== null || Boolean(authCapabilities?.authDisabled)}>
            {loading ? t('Signing in...') : t('Sign In')}
          </button>
        </form>

        {authCapabilities?.guestModeEnabled && (
          <Link href="/workspace" className="auth-guest-link">
            {t('Continue as guest')}
            <span>{t('Use StudyHarbor without creating an account')}</span>
          </Link>
        )}

        <div className="auth-link">
          {t("Don't have an account?")} <Link href="/register">{t('Sign up')}</Link>
        </div>
      </div>
    </div>
  );
}
