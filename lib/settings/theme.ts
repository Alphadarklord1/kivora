export type AppTheme = 'light' | 'blue' | 'black' | 'system';

export function normalizeTheme(value: unknown): AppTheme {
  if (value === 'dark') return 'blue'; // Backward compatibility
  if (value === 'blue' || value === 'black' || value === 'light' || value === 'system') return value;
  return 'light';
}
