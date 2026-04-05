import test from 'node:test';
import assert from 'node:assert/strict';
import * as math from 'mathjs';

const { isCustomFuncDefinition, isSliderDefinition, normalizeGraphExpression, buildSharedScope } =
  await import('../lib/math/graph-utils.ts');

// ── isCustomFuncDefinition ────────────────────────────────────────────────────

test('isCustomFuncDefinition detects simple custom function', () => {
  assert.equal(isCustomFuncDefinition('f(x) = x^2 + 1'), true);
});

test('isCustomFuncDefinition detects function with different variable', () => {
  assert.equal(isCustomFuncDefinition('g(t) = sin(t)'), true);
});

test('isCustomFuncDefinition detects multi-char function name', () => {
  assert.equal(isCustomFuncDefinition('foo(x) = 2*x'), true);
});

test('isCustomFuncDefinition detects uppercase function name', () => {
  assert.equal(isCustomFuncDefinition('F(x) = x + 1'), true);
});

test('isCustomFuncDefinition rejects x(…) — reserved for parametric', () => {
  assert.equal(isCustomFuncDefinition('x(t) = cos(t)'), false);
});

test('isCustomFuncDefinition rejects y(…) — reserved for parametric', () => {
  assert.equal(isCustomFuncDefinition('y(t) = sin(t)'), false);
});

test('isCustomFuncDefinition rejects plain y = expression', () => {
  assert.equal(isCustomFuncDefinition('y = x^2'), false);
});

test('isCustomFuncDefinition rejects bare expression', () => {
  assert.equal(isCustomFuncDefinition('x^2 + 1'), false);
});

test('isCustomFuncDefinition rejects empty string', () => {
  assert.equal(isCustomFuncDefinition(''), false);
});

test('isCustomFuncDefinition rejects whitespace-only string', () => {
  assert.equal(isCustomFuncDefinition('   '), false);
});

test('isCustomFuncDefinition handles extra whitespace around =', () => {
  assert.equal(isCustomFuncDefinition('h(x)   =   x + 5'), true);
});

test('isSliderDefinition detects slider constants but not axis equations', () => {
  assert.equal(isSliderDefinition('a = 2.5'), true);
  assert.equal(isSliderDefinition('x = 3'), false);
  assert.equal(isSliderDefinition('y = -4'), false);
});

// ── normalizeGraphExpression ──────────────────────────────────────────────────

test('normalizeGraphExpression returns null for empty string', () => {
  assert.equal(normalizeGraphExpression(''), null);
});

test('normalizeGraphExpression returns null for whitespace-only string', () => {
  assert.equal(normalizeGraphExpression('   '), null);
});

test('normalizeGraphExpression returns null for custom function definition', () => {
  assert.equal(normalizeGraphExpression('f(x) = x^2'), null);
});

test('normalizeGraphExpression maps y = expr to function type', () => {
  const result = normalizeGraphExpression('y = x^2 + 1');
  assert.deepEqual(result, { type: 'function', value: 'x^2 + 1' });
});

test('normalizeGraphExpression maps bare expression to function type', () => {
  const result = normalizeGraphExpression('x^2 - 3*x');
  assert.deepEqual(result, { type: 'function', value: 'x^2 - 3*x' });
});

test('normalizeGraphExpression maps x = const to implicit type', () => {
  const result = normalizeGraphExpression('x = 3');
  assert.deepEqual(result, { type: 'implicit', value: 'x - (3)' });
});

test('normalizeGraphExpression maps general equation to implicit type', () => {
  const result = normalizeGraphExpression('x^2 + y^2 = 9');
  assert.deepEqual(result, { type: 'implicit', value: '(x^2 + y^2) - (9)' });
});

test('normalizeGraphExpression maps parametric syntax to parametric type', () => {
  const result = normalizeGraphExpression('x = cos(t), y = sin(t)');
  assert.equal(result?.type, 'parametric');
  if (result?.type === 'parametric') {
    assert.equal(result.valueX, 'cos(t)');
    assert.equal(result.valueY, 'sin(t)');
    assert.ok(result.tMin === 0);
    assert.ok(result.tMax > 6); // ≈ 2π
  }
});

test('normalizeGraphExpression is case-insensitive for Y =', () => {
  const result = normalizeGraphExpression('Y = 2*x');
  assert.deepEqual(result, { type: 'function', value: '2*x' });
});

test('normalizeGraphExpression preserves domain restrictions only when present', () => {
  const result = normalizeGraphExpression('y = sqrt(x) {x >= 0}');
  assert.deepEqual(result, { type: 'function', value: 'sqrt(x)', domain: 'x >= 0' });
});

// ── buildSharedScope ──────────────────────────────────────────────────────────

function makeExpr(id, expr, enabled = true) {
  return { id, expr, color: '#000', enabled };
}

test('buildSharedScope registers a custom function into the scope', () => {
  const scope = buildSharedScope(
    [makeExpr('1', 'f(x) = x^2')],
    math.evaluate,
  );
  // Calling the registered function through the scope
  const result = math.evaluate('f(3)', scope);
  assert.equal(result, 9);
});

test('buildSharedScope registers multiple independent custom functions', () => {
  const scope = buildSharedScope(
    [makeExpr('1', 'f(x) = x + 1'), makeExpr('2', 'g(x) = x * 2')],
    math.evaluate,
  );
  assert.equal(math.evaluate('f(4)', scope), 5);
  assert.equal(math.evaluate('g(4)', scope), 8);
});

test('buildSharedScope allows one custom function to call another', () => {
  const scope = buildSharedScope(
    [makeExpr('1', 'f(x) = x^2'), makeExpr('2', 'h(x) = f(x) + 1')],
    math.evaluate,
  );
  // h(3) = f(3) + 1 = 9 + 1 = 10
  assert.equal(math.evaluate('h(3)', scope), 10);
});

test('buildSharedScope skips disabled expressions', () => {
  const scope = buildSharedScope(
    [makeExpr('1', 'f(x) = x^2', false)],
    math.evaluate,
  );
  assert.throws(() => math.evaluate('f(2)', scope));
});

test('buildSharedScope skips x() and y() definitions', () => {
  const scope = buildSharedScope(
    [makeExpr('1', 'x(t) = cos(t)'), makeExpr('2', 'y(t) = sin(t)')],
    math.evaluate,
  );
  // x and y should not be registered as functions; scope should be empty of them
  assert.equal(Object.keys(scope).length, 0);
});

test('buildSharedScope ignores non-definition expressions', () => {
  const scope = buildSharedScope(
    [makeExpr('1', 'y = x^2'), makeExpr('2', 'x^2 + y^2 = 9')],
    math.evaluate,
  );
  assert.equal(Object.keys(scope).length, 0);
});

test('buildSharedScope returns empty scope for empty list', () => {
  const scope = buildSharedScope([], math.evaluate);
  assert.deepEqual(scope, {});
});

test('buildSharedScope silently skips malformed definition body', () => {
  assert.doesNotThrow(() =>
    buildSharedScope([makeExpr('1', 'f(x) = @@invalid@@')], math.evaluate),
  );
});
