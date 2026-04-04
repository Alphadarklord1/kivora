'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth.module.css';
import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';


const LOCAL_AR: Record<string, string> = {
  'Sign-in with email requires a database. Set up DATABASE_URL in your environment, or continue as Guest.': 'تسجيل الدخول بالبريد الإلكتروني يحتاج إلى قاعدة بيانات. أضف DATABASE_URL إلى البيئة أو تابع كضيف.',
  'Invalid email or password. Check your credentials or create an account.': 'البريد الإلكتروني أو كلمة المرور غير صحيحة. تحقق من بياناتك أو أنشئ حسابًا.',
  'Study smarter, not harder': 'ادرس بذكاء أكثر وبجهد أقل',
  'Your AI-powered study workspace': 'مساحة الدراسة الذكية المدعومة بالذكاء الاصطناعي',
  'Upload lecture slides, generate quizzes and summaries in seconds, study with smart flashcards, and solve maths step-by-step. Everything synced and offline-ready.': 'حمّل شرائح المحاضرات، وأنشئ الاختبارات والملخصات خلال ثوانٍ، وادرس ببطاقات ذكية، واحلّ الرياضيات خطوة بخطوة. كل شيء جاهز للمزامنة والعمل دون اتصال.',
  'Upload & Generate': 'حمّل وأنشئ',
  'PDF, Word, or PowerPoint → summaries, MCQs, flashcards, notes in one click.': 'ملفات PDF وWord وPowerPoint تتحول إلى ملخصات وأسئلة وبطاقات وملاحظات بضغطة واحدة.',
  'Smart Flashcards': 'بطاقات ذكية',
  'FSRS-4.5 spaced repetition schedules your reviews for maximum retention.': 'يقوم FSRS-4.5 بجدولة المراجعات بالتكرار المتباعد لتحقيق أفضل تثبيت للمعلومات.',
  'Math Solver': 'حلّال الرياضيات',
  'Step-by-step working, LaTeX output, graphs — from arithmetic to calculus.': 'حلول خطوة بخطوة ومخرجات LaTeX ورسوم بيانية من الحساب حتى التفاضل والتكامل.',
  'Account ready': 'الحساب جاهز',
  'Local-first mode': 'وضع محلي أولاً',
  'Email + guest available': 'البريد والضيف متاحان',
  'Sign in': 'تسجيل الدخول',
  'Welcome back — jump back into your study flow without losing your place.': 'مرحبًا بعودتك — ارجع إلى مسار دراستك دون أن تفقد مكانك.',
  'No database connected.': 'لا توجد قاعدة بيانات متصلة.',
  'Email sign-in requires a database. Configure DATABASE_URL or SUPABASE_DATABASE_URL to enable accounts. Use Guest access below in the meantime.': 'تسجيل الدخول بالبريد يحتاج إلى قاعدة بيانات. أضف DATABASE_URL أو SUPABASE_DATABASE_URL لتفعيل الحسابات. يمكنك استخدام وضع الضيف الآن.',
  'Supabase is only partially configured.': 'إعداد Supabase غير مكتمل.',
  'Email sign-in can still work with the database, but profile sync, Supabase Auth mirroring, and storage backup will stay limited until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are added.': 'يمكن أن يعمل تسجيل الدخول بالبريد مع قاعدة البيانات، لكن مزامنة الملف الشخصي ونسخ Supabase Auth والنسخ الاحتياطي للتخزين ستبقى محدودة حتى تتم إضافة NEXT_PUBLIC_SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY.',
  'Pick up saved work': 'تابع عملك المحفوظ',
  'Your library, plans, and settings stay together when you use an account.': 'تظل مكتبتك وخططك وإعداداتك معًا عندما تستخدم حسابًا.',
  'Still works locally': 'ما زال يعمل محليًا',
  'If cloud setup is incomplete, you can keep moving in guest mode and come back later.': 'إذا كان إعداد السحابة غير مكتمل، يمكنك المتابعة كضيف والعودة لاحقًا.',
  'Redirecting…': 'جارٍ التحويل…',
  'Continue with Google': 'المتابعة باستخدام Google',
  'Continue with Microsoft': 'المتابعة باستخدام Microsoft',
  'Continue with GitHub': 'المتابعة باستخدام GitHub',
  'or sign in with email': 'أو سجّل الدخول بالبريد الإلكتروني',
  'Email': 'البريد الإلكتروني',
  'Use the same address you used for your study account or provider sign-in.': 'استخدم نفس العنوان الذي تستعمله لحساب الدراسة أو تسجيل الدخول عبر المزوّد.',
  'Password': 'كلمة المرور',
  'Forgot password?': 'هل نسيت كلمة المرور؟',
  'Hide password': 'إخفاء كلمة المرور',
  'Show password': 'إظهار كلمة المرور',
  'Local-only accounts work too, so sign-in can keep working even when hosted sync is limited.': 'الحسابات المحلية تعمل أيضًا، لذلك يستمر تسجيل الدخول حتى لو كانت المزامنة السحابية محدودة.',
  'Signing in…': 'جارٍ تسجيل الدخول…',
  'Sign in with email': 'تسجيل الدخول بالبريد الإلكتروني',
  'or': 'أو',
  'Continue as Guest — no account needed': 'المتابعة كضيف — لا حاجة إلى حساب',
  'Signing in gives you cleaner sync across study tools. Guest mode stays available when you just want to move fast.': 'يوفر لك تسجيل الدخول مزامنة أفضل بين أدوات الدراسة. ويبقى وضع الضيف متاحًا عندما تريد الانطلاق بسرعة.',
  'No account?': 'ليس لديك حساب؟',
  'Create one free →': 'أنشئ حسابًا مجانًا ←',
};

