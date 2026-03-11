'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { normalizeTheme, type AppTheme } from '@/lib/settings/theme';
import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

type AppLanguage = 'en' | 'ar';

interface Settings {
  theme: AppTheme;
  fontSize: string;
  lineHeight: string;
  density: string;
  language: AppLanguage;
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
  language: 'en',
};

export function normalizeLanguage(value: unknown): AppLanguage {
  return value === 'ar' ? 'ar' : 'en';
}

function getInitialSettings(): Settings {
  if (typeof window === 'undefined') return defaultSettings;

  return {
    theme: normalizeTheme(readCompatStorage(localStorage, storageKeys.theme) || defaultSettings.theme),
    fontSize: readCompatStorage(localStorage, storageKeys.fontSize) || defaultSettings.fontSize,
    lineHeight: readCompatStorage(localStorage, storageKeys.lineHeight) || defaultSettings.lineHeight,
    density: readCompatStorage(localStorage, storageKeys.density) || defaultSettings.density,
    language: normalizeLanguage(readCompatStorage(localStorage, storageKeys.language)),
  };
}

function normalizeSettings(s: Partial<Settings> | null | undefined): Settings {
  const fallback = getInitialSettings();
  return {
    theme: normalizeTheme(s?.theme ?? fallback.theme),
    fontSize: typeof s?.fontSize === 'string' ? s.fontSize : fallback.fontSize,
    lineHeight: typeof s?.lineHeight === 'string' ? s.lineHeight : fallback.lineHeight,
    density: typeof s?.density === 'string' ? s.density : fallback.density,
    language: normalizeLanguage(s?.language ?? fallback.language),
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
      document.documentElement.setAttribute('data-theme', prefersDark ? 'blue' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', s.theme);
    }

    // Apply font scale
    document.documentElement.style.setProperty('--font-scale', s.fontSize);

    // Apply line height scale
    document.documentElement.style.setProperty('--line-scale', s.lineHeight);

    // Apply density
    document.documentElement.setAttribute('data-density', s.density);

    // Apply language and direction
    document.documentElement.setAttribute('lang', s.language);
    document.documentElement.setAttribute('dir', s.language === 'ar' ? 'rtl' : 'ltr');

    // Save to localStorage for quick load on next visit
    writeCompatStorage(localStorage, storageKeys.theme, s.theme);
    writeCompatStorage(localStorage, storageKeys.fontSize, s.fontSize);
    writeCompatStorage(localStorage, storageKeys.lineHeight, s.lineHeight);
    writeCompatStorage(localStorage, storageKeys.density, s.density);
    writeCompatStorage(localStorage, storageKeys.language, s.language);
  }, []);

  // Fetch authoritative settings from server (inline script in layout.tsx already applied localStorage values)
  useEffect(() => {
    fetch('/api/settings', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(serverSettings => {
        if (serverSettings) {
          const normalized = normalizeSettings(serverSettings);

          // Only re-apply to DOM if server settings differ from what's already applied
          const current = getInitialSettings();
          const changed = normalized.theme !== current.theme ||
            normalized.fontSize !== current.fontSize ||
            normalized.lineHeight !== current.lineHeight ||
            normalized.density !== current.density ||
            normalized.language !== current.language;

          setSettings(normalized);

          if (changed) {
            applySettings(normalized);
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
      document.documentElement.setAttribute('data-theme', e.matches ? 'blue' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.theme]);

  // Update settings
  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    const updated = normalizeSettings({ ...settings, ...newSettings });
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
