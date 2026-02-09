'use client';

import { useSettings } from '@/providers/SettingsProvider';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="settings-modal" onClick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <h3>Appearance</h3>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Theme</label>
            <select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value })}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Language</label>
            <select value={settings.language} onChange={(e) => updateSettings({ language: e.target.value === 'ar' ? 'ar' : 'en' })}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Font Size</label>
            <select value={settings.fontSize} onChange={(e) => updateSettings({ fontSize: e.target.value })}>
              <option value="0.875">Small</option>
              <option value="1">Normal</option>
              <option value="1.125">Large</option>
              <option value="1.25">Extra Large</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Density</label>
            <select value={settings.density} onChange={(e) => updateSettings({ density: e.target.value })}>
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </div>
        </div>

        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
