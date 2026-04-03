export const SUPPORTED_LOCALES = ['en', 'ar', 'fr'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_OPTIONS: Array<{
  id: SupportedLocale;
  label: string;
  hint: string;
  rtl: boolean;
}> = [
  { id: 'en', label: 'English',  hint: 'Default interface language',  rtl: false },
  { id: 'ar', label: 'العربية',  hint: 'Arabic — right-to-left layout', rtl: true  },
  { id: 'fr', label: 'Français', hint: 'French interface labels',      rtl: false },
];

export function sanitizeSupportedLocale(value: unknown): SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale)
    ? value as SupportedLocale
    : 'en';
}

export function isRtlLocale(locale: string): boolean {
  return sanitizeSupportedLocale(locale) === 'ar';
}
