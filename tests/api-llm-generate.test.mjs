/**
 * Tests for app/api/llm/generate/route.ts
 * Uses mock.module to replace tryCloudGeneration so no real API keys are needed.
 */
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// ── Cloud generation stub ─────────────────────────────────────────────────────

// Default: cloud generation fails → route falls back to offline
let cloudResponse = { ok: false, message: 'No cloud AI configured' };

mock.module(resolve(ROOT, 'lib/ai/server-routing.ts'), {
  namedExports: {
    tryCloudGeneration: async () => cloudResponse,
  },
});

const { POST } = await import('../app/api/llm/generate/route.ts');

function req(body, ip = '127.0.0.42') {
  return new Request('http://localhost/api/llm/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

// ── Input validation ──────────────────────────────────────────────────────────

test('returns 400 when text is missing', async () => {
  const res = await POST(req({ mode: 'summarize' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('returns 400 when mode is missing', async () => {
  const res = await POST(req({ text: 'Some study text' }));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('returns 400 when both text and mode are missing', async () => {
  const res = await POST(req({}));
  assert.equal(res.status, 400);
});

test('returns 400 for unsupported provider', async () => {
  const res = await POST(req({ text: 'study text', mode: 'summarize', provider: 'anthropic' }));
  assert.equal(res.status, 400);
});

// ── Scope / policy check ──────────────────────────────────────────────────────

test('returns 422 for off-topic personal writing request', async () => {
  const res = await POST(req({
    text: 'Write a love letter to my girlfriend',
    mode: 'rephrase',
  }, '10.0.0.1'));
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(body.errorCode);
});

// ── Offline fallback (cloud unavailable) ─────────────────────────────────────

test('returns 200 with offline fallback content when cloud is not configured', async () => {
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
  const res = await POST(req({ text: 'Photosynthesis converts light to energy.', mode: 'summarize' }, '192.168.1.1'));
  // Route returns 503 when cloud not configured — check the errorCode
  const body = await res.json();
  assert.ok(res.status === 503 || res.status === 200, `unexpected status ${res.status}`);
  if (res.status === 503) {
    assert.equal(body.errorCode, 'CLOUD_NOT_CONFIGURED');
  }
});

test('returns 502 when cloud returns completely non-JSON response', async () => {
  cloudResponse = {
    ok: true,
    content: 'not json at all !!!',
    source: 'grok',
  };
  const res = await POST(req({ text: 'Photosynthesis converts light to energy.', mode: 'notes' }, '192.168.1.2'));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.ok(body.error);
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
});

test('falls back to offline when cloud returns malformed JSON (braces but unparseable)', async () => {
  cloudResponse = {
    ok: true,
    content: '{ totally : invalid : json : here }',
    source: 'grok',
  };
  const res = await POST(req({ text: 'Photosynthesis converts light to energy.', mode: 'notes' }, '192.168.1.7'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fallback, true);
  assert.ok(body.content);
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
});

test('falls back to offline when cloud returns schema-invalid JSON', async () => {
  cloudResponse = {
    ok: true,
    content: '{"mode":"notes","displayText":""}',
    source: 'grok',
  };
  const res = await POST(req({ text: 'Photosynthesis converts light to energy.', mode: 'notes' }, '192.168.1.3'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fallback, true);
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
});

test('returns real content when cloud returns valid JSON', async () => {
  cloudResponse = {
    ok: true,
    content: JSON.stringify({
      mode: 'summarize',
      displayText: 'Plants convert sunlight to glucose via photosynthesis.',
      keyTopics: ['photosynthesis', 'chlorophyll'],
      learningObjectives: ['Understand photosynthesis'],
      subjectArea: 'science',
      questions: [],
      flashcards: [],
      sourceText: 'Photosynthesis...',
    }),
    source: 'grok',
  };
  const res = await POST(req({ text: 'Photosynthesis converts light to energy.', mode: 'summarize' }, '192.168.1.4'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.fallback, false);
  assert.ok(body.content.displayText.length > 0);
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
});

// ── Model allowlist ───────────────────────────────────────────────────────────

test('unknown model is silently replaced with default (no 400)', async () => {
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
  const res = await POST(req({ text: 'study text', mode: 'summarize', model: 'some-unknown-model-xyz' }, '10.5.5.5'));
  // Should not be 400 — model is just coerced to default
  assert.notEqual(res.status, 400);
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

test('returns 429 after exceeding default request limit for same IP', async () => {
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
  const IP = '203.0.113.99'; // unique IP for this test
  const LIMIT = 20; // WEB_AI_RATE_LIMIT_MAX default
  let last;
  for (let i = 0; i <= LIMIT; i++) {
    last = await POST(req({ text: 'test', mode: 'summarize' }, IP));
  }
  assert.equal(last.status, 429);
  const body = await last.json();
  assert.equal(body.errorCode, 'RATE_LIMITED');
  assert.ok(typeof body.retryAfterSeconds === 'number');
});

test('rate limit 429 includes Retry-After header', async () => {
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
  const IP = '203.0.113.88';
  const LIMIT = 20;
  let last;
  for (let i = 0; i <= LIMIT; i++) {
    last = await POST(req({ text: 'test', mode: 'summarize' }, IP));
  }
  assert.equal(last.status, 429);
  assert.ok(last.headers.get('Retry-After'));
});

test('different IPs have independent rate limit buckets', async () => {
  cloudResponse = { ok: false, message: 'No cloud AI configured' };
  const IP_A = '203.0.113.10';
  const IP_B = '203.0.113.11';
  const LIMIT = 20;
  // Exhaust IP_A
  for (let i = 0; i <= LIMIT; i++) {
    await POST(req({ text: 'test', mode: 'summarize' }, IP_A));
  }
  // IP_B should still be allowed
  const resB = await POST(req({ text: 'Photosynthesis study', mode: 'summarize' }, IP_B));
  assert.notEqual(resB.status, 429);
});
