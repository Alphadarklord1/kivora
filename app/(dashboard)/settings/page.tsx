'use client';

import { useState, useEffect } from 'react';
import { signIn, signOut, getProviders } from 'next-auth/react';
import { useVault } from '@/providers/VaultProvider';
import { loadAiPreferences, saveAiPreferences, type AiPreferences } from '@/lib/ai/client';
import { getSupportedAiTasks } from '@/lib/ai/policy';
import { isElectronRenderer } from '@/lib/runtime/mode';
import { useI18n } from '@/lib/i18n/useI18n';
import { ENCRYPTION_DISABLED } from '@/lib/crypto/vault';

type SettingsTab = 'profile' | 'appearance' | 'security' | 'account' | 'ai';

interface UserAccount {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
  isGuest?: boolean;
  connectedAccounts: string[];
  stats: {
    folders: number;
    files: number;
    libraryItems: number;
  };
}

interface UserSettings {
  theme: 'light' | 'blue' | 'black' | 'system';
  fontSize: string;
  lineHeight: string;
  density: string;
  language: 'en' | 'ar';
}

interface DesktopModelOption {
  key: string;
  modelId: string;
  modelFile: string;
  quantization: string;
  recommendedFor: 'laptop' | 'laptop-pc' | 'pc';
  minRamGb: number;
  sizeBytes: number;
  sha256: string;
  url?: string;
  bundled: boolean;
  isInstalled: boolean;
  installedSource: 'bundled' | 'userData' | 'none';
  isDownloading?: boolean;
  downloadProgress?: {
    modelKey: string;
    state: 'idle' | 'downloading' | 'completed' | 'error';
    downloadedBytes: number;
    totalBytes: number;
    percent: number;
    speedBps: number;
    errorCode?: string;
    message?: string;
  } | null;
  modelPath?: string;
}

interface DesktopModelInfo {
  modelId: string;
  modelFile: string;
  quantization: string;
  bundled: boolean;
  activeModelKey: string | null;
  selectedModelKey: string;
  recommendedModelKey: string;
  deviceProfile: 'laptop' | 'laptop-pc' | 'pc';
  setupCompleted: boolean;
  wizardEnabled: boolean;
  manifestVersion: string | null;
  models: DesktopModelOption[];
}

interface DesktopSelection {
  selectedModelKey: string;
  activeModelKey: string | null;
  setupCompleted: boolean;
  wizardEnabled: boolean;
  recommendedModelKey: string;
  deviceProfile: 'laptop' | 'laptop-pc' | 'pc';
}

interface WebAiCapabilities {
  webAiEnabled: boolean;
  openaiConfigured: boolean;
  defaultModel: string;
  desktopOnlyMode: boolean;
}

interface AuthCapabilities {
  googleConfigured: boolean;
  githubConfigured: boolean;
  guestModeEnabled: boolean;
  desktopAuthPort: number | null;
  oauthDisabled: boolean;
  oauthDisabledReason: string | null;
}

interface ApiErrorLike {
  error?: string;
  reason?: string;
}

const defaultUserSettings: UserSettings = {
  theme: 'light',
  fontSize: '1',
  lineHeight: '1.5',
  density: 'normal',
  language: 'en',
};

function normalizeLanguage(value: unknown): 'en' | 'ar' {
  return value === 'ar' ? 'ar' : 'en';
}

function normalizeTheme(value: unknown): UserSettings['theme'] {
  if (value === 'dark') return 'blue';
  if (value === 'light' || value === 'blue' || value === 'black' || value === 'system') return value;
  return defaultUserSettings.theme;
}

function normalizeUserSettings(raw: Partial<UserSettings> | null | undefined): UserSettings {
  const storedLanguage = typeof window !== 'undefined'
    ? localStorage.getItem('studypilot_language')
    : null;

  return {
    theme: normalizeTheme(raw?.theme),
    fontSize: typeof raw?.fontSize === 'string' ? raw.fontSize : defaultUserSettings.fontSize,
    lineHeight: typeof raw?.lineHeight === 'string' ? raw.lineHeight : defaultUserSettings.lineHeight,
    density: typeof raw?.density === 'string' ? raw.density : defaultUserSettings.density,
    language: normalizeLanguage(raw?.language ?? storedLanguage ?? defaultUserSettings.language),
  };
}