interface AuthCapabilities {
  googleConfigured: boolean;
  githubConfigured: boolean;
  microsoftConfigured: boolean;
  guestModeEnabled: boolean;
  oauthDisabled?: boolean;
  dbConfigured?: boolean;
  authDisabled?: boolean;
  authDisabledReason?: string | null;
  supabaseAdminConfigured?: boolean;
  supabaseBrowserConfigured?: boolean;
  supabaseStorageConfigured?: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const { t } = useI18n(LOCAL_AR);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [caps, setCaps]         = useState<AuthCapabilities | null>(null);
  const [showPwd, setShowPwd]   = useState(false);

  useEffect(() => {
    fetch('/api/auth/capabilities')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setCaps(d))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (caps && caps.dbConfigured === false) {
      setError(t('Sign-in with email requires a database. Set up DATABASE_URL in your environment, or continue as Guest.'));
      return;
    }

    setLoading(true);
    const res = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(t('Invalid email or password. Check your credentials or create an account.'));
    } else {
      router.replace('/workspace');
    }
  }

  async function handleOAuth(provider: string) {
    setOauthLoading(provider);
    await signIn(provider, { callbackUrl: '/workspace' });
  }

  const hasOAuth = !caps?.oauthDisabled && (caps?.googleConfigured || caps?.microsoftConfigured || caps?.githubConfigured);
  const dbReady  = caps?.dbConfigured !== false; // assume true while loading
  const authDisabled = caps?.authDisabled;
  const providerCount = [caps?.googleConfigured, caps?.microsoftConfigured, caps?.githubConfigured].filter(Boolean).length;

  return (
    <div className={styles.shell} dir={settings.language === 'ar' ? 'rtl' : 'ltr'}>
      <div className={styles.grid}>
        {/* Left panel — branding */}
        <div className={styles.panel}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>K</span>
            <span className={styles.brandText}>Kivora</span>
          </Link>
          <p className={styles.eyebrow}>{t('Study smarter, not harder')}</p>
          <h1 className={styles.panelTitle}>{t('Your AI-powered study workspace')}</h1>
          <p className={styles.panelBody}>
            {t('Upload lecture slides, generate quizzes and summaries in seconds, study with smart flashcards, and solve maths step-by-step. Everything synced and offline-ready.')}
          </p>
          <div className={styles.proofGrid}>
            <div className={styles.proofCard}>
              <strong>📄 {t('Upload & Generate')}</strong>
              <p>{t('PDF, Word, or PowerPoint → summaries, MCQs, flashcards, notes in one click.')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>🃏 {t('Smart Flashcards')}</strong>
              <p>{t('FSRS-4.5 spaced repetition schedules your reviews for maximum retention.')}</p>
            </div>
            <div className={styles.proofCard}>
              <strong>🧮 {t('Math Solver')}</strong>
              <p>{t('Step-by-step working, LaTeX output, graphs — from arithmetic to calculus.')}</p>
            </div>
          </div>
        </div>

        {/* Right panel — form */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderTop}>
              <span className={`${styles.badge} ${dbReady ? styles.badgeReady : styles.badgeSetup}`}>{dbReady ? t('Account ready') : t('Local-first mode')}</span>
              <span className={`${styles.badge} ${hasOAuth ? styles.badgeReady : styles.badgeNeutral}`}>
                {hasOAuth ? `${providerCount} quick sign-in option${providerCount === 1 ? '' : 's'}` : t('Email + guest available')}
              </span>
            </div>
            <h1>{t('Sign in')}</h1>
            <p>{t('Welcome back — jump back into your study flow without losing your place.')}</p>
          </div>

          <div className={styles.stack}>
            {/* Status notices */}
            {authDisabled && caps?.authDisabledReason && (
              <div className={styles.warning}>{caps.authDisabledReason}</div>
            )}
            {!authDisabled && !dbReady && (
              <div className={styles.notice}>
                <strong>{t('No database connected.')}</strong> {t('Email sign-in requires a database. Configure DATABASE_URL or SUPABASE_DATABASE_URL to enable accounts. Use Guest access below in the meantime.')}
              </div>
            )}
            {!authDisabled && dbReady && caps && !caps.supabaseAdminConfigured && (
              <div className={styles.notice}>
                <strong>{t('Supabase is only partially configured.')}</strong> {t('Email sign-in can still work with the database, but profile sync, Supabase Auth mirroring, and storage backup will stay limited until NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are added.')}
              </div>
            )}

            <div className={styles.miniGrid}>
              <div className={styles.miniCard}>
                <strong>{t('Pick up saved work')}</strong>
                <p>{t('Your library, plans, and settings stay together when you use an account.')}</p>
              </div>
              <div className={styles.miniCard}>
                <strong>{t('Still works locally')}</strong>
                <p>{t('If cloud setup is incomplete, you can keep moving in guest mode and come back later.')}</p>
              </div>
            </div>

            {/* OAuth providers */}
            {hasOAuth && (
              <div className={styles.oauthButtons}>
                {caps?.googleConfigured && (
                  <button
                    type="button"
                    className={styles.oauthButton}
                    disabled={!!oauthLoading}
                    onClick={() => handleOAuth('google')}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </svg>
                    {oauthLoading === 'google' ? t('Redirecting…') : t('Continue with Google')}
                  </button>
                )}
                {caps?.microsoftConfigured && (
                  <button
                    type="button"
                    className={styles.oauthButton}
                    disabled={!!oauthLoading}
                    onClick={() => handleOAuth('microsoft-entra-id')}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                      <rect x="1" y="1" width="7" height="7" fill="#F25022"/>
                      <rect x="10" y="1" width="7" height="7" fill="#7FBA00"/>
                      <rect x="1" y="10" width="7" height="7" fill="#00A4EF"/>
                      <rect x="10" y="10" width="7" height="7" fill="#FFB900"/>
                    </svg>
                    {oauthLoading === 'microsoft-entra-id' ? t('Redirecting…') : t('Continue with Microsoft')}
                  </button>
                )}
                {caps?.githubConfigured && (
                  <button
                    type="button"
                    className={styles.oauthButton}
                    disabled={!!oauthLoading}
                    onClick={() => handleOAuth('github')}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                    </svg>
                    {oauthLoading === 'github' ? t('Redirecting…') : t('Continue with GitHub')}
                  </button>
                )}
              </div>
            )}

            {hasOAuth && <div className={styles.divider}>{t('or sign in with email')}</div>}

            {/* Email / password form */}
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor="email">{t('Email')}</label>
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder={t('you@example.com')}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <p className={styles.helperText}>{t('Use the same address you used for your study account or provider sign-in.')}</p>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor="password">{t('Password')}</label>
                  <Link href="/forgot-password" className={styles.inlineLink}>
                    {t('Forgot password?')}
                  </Link>
                </div>
                <div className={styles.passwordWrap}>
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ paddingRight: 44 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className={styles.visibilityButton}
                    aria-label={showPwd ? t('Hide password') : t('Show password')}
                  >
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
                <p className={styles.helperText}>{t('Local-only accounts work too, so sign-in can keep working even when hosted sync is limited.')}</p>
              </div>
              {error && <p className={styles.errorBanner}>{error}</p>}
              <button
                type="submit"
                className={styles.submitButton}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? t('Signing in…') : t('Sign in with email')}
              </button>
            </form>

            {!hasOAuth && <div className={styles.divider}>{t('or')}</div>}

            {/* Guest access */}
            {caps?.guestModeEnabled !== false && (
              <Link href="/workspace" className={styles.guestLink}>
                {t('Continue as Guest — no account needed')}
              </Link>
            )}

            <div className={styles.cardFooterNote}>
              {t('Signing in gives you cleaner sync across study tools. Guest mode stays available when you just want to move fast.')}
            </div>

            <div className={styles.footerRow}>
              <span>{t('No account?')}</span>
              <Link href="/register">{t('Create one free →')}</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
