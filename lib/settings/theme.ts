export type AppTheme = 'light' | 'dark' | 'blue' | 'black' | 'system';

export function normalizeTheme(value: unknown): AppTheme {
  if (value === 'dark' || value === 'blue' || value === 'black' || value === 'light' || value === 'system') return value;
  return 'light';
}
