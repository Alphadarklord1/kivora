'use client';

export const ANALYTICS_OPT_OUT_KEY = 'kivora_analytics_opt_out';
export const CRASH_OPT_OUT_KEY = 'kivora_crash_opt_out';

const USAGE_SNAPSHOT_KEY = 'kivora_usage_snapshot';
const CRASH_SNAPSHOT_KEY = 'kivora_crash_snapshot';
const MAX_CRASH_ENTRIES = 10;

export type UsageSnapshot = {
  totalViews: number;
  routes: Record<string, number>;
  lastSeenAt: string | null;
};

export type CrashSnapshotEntry = {
  message: string;
  page: string;
  timestamp: string;
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota/private mode failures.
  }
}

function normalizeRoute(pathname: string) {
  const base = pathname.trim() || '/';
  return base.replace(/[?#].*$/, '') || '/';
}

export function usageAnalyticsEnabledClient() {
  if (!canUseStorage()) return true;
  return window.localStorage.getItem(ANALYTICS_OPT_OUT_KEY) !== '1';
}

export function crashReportsEnabledClient() {
  if (!canUseStorage()) return true;
  return window.localStorage.getItem(CRASH_OPT_OUT_KEY) !== '1';
}

export function setUsageAnalyticsEnabled(enabled: boolean) {
  if (!canUseStorage()) return;
  if (enabled) {
    window.localStorage.removeItem(ANALYTICS_OPT_OUT_KEY);
    return;
  }
  window.localStorage.setItem(ANALYTICS_OPT_OUT_KEY, '1');
  window.localStorage.removeItem(USAGE_SNAPSHOT_KEY);
}

export function setCrashReportsEnabled(enabled: boolean) {
  if (!canUseStorage()) return;
  if (enabled) {
    window.localStorage.removeItem(CRASH_OPT_OUT_KEY);
    return;
  }
  window.localStorage.setItem(CRASH_OPT_OUT_KEY, '1');
  window.localStorage.removeItem(CRASH_SNAPSHOT_KEY);
}

export function trackRouteView(pathname: string) {
  if (!usageAnalyticsEnabledClient()) return;
  const route = normalizeRoute(pathname);
  const snapshot = readJson<UsageSnapshot>(USAGE_SNAPSHOT_KEY, {
    totalViews: 0,
    routes: {},
    lastSeenAt: null,
  });
  snapshot.totalViews += 1;
  snapshot.routes[route] = (snapshot.routes[route] ?? 0) + 1;
  snapshot.lastSeenAt = new Date().toISOString();
  writeJson(USAGE_SNAPSHOT_KEY, snapshot);
}

export function getUsageSnapshot() {
  const snapshot = readJson<UsageSnapshot>(USAGE_SNAPSHOT_KEY, {
    totalViews: 0,
    routes: {},
    lastSeenAt: null,
  });
  const topRoutes = Object.entries(snapshot.routes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([route, count]) => ({ route, count }));

  return { ...snapshot, topRoutes };
}

export function recordCrashSummary(input: { message?: string | null; page?: string | null }) {
  if (!crashReportsEnabledClient()) return;

  const message = (input.message ?? 'Unknown runtime error').replace(/\s+/g, ' ').trim().slice(0, 220);
  const page = normalizeRoute(input.page ?? (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const nextEntry: CrashSnapshotEntry = {
    message: message || 'Unknown runtime error',
    page,
    timestamp: new Date().toISOString(),
  };

  const entries = readJson<CrashSnapshotEntry[]>(CRASH_SNAPSHOT_KEY, []);
  entries.unshift(nextEntry);
  writeJson(CRASH_SNAPSHOT_KEY, entries.slice(0, MAX_CRASH_ENTRIES));
}

export function getCrashSnapshot() {
  return readJson<CrashSnapshotEntry[]>(CRASH_SNAPSHOT_KEY, []);
}
