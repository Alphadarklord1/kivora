import test from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import with cache-bust so each test file run picks up the latest
// solver source without restarting node. Mirrors the pattern used by
// tests/math-offline-solver.test.mjs.
async function loadSolver() {
  const mod = await import(`../lib/math/symbolic-solver.ts?t=${Date.now()}-${Math.random()}`);
  return mod;
}

// ── solveTrigEquation: sin/cos/tan(x) = c on [0, 2π) ─────────────────────────

test('trig equation: sin(x) = 0 → {0, π}', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('sin(x) = 0', 'trigonometry');
  assert.equal(result.verified, true);
  assert.equal(result.engine, 'mathjs');
  assert.match(result.answer, /x ∈ \{0, π\}/);
});

test('trig equation: sin(x) = 1/2 → {π/6, 5π/6}', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('sin(x) = 1/2', 'trigonometry');
  assert.equal(result.verified, true);
  assert.match(result.answer, /π\/6/);
  assert.match(result.answer, /5π\/6/);
});

test('trig equation: cos(x) = 1 → {0}', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('cos(x) = 1', 'trigonometry');
  assert.equal(result.verified, true);
  // cos(x) = 1 has only one solution in [0, 2π): x = 0.
  assert.match(result.answer, /\{0\}/);
});

test('trig equation: cos(x) = -1 → {π}', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('cos(x) = -1', 'trigonometry');
  assert.equal(result.verified, true);
  assert.match(result.answer, /\{π\}/);
});

test('trig equation: tan(x) = 1 → {π/4, 5π/4}', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('tan(x) = 1', 'trigonometry');
  assert.equal(result.verified, true);
  assert.match(result.answer, /π\/4/);
  assert.match(result.answer, /5π\/4/);
});

test('trig equation: sin(x) = 2 → no real solutions', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('sin(x) = 2', 'trigonometry');
  // Verified result with explicit "no real solutions" message — solver
  // shouldn't fall through to AI for this.
  assert.equal(result.verified, true);
  assert.match(result.answer, /No real solutions/);
});

// ── Law of Sines ─────────────────────────────────────────────────────────────

test('law of sines AAS: a=10 A=30 B=60 → b ≈ 17.32', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('law of sines a=10 A=30 B=60', 'trigonometry');
  assert.equal(result.verified, true);
  assert.equal(result.engine, 'mathjs');
  // b should be 10·sin(60°)/sin(30°) = 10·(√3/2)/(1/2) = 10√3 ≈ 17.32.
  const numericMatch = result.answer.match(/b\s*=\s*(\d+(?:\.\d+)?)/);
  assert.ok(numericMatch, `expected "b = <num>" in answer, got: ${result.answer}`);
  assert.ok(Math.abs(Number(numericMatch[1]) - 17.32) < 0.05);
});

test('law of sines SSA ambiguous: a=4 b=6 A=30 → two triangles for B', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('law of sines a=4 b=6 A=30', 'trigonometry');
  assert.equal(result.verified, true);
  // sin(B) = 6·sin(30°)/4 = 0.75 → B ≈ 48.59° or 131.41° (both yield valid triangles).
  assert.match(result.answer, /B\s*=\s*48\.\d+°\s*or\s*131\.\d+°/);
});

test('law of sines impossible: a=1 b=10 A=80 → no valid triangle', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('law of sines a=1 b=10 A=80', 'trigonometry');
  // sin(B) = 10·sin(80°)/1 ≈ 9.85 > 1 → impossible.
  assert.equal(result.verified, true);
  assert.match(result.answer, /No triangle exists/);
});

// ── Law of Cosines ───────────────────────────────────────────────────────────

test('law of cosines SAS: a=3 b=4 C=60 → c = √13 ≈ 3.606', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('law of cosines a=3 b=4 C=60', 'trigonometry');
  assert.equal(result.verified, true);
  // c² = 9 + 16 - 24·cos(60°) = 25 - 12 = 13 → c = √13 ≈ 3.606.
  const numericMatch = result.answer.match(/c\s*=\s*(\d+(?:\.\d+)?)/);
  assert.ok(numericMatch, `expected "c = <num>" in answer, got: ${result.answer}`);
  assert.ok(Math.abs(Number(numericMatch[1]) - 3.606) < 0.01);
});

test('law of cosines SSS: a=3 b=4 c=5 → right triangle (C=90°)', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('law of cosines a=3 b=4 c=5', 'trigonometry');
  assert.equal(result.verified, true);
  // 3-4-5 is the canonical right triangle: A ≈ 36.87°, B ≈ 53.13°, C = 90°.
  // The solver's formatNumber may emit more decimals (36.869898°) — match
  // the leading digits and tolerate any precision afterwards.
  assert.match(result.answer, /C\s*=\s*90°/);
  assert.match(result.answer, /A\s*=\s*36\.8\d+°/);
  assert.match(result.answer, /B\s*=\s*53\.1\d+°/);
});

test('law of cosines underdetermined: a=3 → not enough info', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('law of cosines a=3', 'trigonometry');
  // Solver returns verified:false; the API route would fall through to AI.
  assert.equal(result.verified, false);
  assert.match(result.error || '', /SAS|SSS/);
});

// ── Amplitude & Period ───────────────────────────────────────────────────────

test('amplitude/period: 2*sin(3*x) → amp=2, period=2π/3', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('amplitude 2*sin(3*x)', 'trigonometry');
  assert.equal(result.verified, true);
  assert.match(result.answer, /amplitude = 2/);
  assert.match(result.answer, /period = 2π\/3/);
});

test('amplitude/period: -3*cos(x) + 1 → amp=3, period=2π, vshift=1', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('amplitude and period of -3*cos(x)+1', 'trigonometry');
  assert.equal(result.verified, true);
  assert.match(result.answer, /amplitude = 3/);
  assert.match(result.answer, /period = 2π/);
  assert.match(result.answer, /vertical shift = 1/);
});

test('amplitude/period: 5*tan(2*x) → period = π/2', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('period of 5*tan(2*x)', 'trigonometry');
  assert.equal(result.verified, true);
  // Tangent has period π, divided by |B|=2 → π/2.
  assert.match(result.answer, /period = π\/2/);
});

// ── Regression: existing trig flows still work ───────────────────────────────

test('regression: sin(pi/6) still uses exact-value matcher', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('sin(pi/6)', 'trigonometry');
  assert.equal(result.verified, true);
  assert.equal(result.answer, '1/2');
});

test('regression: pythagorean identity still resolves to 1', async () => {
  const { solveMathProblem } = await loadSolver();
  const result = solveMathProblem('sin(x)^2 + cos(x)^2', 'trigonometry');
  assert.equal(result.verified, true);
  assert.equal(result.answer, '1');
});
