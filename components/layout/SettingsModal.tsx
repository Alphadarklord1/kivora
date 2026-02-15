'use client';

import { useSettings } from '@/providers/SettingsProvider';
import { useI18n } from '@/lib/i18n/useI18n';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n({
    Settings: 'الإعدادات',
    Appearance: 'المظهر',
    Theme: 'السمة',
    Light: 'فاتح',
    'Blue Mode': 'الوضع الأزرق',
    'Black Mode': 'الوضع الأسود',
    System: 'النظام',
    Language: 'اللغة',
    English: 'الإنجليزية',
    'Font Size': 'حجم الخط',
    Small: 'صغير',
    Normal: 'عادي',
    Large: 'كبير',
    'Extra Large': 'كبير جدًا',
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
              <option value="light">{t('Light')}</option>
              <option value="blue">{t('Blue Mode')}</option>
              <option value="black">{t('Black Mode')}</option>
              <option value="system">{t('System')}</option>
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Language')}</label>
            <select value={settings.language} onChange={(e) => updateSettings({ language: e.target.value === 'ar' ? 'ar' : 'en' })}>
              <option value="en">{t('English')}</option>
              <option value="ar">العربية</option>
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Font Size')}</label>
            <select value={settings.fontSize} onChange={(e) => updateSettings({ fontSize: e.target.value })}>
              <option value="0.875">{t('Small')}</option>
              <option value="1">{t('Normal')}</option>
              <option value="1.125">{t('Large')}</option>
              <option value="1.25">{t('Extra Large')}</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>{t('Density')}</label>
            <select value={settings.density} onChange={(e) => updateSettings({ density: e.target.value })}>
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
