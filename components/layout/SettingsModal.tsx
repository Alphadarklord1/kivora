'use client';

import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';
import { LOCALE_OPTIONS, sanitizeSupportedLocale } from '@/lib/i18n/locales';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSetting } = useSettings();
  const updateSettings = (patch: Partial<typeof settings>) => {
    (Object.keys(patch) as (keyof typeof settings)[]).forEach(k => updateSetting(k, patch[k]!));
  };
  const { t } = useI18n({
    Settings: 'الإعدادات',
    Appearance: 'المظهر',
    Theme: 'السمة',
    Light: 'فاتح',
    System: 'النظام',
    Dark: 'داكن',
    Black: 'أسود',
    Language: 'اللغة',
    English: 'الإنجليزية',
    'Font Size': 'حجم الخط',
    'Small Text': 'نص صغير',
    'Normal Text Size': 'حجم نص عادي',
    'Large Text': 'نص كبير',
    'Extra Large Text': 'نص كبير جدًا',
    Density: 'الكثافة',
    Compact: 'مضغوط',
    Comfortable: 'مريح',
    Done: 'تم',
  });

  return (
    <div className="settings-modal" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>{t('Settings')}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <h3>{t('Appearance')}</h3>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Theme')}</label>
            <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'blue' | 'black' | 'system' })}>
              <option value="system">{t('System')}</option>
              <option value="blue">{t('Dark')}</option>
              <option value="light">{t('Light')}</option>
              <option value="black">{t('Black')}</option>
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Language')}</label>
            <select value={settings.language} onChange={(e) => updateSettings({ language: sanitizeSupportedLocale(e.target.value) })}>
              {LOCALE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Font Size')}</label>
            <select value={settings.fontSize} onChange={(e) => updateSettings({ fontSize: e.target.value })}>
              <option value="0.95">{t('Small Text')}</option>
              <option value="1">{t('Normal Text Size')}</option>
              <option value="1.05">{t('Large Text')}</option>
              <option value="1.1">{t('Extra Large Text')}</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Density')}</label>
            <select value={settings.density} onChange={(e) => updateSettings({ density: e.target.value as 'compact' | 'normal' | 'comfortable' })}>
              <option value="compact">{t('Compact')}</option>
              <option value="normal">{t('Normal')}</option>
              <option value="comfortable">{t('Comfortable')}</option>
            </select>
          </div>
        </div>

        <button className="btn" onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  );
}
