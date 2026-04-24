const DEFAULT_DESKTOP_AUTH_PORT = 3893;
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

function isGuestModeEnabledForCapabilities(): boolean {
  const authRequired = readOptionalBooleanEnv(process.env.AUTH_REQUIRED);
  if (authRequired === true) return false;

  const guestModeOverride = readOptionalBooleanEnv(process.env.AUTH_GUEST_MODE);
  if (guestModeOverride !== undefined) return guestModeOverride;

  if (readBooleanEnv(process.env.LOCAL_DEMO_MODE) || readBooleanEnv(process.env.KIVORA_DESKTOP_ONLY)) {
    return true;
  }

  return true;
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return DEFAULT_DESKTOP_AUTH_PORT;
  }
  return parsed;
}

export function getDesktopAuthPort(): number {
  return parsePort(process.env.KIVORA_DESKTOP_AUTH_PORT);
}

export function hasConfiguredAuthSecret(): boolean {
  return Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
}

export function normalizeAuthEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function getAuthCapabilities() {
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const githubConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const microsoftConfigured = Boolean(
    (process.env.AUTH_MICROSOFT_ENTRA_ID_ID || process.env.MICROSOFT_CLIENT_ID) &&
    (process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET || process.env.MICROSOFT_CLIENT_SECRET)
  );
  const guestModeEnabled = isGuestModeEnabledForCapabilities();
  const authSecretConfigured = hasConfiguredAuthSecret();
  const authDisabledByMissingSecret = process.env.NODE_ENV === 'production' && !authSecretConfigured;
  const explicitOauthDisabled = process.env.KIVORA_OAUTH_DISABLED === '1';
  const authDisabled = authDisabledByMissingSecret;
  const authDisabledReason = authDisabledByMissingSecret
    ? 'Sign-in is disabled until AUTH_SECRET is configured. Guest access remains available.'
    : null;
  const oauthDisabled = authDisabled || explicitOauthDisabled;
  const oauthDisabledReason = authDisabled
    ? authDisabledReason
    : (process.env.KIVORA_OAUTH_DISABLED_REASON || null);
  const desktopAuthPort = process.env.KIVORA_DESKTOP_ONLY === '1' ? getDesktopAuthPort() : null;

  return {
    googleConfigured,
    githubConfigured,
    microsoftConfigured,
    guestModeEnabled,
    authSecretConfigured,
    authDisabled,
    authDisabledReason,
    desktopAuthPort,
    oauthDisabled,
    oauthDisabledReason,
  };
}
