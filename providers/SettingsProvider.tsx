'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface Settings {
  theme: string;
  fontSize: string;
  lineHeight: string;
  density: string;
}

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
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

const SettingsContext = createContext<SettingsContextType>({
  settings: defaultSettings,
  loading: true,
  updateSettings: async () => {},
});

export function useSettings() {
  return useContext(SettingsContext);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
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

  // Fetch authoritative settings from server (inline script in layout.tsx already applied localStorage values)
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(serverSettings => {
        if (serverSettings) {
          // Only re-apply to DOM if server settings differ from what's already applied
          const current = getInitialSettings();
          const changed = serverSettings.theme !== current.theme ||
            serverSettings.fontSize !== current.fontSize ||
            serverSettings.density !== current.density;

          setSettings(serverSettings);

          if (changed) {
            applySettings(serverSettings);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [applySettings]);

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

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}
