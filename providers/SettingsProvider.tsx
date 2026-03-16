'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeTheme, type AppTheme } from '@/lib/settings/theme';
import { readCompatStorage, storageKeys, writeCompatStorage } from '@/lib/storage/keys';

export type Theme = AppTheme;
export type Density = 'compact' | 'normal' | 'comfortable';

export interface Settings {
  theme: Theme;
  density: Density;
  fontSize: string;
  lineHeight: string;
  language: string;
}

const DEFAULTS: Settings = {
  theme: 'system',
  density: 'normal',
  fontSize: '1',
  lineHeight: '1.5',
  language: 'en',
};

type SettingsContextValue = {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function normalizeDensity(value: unknown): Density {
  if (value === 'compact' || value === 'normal' || value === 'comfortable') return value;
  if (value === 'spacious') return 'comfortable';
  return DEFAULTS.density;
}

function resolveTheme(theme: Theme) {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'blue' : 'light';
}

function sanitizeLineHeight(value: string | null): string {
  return value && ['1.4', '1.5', '1.65', '1.8'].includes(value) ? value : DEFAULTS.lineHeight;
}

function sanitizeFontSize(value: string | null): string {
  return value && ['0.9', '1', '1.1', '1.2'].includes(value) ? value : DEFAULTS.fontSize;
}

function loadFromStorage(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;

  return {
    theme: normalizeTheme(readCompatStorage(localStorage, storageKeys.theme)),
    density: normalizeDensity(readCompatStorage(localStorage, storageKeys.density)),
    fontSize: sanitizeFontSize(readCompatStorage(localStorage, storageKeys.fontSize)),
    lineHeight: sanitizeLineHeight(readCompatStorage(localStorage, storageKeys.lineHeight)),
    language: readCompatStorage(localStorage, storageKeys.language) || DEFAULTS.language,
  };
}

function persistToStorage(settings: Settings) {
  if (typeof window === 'undefined') return;
  writeCompatStorage(localStorage, storageKeys.theme, settings.theme);
  writeCompatStorage(localStorage, storageKeys.density, settings.density);
  writeCompatStorage(localStorage, storageKeys.fontSize, settings.fontSize);
  writeCompatStorage(localStorage, storageKeys.lineHeight, settings.lineHeight);
  writeCompatStorage(localStorage, storageKeys.language, settings.language);
}

function applySettings(settings: Settings) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolveTheme(settings.theme));
  document.documentElement.setAttribute('data-density', settings.density);
  document.documentElement.style.setProperty('--font-scale', settings.fontSize);
  document.documentElement.style.setProperty('--line-scale', settings.lineHeight);
  document.documentElement.setAttribute('lang', settings.language);
  document.documentElement.setAttribute('dir', settings.language === 'ar' ? 'rtl' : 'ltr');
}

async function syncSettings(settings: Settings) {
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  } catch {
    // Local fallback is already applied; network or auth failures should stay quiet.
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadFromStorage());
  const hasLoadedRemote = useRef(false);

  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  useEffect(() => {
    if (hasLoadedRemote.current) return;
    hasLoadedRemote.current = true;

    fetch('/api/settings')
      .then(async response => {
        if (!response.ok) return null;
        return response.json();
      })
      .then(remote => {
        if (!remote) return;
        const next: Settings = {
          theme: normalizeTheme(remote.theme),
          density: normalizeDensity(remote.density),
          fontSize: sanitizeFontSize(remote.fontSize),
          lineHeight: sanitizeLineHeight(remote.lineHeight),
          language: typeof remote.language === 'string' ? remote.language : settings.language,
        };
        setSettings(next);
        persistToStorage(next);
        applySettings(next);
      })
      .catch(() => {
        // Signed-out and local-only flows are fine here.
      });
  }, [settings.language]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setSettings(current => {
        if (current.theme !== 'system') return current;
        applySettings(current);
        return current;
      });
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      persistToStorage(next);
      applySettings(next);
      void syncSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, updateSetting }), [settings, updateSetting]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
