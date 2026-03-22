export const SUPPORTED_LOCALES = ['en', 'ar', 'fr', 'es', 'de', 'zh'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_OPTIONS: Array<{
  id: SupportedLocale;
  label: string;
  hint: string;
}> = [
  { id: 'en', label: 'English', hint: 'Default interface language' },
  { id: 'ar', label: 'العربية', hint: 'Arabic with RTL layout' },
  { id: 'fr', label: 'Français', hint: 'French interface labels' },
  { id: 'es', label: 'Español', hint: 'Spanish interface labels' },
  { id: 'de', label: 'Deutsch', hint: 'German interface labels' },
  { id: 'zh', label: '中文', hint: 'Chinese interface labels' },
];

export function sanitizeSupportedLocale(value: unknown): SupportedLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as SupportedLocale)
    ? value as SupportedLocale
    : 'en';
}

export function isRtlLocale(locale: string): boolean {
  return sanitizeSupportedLocale(locale) === 'ar';
}
