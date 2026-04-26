import test from 'node:test';
import assert from 'node:assert/strict';

// These tests cover the lib/workspace/quiz-persistence helper that
// MCQView and ExamView now call after a quiz is graded. Full route
// integration tests would require a Next.js test server + DB; here
// we just lock down the contract and the fire-and-forget behaviour.

async function loadQuizPersistence() {
  return import(`../lib/workspace/quiz-persistence.ts?t=${Date.now()}-${Math.random()}`);
}

// Replace global fetch for the duration of one test, then restore.
async function withMockFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test('recordQuizAttempt: posts to /api/quiz-attempts with the right shape', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  let captured = null;
  await withMockFetch(
    async (url, init) => {
      captured = { url: String(url), init };
      return new Response('{}', { status: 201 });
    },
    async () => {
      await recordQuizAttempt({
        mode: 'mcq',
        totalQuestions: 5,
        correctAnswers: 3,
        fileId: 'file-123',
      });
    },
  );
  assert.equal(captured.url, '/api/quiz-attempts');
  assert.equal(captured.init.method, 'POST');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.mode, 'mcq');
  assert.equal(body.totalQuestions, 5);
  assert.equal(body.correctAnswers, 3);
  assert.equal(body.fileId, 'file-123');
  assert.equal(body.deckId, null);
});

test('recordQuizAttempt: clamps correctAnswers to totalQuestions', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  let body = null;
  await withMockFetch(
    async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response('{}', { status: 201 });
    },
    async () => {
      // 99 correct out of 5 total is impossible — clamp to 5.
      await recordQuizAttempt({ mode: 'exam', totalQuestions: 5, correctAnswers: 99 });
    },
  );
  assert.equal(body.correctAnswers, 5);
});

test('recordQuizAttempt: clamps negative correctAnswers to 0', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  let body = null;
  await withMockFetch(
    async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response('{}', { status: 201 });
    },
    async () => {
      await recordQuizAttempt({ mode: 'quiz', totalQuestions: 5, correctAnswers: -3 });
    },
  );
  assert.equal(body.correctAnswers, 0);
});

test('recordQuizAttempt: skips the call when totalQuestions is invalid', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  let calls = 0;
  await withMockFetch(
    async () => { calls += 1; return new Response('{}', { status: 201 }); },
    async () => {
      await recordQuizAttempt({ mode: 'mcq', totalQuestions: 0, correctAnswers: 0 });
      await recordQuizAttempt({ mode: 'mcq', totalQuestions: NaN, correctAnswers: 1 });
    },
  );
  assert.equal(calls, 0);
});

test('recordQuizAttempt: swallows network errors silently', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  // Throwing fetch should not propagate — analytics is fire-and-forget.
  await withMockFetch(
    async () => { throw new Error('network down'); },
    async () => {
      await recordQuizAttempt({ mode: 'mcq', totalQuestions: 5, correctAnswers: 3 });
    },
  );
  // If we got here, the helper swallowed the error correctly.
  assert.ok(true);
});

test('recordQuizAttempt: includes timeTaken and answers detail when provided', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  let body = null;
  await withMockFetch(
    async (_url, init) => {
      body = JSON.parse(init.body);
      return new Response('{}', { status: 201 });
    },
    async () => {
      await recordQuizAttempt({
        mode: 'exam',
        totalQuestions: 2,
        correctAnswers: 1,
        timeTaken: 240,
        answers: [
          { questionId: 'q1', question: 'What is 2+2?', userAnswer: 'A', correctAnswer: 'A', isCorrect: true },
          { questionId: 'q2', question: 'What is 3+3?', userAnswer: 'B', correctAnswer: 'C', isCorrect: false },
        ],
      });
    },
  );
  assert.equal(body.timeTaken, 240);
  assert.equal(body.answers.length, 2);
  assert.equal(body.answers[1].isCorrect, false);
});

test('recordQuizAttempt: uses keepalive so the request survives navigation', async () => {
  const { recordQuizAttempt } = await loadQuizPersistence();
  let captured = null;
  await withMockFetch(
    async (_url, init) => {
      captured = init;
      return new Response('{}', { status: 201 });
    },
    async () => {
      await recordQuizAttempt({ mode: 'mcq', totalQuestions: 3, correctAnswers: 2 });
    },
  );
  // keepalive: true ensures the POST completes even if the user clicks
  // away from the results page immediately after seeing their score.
  assert.equal(captured.keepalive, true);
});
