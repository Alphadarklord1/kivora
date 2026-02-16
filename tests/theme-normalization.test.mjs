import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTheme } from '../lib/settings/theme.ts';

test('normalizeTheme maps legacy dark to blue', () => {
  assert.equal(normalizeTheme('dark'), 'blue');
});

test('normalizeTheme keeps canonical themes', () => {
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('blue'), 'blue');
  assert.equal(normalizeTheme('black'), 'black');
  assert.equal(normalizeTheme('system'), 'system');
});

test('normalizeTheme falls back to light for unknown values', () => {
  assert.equal(normalizeTheme('purple'), 'light');
  assert.equal(normalizeTheme(null), 'light');
});
