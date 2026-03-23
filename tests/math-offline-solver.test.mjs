import test from 'node:test';
import assert from 'node:assert/strict';

test('offline solver handles simple definite integrals with bounds', async () => {
  const mod = await import(`../lib/math/offline-solver.ts?t=${Date.now()}-${Math.random()}`);
  const result = mod.solveOffline('Integral from 0 to 2 of x^2 dx');

  assert.equal(result.problemType, 'definite-integral');
  assert.equal(result.finalAnswer, '2.6667');
  assert.ok(result.steps.some((step) => /Substitute the bounds/.test(step.description)));
});

test('offline solver keeps indefinite integrals symbolic', async () => {
  const mod = await import(`../lib/math/offline-solver.ts?t=${Date.now()}-${Math.random()}`);
  const result = mod.solveOffline('Integrate x^2 dx');

  assert.equal(result.problemType, 'indefinite-integral');
  assert.match(result.finalAnswer, /\+ C$/);
});
