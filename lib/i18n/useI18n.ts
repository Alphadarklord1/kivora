'use client';

import { useCallback } from 'react';
import { useSettings } from '@/providers/SettingsProvider';
import { GLOBAL_TRANSLATIONS, type SupportedLocale, isRtl } from './translations';

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

/**
 * Multi-language translation hook.
 *
 * @param localAr  Component-specific Arabic overrides (kept for backward compat).
 *                 For Arabic, these are checked AFTER the global dictionary as a
 *                 component-level fallback for strings not in GLOBAL_TRANSLATIONS.
 *
 * Lookup order for a non-English locale:
 *   1. GLOBAL_TRANSLATIONS[key][locale]   — shared app-wide translation
 *   2. localAr[key]                        — Arabic component-specific (Arabic only)
 *   3. key (English string)                — final fallback
 */
export function useI18n(localAr: Record<string, string> = {}) {
  const { settings } = useSettings();
  const locale = (settings.language || 'en') as SupportedLocale;
  const isArabic = locale === 'ar';
  const isRTL = isRtl(locale);

  const t = useCallback(
    (key: string, params?: Params) => {
      let source = key; // default: English key

      if (locale !== 'en') {
        // 1. Global dictionary for this locale
        const globalVal = GLOBAL_TRANSLATIONS[key]?.[locale];
        if (globalVal) {
          source = globalVal;
        } else if (isArabic && localAr[key]) {
          // 2. Component-local Arabic fallback (backward compat)
          source = localAr[key];
        }
        // 3. Falls through to English key
      }

      return interpolate(source, params);
    },
    [locale, isArabic, localAr]
  );

  // Intl locale string — undefined keeps the browser default (en)
  const intlLocale = locale !== 'en' ? locale : undefined;

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Date(date).toLocaleDateString(intlLocale, options),
    [intlLocale]
  );

  const formatDateTime = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Date(date).toLocaleString(intlLocale, options),
    [intlLocale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(intlLocale, options).format(value),
    [intlLocale]
  );

  return { t, isArabic, isRTL, locale, formatDate, formatDateTime, formatNumber };
}