function formatModelSize(bytes: number, isArabic: boolean) {
  if (!bytes || bytes <= 0) {
    return isArabic ? 'الحجم غير متوفر' : 'Size unavailable';
  }
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

function mapInstallStatusMessage(status: string, isArabic: boolean) {
  const map: Record<string, { en: string; ar: string }> = {
    network_error: {
      en: 'Could not download model from release assets. Mini remains available offline.',
      ar: 'تعذر تنزيل النموذج من ملفات الإصدار. نموذج Mini يبقى متاحًا بدون إنترنت.',
    },
    checksum_error: {
      en: 'Model integrity check failed. Mini remains available offline.',
      ar: 'فشل التحقق من سلامة النموذج. نموذج Mini يبقى متاحًا بدون إنترنت.',
    },
    disk_error: {
      en: 'Could not save model to disk. Mini remains available offline.',
      ar: 'تعذر حفظ النموذج على القرص. نموذج Mini يبقى متاحًا بدون إنترنت.',
    },
    invalid_request: {
      en: 'Invalid model request.',
      ar: 'طلب نموذج غير صالح.',
    },
  };
  return isArabic ? (map[status]?.ar || 'تعذر تثبيت النموذج.') : (map[status]?.en || 'Failed to install model.');
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Delete confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Vault encryption
  const vault = useVault();
  const [vaultCurrentPassword, setVaultCurrentPassword] = useState('');
  const [vaultNewPassword, setVaultNewPassword] = useState('');
  const [vaultConfirmPassword, setVaultConfirmPassword] = useState('');
  const [showResetVaultModal, setShowResetVaultModal] = useState(false);

  // OAuth linking
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);
  const [authCapabilities, setAuthCapabilities] = useState<AuthCapabilities | null>(null);
  const [loadingAuthCapabilities, setLoadingAuthCapabilities] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [ttsRate, setTtsRate] = useState<number>(1);
  const [ttsPitch, setTtsPitch] = useState<number>(1);
  const [aiPrefs, setAiPrefs] = useState<AiPreferences>(loadAiPreferences());
  const [desktopAiHealth, setDesktopAiHealth] = useState<{ ok: boolean; status: string; details?: string } | null>(null);
  const [desktopAiModelInfo, setDesktopAiModelInfo] = useState<DesktopModelInfo | null>(null);
  const [desktopAiSelection, setDesktopAiSelection] = useState<DesktopSelection | null>(null);
  const [checkingAiRuntime, setCheckingAiRuntime] = useState(false);
  const [switchingDesktopModel, setSwitchingDesktopModel] = useState(false);
  const [installingModelKey, setInstallingModelKey] = useState<string | null>(null);
  const [removingModelKey, setRemovingModelKey] = useState<string | null>(null);
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [webAiCapabilities, setWebAiCapabilities] = useState<WebAiCapabilities | null>(null);
  const [loadingWebAiCapabilities, setLoadingWebAiCapabilities] = useState(false);

  const currentLanguage = settings?.language ?? 'en';
  const isArabic = currentLanguage === 'ar';
  const { t, formatDate } = useI18n({
    'Settings': 'الإعدادات',
    'Manage your account and preferences': 'إدارة حسابك وتفضيلاتك',
    'Loading settings...': 'جارٍ تحميل الإعدادات...',
    'Profile': 'الملف الشخصي',
    'Appearance': 'المظهر',
    'Security': 'الأمان',
    'Account': 'الحساب',
    'Profile updated successfully': 'تم تحديث الملف الشخصي بنجاح',
    'Failed to update profile': 'تعذر تحديث الملف الشخصي',
    'Settings saved': 'تم حفظ الإعدادات',
    'Failed to save settings': 'تعذر حفظ الإعدادات',
    'AI preferences saved': 'تم حفظ تفضيلات الذكاء الاصطناعي',
    'Passwords do not match': 'كلمات المرور غير متطابقة',
    'Password must be at least 6 characters': 'يجب أن تكون كلمة المرور 6 أحرف على الأقل',
    'Password changed successfully': 'تم تغيير كلمة المرور بنجاح',
    'Failed to change password': 'تعذر تغيير كلمة المرور',
    'Encryption passwords do not match': 'كلمات مرور التشفير غير متطابقة',
    'Encryption password must be at least 8 characters': 'يجب أن تكون كلمة مرور التشفير 8 أحرف على الأقل',
    'Encryption password changed successfully': 'تم تغيير كلمة مرور التشفير بنجاح',
    'Failed to change encryption password': 'تعذر تغيير كلمة مرور التشفير',
    'Current encryption password is incorrect': 'كلمة مرور التشفير الحالية غير صحيحة',
    'Encryption has been reset. Your encrypted data is now inaccessible.': 'تمت إعادة تعيين التشفير. بياناتك المشفرة غير قابلة للوصول الآن.',
    'Delete Account': 'حذف الحساب',
    'Cancel': 'إلغاء',
    'Deleting...': 'جارٍ الحذف...',
    'Save Changes': 'حفظ التغييرات',
    'Saving...': 'جارٍ الحفظ...',
    'Name': 'الاسم',
    'Email': 'البريد الإلكتروني',
    'Your name': 'اسمك',
    'Profile Information': 'معلومات الملف الشخصي',
    'Update your personal information': 'تحديث معلوماتك الشخصية',
    'Your Stats': 'إحصاءاتك',
    'Folders': 'المجلدات',
    'Files': 'الملفات',
    'Library Items': 'عناصر المكتبة',
    'Theme': 'السمة',
    'Light': 'فاتح',
    'Blue Mode': 'الوضع الأزرق',
    'Black Mode': 'الوضع الأسود',
    'System': 'النظام',
    'Language': 'اللغة',
    'Choose interface direction and reading flow': 'اختر اتجاه الواجهة وتدفق القراءة',
    'Font Size': 'حجم الخط',
    'Adjust the text size across the app': 'اضبط حجم النص في التطبيق',
    'Small': 'صغير',
    'Normal': 'عادي',
    'Large': 'كبير',
    'Extra Large': 'كبير جدًا',
    'UI Density': 'كثافة الواجهة',
    'Control spacing between elements': 'تحكم في المسافات بين العناصر',
    'Compact': 'مضغوط',
    'Tighter spacing': 'مسافات ضيقة',
    'Balanced spacing': 'مسافات متوازنة',
    'Comfortable': 'مريح',
    'More breathing room': 'مساحة إضافية',
    'Line Height': 'تباعد الأسطر',
    'Increase or decrease reading comfort': 'زيادة أو تقليل راحة القراءة',
    'Tight': 'ضيق',
    'Relaxed': 'مريح',
    'Extra': 'إضافي',
    'Audio Voice': 'صوت القراءة',
    'Choose a clearer voice for Listen': 'اختر صوتًا أوضح لميزة الاستماع',
    'System Default': 'افتراضي النظام',
    'Rate': 'السرعة',
    'Pitch': 'النبرة',
    'Preview': 'معاينة',
    'Sample Folder': 'مجلد نموذجي',
    'Added today': 'أضيف اليوم',
    'Generated content': 'محتوى مولّد',
    'Manage your password, encryption, and security settings': 'إدارة كلمة المرور والتشفير وإعدادات الأمان',
    'End-to-End Encryption': 'تشفير من طرف إلى طرف',
    'Not Set Up': 'غير مفعّل',
    'Active & Unlocked': 'نشط ومفتوح',
    'Locked': 'مقفل',
    'Lock Now': 'اقفل الآن',
    'Change Encryption Password': 'تغيير كلمة مرور التشفير',
    'Current Encryption Password': 'كلمة مرور التشفير الحالية',
    'Enter current encryption password': 'أدخل كلمة مرور التشفير الحالية',
    'New Encryption Password': 'كلمة مرور تشفير جديدة',
    'At least 8 characters': '8 أحرف على الأقل',
    'Confirm New Encryption Password': 'تأكيد كلمة مرور التشفير الجديدة',
    'Confirm new encryption password': 'أكد كلمة مرور التشفير الجديدة',
    'Changing...': 'جارٍ التغيير...',
    'Reset Encryption': 'إعادة تعيين التشفير',
    'Reset Encryption Modal Title': 'إعادة تعيين التشفير',
    'Reset Encryption Modal Body': 'هذا الإجراء لا يمكن التراجع عنه. ستصبح كل بياناتك المشفرة غير قابلة للوصول بشكل دائم.',
    'Reset Encryption Modal Confirm': 'هل أنت متأكد أنك تريد المتابعة؟',
    'Yes, Reset Encryption': 'نعم، أعد تعيين التشفير',
    'Change Login Password': 'تغيير كلمة مرور تسجيل الدخول',
    'Set Login Password': 'تعيين كلمة مرور تسجيل الدخول',
    'Current Login Password': 'كلمة مرور تسجيل الدخول الحالية',
    'Enter current password': 'أدخل كلمة المرور الحالية',
    'New Login Password': 'كلمة مرور تسجيل دخول جديدة',
    'At least 6 characters': '6 أحرف على الأقل',
    'Confirm New Login Password': 'تأكيد كلمة مرور تسجيل الدخول الجديدة',
    'Confirm new password': 'أكد كلمة المرور الجديدة',
    'Account Info': 'معلومات الحساب',
    'Member since': 'عضو منذ',
    'Danger Zone': 'منطقة الخطر',
    'Delete account warning': 'عند حذف الحساب لا يمكن التراجع. يرجى التأكد.',
    'Type DELETE MY ACCOUNT to confirm:': 'اكتب DELETE MY ACCOUNT للتأكيد:',
    'Encryption is temporarily disabled for all users.': 'تم تعطيل التشفير مؤقتًا لجميع المستخدمين.',
  });
  const supportedTasks = getSupportedAiTasks(currentLanguage);

  useEffect(() => {
    fetchData();
    getProviders().then(setProviders).catch(() => setProviders(null));

    // Check URL params for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const linkedProvider = params.get('linked');
    const tabParam = params.get('tab');

    if (tabParam && ['profile', 'appearance', 'security', 'account', 'ai'].includes(tabParam)) {
      setTab(tabParam as SettingsTab);
    }

    if (linkedProvider) {
      const providerName = linkedProvider.charAt(0).toUpperCase() + linkedProvider.slice(1);
      setMessage({ type: 'success', text: isArabic ? `تم ربط حساب ${providerName} بنجاح` : `${providerName} account connected successfully!` });
      setTimeout(() => setMessage(null), 3000);
      // Clean up URL
      window.history.replaceState({}, '', '/settings?tab=account');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAuthCapabilities = async () => {
    setLoadingAuthCapabilities(true);
    try {
      const res = await fetch('/api/auth/capabilities', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAuthCapabilities(data);
      } else {
        setAuthCapabilities(null);
      }
    } catch {
      setAuthCapabilities(null);
    } finally {
      setLoadingAuthCapabilities(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const electronRuntime = isElectronRenderer();
    setIsElectronApp(electronRuntime);

    if (!electronRuntime) {
      const storedProvider = localStorage.getItem('studypilot_ai_provider');
      if (!storedProvider || storedProvider === 'desktop-local') {
        setAiPrefs(prev => ({
          ...prev,
          provider: 'openai',
          enableCloudFallback: false,
        }));
      } else {
        setAiPrefs(prev => ({
          ...prev,
          enableCloudFallback: false,
        }));
      }
    }

    const syncVoices = () => {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
      const storedVoice = localStorage.getItem('studypilot_tts_voice') || '';
      const storedRate = Number(localStorage.getItem('studypilot_tts_rate') || 1);
      const storedPitch = Number(localStorage.getItem('studypilot_tts_pitch') || 1);
      setTtsVoice(storedVoice);
      setTtsRate(storedRate);
      setTtsPitch(storedPitch);
    };
    syncVoices();
    window.speechSynthesis.onvoiceschanged = syncVoices;
  }, []);

  const refreshWebAiCapabilities = async () => {
    if (typeof window === 'undefined' || isElectronRenderer()) return;
    setLoadingWebAiCapabilities(true);
    try {
      const res = await fetch('/api/ai/capabilities', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setWebAiCapabilities(data);
      }
    } catch {
      setWebAiCapabilities(null);
    } finally {
      setLoadingWebAiCapabilities(false);
    }
  };

  const refreshDesktopAiStatus = async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.desktopAI) {
      setDesktopAiHealth(null);
      setDesktopAiModelInfo(null);
      setDesktopAiSelection(null);
      return;
    }

    setCheckingAiRuntime(true);
    try {
      const [health, modelInfo, selection, downloadStatus] = await Promise.all([
        window.electronAPI.desktopAI.health(),
        window.electronAPI.desktopAI.modelInfo(),
        window.electronAPI.desktopAI.getSelection(),
        window.electronAPI.desktopAI.downloadStatus(),
      ]);

      const progressMap = new Map(
        (downloadStatus.items || []).map((item) => [item.modelKey, item])
      );
      const mergedModels = modelInfo.models.map((model) => ({
        ...model,
        downloadProgress: progressMap.get(model.key) || model.downloadProgress || null,
        isDownloading: progressMap.get(model.key)?.state === 'downloading' || Boolean(model.isDownloading),
      }));

      setDesktopAiHealth({
        ok: health.ok,
        status: health.status,
        details: health.details,
      });
      setDesktopAiSelection(selection);
      setDesktopAiModelInfo({
        ...modelInfo,
        models: mergedModels,
      });
    } catch (error) {
      setDesktopAiHealth({
        ok: false,
        status: 'error',
        details: error instanceof Error ? error.message : (isArabic ? 'تعذر التحقق من Runtime المحلي' : 'Failed to check desktop AI runtime'),
      });
    } finally {
      setCheckingAiRuntime(false);
    }
  };

  useEffect(() => {
    if (tab !== 'ai') return;
    if (isElectronRenderer()) {
      void refreshDesktopAiStatus();
    } else {
      void refreshWebAiCapabilities();
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== 'account') return;
    void refreshAuthCapabilities();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'ai' || !window.electronAPI?.desktopAI || !isElectronRenderer()) return;
    const unsubscribe = window.electronAPI.desktopAI.onDownloadProgress(() => {
      void refreshDesktopAiStatus();
    });
    return () => unsubscribe();
  }, [tab]);

  const handleSelectDesktopModel = async (modelKey: string) => {
    if (!window.electronAPI?.desktopAI) return;
    setSwitchingDesktopModel(true);
    try {
      const result = await window.electronAPI.desktopAI.setModel(modelKey);
      if (!result.ok) {
        showMessage('error', result.message || (isArabic ? 'تعذر تبديل النموذج' : 'Failed to switch model'));
      } else {
        showMessage('success', isArabic ? 'تم تبديل النموذج المحلي' : 'Desktop model switched');
      }
      await refreshDesktopAiStatus();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : (isArabic ? 'تعذر تبديل النموذج' : 'Failed to switch model'));
    } finally {
      setSwitchingDesktopModel(false);
    }
  };

  const handleInstallDesktopModel = async (modelKey: string) => {
    if (!window.electronAPI?.desktopAI) return;
    setInstallingModelKey(modelKey);
    try {
      const result = await window.electronAPI.desktopAI.installModel(modelKey);
      if (!result.ok && result.status !== 'already_installed') {
        showMessage('error', result.message || mapInstallStatusMessage(result.status, isArabic));
      } else {
        showMessage('success', isArabic ? 'تم تثبيت النموذج' : 'Model installed');
      }
      await refreshDesktopAiStatus();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : (isArabic ? 'تعذر تثبيت النموذج' : 'Failed to install model'));
    } finally {
      setInstallingModelKey(null);
    }
  };

  const handleRemoveDesktopModel = async (modelKey: string) => {
    if (!window.electronAPI?.desktopAI) return;
    setRemovingModelKey(modelKey);
    try {
      const result = await window.electronAPI.desktopAI.removeModel(modelKey);
      if (!result.ok) {
        showMessage('error', result.message || (isArabic ? 'تعذر حذف النموذج' : 'Failed to remove model'));
      } else {
        showMessage('success', isArabic ? 'تم حذف النموذج' : 'Model removed');
      }
      await refreshDesktopAiStatus();
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : (isArabic ? 'تعذر حذف النموذج' : 'Failed to remove model'));
    } finally {
      setRemovingModelKey(null);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [accountRes, settingsRes] = await Promise.all([
        fetch('/api/account', { credentials: 'include' }),
        fetch('/api/settings', { credentials: 'include' }),
      ]);

      if (accountRes.ok) {
        const accountData = await accountRes.json();
        setAccount(accountData);
        setName(accountData.name || '');
        setEmail(accountData.email || '');
      }

      if (settingsRes.ok) {
        const settingsData = normalizeUserSettings(await settingsRes.json());
        setSettings(settingsData);
        applySettings(settingsData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applySettings = (s: UserSettings) => {
    const resolveTheme = (theme: UserSettings['theme']) => {
      if (theme === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'blue' : 'light';
      }
      return theme;
    };

    // Apply theme (resolve system to actual theme)
    const resolvedTheme = resolveTheme(s.theme);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    localStorage.setItem('studypilot_theme', s.theme);

    // Apply font size
    document.documentElement.style.setProperty('--font-scale', s.fontSize);
    localStorage.setItem('studypilot_fontSize', s.fontSize);

    // Apply line height scale
    document.documentElement.style.setProperty('--line-scale', s.lineHeight);
    localStorage.setItem('studypilot_lineHeight', s.lineHeight);

    // Apply density
    document.documentElement.setAttribute('data-density', s.density);
    localStorage.setItem('studypilot_density', s.density);

    // Apply language and direction
    document.documentElement.setAttribute('lang', s.language);
    document.documentElement.setAttribute('dir', s.language === 'ar' ? 'rtl' : 'ltr');
    localStorage.setItem('studypilot_language', s.language);
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email }),
      });

      if (res.ok) {
        const data = await res.json();
        setAccount(prev => prev ? { ...prev, ...data } : null);
        showMessage('success', t('Profile updated successfully'));
      } else {
        const error = (await res.json()) as ApiErrorLike;
        showMessage('error', error.reason || error.error || t('Failed to update profile'));
      }
    } catch {
      showMessage('error', t('Failed to update profile'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (newSettings: Partial<UserSettings>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newSettings),
      });

      if (res.ok) {
        const data = await res.json();
        const merged = normalizeUserSettings({ ...(settings || defaultUserSettings), ...data, ...newSettings });
        setSettings(merged);
        applySettings(merged);
        showMessage('success', t('Settings saved'));
      } else {
        showMessage('error', t('Failed to save settings'));
      }
    } catch {
      showMessage('error', t('Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAi = () => {
    const normalizedPrefs: AiPreferences = !isElectronApp && aiPrefs.provider === 'desktop-local'
      ? { ...aiPrefs, provider: 'openai', enableCloudFallback: false }
      : aiPrefs;

    saveAiPreferences(normalizedPrefs);
    setAiPrefs(normalizedPrefs);
    showMessage('success', t('AI preferences saved'));
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showMessage('error', t('Passwords do not match'));
      return;
    }

    if (newPassword.length < 6) {
      showMessage('error', t('Password must be at least 6 characters'));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        showMessage('success', t('Password changed successfully'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const error = (await res.json()) as ApiErrorLike;
        showMessage('error', error.reason || error.error || t('Failed to change password'));
      }
    } catch {
      showMessage('error', t('Failed to change password'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangeVaultPassword = async () => {
    if (vaultNewPassword !== vaultConfirmPassword) {
      showMessage('error', t('Encryption passwords do not match'));
      return;
    }

    if (vaultNewPassword.length < 8) {
      showMessage('error', t('Encryption password must be at least 8 characters'));
      return;
    }

    setSaving(true);
    try {
      const success = await vault.changePassword(vaultCurrentPassword, vaultNewPassword);
      if (success) {
        showMessage('success', t('Encryption password changed successfully'));
        setVaultCurrentPassword('');
        setVaultNewPassword('');
        setVaultConfirmPassword('');
      } else {
        showMessage('error', t('Failed to change encryption password'));
      }
    } catch {
      showMessage('error', t('Current encryption password is incorrect'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetVault = () => {
    vault.destroyVault();
    setShowResetVaultModal(false);
    showMessage('success', t('Encryption has been reset. Your encrypted data is now inaccessible.'));
  };

  const handleLinkAccount = async (provider: 'google' | 'github') => {
    setLinkingProvider(provider);
    try {
      if (authCapabilities?.oauthDisabled) {
        showMessage(
          'error',
          authCapabilities.oauthDisabledReason || (isArabic ? 'OAuth معطل حاليًا على سطح المكتب.' : 'OAuth is currently disabled in desktop mode.')
        );
        setLinkingProvider(null);
        return;
      }
      if (!providers?.[provider]) {
        if (provider === 'google') {
          showMessage('error', isArabic ? 'تسجيل الدخول عبر Google غير مضبوط من قبل المسؤول.' : 'Google login is not configured by admin.');
        } else {
          showMessage('error', isArabic ? 'تسجيل الدخول عبر GitHub غير مضبوط من قبل المسؤول.' : 'GitHub login is not configured by admin.');
        }
        setLinkingProvider(null);
        return;
      }
      // Redirect to OAuth provider - when they come back, the account will be linked
      await signIn(provider, { callbackUrl: '/settings?tab=account&linked=' + provider });
    } catch {
      showMessage('error', isArabic ? `تعذر ربط ${provider}` : `Failed to connect ${provider}`);
      setLinkingProvider(null);
    }
  };

  const handleUnlinkAccount = async (provider: string) => {
    setUnlinkingProvider(provider);
    try {
      const res = await fetch(`/api/account/link?provider=${provider}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        showMessage('success', isArabic ? `تم فصل حساب ${providerName}` : `${providerName} account disconnected`);
        // Refresh account data
        fetchData();
      } else {
        const error = (await res.json()) as ApiErrorLike;
        showMessage('error', error.reason || error.error || (isArabic ? `تعذر فصل ${provider}` : `Failed to disconnect ${provider}`));
      }
    } catch {
      showMessage('error', isArabic ? `تعذر فصل ${provider}` : `Failed to disconnect ${provider}`);
    } finally {
      setUnlinkingProvider(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      showMessage('error', isArabic ? 'يرجى كتابة "DELETE MY ACCOUNT" للتأكيد' : 'Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmation: deleteConfirmation }),
      });

      if (res.ok) {
        await signOut({ callbackUrl: '/login' });
      } else {
        const error = (await res.json()) as ApiErrorLike;
        showMessage('error', error.reason || error.error || (isArabic ? 'تعذر حذف الحساب' : 'Failed to delete account'));
      }
    } catch {
      showMessage('error', isArabic ? 'تعذر حذف الحساب' : 'Failed to delete account');
    } finally {
      setSaving(false);
      setShowDeleteModal(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'profile', label: t('Profile'), icon: '👤' },
    { id: 'appearance', label: t('Appearance'), icon: '🎨' },
    { id: 'security', label: t('Security'), icon: '🔒' },
    { id: 'account', label: t('Account'), icon: '⚙️' },
    { id: 'ai', label: 'AI', icon: '🤖' },
  ];

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">{t('Loading settings...')}</div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        {/* Header */}
        <div className="settings-header">
          <h1>{t('Settings')}</h1>
          <p>{t('Manage your account and preferences')}</p>
        </div>

        {/* Message */}
        {message && (
          <div className={`settings-message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="settings-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`settings-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {/* Profile Tab */}
          {tab === 'profile' && (
            <div className="settings-section">
              <h2>{t('Profile Information')}</h2>
              <p className="section-description">{t('Update your personal information')}</p>
              {account?.isGuest && (
                <p className="section-description">
                  {isArabic ? 'تعديل الملف الشخصي معطل أثناء جلسة الضيف.' : 'Profile editing is disabled during a guest session.'}
                </p>
              )}

              <div className="form-group">
                <label htmlFor="name">{t('Name')}</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('Your name')}
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">{t('Email')}</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                />
              </div>

              <button
                className="btn"
                onClick={handleSaveProfile}
                disabled={saving || Boolean(account?.isGuest)}
              >
                {saving ? t('Saving...') : t('Save Changes')}
              </button>

              {/* Stats */}
              {account?.stats && (
                <div className="profile-stats">
                  <h3>{t('Your Stats')}</h3>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="stat-value">{account.stats.folders}</span>
                      <span className="stat-label">{t('Folders')}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{account.stats.files}</span>
                      <span className="stat-label">{t('Files')}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-value">{account.stats.libraryItems}</span>
                      <span className="stat-label">{t('Library Items')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Appearance Tab */}
          {tab === 'appearance' && settings && (
            <div className="settings-section">
              <h2>{t('Appearance')}</h2>
              <p className="section-description">{isArabic ? 'خصص شكل StudyPilot بالطريقة التي تناسبك' : 'Customize how StudyPilot looks'}</p>

              {/* Theme */}
              <div className="form-group">
                <label>{t('Theme')}</label>
                <div className="option-buttons">
                  {[
                    { value: 'light', label: t('Light'), icon: '☀️' },
                    { value: 'blue', label: t('Blue Mode'), icon: '🌊' },
                    { value: 'black', label: t('Black Mode'), icon: '🌑' },
                    { value: 'system', label: t('System'), icon: '💻' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn ${settings.theme === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ theme: option.value as UserSettings['theme'] })}
                      disabled={saving}
                    >
                      <span>{option.icon}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="form-group">
                <label>{t('Language')}</label>
                <p className="option-description">{t('Choose interface direction and reading flow')}</p>
                <div className="option-buttons">
                  {[
                    { value: 'en', label: 'English', preview: 'EN' },
                    { value: 'ar', label: 'العربية', preview: 'AR' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn ${settings.language === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ language: option.value as UserSettings['language'] })}
                      disabled={saving}
                    >
                      <span>{option.preview}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="form-group">
                <label>{t('Font Size')}</label>
                <p className="option-description">{t('Adjust the text size across the app')}</p>
                <div className="option-buttons">
                  {[
                    { value: '0.875', label: t('Small'), preview: 'Aa' },
                    { value: '1', label: t('Normal'), preview: 'Aa' },
                    { value: '1.125', label: t('Large'), preview: 'Aa' },
                    { value: '1.25', label: t('Extra Large'), preview: 'Aa' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn font-option ${settings.fontSize === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ fontSize: option.value })}
                      disabled={saving}
                      style={{ '--preview-scale': option.value } as React.CSSProperties}
                    >
                      <span className="font-preview">{option.preview}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Density */}
              <div className="form-group">
                <label>{t('UI Density')}</label>
                <p className="option-description">{t('Control spacing between elements')}</p>
                <div className="option-buttons density-buttons">
                  {[
                    { value: 'compact', label: t('Compact'), icon: '▪️', desc: t('Tighter spacing') },
                    { value: 'normal', label: t('Normal'), icon: '◾', desc: t('Balanced spacing') },
                    { value: 'comfortable', label: t('Comfortable'), icon: '⬛', desc: t('More breathing room') },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn density-option ${settings.density === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ density: option.value })}
                      disabled={saving}
                    >
                      <span className="density-icon">{option.icon}</span>
                      <span className="density-label">{option.label}</span>
                      <span className="density-desc">{option.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Height */}
              <div className="form-group">
                <label>{t('Line Height')}</label>
                <p className="option-description">{t('Increase or decrease reading comfort')}</p>
                <div className="option-buttons">
                  {[
                    { value: '0.95', label: t('Tight') },
                    { value: '1', label: t('Normal') },
                    { value: '1.1', label: t('Relaxed') },
                    { value: '1.2', label: t('Extra') },
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`option-btn ${settings.lineHeight === option.value ? 'active' : ''}`}
                      onClick={() => handleSaveSettings({ lineHeight: option.value })}
                      disabled={saving}
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Voice */}
              <div className="form-group">
                <label>{t('Audio Voice')}</label>
                <p className="option-description">{t('Choose a clearer voice for Listen')}</p>
                <select
                  value={ttsVoice}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTtsVoice(value);
                    localStorage.setItem('studypilot_tts_voice', value);
                  }}
                >
                  <option value="">{t('System Default')}</option>
                  {voices.map((voice) => (
                    <option key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
                <div className="audio-sliders">
                  <label>
                    {t('Rate')}
                    <input
                      type="range"
                      min="0.7"
                      max="1.3"
                      step="0.05"
                      value={ttsRate}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setTtsRate(value);
                        localStorage.setItem('studypilot_tts_rate', String(value));
                      }}
                    />
                  </label>
                  <label>
                    {t('Pitch')}
                    <input
                      type="range"
                      min="0.8"
                      max="1.2"
                      step="0.05"
                      value={ttsPitch}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        setTtsPitch(value);
                        localStorage.setItem('studypilot_tts_pitch', String(value));
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Preview Section */}
              <div className="appearance-preview">
                <label>{t('Preview')}</label>
                <div className="preview-card">
                  <div className="preview-header">
                    <span className="preview-icon">📁</span>
                    <span className="preview-title">{t('Sample Folder')}</span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-file-icon">📄</span>
                    <div className="preview-file-info">
                      <span className="preview-file-name">Study Notes.pdf</span>
                      <span className="preview-file-meta">{t('Added today')}</span>
                    </div>
                  </div>
                  <div className="preview-item">
                    <span className="preview-file-icon">📝</span>
                    <div className="preview-file-info">
                      <span className="preview-file-name">{isArabic ? 'أسئلة الاختبار' : 'Quiz Questions'}</span>
                      <span className="preview-file-meta">{t('Generated content')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {tab === 'security' && (
            <div className="settings-section">
              <h2>{t('Security')}</h2>
              <p className="section-description">{t('Manage your password, encryption, and security settings')}</p>

              {/* End-to-End Encryption Section */}
              {!ENCRYPTION_DISABLED ? (
              <div className="security-card encryption-card">
                <div className="encryption-header">
                  <div className="encryption-status">
                    <span className="encryption-icon">{vault.isUnlocked ? '🔓' : '🔐'}</span>
                    <div>
                      <h3>{t('End-to-End Encryption')}</h3>
                      <span className={`encryption-badge ${vault.isSetup ? (vault.isUnlocked ? 'active' : 'locked') : 'inactive'}`}>
                        {!vault.isSetup ? t('Not Set Up') : vault.isUnlocked ? t('Active & Unlocked') : t('Locked')}
                      </span>
                    </div>
                  </div>
                  {vault.isUnlocked && (
                    <button className="btn secondary small" onClick={vault.lock}>
                      {t('Lock Now')}
                    </button>
                  )}
                </div>

                <div className="encryption-features">
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>{isArabic ? 'تشفير AES-256 (مستوى عسكري)' : 'AES-256 encryption (military grade)'}</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>{isArabic ? 'هيكلية بدون معرفة مسبقة' : 'Zero-knowledge architecture'}</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>{isArabic ? 'تُشفَّر البيانات قبل مغادرة جهازك' : 'Data encrypted before leaving your device'}</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-check">✓</span>
                    <span>{isArabic ? 'لا يمكننا الوصول إلى بياناتك المشفرة' : 'We cannot access your encrypted data'}</span>
                  </div>
                </div>

                {vault.isSetup && vault.isUnlocked && (
                  <>
                    <div className="encryption-divider"></div>
                    <h4>{t('Change Encryption Password')}</h4>
                    <p className="helper-text">
                      {isArabic
                        ? 'هذه مختلفة عن كلمة مرور تسجيل الدخول. تُستخدم لتشفير بياناتك.'
                        : 'This is separate from your login password. It\'s used to encrypt your data.'}
                    </p>

                    <div className="form-group">
                      <label htmlFor="vaultCurrentPassword">{t('Current Encryption Password')}</label>
                      <input
                        id="vaultCurrentPassword"
                        type="password"
                        value={vaultCurrentPassword}
                        onChange={(e) => setVaultCurrentPassword(e.target.value)}
                        placeholder={t('Enter current encryption password')}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="vaultNewPassword">{t('New Encryption Password')}</label>
                      <input
                        id="vaultNewPassword"
                        type="password"
                        value={vaultNewPassword}
                        onChange={(e) => setVaultNewPassword(e.target.value)}
                        placeholder={t('At least 8 characters')}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="vaultConfirmPassword">{t('Confirm New Encryption Password')}</label>
                      <input
                        id="vaultConfirmPassword"
                        type="password"
                        value={vaultConfirmPassword}
                        onChange={(e) => setVaultConfirmPassword(e.target.value)}
                        placeholder={t('Confirm new encryption password')}
                      />
                    </div>

                    <button
                      className="btn"
                      onClick={handleChangeVaultPassword}
                      disabled={saving || !vaultCurrentPassword || !vaultNewPassword || !vaultConfirmPassword}
                    >
                      {saving ? t('Changing...') : t('Change Encryption Password')}
                    </button>
                  </>
                )}

                {vault.isSetup && (
                  <>
                    <div className="encryption-divider danger"></div>
                    <div className="encryption-danger">
                      <h4>{t('Reset Encryption')}</h4>
                      <p>
                        {isArabic
                          ? 'إذا نسيت كلمة مرور التشفير، يمكنك إعادة تعيينها.'
                          : 'If you\'ve forgotten your encryption password, you can reset it.'}
                        <strong>{isArabic ? ' تحذير: سيجعل هذا كل بياناتك المشفرة غير قابلة للوصول بشكل دائم.' : ' Warning: This will make all your encrypted data permanently inaccessible.'}</strong>
                      </p>
                      <button
                        className="btn danger small"
                        onClick={() => setShowResetVaultModal(true)}
                      >
                        {t('Reset Encryption')}
                      </button>
                    </div>
                  </>
                )}
              </div>
              ) : (
                <div className="security-card">
                  <h3>{t('End-to-End Encryption')}</h3>
                  <p>{t('Encryption is temporarily disabled for all users.')}</p>
                </div>
              )}

              {/* Login Password Section */}
              <div className="security-card">
                <h3>{account?.hasPassword ? t('Change Login Password') : t('Set Login Password')}</h3>
                <p>
                  {account?.hasPassword
                    ? (isArabic ? 'حدّث كلمة مرور تسجيل الدخول (منفصلة عن التشفير)' : 'Update your login password (separate from encryption)')
                    : (isArabic ? 'عيّن كلمة مرور لتسجيل الدخول بالبريد وكلمة المرور' : 'Set a password to login with email and password')}
                </p>
                {account?.isGuest && (
                  <p className="section-description">
                    {isArabic ? 'إعداد كلمة مرور غير متاح في وضع الضيف.' : 'Password setup is unavailable in guest mode.'}
                  </p>
                )}

                {account?.hasPassword && (
                  <div className="form-group">
                    <label htmlFor="currentPassword">{t('Current Login Password')}</label>
                    <input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={t('Enter current password')}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="newPassword">{t('New Login Password')}</label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('At least 6 characters')}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">{t('Confirm New Login Password')}</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('Confirm new password')}
                  />
                </div>

                <button
                  className="btn"
                  onClick={handleChangePassword}
                  disabled={saving || !newPassword || !confirmPassword || Boolean(account?.isGuest)}
                >
                  {saving ? t('Saving...') : account?.hasPassword ? t('Change Login Password') : t('Set Login Password')}
                </button>
              </div>
            </div>
          )}

          {/* Account Tab */}
          {tab === 'account' && (
            <div className="settings-section">
              <h2>{t('Account')}</h2>
              <p className="section-description">{isArabic ? 'إدارة حسابك والخدمات المرتبطة' : 'Manage your account and connected services'}</p>

              {account?.isGuest && (
                <div className="account-card info">
                  <h3>{isArabic ? 'جلسة ضيف' : 'Guest session'}</h3>
                  <p>
                    {isArabic
                      ? 'أنت تستخدم StudyPilot بدون حساب. يمكنك المتابعة كضيف، لكن ربط الخدمات الخارجية أو حذف الحساب غير متاحين حتى تسجل الدخول بحساب فعلي.'
                      : 'You are using StudyPilot without a full account. Guest mode keeps the app usable, but external account linking and account deletion stay disabled until you sign in with a real account.'}
                  </p>
                </div>
              )}

              {/* Connected Accounts */}
              <div className="account-card">
                <h3>{isArabic ? 'الحسابات المرتبطة' : 'Connected Accounts'}</h3>
                <p>{isArabic ? 'طرق تسجيل الدخول المرتبطة بحسابك' : 'Sign in methods linked to your account'}</p>

                <div className="connected-accounts">
                  {/* Email/Password */}
                  <div className="connected-item">
                    <div className="connected-info">
                      <span className="connected-icon email-icon">📧</span>
                      <div>
                        <strong>{isArabic ? 'البريد وكلمة المرور' : 'Email & Password'}</strong>
                        <span>{account?.email}</span>
                      </div>
                    </div>
                    <div className="connected-actions">
                      {account?.hasPassword ? (
                        <span className="connected-status active">{isArabic ? 'نشط' : 'Active'}</span>
                      ) : (
                        <button
                          className="btn small"
                          onClick={() => setTab('security')}
                        >
                          {isArabic ? 'تعيين كلمة مرور' : 'Set Password'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Google */}
                  <div className="connected-item">
                    <div className="connected-info">
                      <span className="connected-icon google-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      </span>
                      <div>
                        <strong>Google</strong>
                        <span>{isArabic ? 'تسجيل الدخول باستخدام Google' : 'Sign in with Google'}</span>
                      </div>
                    </div>
                    <div className="connected-actions">
                      {account?.connectedAccounts.includes('google') ? (
                        <>
                          <span className="connected-status active">{isArabic ? 'متصل' : 'Connected'}</span>
                          <button
                            className="btn small secondary"
                            onClick={() => handleUnlinkAccount('google')}
                            disabled={unlinkingProvider === 'google'}
                          >
                            {unlinkingProvider === 'google' ? (isArabic ? 'جارٍ الفصل...' : 'Disconnecting...') : (isArabic ? 'فصل' : 'Disconnect')}
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn small google-btn"
                          onClick={() => handleLinkAccount('google')}
                          disabled={account?.isGuest || linkingProvider === 'google' || !providers?.google || Boolean(authCapabilities?.oauthDisabled)}
                        >
                          {linkingProvider === 'google' ? (isArabic ? 'جارٍ الربط...' : 'Connecting...') : (isArabic ? 'ربط' : 'Connect')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* GitHub */}
                  <div className="connected-item">
                    <div className="connected-info">
                      <span className="connected-icon github-icon">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                        </svg>
                      </span>
                      <div>
                        <strong>GitHub</strong>
                        <span>{isArabic ? 'تسجيل الدخول باستخدام GitHub' : 'Sign in with GitHub'}</span>
                      </div>
                    </div>
                    <div className="connected-actions">
                      {account?.connectedAccounts.includes('github') ? (
                        <>
                          <span className="connected-status active">{isArabic ? 'متصل' : 'Connected'}</span>
                          <button
                            className="btn small secondary"
                            onClick={() => handleUnlinkAccount('github')}
                            disabled={unlinkingProvider === 'github'}
                          >
                            {unlinkingProvider === 'github' ? (isArabic ? 'جارٍ الفصل...' : 'Disconnecting...') : (isArabic ? 'فصل' : 'Disconnect')}
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn small github-btn"
                          onClick={() => handleLinkAccount('github')}
                          disabled={account?.isGuest || linkingProvider === 'github' || !providers?.github || Boolean(authCapabilities?.oauthDisabled)}
                        >
                          {linkingProvider === 'github' ? (isArabic ? 'جارٍ الربط...' : 'Connecting...') : (isArabic ? 'ربط' : 'Connect')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="account-card">
                <h3>{isArabic ? 'تشخيص تسجيل الدخول' : 'Auth Diagnostics'}</h3>
                {loadingAuthCapabilities ? (
                  <p>{isArabic ? 'جارٍ فحص مزودي تسجيل الدخول...' : 'Checking sign-in providers...'}</p>
                ) : (
                  <div className="account-info-list">
                    <div className="account-info-item">
                      <span>{isArabic ? 'Google مهيأ' : 'Google configured'}</span>
                      <strong>{authCapabilities?.googleConfigured ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</strong>
                    </div>
                    <div className="account-info-item">
                      <span>{isArabic ? 'GitHub مهيأ' : 'GitHub configured'}</span>
                      <strong>{authCapabilities?.githubConfigured ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</strong>
                    </div>
                    <div className="account-info-item">
                      <span>{isArabic ? 'وضع الضيف' : 'Guest mode enabled'}</span>
                      <strong>{authCapabilities?.guestModeEnabled ? (isArabic ? 'مفعل' : 'Enabled') : (isArabic ? 'معطل' : 'Disabled')}</strong>
                    </div>
                    {isElectronApp && (
                      <div className="account-info-item">
                        <span>{isArabic ? 'منفذ OAuth لسطح المكتب' : 'Desktop OAuth port'}</span>
                        <strong>{authCapabilities?.desktopAuthPort ?? 3893}</strong>
                      </div>
                    )}
                    {authCapabilities?.oauthDisabledReason && (
                      <div className="oauth-warning">{authCapabilities.oauthDisabledReason}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Member Since */}
              <div className="account-card">
                <h3>{t('Account Info')}</h3>
                <div className="account-info-item">
                  <span>{t('Member since')}</span>
                  <strong>{account?.createdAt ? formatDate(account.createdAt) : (isArabic ? 'غير متاح' : 'N/A')}</strong>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="account-card danger">
                <h3>{t('Danger Zone')}</h3>
                <p>{t('Delete account warning')}</p>
                <button
                  className="btn danger"
                  onClick={() => setShowDeleteModal(true)}
                  disabled={Boolean(account?.isGuest)}
                >
                  {t('Delete Account')}
                </button>
              </div>
            </div>
          )}

          {/* AI Tab */}
          {tab === 'ai' && (
            <div className="settings-section">
              <h2>{isArabic ? 'نماذج الذكاء الاصطناعي' : 'AI Models'}</h2>
              <p className="section-description">
                {isElectronApp
                  ? (isArabic
                    ? 'وضع سطح المكتب محلي أولاً مع قيود مخصصة للدراسة فقط.'
                    : 'Desktop-first AI with offline local runtime and study-only guardrails.')
                  : (isArabic
                    ? 'الويب يستخدم OpenAI افتراضيًا مع بديل محلي عند تعذر الخدمة.'
                    : 'Web uses OpenAI by default with deterministic offline fallback if cloud fails.')}
              </p>

              <div className="account-card">
                <h3>{isArabic ? 'المزوّد' : 'Provider'}</h3>
                <div className="form-group">
                  <label htmlFor="aiProvider">{isArabic ? 'مزود الذكاء الاصطناعي' : 'AI provider'}</label>
                  <select
                    id="aiProvider"
                    value={aiPrefs.provider}
                    onChange={(e) => setAiPrefs(prev => ({ ...prev, provider: e.target.value as AiPreferences['provider'] }))}
                  >
                    {isElectronApp && (
                      <option value="desktop-local">{isArabic ? 'محلي على الجهاز (مفضل)' : 'Desktop Local (Recommended)'}</option>
                    )}
                    <option value="openai">{isArabic ? 'OpenAI (سحابي)' : 'OpenAI (Cloud)'}</option>
                    <option value="offline">{isArabic ? 'وضع بدون سحابة' : 'Offline deterministic only'}</option>
                  </select>
                </div>
                {isElectronApp && (
                  <div className="form-group">
                    <label htmlFor="cloudFallbackToggle">{isArabic ? 'السماح بالرجوع للسحابة عند فشل المحلي' : 'Enable cloud fallback if desktop runtime fails'}</label>
                    <input
                      id="cloudFallbackToggle"
                      type="checkbox"
                      checked={aiPrefs.enableCloudFallback}
                      onChange={(e) => setAiPrefs(prev => ({ ...prev, enableCloudFallback: e.target.checked }))}
                    />
                  </div>
                )}
              </div>

              <div className="account-card">
                <h3>OpenAI</h3>
                <div className="form-group">
                  <label htmlFor="openaiModel">{isArabic ? 'النموذج' : 'Model'}</label>
                  <input
                    id="openaiModel"
                    type="text"
                    value={aiPrefs.openaiModel}
                    onChange={(e) => setAiPrefs(prev => ({ ...prev, openaiModel: e.target.value }))}
                    placeholder="gpt-4o-mini"
                  />
                  <p className="help-text">{isArabic ? 'يتطلب `OPENAI_API_KEY` على الخادم.' : 'Requires `OPENAI_API_KEY` on the server.'}</p>
                </div>
              </div>

              {isElectronApp ? (
                <div className="account-card">
                  <h3>{isArabic ? 'مدير نماذج سطح المكتب' : 'Desktop Model Manager'}</h3>
                  <p className="help-text">
                    {isArabic
                      ? 'يبدأ StudyPilot بنموذج Mini دون اتصال. يمكنك تثبيت نماذج أقوى واختيار النموذج النشط.'
                      : 'StudyPilot starts with offline Mini. Install stronger models and choose the active one.'}
                  </p>
                  {desktopAiModelInfo && (
                    <div className="help-text" style={{ marginTop: 8 }}>
                      <strong>{isArabic ? 'النموذج النشط:' : 'Active model:'}</strong>{' '}
                      {desktopAiModelInfo.modelId || (isArabic ? 'لا يوجد' : 'None')}<br />
                      <strong>{isArabic ? 'النموذج المختار:' : 'Selected model:'}</strong>{' '}
                      {desktopAiSelection?.selectedModelKey || desktopAiModelInfo.selectedModelKey}<br />
                      <strong>{isArabic ? 'نوع الجهاز المكتشف:' : 'Detected device profile:'}</strong>{' '}
                      {desktopAiModelInfo.deviceProfile === 'laptop'
                        ? (isArabic ? 'لابتوب' : 'Laptop')
                        : desktopAiModelInfo.deviceProfile === 'pc'
                          ? (isArabic ? 'كمبيوتر مكتبي' : 'PC')
                          : (isArabic ? 'لابتوب/كمبيوتر متوسط' : 'Laptop/PC (balanced)')}
                      <br />
                      <strong>{isArabic ? 'إصدار القائمة:' : 'Manifest version:'}</strong>{' '}
                      {desktopAiModelInfo.manifestVersion || (isArabic ? 'غير متاح' : 'N/A')}
                    </div>
                  )}
                  {desktopAiModelInfo?.models?.length ? (
                    <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                      {desktopAiModelInfo.models.map((model) => {
                        const isActive = desktopAiModelInfo.activeModelKey === model.key;
                        const isRecommended = desktopAiModelInfo.recommendedModelKey === model.key;
                        const installing = installingModelKey === model.key || model.isDownloading;
                        const removing = removingModelKey === model.key;
                        const downloadPercent = model.downloadProgress?.percent ?? 0;
                        return (
                          <div key={model.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div>
                                <strong>{model.modelId}</strong> · {model.quantization}
                                <div style={{ marginTop: 4 }}>
                                  <code>{model.modelFile}</code>
                                </div>
                                <div className="help-text" style={{ marginTop: 4 }}>
                                  {formatModelSize(model.sizeBytes, isArabic)} · {model.minRamGb}GB+ RAM
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                {model.isInstalled ? (
                                  <button
                                    className="btn secondary"
                                    disabled={isActive || switchingDesktopModel || installing || removing}
                                    onClick={() => handleSelectDesktopModel(model.key)}
                                  >
                                    {isActive
                                      ? (isArabic ? 'نشط' : 'Active')
                                      : (isArabic ? 'تفعيل' : 'Use')}
                                  </button>
                                ) : (
                                  <button
                                    className="btn secondary"
                                    disabled={installing || switchingDesktopModel || removing}
                                    onClick={() => handleInstallDesktopModel(model.key)}
                                  >
                                    {installing
                                      ? (isArabic ? 'جارِ التثبيت...' : 'Installing...')
                                      : (isArabic ? 'تثبيت' : 'Install')}
                                  </button>
                                )}
                                {model.installedSource === 'userData' && !isActive && (
                                  <button
                                    className="btn secondary"
                                    disabled={installing || removing}
                                    onClick={() => handleRemoveDesktopModel(model.key)}
                                  >
                                    {removing ? (isArabic ? 'جارِ الحذف...' : 'Removing...') : (isArabic ? 'حذف' : 'Remove')}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="help-text" style={{ marginTop: 6 }}>
                              {isRecommended
                                ? (isArabic ? 'موصى به لهذا الجهاز' : 'Recommended for this device')
                                : model.recommendedFor === 'laptop'
                                  ? (isArabic ? 'موصى به للابتوب' : 'Recommended for laptops')
                                  : model.recommendedFor === 'pc'
                                    ? (isArabic ? 'موصى به للكمبيوتر المكتبي' : 'Recommended for desktops')
                                    : (isArabic ? 'موصى به للأجهزة المتوسطة' : 'Balanced for laptop/PC')}
                              {' · '}
                              {model.installedSource === 'userData'
                                ? (isArabic ? 'مثبّت محليًا بعد التثبيت' : 'Installed locally after setup')
                                : model.bundled
                                  ? (isArabic ? 'مضمّن في هذه النسخة' : 'Bundled in this installer')
                                  : (isArabic ? 'غير مثبت' : 'Not installed')}
                            </div>
                            {model.downloadProgress && (
                              <div className="help-text" style={{ marginTop: 4 }}>
                                {model.downloadProgress.state === 'downloading'
                                  ? `${isArabic ? 'التنزيل جارٍ' : 'Downloading'}: ${downloadPercent}%`
                                  : model.downloadProgress.state === 'error'
                                    ? `${isArabic ? 'خطأ التنزيل' : 'Download error'}: ${model.downloadProgress.message || ''}`
                                    : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <button className="btn secondary" onClick={refreshDesktopAiStatus} disabled={checkingAiRuntime}>
                    {checkingAiRuntime ? (isArabic ? 'جار الفحص...' : 'Checking...') : (isArabic ? 'فحص حالة Runtime' : 'Check Runtime Status')}
                  </button>
                  {desktopAiHealth && (
                    <p className="help-text" style={{ marginTop: 10 }}>
                      {isArabic ? 'الحالة:' : 'Status:'} <strong>{desktopAiHealth.status}</strong>
                      {desktopAiHealth.details ? ` — ${desktopAiHealth.details}` : ''}
                    </p>
                  )}
                  {desktopAiSelection && (
                    <p className="help-text" style={{ marginTop: 6 }}>
                      {isArabic ? 'معالج الإعداد الأول:' : 'First-launch setup:'}{' '}
                      <strong>{desktopAiSelection.setupCompleted ? (isArabic ? 'مكتمل' : 'Completed') : (isArabic ? 'غير مكتمل' : 'Pending')}</strong>
                    </p>
                  )}
                  <p className="help-text" style={{ marginTop: 6 }}>
                    {isArabic
                      ? 'عند فشل تثبيت النماذج الاختيارية، سيستمر StudyPilot باستخدام Mini بدون إنترنت.'
                      : 'If optional model install fails, StudyPilot keeps working with Mini offline.'}
                  </p>
                </div>
              ) : (
                <div className="account-card">
                  <h3>{isArabic ? 'حالة ذكاء الويب' : 'Web AI Status'}</h3>
                  {loadingWebAiCapabilities ? (
                    <p className="help-text">{isArabic ? 'جار التحميل...' : 'Loading...'}</p>
                  ) : (
                    <>
                      <p className="help-text">
                        {isArabic ? 'ذكاء الويب مفعل:' : 'Web AI enabled:'}{' '}
                        <strong>{webAiCapabilities?.webAiEnabled ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</strong>
                      </p>
                      <p className="help-text">
                        {isArabic ? 'مفتاح OpenAI متوفر:' : 'OpenAI key configured:'}{' '}
                        <strong>{webAiCapabilities?.openaiConfigured ? (isArabic ? 'نعم' : 'Yes') : (isArabic ? 'لا' : 'No')}</strong>
                      </p>
                      <p className="help-text">
                        {isArabic ? 'النموذج الافتراضي:' : 'Default model:'}{' '}
                        <strong>{webAiCapabilities?.defaultModel || 'gpt-4o-mini'}</strong>
                      </p>
                      <p className="help-text">
                        {isArabic ? 'وضع سطح المكتب فقط:' : 'Desktop-only mode:'}{' '}
                        <strong>{webAiCapabilities?.desktopOnlyMode ? (isArabic ? 'مفعّل' : 'Enabled') : (isArabic ? 'معطل' : 'Disabled')}</strong>
                      </p>
                    </>
                  )}
                  <button className="btn secondary" onClick={refreshWebAiCapabilities} disabled={loadingWebAiCapabilities}>
                    {loadingWebAiCapabilities ? (isArabic ? 'جار الفحص...' : 'Checking...') : (isArabic ? 'تحديث الحالة' : 'Refresh Status')}
                  </button>
                  <p className="help-text" style={{ marginTop: 8 }}>
                    {isArabic
                      ? 'إذا تعذر الوصول إلى السحابة، سيستخدم التطبيق بديلًا محليًا تلقائيًا.'
                      : 'If cloud is unavailable, the app will automatically use deterministic offline fallback.'}
                  </p>
                </div>
              )}

              <div className="account-card">
                <h3>{isArabic ? 'نطاق الذكاء الاصطناعي في StudyPilot' : 'StudyPilot AI Scope'}</h3>
                <p className="help-text">
                  {isArabic
                    ? 'الذكاء الاصطناعي هنا مخصص للدراسة فقط: تلخيص، اختبارات، ملاحظات، تخطيط دراسة، وحل مسائل أكاديمية.'
                    : 'AI is restricted to academic learning and study-planning tasks only.'}
                </p>
                <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
                  {supportedTasks.map((task) => (
                    <li key={task} style={{ marginBottom: '0.25rem' }}>{task}</li>
                  ))}
                </ul>
                <p className="help-text" style={{ marginTop: 10 }}>
                  {isArabic
                    ? 'الطلبات خارج الدراسة (مثل الرسائل الشخصية، البرمجة العامة، أو الاستشارات الطبية/القانونية) سيتم رفضها.'
                    : 'Out-of-scope requests (personal messages, generic coding help, legal/medical/financial advice) are blocked.'}
                </p>
              </div>

              <button className="btn" onClick={handleSaveAi}>
                {isArabic ? 'حفظ إعدادات الذكاء الاصطناعي' : 'Save AI Preferences'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reset Vault Modal */}
      {showResetVaultModal && (
        <div className="modal-overlay" onClick={() => setShowResetVaultModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('Reset Encryption Modal Title')}</h2>
            <p>
              <strong>{isArabic ? 'هذا الإجراء لا يمكن التراجع عنه.' : 'This action is irreversible.'}</strong>{' '}
              {isArabic
                ? 'جميع بياناتك المشفرة (أسماء المجلدات والملفات والمحتوى وعناصر المكتبة) ستصبح غير قابلة للوصول بشكل دائم.'
                : 'All your encrypted data (folder names, file names, file content, library items) will become permanently inaccessible.'}
            </p>
            <p>{t('Reset Encryption Modal Confirm')}</p>

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setShowResetVaultModal(false)}
              >
                {t('Cancel')}
              </button>
              <button
                className="btn danger"
                onClick={handleResetVault}
              >
                {t('Yes, Reset Encryption')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('Delete Account')}</h2>
            <p>{isArabic ? 'لا يمكن التراجع عن هذا الإجراء. سيتم حذف كل بياناتك نهائيًا.' : 'This action cannot be undone. All your data will be permanently deleted.'}</p>
            <p>{t('Type DELETE MY ACCOUNT to confirm:')}</p>

            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
            />

            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
              >
                {t('Cancel')}
              </button>
              <button
                className="btn danger"
                onClick={handleDeleteAccount}
                disabled={saving || deleteConfirmation !== 'DELETE MY ACCOUNT'}
              >
                {saving ? t('Deleting...') : t('Delete Account')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .settings-page {
          padding: var(--space-6);
          max-width: 800px;
          margin: 0 auto;
        }

        .settings-loading {
          text-align: center;
          padding: var(--space-8);
          color: var(--text-muted);
        }

        .settings-header {
          margin-bottom: var(--space-6);
        }

        .settings-header h1 {
          font-size: var(--font-2xl);
          margin-bottom: var(--space-2);
        }

        .settings-header p {
          color: var(--text-muted);
        }

        .settings-message {
          padding: var(--space-3);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
          font-size: var(--font-meta);
        }

        .settings-message.success {
          background: var(--success-muted);
          color: var(--success);
        }

        .settings-message.error {
          background: var(--error-muted);
          color: var(--error);
        }

        .settings-tabs {
          display: flex;
          gap: var(--space-2);
          margin-bottom: var(--space-6);
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: var(--space-2);
          overflow-x: auto;
          background: var(--bg-base);
          position: sticky;
          top: 0;
          z-index: 5;
        }

        .settings-tab {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border: none;
          background: none;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: var(--radius-md);
          transition: all 0.2s;
          white-space: nowrap;
        }

        .settings-tab:hover {
          background: var(--bg-inset);
          color: var(--text-primary);
        }

        .settings-tab.active {
          background: var(--primary-muted);
          color: var(--primary);
        }

        .settings-section {
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .settings-section h2 {
          font-size: var(--font-lg);
          margin-bottom: var(--space-1);
        }

        .section-description {
          color: var(--text-muted);
          margin-bottom: var(--space-6);
        }

        .help-text {
          margin-top: var(--space-2);
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .form-group {
          margin-bottom: var(--space-4);
        }

        .form-group label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .option-buttons {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        select {
          width: 100%;
          padding: var(--space-2) var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          background: var(--bg-surface);
        }

        .audio-sliders {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: var(--space-2);
          margin-top: var(--space-3);
        }

        .audio-sliders label {
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
          font-size: var(--font-meta);
        }

        .option-btn {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--space-2) var(--space-4);
          border: 1px solid var(--border-default);
          background: var(--bg-surface);
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: all 0.2s;
        }

        .option-btn:hover {
          border-color: var(--primary);
        }

        .option-btn.active {
          background: var(--primary-muted);
          border-color: var(--primary);
          color: var(--primary);
        }

        .option-description {
          font-size: var(--font-tiny);
          color: var(--text-muted);
          margin-bottom: var(--space-3);
          margin-top: calc(-1 * var(--space-1));
        }

        /* Font size options */
        .option-btn.font-option {
          flex-direction: column;
          gap: var(--space-1);
          padding: var(--space-3) var(--space-4);
          min-width: 80px;
        }

        .font-preview {
          font-size: calc(18px * var(--preview-scale, 1));
          font-weight: 600;
          line-height: 1;
        }

        /* Density options */
        .density-buttons {
          flex-direction: column;
        }

        .option-btn.density-option {
          width: 100%;
          justify-content: flex-start;
          padding: var(--space-3) var(--space-4);
        }

        .density-icon {
          font-size: 12px;
          opacity: 0.7;
        }

        .density-label {
          flex: 0 0 auto;
          font-weight: 500;
        }

        .density-desc {
          flex: 1;
          text-align: right;
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .option-btn.density-option.active .density-desc {
          color: var(--primary-text);
        }

        /* Appearance Preview */
        .appearance-preview {
          margin-top: var(--space-6);
          padding-top: var(--space-5);
          border-top: 1px solid var(--border-subtle);
        }

        .appearance-preview label {
          display: block;
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-3);
          color: var(--text-secondary);
        }

        .preview-card {
          background: var(--bg-inset);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: var(--space-4);
        }

        .preview-header {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding-bottom: var(--space-3);
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: var(--space-3);
        }

        .preview-icon {
          font-size: 20px;
        }

        .preview-title {
          font-weight: 600;
          font-size: var(--font-body);
        }

        .preview-item {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: var(--space-2) 0;
        }

        .preview-item + .preview-item {
          border-top: 1px solid var(--border-subtle);
        }

        .preview-file-icon {
          font-size: 16px;
        }

        .preview-file-info {
          display: flex;
          flex-direction: column;
        }

        .preview-file-name {
          font-size: var(--font-meta);
          font-weight: 500;
        }

        .preview-file-meta {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .profile-stats {
          margin-top: var(--space-8);
          padding-top: var(--space-6);
          border-top: 1px solid var(--border-subtle);
        }

        .profile-stats h3 {
          font-size: var(--font-body);
          margin-bottom: var(--space-4);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-4);
        }

        .stat-item {
          text-align: center;
          padding: var(--space-4);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .stat-value {
          display: block;
          font-size: var(--font-2xl);
          font-weight: 700;
          color: var(--primary);
        }

        .stat-label {
          font-size: var(--font-meta);
          color: var(--text-muted);
        }

        .security-card,
        .account-card {
          padding: var(--space-5);
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-lg);
          margin-bottom: var(--space-4);
        }

        .security-card h3,
        .account-card h3 {
          font-size: var(--font-body);
          margin-bottom: var(--space-2);
        }

        .security-card h4 {
          font-size: var(--font-meta);
          font-weight: 600;
          margin-bottom: var(--space-2);
        }

        .encryption-card {
          border-color: var(--success);
        }

        .encryption-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: var(--space-4);
        }

        .encryption-status {
          display: flex;
          gap: var(--space-3);
          align-items: center;
        }

        .encryption-icon {
          font-size: 32px;
        }

        .encryption-badge {
          font-size: var(--font-tiny);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
        }

        .encryption-badge.active {
          background: var(--success-muted);
          color: var(--success);
        }

        .encryption-badge.locked {
          background: var(--warning-muted);
          color: var(--warning);
        }

        .encryption-badge.inactive {
          background: var(--bg-inset);
          color: var(--text-muted);
        }

        .encryption-features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--space-2);
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-4);
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          font-size: var(--font-meta);
        }

        .feature-check {
          color: var(--success);
        }

        .encryption-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: var(--space-5) 0;
        }

        .encryption-divider.danger {
          background: var(--error);
          opacity: 0.3;
        }

        .encryption-danger {
          padding: var(--space-4);
          background: var(--error-muted);
          border-radius: var(--radius-md);
        }

        .encryption-danger h4 {
          color: var(--error);
        }

        .encryption-danger p {
          font-size: var(--font-meta);
          color: var(--text-secondary);
          margin-bottom: var(--space-3);
        }

        .helper-text {
          font-size: var(--font-meta);
          color: var(--text-muted);
          margin-bottom: var(--space-4);
        }

        .warning-text {
          color: var(--warning);
        }

        .btn.small {
          padding: var(--space-2) var(--space-3);
          font-size: var(--font-meta);
        }

        .btn.secondary {
          background: var(--bg-inset);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
        }

        .btn.secondary:hover {
          background: var(--bg-hover);
        }

        .security-card > p,
        .account-card > p {
          color: var(--text-muted);
          font-size: var(--font-meta);
          margin-bottom: var(--space-4);
        }

        .account-card.danger {
          border-color: var(--error);
          background: var(--error-muted);
        }

        .account-card.danger h3 {
          color: var(--error);
        }

        .connected-accounts {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .connected-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-3);
          background: var(--bg-inset);
          border-radius: var(--radius-md);
        }

        .connected-info {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .connected-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-surface);
          border-radius: var(--radius-md);
        }

        .connected-info div {
          display: flex;
          flex-direction: column;
        }

        .connected-info span {
          font-size: var(--font-tiny);
          color: var(--text-muted);
        }

        .connected-status {
          font-size: var(--font-tiny);
          padding: var(--space-1) var(--space-2);
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          color: var(--text-muted);
        }

        .connected-status.active {
          background: var(--success-muted);
          color: var(--success);
        }

        .connected-actions {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .btn.small {
          padding: var(--space-1) var(--space-3);
          font-size: var(--font-tiny);
        }

        .btn.google-btn {
          background: #4285F4;
          color: white;
        }

        .btn.google-btn:hover {
          background: #3367d6;
        }

        .btn.github-btn {
          background: #24292e;
          color: white;
        }

        .btn.github-btn:hover {
          background: #1b1f23;
        }

        .connected-icon {
          font-size: 20px;
        }

        .connected-icon svg {
          display: block;
        }

        .account-info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .account-info-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
        }

        .account-info-item span {
          color: var(--text-muted);
        }

        .oauth-warning {
          margin-top: var(--space-2);
          padding: var(--space-3);
          border-radius: var(--radius-md);
          border: 1px solid color-mix(in srgb, var(--warning) 40%, var(--border-subtle));
          background: color-mix(in srgb, var(--warning) 16%, transparent);
          color: var(--text-secondary);
          font-size: var(--font-meta);
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal {
          background: var(--bg-surface);
          padding: var(--space-6);
          border-radius: var(--radius-lg);
          max-width: 400px;
          width: 90%;
        }

        .modal h2 {
          color: var(--error);
          margin-bottom: var(--space-3);
        }

        .modal p {
          margin-bottom: var(--space-3);
          color: var(--text-secondary);
        }

        .modal input {
          margin-bottom: var(--space-4);
        }

        .modal-actions {
          display: flex;
          gap: var(--space-2);
          justify-content: flex-end;
        }

        .btn.danger {
          background: var(--error);
          color: white;
        }

        .btn.danger:hover {
          background: color-mix(in srgb, var(--error) 85%, black);
        }

        @media (max-width: 600px) {
          .settings-page {
            padding: var(--space-4);
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .connected-item {
            flex-direction: column;
            gap: var(--space-3);
            text-align: center;
          }

          .connected-info {
            flex-direction: column;
          }

          .connected-actions {
            flex-direction: column;
            width: 100%;
          }

          .connected-actions .btn {
            width: 100%;
          }

          .encryption-features {
            grid-template-columns: 1fr;
          }

          .encryption-header {
            flex-direction: column;
            gap: var(--space-3);
          }

          .settings-tabs {
            padding-top: var(--space-2);
          }

          .option-buttons {
            flex-direction: column;
          }

          .option-btn {
            width: 100%;
            justify-content: space-between;
          }

          .settings-tabs {
            gap: var(--space-1);
          }

          .settings-tab {
            padding: var(--space-2);
          }

          .tab-icon {
            font-size: var(--font-body);
          }

          .settings-message {
            position: sticky;
            top: 46px;
            z-index: 6;
          }

          .modal {
            width: 95%;
          }
        }
      `}</style>
    </div>
  );
}
