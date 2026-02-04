'use client';

import { useState, useEffect, useCallback } from 'react';

interface Settings {
  theme: string;
  fontSize: string;
  lineHeight: string;
  density: string;
}

const defaultSettings: Settings = {
  theme: 'light',
  fontSize: '1',
  lineHeight: '1.5',
  density: 'normal',
};

function getInitialSettings(): Settings {
  if (typeof window === 'undefined') return defaultSettings;

  return {
    theme: localStorage.getItem('studypilot_theme') || defaultSettings.theme,
    fontSize: localStorage.getItem('studypilot_fontSize') || defaultSettings.fontSize,
    lineHeight: defaultSettings.lineHeight,
    density: localStorage.getItem('studypilot_density') || defaultSettings.density,
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(getInitialSettings);
  const [loading, setLoading] = useState(true);

  // Apply settings to DOM
  const applySettings = useCallback((s: Settings) => {
    // Apply theme
    if (s.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', s.theme);
    }

    // Apply font scale
    document.documentElement.style.setProperty('--font-scale', s.fontSize);

    // Apply density
    document.documentElement.setAttribute('data-density', s.density);

    // Save to localStorage for quick load on next visit
    localStorage.setItem('studypilot_theme', s.theme);
    localStorage.setItem('studypilot_fontSize', s.fontSize);
    localStorage.setItem('studypilot_density', s.density);
  }, []);

  // Apply initial settings and fetch from server
  useEffect(() => {
    // Helper to apply settings to DOM
    const apply = (s: Settings) => {
      if (s.theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', s.theme);
      }
      document.documentElement.style.setProperty('--font-scale', s.fontSize);
      document.documentElement.setAttribute('data-density', s.density);
      localStorage.setItem('studypilot_theme', s.theme);
      localStorage.setItem('studypilot_fontSize', s.fontSize);
      localStorage.setItem('studypilot_density', s.density);
    };

    // Apply initial settings
    apply(getInitialSettings());

    // Fetch authoritative settings from server
    fetch('/api/settings', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(serverSettings => {
        if (serverSettings) {
          setSettings(serverSettings);
          apply(serverSettings);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (settings.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.theme]);

  // Update settings
  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    applySettings(updated);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newSettings),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Failed to save settings:', res.status, errorData);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }, [settings, applySettings]);

  return { settings, loading, updateSettings };
}
