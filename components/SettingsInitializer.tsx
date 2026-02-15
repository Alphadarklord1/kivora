'use client';

import { useEffect } from 'react';

export function SettingsInitializer() {
  useEffect(() => {
    // Apply saved settings from localStorage
    const theme = localStorage.getItem('studypilot_theme');
    const fontSize = localStorage.getItem('studypilot_fontSize');
    const density = localStorage.getItem('studypilot_density');
    const lineHeight = localStorage.getItem('studypilot_lineHeight');
    const language = localStorage.getItem('studypilot_language') || 'en';

    // Apply language + direction
    document.documentElement.setAttribute('lang', language === 'ar' ? 'ar' : 'en');
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');

    // Apply theme
    if (theme) {
      const normalizedTheme = theme === 'dark' ? 'blue' : theme;
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'blue' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', normalizedTheme);
      }
    } else {
      // Default to system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'blue' : 'light');
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

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const savedTheme = localStorage.getItem('studypilot_theme');
      if (savedTheme === 'system' || !savedTheme) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'blue' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return null;
}
