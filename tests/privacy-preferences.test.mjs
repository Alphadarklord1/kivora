import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCrashSnapshot,
  getUsageSnapshot,
  recordCrashSummary,
  setCrashReportsEnabled,
  setUsageAnalyticsEnabled,
  trackRouteView,
} from '../lib/privacy/preferences.ts';

function createStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

function installWindow(pathname = '/') {
  global.window = {
    location: { pathname },
    localStorage: createStorage(),
  };
}

test.afterEach(() => {
  delete global.window;
});

test('route analytics track page views only while enabled', () => {
  installWindow('/math');

  trackRouteView('/math?tab=graph');
  trackRouteView('/math');

  let snapshot = getUsageSnapshot();
  assert.equal(snapshot.totalViews, 2);
  assert.deepEqual(snapshot.topRoutes, [{ route: '/math', count: 2 }]);

  setUsageAnalyticsEnabled(false);
  snapshot = getUsageSnapshot();
  assert.equal(snapshot.totalViews, 0);
  assert.deepEqual(snapshot.topRoutes, []);

  trackRouteView('/workspace');
  snapshot = getUsageSnapshot();
  assert.equal(snapshot.totalViews, 0);
});

test('crash summaries are stored only while enabled', () => {
  installWindow('/coach');

  recordCrashSummary({ message: 'Example crash', page: '/coach?tab=brief' });
  let crashes = getCrashSnapshot();
  assert.equal(crashes.length, 1);
  assert.equal(crashes[0].page, '/coach');

  setCrashReportsEnabled(false);
  crashes = getCrashSnapshot();
  assert.equal(crashes.length, 0);

  recordCrashSummary({ message: 'Should not persist', page: '/settings' });
  crashes = getCrashSnapshot();
  assert.equal(crashes.length, 0);
});
