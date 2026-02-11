const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY_VALUES.has(value.toLowerCase());
}

export function isDesktopOnlyModeEnabled(): boolean {
  return readBooleanEnv(process.env.STUDYPILOT_DESKTOP_ONLY);
}

export function isGuestModeEnabled(): boolean {
  return (
    readBooleanEnv(process.env.LOCAL_DEMO_MODE) ||
    readBooleanEnv(process.env.AUTH_GUEST_MODE) ||
    isDesktopOnlyModeEnabled()
  );
}

export function isDesktopUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /electron/i.test(userAgent);
}

export function isElectronRenderer(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.electronAPI?.isElectron);
}
