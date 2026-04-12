import test from 'node:test';
import assert from 'node:assert/strict';

test('solveMathProblem evaluates definite integrals written as "integrate f(x) from a to b"', async () => {
  const mod = await import('../lib/math/symbolic-solver.ts');
  const result = mod.solveMathProblem('integrate x^2 from 0 to 2', 'calculus');

  assert.equal(result.verified, true);
  assert.equal(result.answer, '2.666667');
  assert.match(result.explanation, /definite integral/i);
  assert.equal(result.graphExpr, 'x^2');
});

test('solveMathProblem keeps classic definite-integral wording working', async () => {
  const mod = await import('../lib/math/symbolic-solver.ts');
  const result = mod.solveMathProblem('integral from 0 to 1 of x^2 dx', 'calculus');

  assert.equal(result.verified, true);
  assert.equal(result.answer, '0.333333');
  assert.equal(result.graphExpr, 'x^2');
});
