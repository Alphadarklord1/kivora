'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme   = 'dark' | 'light' | 'black';
export type Density = 'compact' | 'normal' | 'spacious' | 'comfortable';

export interface Settings {
  theme:    Theme;
  density:  Density;
  fontSize: string;
  language: string;
}

const DEFAULTS: Settings = {
  theme:    'dark',
  density:  'normal',
  fontSize: '1',
  language: 'en',
};

type SettingsContextValue = {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadFromStorage(): Settings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    return {
      theme:    (localStorage.getItem('kivora_theme')    as Theme)   || DEFAULTS.theme,
      density:  (localStorage.getItem('kivora_density')  as Density) || DEFAULTS.density,
      fontSize: localStorage.getItem('kivora_fontSize')  || DEFAULTS.fontSize,
      language: localStorage.getItem('kivora_language')  || DEFAULTS.language,
    };
  } catch {
    return DEFAULTS;
  }
}

function applySettings(s: Settings) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme',   s.theme);
  document.documentElement.setAttribute('data-density', s.density);
  document.documentElement.style.setProperty('--font-scale', s.fontSize);
  document.documentElement.setAttribute('lang', s.language);
  document.documentElement.setAttribute('dir', s.language === 'ar' ? 'rtl' : 'ltr');
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    const loaded = loadFromStorage();
    setSettings(loaded);
    applySettings(loaded);
  }, []);

  const updateSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem(`kivora_${key}`, String(value)); } catch {}
      applySettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
