'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';
import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';


const LOCAL_AR: Record<string, string> = {
  'Account creation requires a database. Configure DATABASE_URL or SUPABASE_DATABASE_URL in your environment first.': 'إنشاء الحساب يحتاج إلى قاعدة بيانات. أضف DATABASE_URL أو SUPABASE_DATABASE_URL أولاً.',
  'Password must be at least 8 characters.': 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.',
  'Registration failed. Please try again.': 'فشل إنشاء الحساب. حاول مرة أخرى.',
  'Account created! Automatic sign-in failed — please sign in from the login page.': 'تم إنشاء الحساب، لكن تسجيل الدخول التلقائي فشل — يرجى تسجيل الدخول من صفحة الدخول.',
  'Free forever for students': 'مجاني دائمًا للطلاب',
  'Start studying smarter today': 'ابدأ الدراسة بذكاء أكبر اليوم',
  'Create your free account to sync study materials across devices, track your progress with detailed analytics, and build a personal library of AI-generated content.': 'أنشئ حسابك المجاني لمزامنة مواد الدراسة بين الأجهزة، ومتابعة تقدمك بتحليلات مفصلة، وبناء مكتبة شخصية من المحتوى المُنشأ بالذكاء الاصطناعي.',
  'No credit card needed': 'لا حاجة إلى بطاقة ائتمان',
  'Free to sign up. Core features work offline without a paid plan.': 'التسجيل مجاني، والميزات الأساسية تعمل دون اتصال ومن دون خطة مدفوعة.',
  'Cloud sync': 'مزامنة سحابية',
  'Your review sets, plans, and library sync when account features are configured.': 'تتزامن مجموعات المراجعة والخطط والمكتبة عند تفعيل ميزات الحساب.',
  'Privacy-first': 'الخصوصية أولاً',
  'Run AI models locally — your files never leave your device.': 'شغّل نماذج الذكاء الاصطناعي محليًا — ملفاتك لا تغادر جهازك.',
  'Already have an account?': 'هل لديك حساب بالفعل؟',
  'Sign in →': 'سجّل الدخول ←',
  'Free account': 'حساب مجاني',
  'Email signup': 'تسجيل بالبريد',
  'Create account': 'إنشاء حساب',
  'Get started in under a minute, then keep your study flow synced across Kivora.': 'ابدأ خلال أقل من دقيقة، ثم حافظ على مزامنة رحلتك الدراسية عبر Kivora.',
  'Database not connected.': 'قاعدة البيانات غير متصلة.',
  'Account creation requires a database. Add DATABASE_URL or SUPABASE_DATABASE_URL to your environment. You can still continue as Guest.': 'إنشاء الحساب يحتاج إلى قاعدة بيانات. أضف DATABASE_URL أو SUPABASE_DATABASE_URL إلى البيئة. ما زال بإمكانك المتابعة كضيف.',
  'continue as Guest': 'المتابعة كضيف',
  'Supabase setup is incomplete.': 'إعداد Supabase غير مكتمل.',
  'Registration can still create local accounts, but full Supabase Auth sync and storage backup need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.': 'يمكن للتسجيل إنشاء حسابات محلية، لكن مزامنة Supabase الكاملة والنسخ الاحتياطي للتخزين يحتاجان إلى NEXT_PUBLIC_SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY.',
  'Sync when you want it': 'زامن عندما تريد',
  'Save plans, library items, and account settings across sessions without rebuilding your setup.': 'احفظ الخطط وعناصر المكتبة وإعدادات الحساب بين الجلسات دون إعادة إعداد كل شيء.',
  'Stay local when needed': 'ابقَ محليًا عند الحاجة',
  'You can still use guest mode and local AI paths if you are not ready to depend on cloud features.': 'يمكنك الاستمرار باستخدام وضع الضيف والمسارات المحلية للذكاء الاصطناعي إذا لم تكن مستعدًا للاعتماد على الميزات السحابية.',
  'Redirecting…': 'جارٍ التحويل…',
  'Sign up with Google': 'سجّل باستخدام Google',
  'Sign up with Microsoft': 'سجّل باستخدام Microsoft',
  'Sign up with GitHub': 'سجّل باستخدام GitHub',
  'or create account with email': 'أو أنشئ حسابًا بالبريد الإلكتروني',
  'Name': 'الاسم',
  'Your name': 'اسمك',
  'This is what shows up across your account, public profile, and shared study items.': 'هذا هو الاسم الذي يظهر في حسابك وملفك العام وعناصر الدراسة المشتركة.',
  'Email': 'البريد الإلكتروني',
  'Use an address you’ll keep, so your progress and recovery options stay simple.': 'استخدم عنوانًا ستحتفظ به حتى تبقى استعادة الحساب وتقدمك الدراسي بسيطة.',
  'Password': 'كلمة المرور',
  'At least 8 characters': '8 أحرف على الأقل',
  'Hide password': 'إخفاء كلمة المرور',
  'Show password': 'إظهار كلمة المرور',
  'Use 8+ characters. A long unique password makes recovery and provider linking much easier later.': 'استخدم 8 أحرف أو أكثر. كلمة مرور طويلة ومميزة تسهّل الاسترداد وربط المزوّدات لاحقًا.',
  'Creating account…': 'جارٍ إنشاء الحساب…',
  'Continue as Guest — no account needed': 'المتابعة كضيف — لا حاجة إلى حساب',
  'Creating an account gives you the cleanest path for sync, profile settings, and shared study history. You can still stay local-first when needed.': 'إنشاء الحساب يمنحك أسهل طريق للمزامنة وإعدادات الملف الشخصي وسجل الدراسة المشترك. ويمكنك البقاء في الوضع المحلي عند الحاجة.',
};

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
  const { t } = useI18n(LOCAL_AR);
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
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
  const providerCount = [caps?.googleConfigured, caps?.microsoftConfigured, caps?.githubConfigured].filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (caps && caps.dbConfigured === false) {
      setError(t('Account creation requires a database. Configure DATABASE_URL or SUPABASE_DATABASE_URL in your environment first.'));
      return;
    }

    if (password.length < 8) {
      setError(t('Password must be at least 8 characters.'));
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
      setError(data.error ?? t('Registration failed. Please try again.'));
      return;
    }

    const signInResult = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);

    if (signInResult?.error) {
      setError(t('Account created! Automatic sign-in failed — please sign in from the login page.'));
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
          <p className={styles.eyebrow}>{t('Free forever for students')}</p>
          <h1 className={styles.panelTitle}>{t('Start studying smarter today')}</h1>
          <p className={styles.panelBody}>
            {t('Create your free account to sync study materials across devices, track your progress with detailed analytics, and build a personal library of AI-generated content.')}
          </p>
          <div className={styles.proofGrid}>
            <div className={styles.proofCard}>
              <strong>✓ {t('No credit card needed')}</strong>
              <p>{t('Free to sign up. Core features work offline without a paid plan.')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>☁ {t('Cloud sync')}</strong>
              <p>{t('Your review sets, plans, and library sync when account features are configured.')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>🔒 {t('Privacy-first')}</strong>
              <p>{t('Run AI models locally — your files never leave your device.')}</p>
            </div>
          </div>
          <div className={styles.panelFooter}>
            <span>{t('Already have an account?')}</span>
            <Link href="/login" style={{ color: '#9ebdff', textDecoration: 'none', fontWeight: 600 }}>
              {t('Sign in →')}
            </Link>
          </div>
        </div>

        {/* Right panel — form */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderTop}>
              <span className={`${styles.badge} ${styles.badgeReady}`}>{t('Free account')}</span>
              <span className={`${styles.badge} ${hasOAuth ? styles.badgeReady : styles.badgeNeutral}`}>
                {hasOAuth ? `${providerCount} quick start option${providerCount === 1 ? '' : 's'}` : t('Email signup')}
              </span>
            </div>
            <h1>{t('Create account')}</h1>
            <p>{t('Get started in under a minute, then keep your study flow synced across Kivora.')}</p>
          </div>

          <div className={styles.stack}>
            {/* No-DB warning */}
            {!dbReady && caps !== null && (
              <div className={styles.warning}>
                <strong>{t('Database not connected.')}</strong> {t('Account creation requires a database. Add DATABASE_URL or SUPABASE_DATABASE_URL to your environment. You can still continue as Guest.')} <Link href="/workspace" style={{ color: '#fbbf24', fontWeight: 600 }}>{t('continue as Guest')}</Link>.
              </div>
            )}
            {dbReady && caps !== null && !caps.supabaseAdminConfigured && (
              <div className={styles.notice}>
                <strong>{t('Supabase setup is incomplete.')}</strong> {t('Registration can still create local accounts, but full Supabase Auth sync and storage backup need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')}
              </div>
            )}

            <div className={styles.miniGrid}>
              <div className={styles.miniCard}>
                <strong>{t('Sync when you want it')}</strong>
                <p>{t('Save plans, library items, and account settings across sessions without rebuilding your setup.')}</p>
              </div>
              <div className={styles.miniCard}>
                <strong>{t('Stay local when needed')}</strong>
                <p>{t('You can still use guest mode and local AI paths if you are not ready to depend on cloud features.')}</p>
              </div>
            </div>

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
                    {oauthLoading === 'google' ? t('Redirecting…') : t('Sign up with Google')}
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
                    {oauthLoading === 'microsoft-entra-id' ? t('Redirecting…') : t('Sign up with Microsoft')}
                  </button>
                )}
                {caps?.githubConfigured && (
                  <button type="button" className={styles.oauthButton} disabled={!!oauthLoading}
                    onClick={() => handleOAuth('github')}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                    </svg>
                    {oauthLoading === 'github' ? t('Redirecting…') : t('Sign up with GitHub')}
                  </button>
                )}
              </div>
            )}

            {hasOAuth && <div className={styles.divider}>{t('or create account with email')}</div>}

            {/* Email registration form */}
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor="name">{t('Name')}</label>
                </div>
                <input id="name" type="text" placeholder={t('Your name')} value={name}
                  onChange={e => setName(e.target.value)} required autoComplete="name" />
                <p className={styles.helperText}>{t('This is what shows up across your account, public profile, and shared study items.')}</p>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor="email">{t('Email')}</label>
                </div>
                <input id="email" type="email" placeholder={t('you@example.com')} value={email}
                  onChange={e => setEmail(e.target.value)} required autoComplete="email" />
                <p className={styles.helperText}>{t('Use an address you’ll keep, so your progress and recovery options stay simple.')}</p>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor="password">{t('Password')}</label>
                </div>
                <div className={styles.passwordWrap}>
                  <input id="password" type={showPwd ? 'text' : 'password'} placeholder={t('At least 8 characters')} value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" style={{ paddingRight: 44 }} />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className={styles.visibilityButton}
                    aria-label={showPwd ? t('Hide password') : t('Show password')}
                  >
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
                <p className={styles.helperText}>{t('Use 8+ characters. A long unique password makes recovery and provider linking much easier later.')}</p>
              </div>
              {error && <p className={styles.errorBanner}>{error}</p>}
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? t('Creating account…') : t('Create account')}
              </button>
            </form>

            {/* Guest access */}
            {caps?.guestModeEnabled !== false && (
              <>
                <div className={styles.divider}>{t('or')}</div>
                <Link href="/workspace" className={styles.guestLink}>
                  {t('Continue as Guest — no account needed')}
                </Link>
              </>
            )}

            <div className={styles.cardFooterNote}>
              {t('Creating an account gives you the cleanest path for sync, profile settings, and shared study history. You can still stay local-first when needed.')}
            </div>

            <div className={styles.footerRow}>
              <span>{t('Already have an account?')}</span>
              <Link href="/login">{t('Sign in →')}</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
