/**
 * E2E smoke tests — require `npm run dev` or `npm start` running on :3000.
 * Run with: npx playwright test
 * Install browsers first: npx playwright install chromium
 */
import { test, expect } from '@playwright/test';

// ── App shell ─────────────────────────────────────────────────────────────────

test('home page loads without 500 error', async ({ page }) => {
  await page.goto('/');
  // App may serve on / directly or redirect — just confirm it's not a crash page
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  await expect(page.locator('body')).not.toContainText('Application error');
});

test('page title is set', async ({ page }) => {
  await page.goto('/');
  const title = await page.title();
  expect(title.length).toBeGreaterThan(0);
});

// ── Auth capabilities endpoint ────────────────────────────────────────────────

test('GET /api/auth/capabilities returns 200 with JSON', async ({ request }) => {
  const res = await request.get('/api/auth/capabilities');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(typeof body.guestModeEnabled).toBe('boolean');
  expect(typeof body.dbConfigured).toBe('boolean');
});

// ── DB verify endpoint ────────────────────────────────────────────────────────

test('GET /api/db/verify returns structured response', async ({ request }) => {
  const res = await request.get('/api/db/verify');
  // 200 (db connected) or 503 (not configured) — both are valid in CI
  expect([200, 503]).toContain(res.status());
  const body = await res.json();
  expect(typeof body.ok).toBe('boolean');
  expect(typeof body.configured).toBe('boolean');
});

// ── LLM generate endpoint ─────────────────────────────────────────────────────

test('POST /api/llm/generate returns 400 for missing fields', async ({ request }) => {
  const res = await request.post('/api/llm/generate', {
    data: { mode: 'summarize' }, // missing text
  });
  expect(res.status()).toBe(400);
});

test('POST /api/llm/generate falls back to offline content', async ({ request }) => {
  const res = await request.post('/api/llm/generate', {
    data: {
      text: 'Photosynthesis converts sunlight to chemical energy in plants.',
      mode: 'summarize',
    },
  });
  // 200 (offline fallback or cloud success) or 503 (cloud not configured with no fallback path)
  expect([200, 503]).toContain(res.status());
  if (res.status() === 200) {
    const body = await res.json();
    expect(body.content).toBeDefined();
    expect(body.content.displayText.length).toBeGreaterThan(0);
  }
});

// ── Workspace page (guest mode) ───────────────────────────────────────────────

test('workspace page loads in guest mode', async ({ page }) => {
  // Only meaningful if AUTH_GUEST_MODE=1 is set in the running server
  await page.goto('/workspace');
  // Should not show a 500 error
  await expect(page.locator('body')).not.toContainText('Internal Server Error');
  await expect(page.locator('body')).not.toContainText('Application error');
});

// ── Auth register endpoint ────────────────────────────────────────────────────

test('POST /api/auth/register returns 400 for invalid email', async ({ request }) => {
  const res = await request.post('/api/auth/register', {
    data: { email: 'not-an-email', password: 'password123' },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/auth/register returns 400 for short password', async ({ request }) => {
  const res = await request.post('/api/auth/register', {
    data: { email: 'test@example.com', password: 'short' },
  });
  expect(res.status()).toBe(400);
});

// ── Folders endpoint ──────────────────────────────────────────────────────────

test('GET /api/folders returns a known status code', async ({ request }) => {
  const res = await request.get('/api/folders');
  // 200 (guest mode with db), 401 (auth required), 500 (guest query error), 503 (no db)
  expect([200, 401, 500, 503]).toContain(res.status());
});

// ── Static assets ─────────────────────────────────────────────────────────────

test('favicon is served', async ({ request }) => {
  const res = await request.get('/favicon.ico');
  expect([200, 204]).toContain(res.status());
});
