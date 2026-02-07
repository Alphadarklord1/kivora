'use client';

import { useState, useEffect } from 'react';

interface SettingsModalProps {
  onClose: () => void;
}

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem('studypilot_theme') || 'light';
};

const getInitialFontSize = () => {
  if (typeof window === 'undefined') return '1';
  return localStorage.getItem('studypilot_fontSize') || '1';
};

const getInitialDensity = () => {
  if (typeof window === 'undefined') return 'normal';
  return localStorage.getItem('studypilot_density') || 'normal';
};

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [fontSize, setFontSize] = useState(getInitialFontSize);
  const [density, setDensity] = useState(getInitialDensity);

  const applySettings = () => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', density);
    document.documentElement.style.setProperty('--font-scale', fontSize);

    localStorage.setItem('studypilot_theme', theme);
    localStorage.setItem('studypilot_fontSize', fontSize);
    localStorage.setItem('studypilot_density', density);
  };

  useEffect(() => {
    applySettings();
  }, [theme, fontSize, density]);

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
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Font Size</label>
            <select value={fontSize} onChange={(e) => setFontSize(e.target.value)}>
              <option value="0.875">Small</option>
              <option value="1">Normal</option>
              <option value="1.125">Large</option>
              <option value="1.25">Extra Large</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Density</label>
            <select value={density} onChange={(e) => setDensity(e.target.value)}>
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
