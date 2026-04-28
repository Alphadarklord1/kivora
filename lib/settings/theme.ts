// 'black' is no longer in the picker; legacy stored values fall through
// to 'dark' so users who previously selected Black aren't stuck on a
// dead theme value.
export type AppTheme = 'light' | 'dark' | 'blue' | 'system';

export function normalizeTheme(value: unknown): AppTheme {
  if (value === 'black') return 'dark';
  if (value === 'dark' || value === 'blue' || value === 'light' || value === 'system') return value;
  return 'light';
}
