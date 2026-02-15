const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSY_VALUES = new Set(['0', 'false', 'no', 'off']);

function readBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  return TRUTHY_VALUES.has(value.toLowerCase());
}

function readOptionalBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const normalized = value.toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) return true;
  if (FALSY_VALUES.has(normalized)) return false;
  return undefined;
}

export function isDesktopOnlyModeEnabled(): boolean {
  return readBooleanEnv(process.env.STUDYPILOT_DESKTOP_ONLY);
}

export function isGuestModeEnabled(): boolean {
  const authRequired = readOptionalBooleanEnv(process.env.AUTH_REQUIRED);
  if (authRequired === true) return false;

  const guestModeOverride = readOptionalBooleanEnv(process.env.AUTH_GUEST_MODE);
  if (guestModeOverride !== undefined) return guestModeOverride;

  if (readBooleanEnv(process.env.LOCAL_DEMO_MODE) || isDesktopOnlyModeEnabled()) {
    return true;
  }

  // Prototype default: allow guest usage unless explicitly disabled.
  return true;
}

export function isDesktopUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return /electron/i.test(userAgent);
}

export function isElectronRenderer(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.electronAPI?.isElectron);
}
