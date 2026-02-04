'use client';

import { useEffect } from 'react';

export function SettingsInitializer() {
  useEffect(() => {
    // Apply saved settings from localStorage
    const theme = localStorage.getItem('studypilot_theme');
    const fontSize = localStorage.getItem('studypilot_fontSize');
    const density = localStorage.getItem('studypilot_density');

    // Apply theme
    if (theme) {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
    } else {
      // Default to system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    }

    // Apply font scale
    if (fontSize) {
      document.documentElement.style.setProperty('--font-scale', fontSize);
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
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return null;
}
