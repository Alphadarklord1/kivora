'use client';

import { useEffect } from 'react';
import { DEFAULT_DESKTOP_LOCAL_MODEL } from '@/lib/ai/local-runtime';
import { saveAiRuntimePreferences, loadAiRuntimePreferences } from '@/lib/ai/runtime';
import { readCompatStorage, storageKeys } from '@/lib/storage/keys';
import { isRtlLocale, sanitizeSupportedLocale } from '@/lib/i18n/locales';

export function SettingsInitializer() {
  useEffect(() => {
    // Apply saved settings from localStorage
    const theme = readCompatStorage(localStorage, storageKeys.theme);
    const fontSize = readCompatStorage(localStorage, storageKeys.fontSize);
    const density = readCompatStorage(localStorage, storageKeys.density);
    const lineHeight = readCompatStorage(localStorage, storageKeys.lineHeight);
    const language = sanitizeSupportedLocale(readCompatStorage(localStorage, storageKeys.language) || 'en');

    // Apply language + direction
    document.documentElement.setAttribute('lang', language);
    document.documentElement.setAttribute('dir', isRtlLocale(language) ? 'rtl' : 'ltr');

    // Apply theme. 'system' resolves to the conventional 'dark' (charcoal)
    // when the OS prefers dark — matches what most apps mean by "dark mode".
    if (theme) {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    // Apply font scale
    if (fontSize) {
      document.documentElement.style.setProperty('--font-scale', fontSize);
    }

    // Apply line height scale
    if (lineHeight) {
      document.documentElement.style.setProperty('--line-scale', lineHeight);
    }

    // Apply density
    if (density) {
      document.documentElement.setAttribute('data-density', density);
    } else {
      document.documentElement.setAttribute('data-density', 'normal');
    }

    if (!readCompatStorage(localStorage, storageKeys.aiProvider) && window.electronAPI?.desktopAI) {
      void window.electronAPI.desktopAI.modelInfo()
        .then((info) => {
          if (!info.models?.some((model) => model.isInstalled)) return;
          const current = loadAiRuntimePreferences();
          saveAiRuntimePreferences({
            ...current,
            mode: 'local',
            localModel: DEFAULT_DESKTOP_LOCAL_MODEL,
          });
        })
        .catch(() => {});
    }

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const savedTheme = readCompatStorage(localStorage, storageKeys.theme);
      if (savedTheme === 'system' || !savedTheme) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return null;
}
