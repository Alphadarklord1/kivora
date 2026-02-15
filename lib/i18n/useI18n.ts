'use client';

import { useCallback } from 'react';
import { useSettings } from '@/providers/SettingsProvider';

type Params = Record<string, string | number>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function useI18n(localAr: Record<string, string>) {
  const { settings } = useSettings();
  const isArabic = settings.language === 'ar';
  const locale = isArabic ? 'ar' : undefined;

  const t = useCallback(
    (key: string, params?: Params) => {
      const source = isArabic ? (localAr[key] || key) : key;
      return interpolate(source, params);
    },
    [isArabic, localAr]
  );

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Date(date).toLocaleDateString(locale, options),
    [locale]
  );

  const formatDateTime = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions) =>
      new Date(date).toLocaleString(locale, options),
    [locale]
  );

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, options).format(value),
    [locale]
  );

  return { t, isArabic, locale, formatDate, formatDateTime, formatNumber };
}

